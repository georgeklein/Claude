use anchor_lang::prelude::*;
use crate::state::Config;
use crate::errors::ErrorCode;
use crate::events::AuthorityUpdated;

#[derive(Accounts)]
pub struct UpdateAuthority<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ ErrorCode::Unauthorized
    )]
    pub config: Account<'info, Config>,

    /// Current authority (must sign)
    pub authority: Signer<'info>,
}

/// Update protocol authority
///
/// Transfers control to a new authority wallet. This is irreversible.
/// Only the current authority can call this.
///
/// Use cases:
/// - Upgrade to multisig (e.g., Squads)
/// - Transfer to DAO governance
/// - Rotate compromised keys
///
/// # Security
/// - One-step transfer (no acceptance required)
/// - Irreversible - new authority has full control
/// - Emits AuthorityUpdated event for transparency
pub fn handler(
    ctx: Context<UpdateAuthority>,
    new_authority: Pubkey,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let old_authority = config.authority;

    // Validate new authority is not default pubkey
    require!(
        new_authority != Pubkey::default(),
        ErrorCode::Unauthorized
    );

    // Prevent no-op updates (authority must actually change)
    require!(
        new_authority != old_authority,
        ErrorCode::Unauthorized
    );

    // Update authority
    config.authority = new_authority;

    // Emit event for transparency
    emit!(AuthorityUpdated {
        old_authority,
        new_authority,
        slot: Clock::get()?.slot,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!("Authority updated: {} -> {}", old_authority, new_authority);

    Ok(())
}
