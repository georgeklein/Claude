use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{Config, Pool, CurvePhase};
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct Buy<'info> {
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
        constraint = quote_vault.authority == pool.key() @ ErrorCode::Unauthorized,
    )]
    pub quote_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = base_vault.key() == pool.base_vault,
        constraint = base_vault.authority == pool.key() @ ErrorCode::Unauthorized,
    )]
    pub base_vault: Account<'info, TokenAccount>,

    /// User's quote token account (paying with CRX)
    #[account(
        mut,
        constraint = user_quote_account.mint == pool.quote_mint,
        constraint = user_quote_account.owner == user.key(),
    )]
    pub user_quote_account: Account<'info, TokenAccount>,

    /// User's base token account (receiving tokens)
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
    ctx: Context<Buy>,
    quote_amount: u64,      // Amount of CRX to spend
    min_base_amount: u64,   // Minimum tokens to receive (slippage protection)
) -> Result<()> {
    require!(quote_amount > 0, ErrorCode::InvalidAmount);

    let pool = &mut ctx.accounts.pool;
    let config = &ctx.accounts.config;
    let clock = Clock::get()?;

    // Get current phase parameters
    let current_fee_bps = pool.get_current_fee_bps();

    // Get correct reserves based on phase (virtual or real)
    let (quote_reserve, base_reserve) = pool.get_pricing_reserves();

    msg!("💰 Buy Request:");
    msg!("   Quote Amount: {} CRX", quote_amount);
    msg!("   Current Phase: {:?}", pool.current_phase);
    msg!("   Fee: {} bps", current_fee_bps);
    msg!("   Using {} reserves", if matches!(pool.current_phase, CurvePhase::Graduated) { "REAL" } else { "VIRTUAL" });

    // Anti-sniper protection check (only PreBonding phase)
    if pool.is_anti_sniper_active(clock.slot, config.anti_sniper_window_slots) {
        let max_trade_amount = (base_reserve as u128)
            .checked_mul(config.anti_sniper_max_trade_bps as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)? as u64;

        // Estimate output (without fee for check)
        let estimated_output = pool.calculate_output(
            quote_amount,
            quote_reserve,
            base_reserve,
            0, // No fee for estimate
        )?;

        require!(
            estimated_output <= max_trade_amount,
            ErrorCode::AntiSniperActive
        );

        msg!("🛡️  Anti-sniper active: max {} tokens", max_trade_amount);
    }

    // Calculate output amount using correct reserves
    let base_output = pool.calculate_output(
        quote_amount,
        quote_reserve,
        base_reserve,
        current_fee_bps,
    )?;

    // Slippage protection (CRITICAL SECURITY FIX from PumpSwap)
    require!(
        base_output >= min_base_amount,
        ErrorCode::SlippageExceeded
    );

    // Minimum output validation (prevents dust trades)
    const MIN_OUTPUT_AMOUNT: u64 = 1000; // 0.001 tokens (with 6 decimals)
    require!(
        base_output >= MIN_OUTPUT_AMOUNT,
        ErrorCode::OutputTooSmall
    );

    // Calculate protocol fee
    let base_output_before_fee = pool.calculate_output(
        quote_amount,
        quote_reserve,
        base_reserve,
        0, // Calculate without fee to get fee amount
    )?;

    let fee_amount = base_output_before_fee
        .checked_sub(base_output)
        .ok_or(ErrorCode::MathOverflow)?;

    // Convert fee to quote token equivalent for accounting
    // Add precision buffer to prevent rounding to zero
    let fee_in_quote = std::cmp::max(
        (fee_amount as u128)
            .checked_mul(quote_reserve as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(base_reserve as u128)
            .ok_or(ErrorCode::MathOverflow)? as u64,
        if fee_amount > 0 { 1 } else { 0 } // Minimum 1 lamport fee if fee > 0
    );

    // Transfer quote tokens from user to pool
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_quote_account.to_account_info(),
        to: ctx.accounts.quote_vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
        quote_amount,
    )?;

    // Transfer base tokens from pool to user
    let pool_seeds = &[
        b"pool",
        pool.base_mint.as_ref(),
        &[pool.bump],
    ];
    let signer = &[&pool_seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.base_vault.to_account_info(),
        to: ctx.accounts.user_base_account.to_account_info(),
        authority: pool.to_account_info(),
    };
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        ),
        base_output,
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
        fee_in_quote,
    )?;

    // Update reserves based on phase
    if matches!(pool.current_phase, CurvePhase::Graduated) {
        // GRADUATED PHASE: Pure constant product (x*y=k)
        // NO fees extracted to maintain invariant
        // Add full input, subtract full output
        pool.real_quote_reserves = pool.real_quote_reserves
            .checked_add(quote_amount)
            .ok_or(ErrorCode::MathOverflow)?;
        pool.real_base_reserves = pool.real_base_reserves
            .checked_sub(base_output)
            .ok_or(ErrorCode::MathOverflow)?;
        // Virtual reserves frozen at graduation
    } else {
        // PRE-BONDING PHASE: Update VIRTUAL reserves for bonding curve
        // CRITICAL: Must use before-fee amounts to maintain x*y=k invariant
        pool.virtual_quote_reserves = pool.virtual_quote_reserves
            .checked_add(quote_amount)
            .ok_or(ErrorCode::MathOverflow)?;
        pool.virtual_base_reserves = pool.virtual_base_reserves
            .checked_sub(base_output_before_fee)  // FIX: Use before-fee amount
            .ok_or(ErrorCode::MathOverflow)?;

        // Update real reserves (tracking actual vault balances with fees extracted)
        pool.real_quote_reserves = pool.real_quote_reserves
            .checked_add(quote_amount)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_sub(fee_in_quote)
            .ok_or(ErrorCode::MathOverflow)?;
        pool.real_base_reserves = pool.real_base_reserves
            .checked_sub(base_output)
            .ok_or(ErrorCode::MathOverflow)?;
    }

    // Update statistics
    pool.total_quote_volume = pool.total_quote_volume
        .checked_add(quote_amount)
        .ok_or(ErrorCode::MathOverflow)?;
    pool.total_base_volume = pool.total_base_volume
        .checked_add(base_output)
        .ok_or(ErrorCode::MathOverflow)?;
    pool.total_fees_collected = pool.total_fees_collected
        .checked_add(fee_in_quote)
        .ok_or(ErrorCode::MathOverflow)?;

    // Check for phase transition (DUAL-PHASE BONDING CURVE INNOVATION)
    let transitioned = pool.check_phase_transition()?;

    msg!("✅ Buy executed!");
    msg!("   Quote In: {} CRX", quote_amount);
    msg!("   Base Out: {} tokens", base_output);
    msg!("   Fee: {} tokens ({} bps)", fee_amount, current_fee_bps);

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
