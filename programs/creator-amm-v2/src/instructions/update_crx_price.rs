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
    // Validate price is reasonable
    require!(
        new_price_usd >= CRX_PRICE_MIN_USD && new_price_usd <= CRX_PRICE_MAX_USD,
        ErrorCode::InvalidCrxPrice
    );

    let config = &mut ctx.accounts.config;
    let clock = Clock::get()?;

    config.crx_price_usd = new_price_usd;
    config.crx_price_last_updated = clock.unix_timestamp;

    msg!("CRX price updated to: {} (${:.2})",
        new_price_usd,
        new_price_usd as f64 / 1_000_000.0
    );

    Ok(())
}
