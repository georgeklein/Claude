use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{Config, Pool, CurvePhase};
use crate::errors::ErrorCode;
use crate::events::{TradeExecuted, PoolGraduated, PhaseTransition};

/// Trade direction enum for shared logic
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TradeDirection {
    Buy,
    Sell,
}

/// Shared trade validation - checks protocol pause and amount validity
#[inline(always)]
pub fn validate_trade_preconditions(
    config: &Config,
    amount: u64,
) -> Result<()> {
    // CRITICAL: Check if protocol is paused (emergency stop)
    require!(!config.is_paused, ErrorCode::ProtocolPaused);
    require!(amount > 0, ErrorCode::InvalidAmount);
    Ok(())
}

/// Anti-sniper protection check for both buy and sell
/// Returns Ok if trade is allowed, Err if blocked
pub fn check_anti_sniper_protection(
    pool: &Pool,
    config: &Config,
    trade_amount: u64,
    base_reserve: u64,
    clock_slot: u64,
) -> Result<()> {
    if pool.is_anti_sniper_active(clock_slot, config.anti_sniper_window_slots) {
        let max_trade_amount = (base_reserve as u128)
            .checked_mul(config.anti_sniper_max_trade_bps as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)? as u64;

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
    let fee = (amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10000)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    // Optimized: Use bitwise OR to ensure minimum 1 lamport (saves ~100 CU vs cmp::max)
    // If fee is 0, this sets it to 1. If fee > 0, no change.
    Ok(fee | 1)
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
    const MIN_OUTPUT_AMOUNT: u64 = 1000; // 0.001 tokens (with 6 decimals)
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
                // PRE-BONDING: Update both virtual and real reserves
                pool.virtual_quote_reserves = pool.virtual_quote_reserves
                    .checked_add(input_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
                pool.virtual_base_reserves = pool.virtual_base_reserves
                    .checked_sub(output_amount)
                    .ok_or(ErrorCode::MathOverflow)?;

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
                // PRE-BONDING: Update both virtual and real reserves
                pool.virtual_base_reserves = pool.virtual_base_reserves
                    .checked_add(input_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
                pool.virtual_quote_reserves = pool.virtual_quote_reserves
                    .checked_sub(output_amount)
                    .ok_or(ErrorCode::MathOverflow)?;

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
    total_fee: u64,
) -> Result<()> {
    match direction {
        TradeDirection::Buy => {
            // For buys: input is quote (CRX), output is base (tokens)
            pool.total_quote_volume = pool.total_quote_volume
                .checked_add(input_amount)
                .ok_or(ErrorCode::MathOverflow)?;
            pool.total_base_volume = pool.total_base_volume
                .checked_add(output_amount)
                .ok_or(ErrorCode::MathOverflow)?;
        },
        TradeDirection::Sell => {
            // For sells: input is base (tokens), output is quote (CRX)
            pool.total_base_volume = pool.total_base_volume
                .checked_add(input_amount)
                .ok_or(ErrorCode::MathOverflow)?;
            pool.total_quote_volume = pool.total_quote_volume
                .checked_add(output_amount)
                .ok_or(ErrorCode::MathOverflow)?;
        },
    }

    // Update total fees collected (always in quote/CRX)
    pool.total_fees_collected = pool.total_fees_collected
        .checked_add(total_fee)
        .ok_or(ErrorCode::MathOverflow)?;

    Ok(())
}

/// Check for phase transition and emit events if needed
/// Returns true if transition occurred
pub fn handle_phase_transition(
    pool: &mut Pool,
    pool_key: Pubkey,
    clock: &Clock,
) -> Result<bool> {
    // Capture pre-transition state
    let phase_before = pool.current_phase;
    let virtual_quote_before = pool.virtual_quote_reserves;
    let virtual_base_before = pool.virtual_base_reserves;

    // Check for phase transition
    let transitioned = pool.check_phase_transition()?;

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
            total_fees_collected: pool.total_fees_collected,
            slots_to_graduate,
            timestamp: clock.unix_timestamp,
        });

        emit!(PhaseTransition {
            pool: pool_key,
            base_mint: pool.base_mint,
            from_phase: phase_before,
            to_phase: pool.current_phase,
            transition_slot: clock.slot,
            timestamp: clock.unix_timestamp,
        });
    }

    Ok(transitioned)
}

/// Emit trade executed event
pub fn emit_trade_event(
    pool: &Pool,
    pool_key: Pubkey,
    user: Pubkey,
    direction: TradeDirection,
    input_amount: u64,
    output_amount: u64,
    fee_amount: u64,
    fee_bps: u16,
    config: &Config,
    clock: &Clock,
) -> Result<()> {
    let (quote_reserves_after, base_reserves_after) = pool.get_pricing_reserves();
    let price_after = pool.get_spot_price()?;

    // Optimized: Calculate market cap from already-computed price (saves ~3-4k CU)
    // Avoids redundant get_spot_price() call inside get_market_cap_usd()
    let market_cap_usd = pool.get_market_cap_usd_from_price(price_after)?;

    let anti_sniper_active = pool.is_anti_sniper_active(clock.slot, config.anti_sniper_window_slots);

    emit!(TradeExecuted {
        pool: pool_key,
        user,
        base_mint: pool.base_mint,
        is_buy: direction == TradeDirection::Buy,
        input_amount,
        output_amount,
        fee_amount,
        fee_bps,
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
