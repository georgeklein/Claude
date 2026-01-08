use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{Config, Pool, CurvePhase};
use crate::errors::ErrorCode;
use crate::events::{TradeExecuted, PoolGraduated, PhaseTransition};

#[derive(Accounts)]
pub struct Sell<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [
            b"pool",
            pool.base_mint.as_ref(),
        ],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        constraint = quote_vault.key() == pool.quote_vault,
        constraint = quote_vault.owner == pool.key() @ ErrorCode::Unauthorized,
    )]
    pub quote_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = base_vault.key() == pool.base_vault,
        constraint = base_vault.owner == pool.key() @ ErrorCode::Unauthorized,
    )]
    pub base_vault: Account<'info, TokenAccount>,

    /// User's quote token account (receiving CRX)
    #[account(
        mut,
        constraint = user_quote_account.mint == pool.quote_mint,
        constraint = user_quote_account.owner == user.key(),
    )]
    pub user_quote_account: Account<'info, TokenAccount>,

    /// User's base token account (paying with tokens)
    #[account(
        mut,
        constraint = user_base_account.mint == pool.base_mint,
        constraint = user_base_account.owner == user.key(),
    )]
    pub user_base_account: Account<'info, TokenAccount>,

    /// Protocol fee recipient's quote token account
    #[account(
        mut,
        constraint = fee_recipient_account.mint == pool.quote_mint @ ErrorCode::Unauthorized,
        constraint = fee_recipient_account.owner == config.fee_recipient @ ErrorCode::Unauthorized,
    )]
    pub fee_recipient_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<Sell>,
    base_amount: u64,       // Amount of tokens to sell
    min_quote_amount: u64,  // Minimum CRX to receive (slippage protection)
) -> Result<()> {
    require!(base_amount > 0, ErrorCode::InvalidAmount);

    let pool = &mut ctx.accounts.pool;

    // Emergency pause check
    require!(!pool.is_paused, ErrorCode::PoolPaused);
    let config = &ctx.accounts.config;
    let clock = Clock::get()?;

    // Get current phase parameters
    let current_fee_bps = pool.get_current_fee_bps();

    msg!("💸 Sell Request:");
    msg!("   Base Amount: {} tokens", base_amount);
    msg!("   Current Phase: {:?}", pool.current_phase);
    msg!("   Fee: {} bps", current_fee_bps);

    // Get correct reserves based on phase (virtual or real)
    let (quote_reserve, base_reserve) = pool.get_pricing_reserves();

    // Anti-sniper protection check (also applies to sells)
    if pool.is_anti_sniper_active(clock.slot, config.anti_sniper_window_slots) {
        let max_trade_amount = (base_reserve as u128)
            .checked_mul(config.anti_sniper_max_trade_bps as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)? as u64;

        require!(
            base_amount <= max_trade_amount,
            ErrorCode::AntiSniperActive
        );

        msg!("🛡️  Anti-sniper active: max {} tokens", max_trade_amount);
    }

    // Calculate output amount using correct reserves
    let quote_output = pool.calculate_output(
        base_amount,
        base_reserve,
        quote_reserve,
        current_fee_bps,
    )?;

    // Upfront liquidity check: Ensure pool has enough CRX to pay out
    // CRITICAL: Prevents calculating output larger than vault balance in PreBonding
    require!(
        quote_output <= pool.real_quote_reserves,
        ErrorCode::InsufficientLiquidity
    );

    // Slippage protection (CRITICAL SECURITY FIX from PumpSwap)
    require!(
        quote_output >= min_quote_amount,
        ErrorCode::SlippageExceeded
    );

    // Minimum output validation (prevents dust trades)
    const MIN_OUTPUT_AMOUNT: u64 = 1000; // 0.001 CRX (with 6 decimals)
    require!(
        quote_output >= MIN_OUTPUT_AMOUNT,
        ErrorCode::OutputTooSmall
    );

    // Calculate protocol fee
    let quote_output_before_fee = pool.calculate_output(
        base_amount,
        base_reserve,
        quote_reserve,
        0, // Calculate without fee to get fee amount
    )?;

    let fee_amount = quote_output_before_fee
        .checked_sub(quote_output)
        .ok_or(ErrorCode::MathOverflow)?;

    // Transfer base tokens from user to pool
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_base_account.to_account_info(),
        to: ctx.accounts.base_vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
        base_amount,
    )?;

    // Transfer quote tokens from pool to user
    let pool_seeds = &[
        b"pool",
        pool.base_mint.as_ref(),
        &[pool.bump],
    ];
    let signer = &[&pool_seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.quote_vault.to_account_info(),
        to: ctx.accounts.user_quote_account.to_account_info(),
        authority: pool.to_account_info(),
    };
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        ),
        quote_output,
    )?;

    // Transfer protocol fee to fee recipient (in CRX)
    // Skip transfer if fee is 0 (Graduated phase) to save gas
    if fee_amount > 0 {
        let fee_cpi_accounts = Transfer {
            from: ctx.accounts.quote_vault.to_account_info(),
            to: ctx.accounts.fee_recipient_account.to_account_info(),
            authority: pool.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                fee_cpi_accounts,
                signer,
            ),
            fee_amount,
        )?;
    }

    // Update reserves based on phase
    if matches!(pool.current_phase, CurvePhase::Graduated) {
        // GRADUATED PHASE: Pure constant product (x*y=k)
        // NO fees extracted to maintain invariant
        // Add full input, subtract full output
        pool.real_base_reserves = pool.real_base_reserves
            .checked_add(base_amount)
            .ok_or(ErrorCode::MathOverflow)?;
        pool.real_quote_reserves = pool.real_quote_reserves
            .checked_sub(quote_output)
            .ok_or(ErrorCode::MathOverflow)?;
        // Virtual reserves frozen at graduation
    } else {
        // PRE-BONDING PHASE: Update VIRTUAL reserves for bonding curve
        // CRITICAL: Must use before-fee amounts to maintain x*y=k invariant
        pool.virtual_base_reserves = pool.virtual_base_reserves
            .checked_add(base_amount)
            .ok_or(ErrorCode::MathOverflow)?;
        pool.virtual_quote_reserves = pool.virtual_quote_reserves
            .checked_sub(quote_output_before_fee)
            .ok_or(ErrorCode::MathOverflow)?;

        // Update real reserves (tracking actual vault balances with fees extracted)
        pool.real_base_reserves = pool.real_base_reserves
            .checked_add(base_amount)
            .ok_or(ErrorCode::MathOverflow)?;
        pool.real_quote_reserves = pool.real_quote_reserves
            .checked_sub(quote_output_before_fee)
            .ok_or(ErrorCode::MathOverflow)?;
    }

    // Update statistics
    pool.total_base_volume = pool.total_base_volume
        .checked_add(base_amount)
        .ok_or(ErrorCode::MathOverflow)?;
    pool.total_quote_volume = pool.total_quote_volume
        .checked_add(quote_output)
        .ok_or(ErrorCode::MathOverflow)?;
    pool.total_fees_collected = pool.total_fees_collected
        .checked_add(fee_amount)
        .ok_or(ErrorCode::MathOverflow)?;

    // Capture pre-transition state for event
    let phase_before = pool.current_phase;
    let virtual_quote_before = pool.virtual_quote_reserves;
    let virtual_base_before = pool.virtual_base_reserves;

    // Note: Phase transitions on sells are less common but still checked
    let transitioned = pool.check_phase_transition()?;

    // Emit graduation events if transition occurred (rare on sells, but possible)
    if transitioned {
        let price_at_graduation = pool.get_spot_price()?;
        let market_cap_at_graduation = pool.get_market_cap_usd()?;
        let slots_to_graduate = clock.slot.saturating_sub(pool.created_at_slot);

        emit!(PoolGraduated {
            pool: pool.key(),
            base_mint: pool.base_mint,
            creator: pool.creator,
            graduation_slot: clock.slot,
            total_crx_accumulated: pool.real_quote_reserves,
            graduation_threshold_crx: pool.graduation_threshold_crx,
            final_virtual_quote_reserves: virtual_quote_before,
            final_virtual_base_reserves: virtual_base_before,
            starting_real_quote_reserves: pool.real_quote_reserves,
            starting_real_base_reserves: pool.real_base_reserves,
            price_at_graduation,
            market_cap_usd_at_graduation: market_cap_at_graduation,
            total_volume_crx: pool.total_quote_volume,
            total_fees_collected: pool.total_fees_collected,
            slots_to_graduate,
            timestamp: clock.unix_timestamp,
        });

        emit!(PhaseTransition {
            pool: pool.key(),
            base_mint: pool.base_mint,
            from_phase: phase_before,
            to_phase: pool.current_phase,
            transition_slot: clock.slot,
            timestamp: clock.unix_timestamp,
        });
    }

    // Emit trade event
    let (quote_reserves_after, base_reserves_after) = pool.get_pricing_reserves();
    let price_after = pool.get_spot_price()?;
    let market_cap_usd = pool.get_market_cap_usd()?;
    let anti_sniper_active = pool.is_anti_sniper_active(clock.slot, config.anti_sniper_window_slots);

    emit!(TradeExecuted {
        pool: pool.key(),
        user: ctx.accounts.user.key(),
        base_mint: pool.base_mint,
        is_buy: false,
        input_amount: base_amount,
        output_amount: quote_output,
        fee_amount,
        fee_bps: current_fee_bps,
        phase: pool.current_phase,
        price_after,
        quote_reserves_after,
        base_reserves_after,
        real_crx_accumulated: pool.real_quote_reserves,
        market_cap_usd,
        anti_sniper_active,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });

    msg!("✅ Sell executed!");
    msg!("   Base In: {} tokens", base_amount);
    msg!("   Quote Out: {} CRX", quote_output);
    msg!("   Fee: {} CRX ({} bps)", fee_amount, current_fee_bps);
    let (new_quote_res, new_base_res) = pool.get_pricing_reserves();
    msg!("   New Price: {} CRX per token",
        (new_quote_res as f64) / (new_base_res as f64)
    );

    if matches!(pool.current_phase, CurvePhase::PreBonding) {
        msg!("   Real CRX Accumulated: {} / {} (to graduation)",
            pool.real_quote_reserves,
            pool.graduation_threshold_crx
        );
    }

    if transitioned {
        msg!("🎉 Phase transition occurred!");
    }

    // CRITICAL: Validate reserves match actual vault balances
    // This prevents accounting bugs and ensures pool integrity
    ctx.accounts.quote_vault.reload()?;
    ctx.accounts.base_vault.reload()?;

    require!(
        pool.real_quote_reserves == ctx.accounts.quote_vault.amount,
        ErrorCode::ReserveVaultMismatch
    );
    require!(
        pool.real_base_reserves == ctx.accounts.base_vault.amount,
        ErrorCode::ReserveVaultMismatch
    );

    Ok(())
}
