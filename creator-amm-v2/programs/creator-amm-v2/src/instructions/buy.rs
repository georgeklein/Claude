use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{Config, Pool, CurvePhase};
use crate::errors::ErrorCode;
use crate::events::{TradeExecuted, PoolGraduated};

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"pool", pool.base_mint.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
    #[account(mut, constraint = quote_vault.key() == pool.quote_vault, constraint = quote_vault.owner == pool.key() @ ErrorCode::Unauthorized)]
    pub quote_vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = base_vault.key() == pool.base_vault, constraint = base_vault.owner == pool.key() @ ErrorCode::Unauthorized)]
    pub base_vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = user_quote_account.mint == pool.quote_mint, constraint = user_quote_account.owner == user.key())]
    pub user_quote_account: Account<'info, TokenAccount>,
    #[account(mut, constraint = user_base_account.mint == pool.base_mint, constraint = user_base_account.owner == user.key())]
    pub user_base_account: Account<'info, TokenAccount>,
    #[account(mut, constraint = fee_recipient_account.mint == pool.quote_mint @ ErrorCode::Unauthorized, constraint = fee_recipient_account.owner == config.fee_recipient @ ErrorCode::Unauthorized)]
    pub fee_recipient_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Buy>, quote_amount: u64, min_base_amount: u64) -> Result<()> {
    require!(quote_amount > 0, ErrorCode::InvalidAmount);
    let pool = &mut ctx.accounts.pool;
    require!(!pool.is_paused, ErrorCode::PoolPaused);

    let config = &ctx.accounts.config;
    let clock = Clock::get()?;
    let fee_bps = pool.get_current_fee_bps();
    let (quote_res, base_res) = pool.get_pricing_reserves();

    // Anti-sniper check
    if pool.is_anti_sniper_active(clock.slot, config.anti_sniper_window_slots) {
        let max = (base_res as u128).checked_mul(config.anti_sniper_max_trade_bps as u128)
            .ok_or(ErrorCode::MathOverflow)?.checked_div(10000).ok_or(ErrorCode::MathOverflow)? as u64;
        let est = pool.calculate_output(quote_amount, quote_res, base_res, 0)?;
        require!(est <= max, ErrorCode::AntiSniperActive);
    }

    let base_output = pool.calculate_output(quote_amount, quote_res, base_res, fee_bps)?;
    require!(base_output >= min_base_amount, ErrorCode::SlippageExceeded);
    require!(base_output >= 1000, ErrorCode::OutputTooSmall);
    require!(base_output <= pool.real_base_reserves, ErrorCode::InsufficientLiquidity);

    let base_before_fee = pool.calculate_output(quote_amount, quote_res, base_res, 0)?;
    let fee_amount = base_before_fee.checked_sub(base_output).ok_or(ErrorCode::MathOverflow)?;
    let fee_in_quote = std::cmp::max(
        (fee_amount as u128).checked_mul(quote_res as u128).ok_or(ErrorCode::MathOverflow)?
            .checked_div(base_res as u128).ok_or(ErrorCode::MathOverflow)? as u64,
        if fee_amount > 0 { 1 } else { 0 }
    );

    // Transfer quote from user to pool
    token::transfer(CpiContext::new(ctx.accounts.token_program.to_account_info(), Transfer {
        from: ctx.accounts.user_quote_account.to_account_info(),
        to: ctx.accounts.quote_vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    }), quote_amount)?;

    let seeds = &[b"pool".as_ref(), pool.base_mint.as_ref(), &[pool.bump]];
    let signer = &[&seeds[..]];

    // Transfer base from pool to user
    token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), Transfer {
        from: ctx.accounts.base_vault.to_account_info(),
        to: ctx.accounts.user_base_account.to_account_info(),
        authority: pool.to_account_info(),
    }, signer), base_output)?;

    // Transfer fee if any
    if fee_in_quote > 0 {
        token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), Transfer {
            from: ctx.accounts.quote_vault.to_account_info(),
            to: ctx.accounts.fee_recipient_account.to_account_info(),
            authority: pool.to_account_info(),
        }, signer), fee_in_quote)?;
    }

    // Update reserves
    if matches!(pool.current_phase, CurvePhase::Graduated) {
        pool.real_quote_reserves = pool.real_quote_reserves.checked_add(quote_amount).ok_or(ErrorCode::MathOverflow)?;
        pool.real_base_reserves = pool.real_base_reserves.checked_sub(base_output).ok_or(ErrorCode::MathOverflow)?;
    } else {
        pool.virtual_quote_reserves = pool.virtual_quote_reserves.checked_add(quote_amount).ok_or(ErrorCode::MathOverflow)?;
        pool.virtual_base_reserves = pool.virtual_base_reserves.checked_sub(base_before_fee).ok_or(ErrorCode::MathOverflow)?;
        pool.real_quote_reserves = pool.real_quote_reserves.checked_add(quote_amount).ok_or(ErrorCode::MathOverflow)?
            .checked_sub(fee_in_quote).ok_or(ErrorCode::MathOverflow)?;
        pool.real_base_reserves = pool.real_base_reserves.checked_sub(base_output).ok_or(ErrorCode::MathOverflow)?;
    }

    pool.total_quote_volume = pool.total_quote_volume.checked_add(quote_amount).ok_or(ErrorCode::MathOverflow)?;
    pool.total_base_volume = pool.total_base_volume.checked_add(base_output).ok_or(ErrorCode::MathOverflow)?;
    pool.total_fees_collected = pool.total_fees_collected.checked_add(fee_in_quote).ok_or(ErrorCode::MathOverflow)?;

    let vq = pool.virtual_quote_reserves;
    let vb = pool.virtual_base_reserves;
    if pool.check_phase_transition()? {
        emit!(PoolGraduated {
            pool: pool.key(), base_mint: pool.base_mint, creator: pool.creator,
            graduation_slot: clock.slot, total_crx_accumulated: pool.real_quote_reserves,
            graduation_threshold_crx: pool.graduation_threshold_crx,
            final_virtual_quote_reserves: vq, final_virtual_base_reserves: vb,
            starting_real_quote_reserves: pool.real_quote_reserves,
            starting_real_base_reserves: pool.real_base_reserves,
            price_at_graduation: pool.get_spot_price()?,
            market_cap_usd_at_graduation: pool.get_market_cap_usd()?,
            total_volume_crx: pool.total_quote_volume, total_fees_collected: pool.total_fees_collected,
            slots_to_graduate: clock.slot.saturating_sub(pool.created_at_slot), timestamp: clock.unix_timestamp,
        });
    }

    let (qr, br) = pool.get_pricing_reserves();
    emit!(TradeExecuted {
        pool: pool.key(), user: ctx.accounts.user.key(), base_mint: pool.base_mint,
        is_buy: true, input_amount: quote_amount, output_amount: base_output,
        fee_amount: fee_in_quote, fee_bps, phase: pool.current_phase,
        price_after: pool.get_spot_price()?, quote_reserves_after: qr, base_reserves_after: br,
        real_crx_accumulated: pool.real_quote_reserves, market_cap_usd: pool.get_market_cap_usd()?,
        anti_sniper_active: pool.is_anti_sniper_active(clock.slot, config.anti_sniper_window_slots),
        slot: clock.slot, timestamp: clock.unix_timestamp,
    });

    ctx.accounts.quote_vault.reload()?;
    ctx.accounts.base_vault.reload()?;
    require!(pool.real_quote_reserves == ctx.accounts.quote_vault.amount, ErrorCode::ReserveVaultMismatch);
    require!(pool.real_base_reserves == ctx.accounts.base_vault.amount, ErrorCode::ReserveVaultMismatch);

    Ok(())
}
