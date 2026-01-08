use anchor_lang::prelude::*;
use crate::state::Config;
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct SetPaused<'info> {
    /// Global configuration (PDA)
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    /// Protocol authority - only they can pause/unpause
    #[account(
        constraint = authority.key() == config.authority @ ErrorCode::Unauthorized
    )]
    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
    let config = &mut ctx.accounts.config;

    let old_state = config.is_paused;
    config.is_paused = paused;

    msg!("Protocol pause state changed: {} -> {}", old_state, paused);
    if paused {
        msg!("PROTOCOL PAUSED: All trading is now disabled");
    } else {
        msg!("PROTOCOL UNPAUSED: Trading is now enabled");
    }

    Ok(())
}
