use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};
use crate::state::{Config, Pool, UserPosition};
use crate::errors::ErrorCode;
use super::trade::{self, TradeDirection};

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
        constraint = quote_vault.owner == pool.key() @ ErrorCode::Unauthorized,
    )]
    pub quote_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = base_vault.key() == pool.base_vault,
        constraint = base_vault.owner == pool.key() @ ErrorCode::Unauthorized,
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

    /// User position for WAA tracking (init_if_needed to auto-create)
    #[account(
        init_if_needed,
        payer = user,
        space = UserPosition::LEN,
        seeds = [b"pos", pool.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Buy>,
    quote_amount: u64,      // Amount of CRX to spend
    min_base_amount: u64,   // Minimum tokens to receive (slippage protection)
) -> Result<()> {
    let config = &ctx.accounts.config;
    let pool_key = ctx.accounts.pool.key();
    let pool = &mut ctx.accounts.pool;
    let clock = Clock::get()?;

    // Shared validation: amount check
    trade::validate_trade_preconditions(quote_amount)?;

    // Get current phase parameters
    let current_fee_bps = pool.get_current_fee_bps();

    // Get correct reserves based on phase (virtual or real)
    let (quote_reserve, base_reserve) = pool.get_pricing_reserves();

    // Estimate output for anti-sniper check
    let estimated_output = pool.calculate_output(
        quote_amount,
        quote_reserve,
        base_reserve,
        0, // No fee for estimate
    )?;

    // Shared anti-sniper protection check
    trade::check_anti_sniper_protection(
        pool,
        config,
        estimated_output,
        base_reserve,
        clock.slot,
    )?;

    // CRITICAL FEE LOGIC: Take fee "off the cuff" BEFORE swap
    // This prevents liquidity degradation by not extracting fees from reserves

    // Shared fee calculation from input amount
    let fee_in_quote = trade::calculate_base_fee(quote_amount, current_fee_bps)?;

    // Calculate swap amount (quote_amount minus fee)
    let swap_amount = quote_amount
        .checked_sub(fee_in_quote)
        .ok_or(ErrorCode::MathOverflow)?;

    // Calculate output based on SWAP AMOUNT (not full quote_amount)
    // This maintains x*y=k invariant because only swap_amount enters reserves
    let base_output = pool.calculate_output(
        swap_amount,
        quote_reserve,
        base_reserve,
        0, // No fee here - already extracted above
    )?;

    // Shared slippage protection
    trade::validate_slippage(base_output, min_base_amount)?;

    // Shared minimum output validation
    trade::validate_minimum_output(base_output)?;

    // === CEI PATTERN: EFFECTS BEFORE INTERACTIONS ===
    // Update all state before executing token transfers to prevent reentrancy

    // Shared reserve update logic
    // CRITICAL: Only swap_amount enters vault (fee already went to creator)
    // This maintains x*y=k perfectly - no degradation!
    trade::update_reserves(
        pool,
        TradeDirection::Buy,
        swap_amount,  // Only swap amount enters reserves
        base_output,
    )?;

    // Shared statistics update
    trade::update_statistics(
        pool,
        TradeDirection::Buy,
        quote_amount,  // Track full trade amount for volume
        base_output,
        fee_in_quote,
    )?;

    // Update CRX price from config to keep pool state current
    trade::update_crx_price(pool, config, &clock)?;

    // Update user position for WAA tracking
    let user_position = &mut ctx.accounts.user_position;

    // Initialize position if first time
    if user_position.pool == Pubkey::default() {
        user_position.pool = pool.key();
        user_position.user = ctx.accounts.user.key();
        user_position.bump = ctx.bumps.user_position;
    } else {
        // CRITICAL: Validate position belongs to this user and pool
        // While Anchor's PDA seeds validation protects against this, explicit validation
        // provides defense in depth and clearer error messages
        require!(
            user_position.pool == pool.key() && user_position.user == ctx.accounts.user.key(),
            ErrorCode::Unauthorized
        );
    }

    // Update weighted average entry slot
    user_position.update_on_buy(base_output, clock.slot)?;

    // === CEI PATTERN: INTERACTIONS (TOKEN TRANSFERS) ===
    // All state updated - now safe to execute external calls

    // Transfer 1: Fee goes directly to creator (if any)
    if fee_in_quote > 0 {
        trade::transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.user_quote_account,
            &ctx.accounts.fee_recipient_account,
            ctx.accounts.user.to_account_info(),
            fee_in_quote,
            None,
        )?;
    }

    // Transfer 2: Swap amount goes to pool vault (NOT full quote_amount)
    trade::transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.user_quote_account,
        &ctx.accounts.quote_vault,
        ctx.accounts.user.to_account_info(),
        swap_amount,
        None,
    )?;

    // Transfer 3: Base tokens from pool to user
    let pool_seeds = &[
        b"pool",
        pool.base_mint.as_ref(),
        &[pool.bump],
    ];
    let signer = &[&pool_seeds[..]];

    trade::transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.base_vault,
        &ctx.accounts.user_base_account,
        pool.to_account_info(),
        base_output,
        Some(signer),
    )?;

    // Shared phase transition handling with event emission
    trade::handle_phase_transition(pool, pool_key, &clock)?;

    // Shared trade event emission
    trade::emit_trade_event(
        pool,
        pool_key,
        ctx.accounts.user.key(),
        TradeDirection::Buy,
        quote_amount,
        base_output,
        fee_in_quote,
        current_fee_bps,
        config,
        &clock,
    )?;

    // NOTE: msg!() calls removed for CU optimization (saves ~1-2k CU)
    // Trade execution confirmed via TradeExecuted event

    // CRITICAL: Always validate vault balances match reserves in production
    // This catches any token transfer failures or accounting mismatches
    // Cost: ~6k CU, but essential for security (defense in depth)
    trade::validate_vault_balances(
        pool,
        &ctx.accounts.quote_vault,
        &ctx.accounts.base_vault,
    )?;

    Ok(())
}
