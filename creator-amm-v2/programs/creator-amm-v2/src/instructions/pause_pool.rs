use anchor_lang::prelude::*;
use crate::state::{Config, Pool};
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct PausePool<'info> {
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

    /// Only the protocol authority can pause/unpause pools
    #[account(
        constraint = authority.key() == config.authority @ ErrorCode::Unauthorized
    )]
    pub authority: Signer<'info>,
}

pub fn handler(
    ctx: Context<PausePool>,
    paused: bool,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    let previous_state = pool.is_paused;
    pool.is_paused = paused;

    msg!("🚨 Pool pause status changed:");
    msg!("   Pool: {}", pool.key());
    msg!("   Base Mint: {}", pool.base_mint);
    msg!("   Previous State: {}", if previous_state { "PAUSED" } else { "ACTIVE" });
    msg!("   New State: {}", if paused { "PAUSED" } else { "ACTIVE" });
    msg!("   Authority: {}", ctx.accounts.authority.key());

    Ok(())
}
