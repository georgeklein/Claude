use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};
use crate::state::{Config, Pool, UserPosition};
use crate::errors::ErrorCode;
use crate::constants::*;
use super::trade::{self, TradeDirection};

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

    /// Pool creator's quote token account (receives trading fees)
    #[account(
        mut,
        constraint = fee_recipient_account.mint == pool.quote_mint @ ErrorCode::Unauthorized,
        constraint = fee_recipient_account.owner == pool.creator @ ErrorCode::Unauthorized,
    )]
    pub fee_recipient_account: Account<'info, TokenAccount>,

    /// Protocol fee recipient (receives protocol fee for CRX deflation)
    #[account(
        mut,
        constraint = protocol_fee_recipient.mint == pool.quote_mint @ ErrorCode::Unauthorized,
        constraint = protocol_fee_recipient.owner == config.fee_recipient @ ErrorCode::Unauthorized,
    )]
    pub protocol_fee_recipient: Account<'info, TokenAccount>,

    /// User position for WAA tracking (must exist for sells)
    #[account(
        mut,
        seeds = [b"pos", pool.key().as_ref(), user.key().as_ref()],
        bump = user_position.bump,
        constraint = user_position.pool == pool.key() @ ErrorCode::Unauthorized,
        constraint = user_position.user == user.key() @ ErrorCode::Unauthorized,
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<Sell>,
    base_amount: u64,       // Amount of tokens to sell
    min_quote_amount: u64,  // Minimum CRX to receive (slippage protection)
) -> Result<()> {
    let config = &ctx.accounts.config;
    let pool_key = ctx.accounts.pool.key();
    let pool = &mut ctx.accounts.pool;
    let clock = Clock::get()?;

    // CRITICAL FIX: Validate CRX price freshness before trading
    config.validate_price_freshness(&clock)?;

    // NOTE: msg!() calls removed for CU optimization (saves ~1-2k CU)
    // Trade execution confirmed via TradeExecuted event
    // Phase transitions confirmed via PhaseTransition event

    // Shared validation: amount check
    trade::validate_trade_preconditions(base_amount)?;

    // Get current phase parameters
    let current_fee_bps = pool.get_current_fee_bps();

    // Get correct reserves based on phase (virtual or real)
    let (quote_reserve, base_reserve) = pool.get_pricing_reserves();

    // CRITICAL FEE LOGIC: Calculate output first, then extract fee from output
    // This maintains consistency with buy.rs and prevents token mint mismatch

    // Calculate output WITHOUT fee first
    let quote_output_before_fee = pool.calculate_output(
        base_amount,
        base_reserve,
        quote_reserve,
        0, // No fee in calculation
    )?;

    // Shared base fee calculation from OUTPUT (in quote tokens)
    let base_fee_in_quote = trade::calculate_base_fee(quote_output_before_fee, current_fee_bps)?;

    // Calculate WAA-based extra sell fee (anti-sniper)
    // Skip if pool has WAA disabled (pure permissionless mode)
    let extra_fee_bps = if pool.disable_waa {
        0 // No WAA fees - pure permissionless trading
    } else {
        let user_position = &ctx.accounts.user_position;
        user_position.calculate_extra_sell_fee_bps(clock.slot)?
    };

    let extra_fee_in_quote = trade::calculate_base_fee(quote_output_before_fee, extra_fee_bps as u16)?;

    // Calculate protocol fee (global, mutable by authority)
    let protocol_fee_in_quote = trade::calculate_base_fee(quote_output_before_fee, config.protocol_fee_bps)?;

    // CRITICAL FIX: Validate combined fee doesn't exceed reasonable bounds
    // Base fee (up to 100 bps) + WAA fee (up to 1000 bps) + Protocol fee (up to 1000 bps) = max 2100 bps
    // Allow up to 2500 bps (25%) for safety margin
    let effective_fee_bps = (current_fee_bps as u64)
        .checked_add(extra_fee_bps)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_add(config.protocol_fee_bps as u64)
        .ok_or(ErrorCode::MathOverflow)?;
    const MAX_EFFECTIVE_FEE_BPS: u64 = 2500; // 25% max total fee
    require!(
        effective_fee_bps <= MAX_EFFECTIVE_FEE_BPS,
        ErrorCode::InvalidFee
    );

    // Total fee (base + extra + protocol)
    let creator_fees = base_fee_in_quote
        .checked_add(extra_fee_in_quote)
        .ok_or(ErrorCode::MathOverflow)?;

    let total_fee_in_quote = creator_fees
        .checked_add(protocol_fee_in_quote)
        .ok_or(ErrorCode::MathOverflow)?;

    // Final output to user (after total fee)
    let quote_output = quote_output_before_fee
        .checked_sub(total_fee_in_quote)
        .ok_or(ErrorCode::MathOverflow)?;

    // Shared slippage protection
    trade::validate_slippage(quote_output, min_quote_amount)?;

    // Shared minimum output validation
    trade::validate_minimum_output(quote_output)?;

    // === CEI PATTERN: EFFECTS BEFORE INTERACTIONS ===
    // Update all state before executing token transfers to prevent reentrancy

    // Shared reserve update logic
    // CRITICAL: Full base_amount enters vault, fee extracted from output
    // This maintains x*y=k perfectly - no degradation!

    // Total quote leaving vault = quote_output (to user) + fee (to creator)
    let total_quote_out = quote_output_before_fee;

    trade::update_reserves(
        pool,
        TradeDirection::Sell,
        base_amount,       // Full amount enters reserves
        total_quote_out,   // Total output leaves reserves
    )?;

    // Shared statistics update
    trade::update_statistics(
        pool,
        TradeDirection::Sell,
        base_amount,
        quote_output,
        total_fee_in_quote,  // Track total fees (base + WAA) in CRX
    )?;

    // Update CRX price from config to keep pool state current
    trade::update_crx_price(pool, config, &clock)?;

    // Update user position - reduce tracked amount after sell
    let user_position = &mut ctx.accounts.user_position;
    user_position.update_on_sell(base_amount)?;

    // === CEI PATTERN: INTERACTIONS (TOKEN TRANSFERS) ===
    // All state updated - now safe to execute external calls

    // Transfer 1: All base tokens from user to pool vault
    trade::transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.user_base_account,
        &ctx.accounts.base_vault,
        ctx.accounts.user.to_account_info(),
        base_amount,
        None,
    )?;

    // Setup pool signer for outgoing transfers
    let pool_seeds = &[
        b"pool",
        pool.base_mint.as_ref(),
        &[pool.bump],
    ];
    let signer = &[&pool_seeds[..]];

    // Transfer 2: Quote tokens from pool to user (after fee deduction)
    trade::transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.quote_vault,
        &ctx.accounts.user_quote_account,
        pool.to_account_info(),
        quote_output,
        Some(signer),
    )?;

    // Transfer 3: Creator fees (base + WAA) in QUOTE tokens from pool to creator
    if creator_fees > 0 {
        trade::transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.quote_vault,
            &ctx.accounts.fee_recipient_account,
            pool.to_account_info(),
            creator_fees,
            Some(signer),
        )?;
    }

    // Transfer 4: Protocol fee in QUOTE tokens from pool to protocol
    if protocol_fee_in_quote > 0 {
        trade::transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.quote_vault,
            &ctx.accounts.protocol_fee_recipient,
            pool.to_account_info(),
            protocol_fee_in_quote,
            Some(signer),
        )?;
    }

    // Shared phase transition handling with event emission
    // Note: Phase transitions on sells are less common but still checked
    let _transitioned = trade::handle_phase_transition(pool, pool_key, &clock)?;

    // Calculate effective fee bps (base + WAA) for event
    let effective_fee_bps = current_fee_bps
        .checked_add(extra_fee_bps as u16)
        .ok_or(ErrorCode::MathOverflow)?;

    // Shared trade event emission
    trade::emit_trade_event(
        pool,
        pool_key,
        ctx.accounts.user.key(),
        TradeDirection::Sell,
        base_amount,
        quote_output,
        total_fee_in_quote,  // Report total fee (base + WAA) in CRX
        effective_fee_bps,   // Effective fee including WAA penalty
        config,
        &clock,
    )?;

    // CRITICAL FIX: Reload accounts after CPI to detect any state tampering
    // Defense in depth against re-entrancy attacks
    pool.reload()?;
    ctx.accounts.quote_vault.reload()?;
    ctx.accounts.base_vault.reload()?;

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
