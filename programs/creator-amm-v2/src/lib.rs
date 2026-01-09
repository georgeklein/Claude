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
        instructions::initialize::handler(
            ctx,
            initial_crx_price_usd,
            pre_bonding_fee_bps,
            pre_bonding_threshold_usd,
            post_bonding_fee_bps,
            graduation_threshold_usd,
            anti_sniper_window_slots,
            anti_sniper_max_trade_bps,
            oracle_max_age_seconds,
            oracle_max_confidence_bps,
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
    ) -> Result<()> {
        instructions::create_pool::handler(
            ctx,
            target_market_cap_usd,
            token_supply,
            fee_bps,
            curve_type,
            graduation_threshold_usd,
            disable_waa,
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
}
