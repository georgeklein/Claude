use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{Config, Pool, CurvePhase};
use crate::errors::ErrorCode;

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
    )]
    pub quote_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = base_vault.key() == pool.base_vault,
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
        constraint = fee_recipient_account.mint == pool.quote_mint,
        constraint = fee_recipient_account.owner == config.fee_recipient,
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
    let config = &ctx.accounts.config;
    let clock = Clock::get()?;

    // Get current phase parameters
    let current_fee_bps = pool.get_current_fee_bps();

    msg!("💸 Sell Request:");
    msg!("   Base Amount: {} tokens", base_amount);
    msg!("   Current Phase: {:?}", pool.current_phase);
    msg!("   Fee: {} bps", current_fee_bps);

    // Anti-sniper protection check (also applies to sells)
    if pool.is_anti_sniper_active(clock.slot, config.anti_sniper_window_slots) {
        let max_trade_amount = (pool.virtual_base_reserves as u128)
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

    // Get correct reserves based on phase (virtual or real)
    let (quote_reserve, base_reserve) = pool.get_pricing_reserves();

    // Calculate output amount using correct reserves
    let quote_output = pool.calculate_output(
        base_amount,
        base_reserve,
        quote_reserve,
        current_fee_bps,
    )?;

    // Slippage protection (CRITICAL SECURITY FIX from PumpSwap)
    require!(
        quote_output >= min_quote_amount,
        ErrorCode::SlippageExceeded
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

    // Update reserves based on phase
    if matches!(pool.current_phase, CurvePhase::Graduated) {
        // Post-graduation: Update REAL reserves only
        // (Virtual reserves frozen at graduation)
    } else {
        // Pre-graduation: Update VIRTUAL reserves for bonding curve
        pool.virtual_base_reserves = pool.virtual_base_reserves
            .checked_add(base_amount)
            .ok_or(ErrorCode::MathOverflow)?;
        pool.virtual_quote_reserves = pool.virtual_quote_reserves
            .checked_sub(quote_output_before_fee)
            .ok_or(ErrorCode::MathOverflow)?;
    }

    // Update pool real reserves
    pool.real_base_reserves = pool.real_base_reserves
        .checked_add(base_amount)
        .ok_or(ErrorCode::MathOverflow)?;
    pool.real_quote_reserves = pool.real_quote_reserves
        .checked_sub(quote_output_before_fee)
        .ok_or(ErrorCode::MathOverflow)?;

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

    // Note: Phase transitions on sells are less common but still checked
    let transitioned = pool.check_phase_transition()?;

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

    Ok(())
}
