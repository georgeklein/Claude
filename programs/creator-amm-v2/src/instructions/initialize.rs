use anchor_lang::prelude::*;
use anchor_lang::solana_program::pubkey;
use crate::state::Config;
use crate::errors::ErrorCode;
use crate::events::ConfigInitialized;
use crate::constants::*;

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

#[cfg(not(feature = "devnet"))]
compile_error!(
    "\n\n\
    ╔════════════════════════════════════════════════════════════════╗\n\
    ║  🚨 SECURITY BLOCKER: DEPLOYER_PUBKEY NOT SET! 🚨              ║\n\
    ║                                                                ║\n\
    ║  The DEPLOYER_PUBKEY is still set to placeholder address.     ║\n\
    ║  This is a CRITICAL SECURITY VULNERABILITY for mainnet!       ║\n\
    ║                                                                ║\n\
    ║  ACTION REQUIRED:                                              ║\n\
    ║  1. Update DEPLOYER_PUBKEY in initialize.rs to your wallet    ║\n\
    ║  2. Rebuild with this check removed or use --features=devnet  ║\n\
    ║                                                                ║\n\
    ║  Current: 11111111111111111111111111111111                    ║\n\
    ║  Expected: Your actual deployer wallet address                ║\n\
    ╚════════════════════════════════════════════════════════════════╝\n\
    "
);

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
    oracle_max_age_seconds: i64,
    approved_quote_tokens: [Pubkey; 5],
    approved_quote_count: u8,
) -> Result<()> {
    // Validate approved quote token count
    require!(
        approved_quote_count <= 5,
        ErrorCode::InvalidQuoteTokenCount
    );

    // CRITICAL FIX: Validate initial CRX price is non-zero and reasonable
    require!(
        initial_crx_price_usd > 0,
        ErrorCode::InvalidCrxPrice
    );
    require!(
        initial_crx_price_usd >= crate::constants::CRX_PRICE_MIN_USD &&
        initial_crx_price_usd <= crate::constants::CRX_PRICE_MAX_USD,
        ErrorCode::InvalidCrxPrice
    );

    let config = &mut ctx.accounts.config;
    let clock = Clock::get()?;

    config.authority = ctx.accounts.authority.key();
    config.fee_recipient = ctx.accounts.fee_recipient.key();
    config.crx_price_oracle = ctx.accounts.crx_price_oracle.key();
    config.crx_mint = ctx.accounts.crx_mint.key();

    config.crx_price_usd = initial_crx_price_usd;
    config.crx_price_last_updated = clock.unix_timestamp;

    config.oracle_max_age_seconds = oracle_max_age_seconds;

    config.approved_quote_tokens = approved_quote_tokens;
    config.approved_quote_count = approved_quote_count;

    // Protocol fee starts disabled (0 bps), can be enabled later via update_protocol_fee
    config.protocol_fee_bps = 0;

    // WAA config starts with defaults (mutable by authority via update_waa_config)
    config.waa_tier1_slots = WAA_TIER1_SLOTS;
    config.waa_tier2_slots = WAA_TIER2_SLOTS;
    config.waa_tier3_slots = WAA_TIER3_SLOTS;
    config.waa_fee_max_bps = WAA_FEE_MAX;
    config.waa_fee_min_bps = WAA_FEE_MIN;

    config.bump = ctx.bumps.config;

    // Emit event for indexers
    emit!(ConfigInitialized {
        authority: config.authority,
        fee_recipient: config.fee_recipient,
        crx_mint: config.crx_mint,
        crx_price_oracle: config.crx_price_oracle,
        oracle_max_age_seconds,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });

    msg!("Scale AMM initialized!");

    Ok(())
}
