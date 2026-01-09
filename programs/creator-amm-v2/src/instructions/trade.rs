use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::constants::*;
use crate::state::{Config, Pool, CurvePhase};
use crate::errors::ErrorCode;
use crate::events::{TradeExecuted, PoolGraduated};

/// Trade direction enum for shared logic
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TradeDirection {
    Buy,
    Sell,
}

/// Shared trade validation - checks amount validity
#[inline(always)]
pub fn validate_trade_preconditions(
    amount: u64,
) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);

    // CRITICAL: Minimum input amount prevents fee rounding exploit
    // Attackers could split trades into 1-999 lamport chunks to avoid fees via rounding-to-zero
    require!(
        amount >= MIN_INPUT_AMOUNT,
        ErrorCode::InvalidAmount
    );

    Ok(())
}

/// Anti-sniper protection check for both buy and sell
/// Returns Ok if trade is allowed, Err if blocked
#[inline]
pub fn check_anti_sniper_protection(
    pool: &Pool,
    config: &Config,
    trade_amount: u64,
    base_reserve: u64,
    clock_slot: u64,
) -> Result<()> {
    if pool.is_anti_sniper_active(clock_slot, config.anti_sniper_window_slots) {
        let max_trade_amount_u128 = (base_reserve as u128)
            .checked_mul(config.anti_sniper_max_trade_bps as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(BPS_DENOMINATOR as u128)
            .ok_or(ErrorCode::MathOverflow)?;

        // CRITICAL FIX: Validate result fits in u64 before cast
        require!(
            max_trade_amount_u128 <= u64::MAX as u128,
            ErrorCode::MathOverflow
        );
        let max_trade_amount = max_trade_amount_u128 as u64;

        require!(
            trade_amount <= max_trade_amount,
            ErrorCode::AntiSniperActive
        );

        // NOTE: msg!() removed for CU optimization
        // Anti-sniper status is included in TradeExecuted event
    }
    Ok(())
}

/// Calculate base protocol fee from an amount
#[inline]
pub fn calculate_base_fee(
    amount: u64,
    fee_bps: u16,
) -> Result<u64> {
    if fee_bps == 0 {
        return Ok(0);
    }

    // Optimized: Use u128 for safety, but minimize operations
    let fee_u128 = (amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(BPS_DENOMINATOR as u128)
        .ok_or(ErrorCode::MathOverflow)?;

    // CRITICAL FIX: Validate result fits in u64 before cast
    require!(fee_u128 <= u64::MAX as u128, ErrorCode::MathOverflow);
    let fee = fee_u128 as u64;

    // Return calculated fee (may be 0 for small amounts)
    // Respects mathematical precision - no forced minimums
    Ok(fee)
}

/// Slippage protection check
#[inline(always)]
pub fn validate_slippage(
    output_amount: u64,
    min_output_amount: u64,
) -> Result<()> {
    require!(
        output_amount >= min_output_amount,
        ErrorCode::SlippageExceeded
    );
    Ok(())
}

/// Minimum output validation (prevents dust trades)
#[inline(always)]
pub fn validate_minimum_output(
    output_amount: u64,
) -> Result<()> {
    require!(
        output_amount >= MIN_OUTPUT_AMOUNT,
        ErrorCode::OutputTooSmall
    );
    Ok(())
}

/// Update pool reserves based on phase and trade direction
/// Returns the total amount that entered or left reserves (for statistics)
pub fn update_reserves(
    pool: &mut Pool,
    direction: TradeDirection,
    input_amount: u64,
    output_amount: u64,
) -> Result<()> {
    match direction {
        TradeDirection::Buy => {
            // Buy: CRX in (input_amount), tokens out (output_amount)
            if matches!(pool.current_phase, CurvePhase::Graduated) {
                // GRADUATED: Update real reserves only
                pool.real_quote_reserves = pool.real_quote_reserves
                    .checked_add(input_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
                pool.real_base_reserves = pool.real_base_reserves
                    .checked_sub(output_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
            } else {
                // PRE-BONDING: Update real reserves only (virtual reserves stay constant)
                pool.real_quote_reserves = pool.real_quote_reserves
                    .checked_add(input_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
                pool.real_base_reserves = pool.real_base_reserves
                    .checked_sub(output_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
        },
        TradeDirection::Sell => {
            // Sell: tokens in (input_amount), CRX out (output_amount)
            if matches!(pool.current_phase, CurvePhase::Graduated) {
                // GRADUATED: Update real reserves only
                pool.real_base_reserves = pool.real_base_reserves
                    .checked_add(input_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
                pool.real_quote_reserves = pool.real_quote_reserves
                    .checked_sub(output_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
            } else {
                // PRE-BONDING: Update real reserves only (virtual reserves stay constant)
                pool.real_base_reserves = pool.real_base_reserves
                    .checked_add(input_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
                pool.real_quote_reserves = pool.real_quote_reserves
                    .checked_sub(output_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
        },
    }
    Ok(())
}

/// Update pool volume statistics
pub fn update_statistics(
    pool: &mut Pool,
    direction: TradeDirection,
    input_amount: u64,
    output_amount: u64,
    _total_fee: u64,  // Unused after optimization
) -> Result<()> {
    match direction {
        TradeDirection::Buy => {
            // For buys: input is quote (CRX), output is base (tokens)
            pool.total_quote_volume = pool.total_quote_volume
                .checked_add(input_amount)
                .ok_or(ErrorCode::MathOverflow)?;
            // Removed: total_base_volume (derive from events)
        },
        TradeDirection::Sell => {
            // For sells: input is base (tokens), output is quote (CRX)
            // Removed: total_base_volume (derive from events)
            pool.total_quote_volume = pool.total_quote_volume
                .checked_add(output_amount)
                .ok_or(ErrorCode::MathOverflow)?;
        },
    }

    // Removed: total_fees_collected (derive from events)

    Ok(())
}

/// Update pool's CRX price from config
/// Should be called during every trade to keep price current
pub fn update_crx_price(
    pool: &mut Pool,
    config: &Config,
    clock: &Clock,
) -> Result<()> {
    let new_price = config.crx_price_usd;

    // Refresh virtual reserves if price changed significantly
    // This prevents virtual reserve stagnation and pricing errors
    pool.refresh_virtual_reserves(new_price)?;

    pool.last_crx_price_usd = new_price;
    pool.last_price_update_slot = clock.slot;
    Ok(())
}

/// Check for phase transition and emit events if needed
/// Returns true if transition occurred
pub fn handle_phase_transition(
    pool: &mut Pool,
    pool_key: Pubkey,
    clock: &Clock,
) -> Result<bool> {
    // Early return if already graduated (saves ~2k CU)
    if matches!(pool.current_phase, CurvePhase::Graduated) {
        return Ok(false);
    }

    // Capture pre-transition state for event
    let virtual_quote_before = pool.virtual_quote_reserves;
    let virtual_base_before = pool.virtual_base_reserves;

    // Check for phase transition (pass current slot for graduation tracking)
    let transitioned = pool.check_phase_transition(clock.slot)?;

    // Emit events if transition occurred
    if transitioned {
        let price_at_graduation = pool.get_spot_price()?;
        let market_cap_at_graduation = pool.get_market_cap_usd()?;
        let slots_to_graduate = clock.slot.saturating_sub(pool.created_at_slot);

        emit!(PoolGraduated {
            pool: pool_key,
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
            total_fees_collected: 0,  // Removed from Pool struct (derive from events)
            slots_to_graduate,
            timestamp: clock.unix_timestamp,
        });

        // PhaseTransition event removed - PoolGraduated provides same info (saves ~1k CU)
    }

    Ok(transitioned)
}

/// Emit trade executed event
/// Optimized: Removed pool, user, price, market_cap fields (saves ~5k CU)
pub fn emit_trade_event(
    pool: &Pool,
    _pool_key: Pubkey,  // Unused after optimization
    _user: Pubkey,      // Unused after optimization
    direction: TradeDirection,
    input_amount: u64,
    output_amount: u64,
    fee_amount: u64,
    fee_bps: u16,
    config: &Config,
    clock: &Clock,
) -> Result<()> {
    let (quote_reserves_after, base_reserves_after) = pool.get_pricing_reserves();
    let anti_sniper_active = pool.is_anti_sniper_active(clock.slot, config.anti_sniper_window_slots);

    emit!(TradeExecuted {
        base_mint: pool.base_mint,
        is_buy: direction == TradeDirection::Buy,
        input_amount,
        output_amount,
        fee_amount,
        fee_bps,
        phase: pool.current_phase,
        quote_reserves_after,
        base_reserves_after,
        real_crx_accumulated: pool.real_quote_reserves,
        anti_sniper_active,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

/// Validate reserves match vault balances
pub fn validate_vault_balances(
    pool: &Pool,
    quote_vault: &Account<TokenAccount>,
    base_vault: &Account<TokenAccount>,
) -> Result<()> {
    require!(
        pool.real_quote_reserves == quote_vault.amount,
        ErrorCode::ReserveVaultMismatch
    );
    require!(
        pool.real_base_reserves == base_vault.amount,
        ErrorCode::ReserveVaultMismatch
    );
    Ok(())
}

/// Helper to execute token transfer
pub fn transfer_tokens<'info>(
    token_program: &Program<'info, Token>,
    from: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    authority: AccountInfo<'info>,
    amount: u64,
    signer_seeds: Option<&[&[&[u8]]]>,
) -> Result<()> {
    let cpi_accounts = Transfer {
        from: from.to_account_info(),
        to: to.to_account_info(),
        authority,
    };

    if let Some(seeds) = signer_seeds {
        token::transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                cpi_accounts,
                seeds,
            ),
            amount,
        )?;
    } else {
        token::transfer(
            CpiContext::new(token_program.to_account_info(), cpi_accounts),
            amount,
        )?;
    }

    Ok(())
}
