use anchor_lang::prelude::*;
use crate::state::Config;
use crate::errors::ErrorCode;
use crate::constants::*;

#[derive(Accounts)]
pub struct UpdateCrxPrice<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        constraint = authority.key() == config.authority @ ErrorCode::Unauthorized
    )]
    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateCrxPrice>, new_price_usd: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let clock = Clock::get()?;

    // Validate price is within absolute bounds
    require!(
        new_price_usd >= CRX_PRICE_MIN_USD && new_price_usd <= CRX_PRICE_MAX_USD,
        ErrorCode::InvalidCrxPrice
    );

    // CRITICAL: Limit price change to prevent graduation manipulation
    // Maximum 10% change per update to prevent authority from manipulating graduation thresholds
    // (graduation_threshold_crx = graduation_threshold_usd / crx_price_usd)
    if config.crx_price_usd > 0 {
        let price_ratio = (new_price_usd as u128)
            .checked_mul(10000)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(config.crx_price_usd as u128)
            .ok_or(ErrorCode::InvalidCrxPrice)?;

        // Ratio must be between 90% and 110% (9000-11000 bps)
        require!(
            price_ratio >= 9000 && price_ratio <= 11000,
            ErrorCode::InvalidCrxPrice
        );
    }

    config.crx_price_usd = new_price_usd;
    config.crx_price_last_updated = clock.unix_timestamp;

    msg!("CRX price updated to: {} (${:.2})",
        new_price_usd,
        new_price_usd as f64 / 1_000_000.0
    );

    Ok(())
}
