use anchor_lang::prelude::*;
use crate::state::Config;
use crate::errors::ErrorCode;
use crate::events::WaaConfigUpdated;

#[derive(Accounts)]
pub struct UpdateWaaConfig<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ ErrorCode::Unauthorized
    )]
    pub config: Account<'info, Config>,

    /// Protocol authority (only they can update WAA config)
    pub authority: Signer<'info>,
}

/// Update WAA (Weighted Average Age) anti-dump configuration
///
/// Allows authority to adjust time windows and fees for the WAA anti-dump system.
/// Changes are retroactive - affect all pools with WAA enabled immediately.
///
/// Use cases:
/// - Tune fees based on market feedback
/// - Adjust time windows for different market conditions
/// - Disable WAA entirely by setting fees to 0
/// - Enable more aggressive anti-sniper protection
///
/// # Parameters
/// - tier1_slots: T1 threshold (e.g., 25 slots = 10s)
/// - tier2_slots: T2 threshold (e.g., 150 slots = 1min)
/// - tier3_slots: T3 threshold (e.g., 750 slots = 5min)
/// - fee_max_bps: Maximum fee (e.g., 300 = 3%)
/// - fee_min_bps: Minimum fee (e.g., 50 = 0.5%)
///
/// # Security
/// - Authority-only (prevents griefing)
/// - Validates tiers are ordered (T1 < T2 < T3)
/// - Validates fees are reasonable (max < 10%)
/// - Emits WaaConfigUpdated event for transparency
pub fn handler(
    ctx: Context<UpdateWaaConfig>,
    tier1_slots: u64,
    tier2_slots: u64,
    tier3_slots: u64,
    fee_max_bps: u64,
    fee_min_bps: u64,
) -> Result<()> {
    // Validate tier ordering
    require!(
        tier1_slots < tier2_slots && tier2_slots < tier3_slots,
        ErrorCode::InvalidFee
    );

    // Validate reasonable fee range (0-1000 bps = 0-10%)
    require!(
        fee_max_bps <= 1000 && fee_min_bps <= fee_max_bps,
        ErrorCode::InvalidFee
    );

    let config = &mut ctx.accounts.config;

    // Store old values for event
    let old_config = (
        config.waa_tier1_slots,
        config.waa_tier2_slots,
        config.waa_tier3_slots,
        config.waa_fee_max_bps,
        config.waa_fee_min_bps,
    );

    // Update WAA config
    config.waa_tier1_slots = tier1_slots;
    config.waa_tier2_slots = tier2_slots;
    config.waa_tier3_slots = tier3_slots;
    config.waa_fee_max_bps = fee_max_bps;
    config.waa_fee_min_bps = fee_min_bps;

    emit!(WaaConfigUpdated {
        old_tier1_slots: old_config.0,
        old_tier2_slots: old_config.1,
        old_tier3_slots: old_config.2,
        old_fee_max_bps: old_config.3,
        old_fee_min_bps: old_config.4,
        new_tier1_slots: tier1_slots,
        new_tier2_slots: tier2_slots,
        new_tier3_slots: tier3_slots,
        new_fee_max_bps: fee_max_bps,
        new_fee_min_bps: fee_min_bps,
        authority: ctx.accounts.authority.key(),
        slot: Clock::get()?.slot,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!(
        "WAA config updated: T1={} T2={} T3={}, fees={}→{} bps",
        tier1_slots, tier2_slots, tier3_slots, fee_min_bps, fee_max_bps
    );

    Ok(())
}
