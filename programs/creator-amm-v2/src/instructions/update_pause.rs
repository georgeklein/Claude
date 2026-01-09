use anchor_lang::prelude::*;
use crate::state::Config;
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct UpdatePause<'info> {
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

/// Toggle protocol pause state (Authority only)
///
/// Emergency kill switch to disable all trading during security incidents.
/// When paused=true, all buy/sell transactions will fail with ProtocolPaused error.
///
/// CRITICAL SECURITY: Only authority can toggle pause state.
pub fn handler(
    ctx: Context<UpdatePause>,
    paused: bool,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    config.paused = paused;

    if paused {
        msg!("EMERGENCY: Protocol trading PAUSED by authority");
    } else {
        msg!("Protocol trading RESUMED by authority");
    }

    Ok(())
}
