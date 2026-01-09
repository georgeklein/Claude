use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3");

#[program]
pub mod creator_amm_v2 {
    use super::*;

    /// Initialize global configuration
    pub fn initialize(
        ctx: Context<Initialize>,
        initial_crx_price_usd: u64,
        oracle_max_age_seconds: i64,
        approved_quote_tokens: [Pubkey; 5],
        approved_quote_count: u8,
    ) -> Result<()> {
        instructions::initialize::handler(
            ctx,
            initial_crx_price_usd,
            oracle_max_age_seconds,
            approved_quote_tokens,
            approved_quote_count,
        )
    }

    /// Create bonding curve pool with dynamic virtual liquidity
    pub fn create_pool(
        ctx: Context<CreatePool>,
        target_market_cap_usd: u64,
        token_supply: u64,
        fee_bps: u16,
        curve_type: state::CurveType,
        graduation_threshold_usd: u64,
        disable_waa: bool,
        metadata_uri: String,
    ) -> Result<()> {
        instructions::create_pool::handler(
            ctx,
            target_market_cap_usd,
            token_supply,
            fee_bps,
            curve_type,
            graduation_threshold_usd,
            disable_waa,
            metadata_uri,
        )
    }

    /// Buy base tokens with quote tokens
    pub fn buy(
        ctx: Context<Buy>,
        quote_amount: u64,
        min_base_amount: u64,
    ) -> Result<()> {
        instructions::buy::handler(ctx, quote_amount, min_base_amount)
    }

    /// Sell base tokens for quote tokens
    pub fn sell(
        ctx: Context<Sell>,
        base_amount: u64,
        min_quote_amount: u64,
    ) -> Result<()> {
        instructions::sell::handler(ctx, base_amount, min_quote_amount)
    }

    /// Update approved quote token whitelist (Admin only)
    pub fn update_approved_quotes(
        ctx: Context<UpdateApprovedQuotes>,
        approved_quote_tokens: [Pubkey; 5],
        approved_quote_count: u8,
    ) -> Result<()> {
        instructions::update_approved_quotes::handler(ctx, approved_quote_tokens, approved_quote_count)
    }

    /// Update CRX price in USD (Authority only)
    pub fn update_crx_price(
        ctx: Context<UpdateCrxPrice>,
        new_price_usd: u64,
    ) -> Result<()> {
        instructions::update_crx_price::handler(ctx, new_price_usd)
    }

    /// Update pool graduation threshold (Authority only)
    pub fn update_pool_graduation(
        ctx: Context<UpdatePoolGraduation>,
        new_graduation_threshold_usd: u64,
    ) -> Result<()> {
        instructions::update_pool_graduation::handler(ctx, new_graduation_threshold_usd)
    }

    /// Update protocol fee (Authority only)
    pub fn update_protocol_fee(
        ctx: Context<UpdateProtocolFee>,
        new_protocol_fee_bps: u16,
    ) -> Result<()> {
        instructions::update_protocol_fee::handler(ctx, new_protocol_fee_bps)
    }

    /// Update protocol authority (Authority only)
    pub fn update_authority(
        ctx: Context<UpdateAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::update_authority::handler(ctx, new_authority)
    }

    /// Update WAA anti-dump configuration (Authority only)
    pub fn update_waa_config(
        ctx: Context<UpdateWaaConfig>,
        tier1_slots: u64,
        tier2_slots: u64,
        tier3_slots: u64,
        fee_max_bps: u64,
        fee_min_bps: u64,
    ) -> Result<()> {
        instructions::update_waa_config::handler(
            ctx,
            tier1_slots,
            tier2_slots,
            tier3_slots,
            fee_max_bps,
            fee_min_bps,
        )
    }
}
