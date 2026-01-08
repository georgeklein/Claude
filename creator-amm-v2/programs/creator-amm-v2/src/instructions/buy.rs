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
        constraint = pool.current_phase != CurvePhase::Graduated @ ErrorCode::PoolGraduated,
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
        constraint = fee_recipient_account.mint == pool.quote_mint,
        constraint = fee_recipient_account.owner == config.fee_recipient,
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
    let current_fee_bps = pool.get_current_fee_bps(config);

    msg!("💰 Buy Request:");
    msg!("   Quote Amount: {} CRX", quote_amount);
    msg!("   Current Phase: {:?}", pool.current_phase);
    msg!("   Fee: {} bps", current_fee_bps);

    // Anti-sniper protection check
    if pool.is_anti_sniper_active(clock.slot, config.anti_sniper_window_slots) {
        let max_trade_amount = (pool.virtual_base_reserves as u128)
            .checked_mul(config.anti_sniper_max_trade_bps as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)? as u64;

        // Estimate output (without fee for check)
        let estimated_output = pool.calculate_output(
            quote_amount,
            pool.virtual_quote_reserves,
            pool.virtual_base_reserves,
            0, // No fee for estimate
        )?;

        require!(
            estimated_output <= max_trade_amount,
            ErrorCode::AntiSniperActive
        );

        msg!("🛡️  Anti-sniper active: max {} tokens", max_trade_amount);
    }

    // Calculate output amount using bonding curve
    let base_output = pool.calculate_output(
        quote_amount,
        pool.virtual_quote_reserves,
        pool.virtual_base_reserves,
        current_fee_bps,
    )?;

    // Slippage protection (CRITICAL SECURITY FIX from PumpSwap)
    require!(
        base_output >= min_base_amount,
        ErrorCode::SlippageExceeded
    );

    // Calculate protocol fee
    let base_output_before_fee = pool.calculate_output(
        quote_amount,
        pool.virtual_quote_reserves,
        pool.virtual_base_reserves,
        0, // Calculate without fee to get fee amount
    )?;

    let fee_amount = base_output_before_fee
        .checked_sub(base_output)
        .ok_or(ErrorCode::MathOverflow)?;

    // Convert fee to quote token equivalent for accounting
    let fee_in_quote = (fee_amount as u128)
        .checked_mul(pool.virtual_quote_reserves as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(pool.virtual_base_reserves as u128)
        .ok_or(ErrorCode::MathOverflow)? as u64;

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

    // Update pool virtual reserves
    pool.virtual_quote_reserves = pool.virtual_quote_reserves
        .checked_add(quote_amount)
        .ok_or(ErrorCode::MathOverflow)?;
    pool.virtual_base_reserves = pool.virtual_base_reserves
        .checked_sub(base_output)
        .ok_or(ErrorCode::MathOverflow)?;

    // Update pool real reserves
    pool.real_quote_reserves = pool.real_quote_reserves
        .checked_add(quote_amount)
        .ok_or(ErrorCode::MathOverflow)?;
    pool.real_base_reserves = pool.real_base_reserves
        .checked_sub(base_output)
        .ok_or(ErrorCode::MathOverflow)?;

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
    msg!("   New Price: {} CRX per token",
        (pool.virtual_quote_reserves as f64) / (pool.virtual_base_reserves as f64)
    );
    msg!("   Real CRX Accumulated: {} / {}",
        pool.real_quote_reserves,
        match pool.current_phase {
            CurvePhase::PreBonding => pool.pre_bonding_threshold_crx,
            CurvePhase::PostBonding => pool.graduation_threshold_crx,
            CurvePhase::Graduated => pool.graduation_threshold_crx,
        }
    );

    if transitioned {
        msg!("🎉 Phase transition occurred!");
    }

    Ok(())
}
