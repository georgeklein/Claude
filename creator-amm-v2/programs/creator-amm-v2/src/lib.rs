use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

pub use events::*;
use instructions::*;

declare_id!("CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3");

#[program]
pub mod creator_amm_v2 {
    use super::*;

    /// Initialize the Creator AMM v2 global configuration
    ///
    /// Sets up oracle integration, fee structures, and phase thresholds
    ///
    /// # Arguments
    /// * `pre_bonding_fee_bps` - Fee during phase 1 (e.g., 300 = 3%)
    /// * `pre_bonding_threshold_usd` - USD threshold for phase 1→2 (e.g., 40_000_000_000 = $40k)
    /// * `post_bonding_fee_bps` - Fee during phase 2 (e.g., 100 = 1%)
    /// * `graduation_threshold_usd` - USD threshold for graduation (e.g., 85_000_000_000 = $85k)
    /// * `anti_sniper_window_slots` - Slots to enforce anti-sniper (e.g., 20 ≈ 8 seconds)
    /// * `anti_sniper_max_trade_bps` - Max trade size during window (e.g., 500 = 5%)
    /// * `oracle_max_age_seconds` - Max oracle price age (e.g., 60 seconds)
    /// * `oracle_max_confidence_bps` - Max oracle confidence deviation (e.g., 100 = 1%)
    pub fn initialize(
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
        instructions::initialize::handler(
            ctx,
            pre_bonding_fee_bps,
            pre_bonding_threshold_usd,
            post_bonding_fee_bps,
            graduation_threshold_usd,
            anti_sniper_window_slots,
            anti_sniper_max_trade_bps,
            oracle_max_age_seconds,
            oracle_max_confidence_bps,
        )
    }

    /// Create a new bonding curve pool with dynamic virtual liquidity
    ///
    /// **🚀 CORE INNOVATION:** Calculates virtual reserves based on:
    /// - Target market cap in USD
    /// - Live CRX price from oracle
    /// - Token supply
    ///
    /// This allows launching at specific market caps regardless of CRX price!
    ///
    /// # Example
    /// ```
    /// Target MC: $10,000 USD
    /// Token Supply: 1,000,000
    /// CRX Price: $2.00 (from oracle)
    /// Fee: 0.25% (25 bps)
    /// Curve: Exponential
    /// Graduation: $40,000 USD
    ///
    /// Result:
    /// - Virtual CRX: 5,000 CRX
    /// - Virtual Tokens: 1,000,000
    /// - Initial Price: 0.005 CRX per token
    /// - Launches at exactly $10k market cap!
    /// - Graduates when 20,000 CRX accumulated
    /// ```
    ///
    /// # Arguments
    /// * `target_market_cap_usd` - Desired initial market cap (6 decimals)
    /// * `token_supply` - Total token supply to deposit
    /// * `fee_bps` - Pool fee: 0 (0%), 25 (0.25%), or 100 (1%)
    /// * `curve_type` - Bonding curve: ConstantProduct or Exponential
    /// * `graduation_threshold_usd` - USD threshold for graduation ($5k - $10M)
    pub fn create_pool(
        ctx: Context<CreatePool>,
        target_market_cap_usd: u64,
        token_supply: u64,
        fee_bps: u16,
        curve_type: state::CurveType,
        graduation_threshold_usd: u64,
    ) -> Result<()> {
        instructions::create_pool::handler(
            ctx,
            target_market_cap_usd,
            token_supply,
            fee_bps,
            curve_type,
            graduation_threshold_usd,
        )
    }

    /// Buy base tokens with CRX (quote tokens)
    ///
    /// **Features:**
    /// - Slippage protection via min_base_amount
    /// - Anti-sniper protection in early slots
    /// - Automatic phase transitions (PreBonding → PostBonding → Graduated)
    /// - Dynamic fee based on current phase
    ///
    /// # Arguments
    /// * `quote_amount` - Amount of CRX to spend
    /// * `min_base_amount` - Minimum tokens to receive (prevents frontrunning)
    pub fn buy(
        ctx: Context<Buy>,
        quote_amount: u64,
        min_base_amount: u64,
    ) -> Result<()> {
        instructions::buy::handler(ctx, quote_amount, min_base_amount)
    }

    /// Sell base tokens for CRX (quote tokens)
    ///
    /// **Features:**
    /// - Slippage protection via min_quote_amount
    /// - Anti-sniper protection in early slots
    /// - Automatic phase transitions
    /// - Dynamic fee based on current phase
    ///
    /// # Arguments
    /// * `base_amount` - Amount of tokens to sell
    /// * `min_quote_amount` - Minimum CRX to receive (prevents frontrunning)
    pub fn sell(
        ctx: Context<Sell>,
        base_amount: u64,
        min_quote_amount: u64,
    ) -> Result<()> {
        instructions::sell::handler(ctx, base_amount, min_quote_amount)
    }

    /// Pause or unpause a pool (emergency only)
    ///
    /// **Emergency Feature:**
    /// - Only the protocol authority (config.authority) can call this
    /// - Prevents trading when paused (both buy and sell)
    /// - Can be toggled on/off as needed
    /// - Does not affect existing pool state (reserves, fees, etc.)
    ///
    /// # Arguments
    /// * `paused` - true to pause, false to unpause
    pub fn pause_pool(
        ctx: Context<PausePool>,
        paused: bool,
    ) -> Result<()> {
        instructions::pause_pool::handler(ctx, paused)
    }
}
