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
    pre_bonding_fee_bps: u16,
    pre_bonding_threshold_usd: u64,
    post_bonding_fee_bps: u16,
    graduation_threshold_usd: u64,
    anti_sniper_window_slots: u64,
    anti_sniper_max_trade_bps: u16,
    oracle_max_age_seconds: i64,
    oracle_max_confidence_bps: u64,
) -> Result<()> {
    // Validate fees
    require!(pre_bonding_fee_bps <= 10000, ErrorCode::InvalidFee);
    require!(post_bonding_fee_bps <= 10000, ErrorCode::InvalidFee);
    require!(anti_sniper_max_trade_bps <= 10000, ErrorCode::InvalidFee);

    // Validate thresholds
    require!(
        pre_bonding_threshold_usd > 0 && graduation_threshold_usd > 0,
        ErrorCode::InvalidMarketCap
    );
    require!(
        graduation_threshold_usd > pre_bonding_threshold_usd,
        ErrorCode::InvalidMarketCap
    );

    // Validate oracle settings
    require!(oracle_max_age_seconds > 0, ErrorCode::InvalidOracle);
    require!(oracle_max_confidence_bps <= 1000, ErrorCode::OracleConfidenceTooLow); // Max 10%

    let config = &mut ctx.accounts.config;

    config.authority = ctx.accounts.authority.key();
    config.fee_recipient = ctx.accounts.fee_recipient.key();
    config.crx_price_oracle = ctx.accounts.crx_price_oracle.key();
    config.crx_mint = ctx.accounts.crx_mint.key();

    config.pre_bonding_fee_bps = pre_bonding_fee_bps;
    config.pre_bonding_threshold_usd = pre_bonding_threshold_usd;
    config.post_bonding_fee_bps = post_bonding_fee_bps;
    config.graduation_threshold_usd = graduation_threshold_usd;

    config.anti_sniper_window_slots = anti_sniper_window_slots;
    config.anti_sniper_max_trade_bps = anti_sniper_max_trade_bps;

    config.oracle_max_age_seconds = oracle_max_age_seconds;
    config.oracle_max_confidence_bps = oracle_max_confidence_bps;

    config.bump = ctx.bumps.config;

    // Emit event for indexers
    let clock = Clock::get()?;
    emit!(ConfigInitialized {
        authority: config.authority,
        fee_recipient: config.fee_recipient,
        crx_mint: config.crx_mint,
        crx_price_oracle: config.crx_price_oracle,
        pre_bonding_fee_bps,
        pre_bonding_threshold_usd,
        post_bonding_fee_bps,
        graduation_threshold_usd,
        anti_sniper_window_slots,
        anti_sniper_max_trade_bps,
        oracle_max_age_seconds,
        oracle_max_confidence_bps,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });

    msg!("✅ Creator AMM v2 initialized!");
    msg!("Pre-bonding: {} bps fee, ${} threshold",
        pre_bonding_fee_bps,
        pre_bonding_threshold_usd as f64 / 1_000_000.0
    );
    msg!("Post-bonding: {} bps fee, ${} graduation",
        post_bonding_fee_bps,
        graduation_threshold_usd as f64 / 1_000_000.0
    );
    msg!("Anti-sniper: {} slots, {} bps max trade",
        anti_sniper_window_slots,
        anti_sniper_max_trade_bps
    );
    msg!("Oracle: {}s max age, {} bps max confidence",
        oracle_max_age_seconds,
        oracle_max_confidence_bps
    );

    Ok(())
}
