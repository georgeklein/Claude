use anchor_lang::prelude::*;
use anchor_lang::solana_program::pubkey;
use crate::state::Config;
use crate::errors::ErrorCode;
use crate::events::ConfigInitialized;

// ⚠️  CRITICAL SECURITY BLOCKER ⚠️
// DO NOT DEPLOY TO MAINNET WITHOUT CHANGING THIS!!!
//
// Replace "11111111111111111111111111111111" with your actual deployer wallet address.
//
// Get your address with: solana address
//
// Why this matters:
// - Without this, ANYONE can call initialize() and take over the protocol
// - This is a front-running attack vector
// - Once someone else initializes, the protocol is bricked forever
//
// Example:
// pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("YourActualWalletAddressHere12345678901234567890");
//
// See DEPLOY.md for full details.
pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("11111111111111111111111111111111");

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
    /// SECURITY: Restricted to hardcoded deployer to prevent front-running
    #[account(
        mut,
        constraint = authority.key() == DEPLOYER_PUBKEY @ ErrorCode::Unauthorized
    )]
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
    initial_crx_price_usd: u64,
    pre_bonding_fee_bps: u16,
    pre_bonding_threshold_usd: u64,
    post_bonding_fee_bps: u16,
    graduation_threshold_usd: u64,
    anti_sniper_window_slots: u64,
    anti_sniper_max_trade_bps: u16,
    oracle_max_age_seconds: i64,
    oracle_max_confidence_bps: u64,
    approved_quote_tokens: [Pubkey; 5],
    approved_quote_count: u8,
) -> Result<()> {
    // Validate approved quote token count
    require!(
        approved_quote_count <= 5,
        ErrorCode::InvalidQuoteTokenCount
    );

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

    let config = &mut ctx.accounts.config;
    let clock = Clock::get()?;

    config.authority = ctx.accounts.authority.key();
    config.fee_recipient = ctx.accounts.fee_recipient.key();
    config.crx_price_oracle = ctx.accounts.crx_price_oracle.key();
    config.crx_mint = ctx.accounts.crx_mint.key();

    config.crx_price_usd = initial_crx_price_usd;
    config.crx_price_last_updated = clock.unix_timestamp;

    config.pre_bonding_fee_bps = pre_bonding_fee_bps;
    config.pre_bonding_threshold_usd = pre_bonding_threshold_usd;
    config.post_bonding_fee_bps = post_bonding_fee_bps;
    config.graduation_threshold_usd = graduation_threshold_usd;

    config.anti_sniper_window_slots = anti_sniper_window_slots;
    config.anti_sniper_max_trade_bps = anti_sniper_max_trade_bps;

    config.oracle_max_age_seconds = oracle_max_age_seconds;
    config.oracle_max_confidence_bps = oracle_max_confidence_bps;

    config.approved_quote_tokens = approved_quote_tokens;
    config.approved_quote_count = approved_quote_count;

    config.bump = ctx.bumps.config;

    // Emit event for indexers
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

    msg!("Scale AMM initialized!");

    Ok(())
}
