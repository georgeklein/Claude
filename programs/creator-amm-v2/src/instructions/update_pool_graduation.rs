use anchor_lang::prelude::*;
use crate::state::{Config, Pool};
use crate::errors::ErrorCode;
use crate::constants::*;
use crate::events::PoolGraduationUpdated;

#[derive(Accounts)]
pub struct UpdatePoolGraduation<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
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
        constraint = authority.key() == config.authority @ ErrorCode::Unauthorized
    )]
    pub authority: Signer<'info>,
}

/// Update a pool's graduation threshold (Authority only)
///
/// Allows authority to dynamically adjust graduation thresholds based on:
/// - Market conditions
/// - Previous day's average price/volume
/// - Manual adjustments for specific pools
///
/// Can be automated with cron jobs to update daily based on metrics.
pub fn handler(
    ctx: Context<UpdatePoolGraduation>,
    new_graduation_threshold_usd: u64,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let pool = &mut ctx.accounts.pool;
    let clock = Clock::get()?;

    // Cannot update graduated pools
    require!(
        pool.current_phase == crate::state::CurvePhase::PreBonding,
        ErrorCode::InvalidMarketCap
    );

    // Validate new threshold is reasonable
    require!(
        new_graduation_threshold_usd >= MIN_GRADUATION_USD,
        ErrorCode::InvalidMarketCap
    );
    require!(
        new_graduation_threshold_usd <= MAX_GRADUATION_USD,
        ErrorCode::InvalidMarketCap
    );

    // CRITICAL: Validate new threshold is higher than CURRENT market cap (not just initial target)
    // This prevents authority from indefinitely delaying graduation by raising threshold
    // as the pool grows closer to graduation
    let current_market_cap_usd = pool.get_market_cap_usd()?;
    require!(
        new_graduation_threshold_usd > current_market_cap_usd,
        ErrorCode::InvalidMarketCap
    );

    // Also validate it's higher than initial target (backwards compatibility check)
    require!(
        new_graduation_threshold_usd > pool.target_market_cap_usd,
        ErrorCode::InvalidMarketCap
    );

    // Get CRX price from config
    let crx_price_usd = config.crx_price_usd;

    // Calculate new graduation threshold in CRX
    let new_graduation_threshold_crx = (new_graduation_threshold_usd as u128)
        .checked_mul(CRX_DECIMALS as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(crx_price_usd as u128)
        .ok_or(ErrorCode::ThresholdCalculationFailed)? as u64;

    // Store old values for event
    let old_graduation_threshold_usd = pool.graduation_threshold_crx
        .checked_mul(crx_price_usd)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(CRX_DECIMALS)
        .ok_or(ErrorCode::ThresholdCalculationFailed)?;
    let old_graduation_threshold_crx = pool.graduation_threshold_crx;

    // Update pool
    pool.graduation_threshold_crx = new_graduation_threshold_crx;

    // Emit event for indexers
    emit!(PoolGraduationUpdated {
        pool: pool.key(),
        base_mint: pool.base_mint,
        old_graduation_threshold_usd,
        new_graduation_threshold_usd,
        old_graduation_threshold_crx,
        new_graduation_threshold_crx,
        crx_price_usd,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Pool graduation threshold updated: ${} USD ({} CRX)",
        new_graduation_threshold_usd as f64 / 1_000_000.0,
        new_graduation_threshold_crx as f64 / 1_000_000.0
    );

    Ok(())
}
