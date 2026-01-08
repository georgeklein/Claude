use anchor_lang::prelude::*;
use crate::state::Config;
use crate::errors::ErrorCode;
use crate::events::ConfigInitialized;

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// Global protocol configuration (PDA)
    /// CRITICAL SECURITY: This can only be initialized ONCE due to PDA.
    /// The deployer MUST call initialize() immediately after program deployment
    /// to prevent front-running attacks where a malicious actor becomes the authority.
    #[account(
        init,
        payer = authority,
        space = Config::LEN,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    /// Protocol authority (becomes config.authority)
    /// SECURITY NOTE: First caller wins! Deploy and initialize atomically.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Protocol fee recipient wallet
    /// CHECK: Validated by authority
    pub fee_recipient: AccountInfo<'info>,

    /// CRX price oracle (Pyth or Switchboard)
    /// CHECK: Validated by authority
    pub crx_price_oracle: AccountInfo<'info>,

    /// CRX token mint
    /// CHECK: Validated by authority
    pub crx_mint: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    anti_sniper_window_slots: u64,
    anti_sniper_max_trade_bps: u16,
    oracle_max_age_seconds: i64,
    oracle_max_confidence_bps: u64,
) -> Result<()> {
    require!(anti_sniper_max_trade_bps <= 10000, ErrorCode::InvalidFee);
    require!(oracle_max_age_seconds > 0, ErrorCode::InvalidOracle);
    require!(oracle_max_confidence_bps <= 1000, ErrorCode::OracleConfidenceTooLow);

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.fee_recipient = ctx.accounts.fee_recipient.key();
    config.crx_price_oracle = ctx.accounts.crx_price_oracle.key();
    config.crx_mint = ctx.accounts.crx_mint.key();
    config.anti_sniper_window_slots = anti_sniper_window_slots;
    config.anti_sniper_max_trade_bps = anti_sniper_max_trade_bps;
    config.oracle_max_age_seconds = oracle_max_age_seconds;
    config.oracle_max_confidence_bps = oracle_max_confidence_bps;
    config.bump = ctx.bumps.config;

    let clock = Clock::get()?;
    emit!(ConfigInitialized {
        authority: config.authority,
        fee_recipient: config.fee_recipient,
        crx_mint: config.crx_mint,
        crx_price_oracle: config.crx_price_oracle,
        anti_sniper_window_slots,
        anti_sniper_max_trade_bps,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
