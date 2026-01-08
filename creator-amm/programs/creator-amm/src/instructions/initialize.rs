use anchor_lang::prelude::*;
use crate::state::Config;
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = Config::LEN,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// Protocol fee recipient wallet
    /// CHECK: This account receives protocol fees, validated by authority
    pub fee_recipient: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    protocol_fee_bps: u16,
    anti_sniper_window: u64,
    anti_sniper_max_trade_bps: u16,
) -> Result<()> {
    require!(protocol_fee_bps <= 10000, ErrorCode::InvalidFee);
    require!(anti_sniper_max_trade_bps <= 10000, ErrorCode::InvalidFee);

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.fee_recipient = ctx.accounts.fee_recipient.key();
    config.protocol_fee_bps = protocol_fee_bps;
    config.anti_sniper_window = anti_sniper_window;
    config.anti_sniper_max_trade_bps = anti_sniper_max_trade_bps;
    config.bump = ctx.bumps.config;

    msg!("Creator AMM initialized");
    msg!("Protocol fee: {} bps", protocol_fee_bps);
    msg!("Anti-sniper window: {} slots", anti_sniper_window);
    msg!("Anti-sniper max trade: {} bps", anti_sniper_max_trade_bps);

    Ok(())
}
