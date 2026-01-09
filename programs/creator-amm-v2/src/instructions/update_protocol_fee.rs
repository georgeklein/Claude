use anchor_lang::prelude::*;
use crate::state::Config;
use crate::errors::ErrorCode;
use crate::events::ProtocolFeeUpdated;

#[derive(Accounts)]
pub struct UpdateProtocolFee<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ ErrorCode::Unauthorized
    )]
    pub config: Account<'info, Config>,

    /// Protocol authority (only they can update protocol fee)
    pub authority: Signer<'info>,
}

pub fn handler(
    ctx: Context<UpdateProtocolFee>,
    new_protocol_fee_bps: u16,
) -> Result<()> {
    // Validate reasonable range (0-1000 bps = 0-10%)
    require!(
        new_protocol_fee_bps <= 1000,
        ErrorCode::InvalidFee
    );

    let config = &mut ctx.accounts.config;
    let old_fee_bps = config.protocol_fee_bps;

    config.protocol_fee_bps = new_protocol_fee_bps;

    emit!(ProtocolFeeUpdated {
        old_fee_bps,
        new_fee_bps: new_protocol_fee_bps,
        authority: ctx.accounts.authority.key(),
        slot: Clock::get()?.slot,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!("Protocol fee updated: {} bps -> {} bps", old_fee_bps, new_protocol_fee_bps);

    Ok(())
}
