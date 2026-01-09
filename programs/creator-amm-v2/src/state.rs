use anchor_lang::prelude::*;
use crate::constants::*;

/// Global configuration for Scale AMM
#[account]
pub struct Config {
    /// Protocol authority
    pub authority: Pubkey,
    /// Protocol fee recipient
    pub fee_recipient: Pubkey,

    /// CRX price oracle (Pyth or Switchboard) - kept for backward compatibility, unused
    pub crx_price_oracle: Pubkey,
    /// CRX token mint
    pub crx_mint: Pubkey,

    /// CRX price in USD (6 decimals, e.g., 2_000_000 = $2.00)
    pub crx_price_usd: u64,
    /// Last time CRX price was updated (unix timestamp)
    pub crx_price_last_updated: i64,

    /// Oracle settings
    pub oracle_max_age_seconds: i64,        // e.g., 60 seconds

    /// Whitelist for premium quote tokens (Tier 2 - Permissioned)
    /// Tier 1 (Permissionless): CRX pairs - always allowed for anyone
    /// Tier 2 (Permissioned): SOL/USDC/USDT pairs - whitelist only
    /// Fixed array of 5 slots to avoid dynamic Vec complexity
    pub approved_quote_tokens: [Pubkey; 5], // Whitelisted quote tokens (SOL, USDC, USDT, etc.)
    pub approved_quote_count: u8,           // How many slots are actually used (0-5)

    /// Protocol fee in basis points (0-1000 = 0-10%)
    /// Applied to all pools, adjustable by authority
    /// Fee goes to fee_recipient for CRX deflation
    pub protocol_fee_bps: u16,              // e.g., 10 = 0.1%, 0 = disabled

    /// WAA (Weighted Average Age) anti-dump fee configuration
    /// Adjustable by authority for market-responsive tuning
    pub waa_tier1_slots: u64,               // Tier 1 threshold (e.g., 25 slots = 10s)
    pub waa_tier2_slots: u64,               // Tier 2 threshold (e.g., 150 slots = 1min)
    pub waa_tier3_slots: u64,               // Tier 3 threshold (e.g., 750 slots = 5min)
    pub waa_fee_max_bps: u64,               // Max fee (e.g., 300 = 3%)
    pub waa_fee_min_bps: u64,               // Min fee (e.g., 50 = 0.5%)

    pub bump: u8,
}

impl Config {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // fee_recipient
        32 + // crx_price_oracle
        32 + // crx_mint
        8 +  // crx_price_usd
        8 +  // crx_price_last_updated
        8 +  // oracle_max_age_seconds
        160 + // approved_quote_tokens (32 * 5 = 160 bytes)
        1 +  // approved_quote_count
        2 +  // protocol_fee_bps
        40 + // WAA config (5 * 8 = 40 bytes)
        1;   // bump

    /// CRITICAL FIX: Validate CRX price freshness to prevent stale price exploitation
    /// This prevents flash loan attacks and arbitrage from outdated oracle data
    pub fn validate_price_freshness(&self, clock: &Clock) -> Result<()> {
        let age = clock.unix_timestamp
            .checked_sub(self.crx_price_last_updated)
            .ok_or(ErrorCode::MathOverflow)?;

        require!(
            age <= self.oracle_max_age_seconds,
            ErrorCode::OraclePriceStale
        );

        Ok(())
    }
}

/// Bonding curve type
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum CurveType {
    /// Constant product: x * y = k (Uniswap/Unisocks-style, balanced growth)
    ConstantProduct,

    /// Exponential: y = (x * Y) / (X + 1.5*x) (steeper curve, faster price growth)
    /// Reaches graduation threshold ~33% faster than constant product
    Exponential,
}

/// Bonding curve phase
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum CurvePhase {
    /// Phase 1: Pre-bonding (0 → $40k) - Uses VIRTUAL reserves for pricing
    PreBonding,
    /// Phase 2: Graduated ($40k+) - Uses REAL reserves for pricing, permanent AMM
    Graduated,
}

/// Pool state with dual-phase bonding curve
#[account]
pub struct Pool {
    /// Pool authority (PDA)
    pub authority: Pubkey,

    /// Token mints
    pub quote_mint: Pubkey,  // CRX
    pub base_mint: Pubkey,   // The launched token

    /// Vaults
    pub quote_vault: Pubkey,
    pub base_vault: Pubkey,

    /// Virtual reserves (for pricing calculations)
    pub virtual_quote_reserves: u64,
    pub virtual_base_reserves: u64,

    /// Real reserves (actual tokens in vaults)
    pub real_quote_reserves: u64,
    pub real_base_reserves: u64,

    /// Curve configuration
    pub current_phase: CurvePhase,
    pub curve_type: CurveType,            // Curve formula (constant product, linear, exponential)
    pub target_market_cap_usd: u64,      // Initial target MC (6 decimals)
    pub token_total_supply: u64,          // Total token supply
    pub fee_bps: u16,                     // Pool-specific fee (0, 25, or 100 bps)

    /// Graduation thresholds
    pub graduation_threshold_usd: u64,     // Target USD amount (e.g., $40k with 6 decimals)
    pub graduation_threshold_crx: u64,     // Current CRX equivalent (recalculated on price changes)

    /// Statistics (minimal to save rent)
    /// Removed: total_base_volume, total_fees_collected, unique_traders (derive from events)
    pub created_at_slot: u64,
    pub total_quote_volume: u64,  // Keep for graduation tracking

    /// Pool creator
    pub creator: Pubkey,

    /// Last oracle price (cached)
    pub last_crx_price_usd: u64,          // 6 decimals

    /// Feature flags
    pub disable_waa: bool,                // If true, skip WAA anti-dump fees (pure permissionless)

    /// Metadata URI (Arweave/IPFS link for name, description, image, socials)
    /// Max 64 chars (e.g., "https://arweave.net/TX_ID" or "ar://TX_ID")
    pub metadata_uri: String,

    pub bump: u8,
}

impl Pool {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // quote_mint
        32 + // base_mint
        32 + // quote_vault
        32 + // base_vault
        8 +  // virtual_quote_reserves
        8 +  // virtual_base_reserves
        8 +  // real_quote_reserves
        8 +  // real_base_reserves
        1 +  // current_phase
        1 +  // curve_type
        8 +  // target_market_cap_usd
        8 +  // token_total_supply
        2 +  // fee_bps
        8 +  // graduation_threshold_usd
        8 +  // graduation_threshold_crx
        8 +  // created_at_slot
        8 +  // total_quote_volume
        // Removed: total_base_volume (8), total_fees_collected (8), unique_traders (8), last_price_update_slot (8), last_graduation_slot (8) = 40 bytes saved
        32 + // creator
        8 +  // last_crx_price_usd
        1 +  // disable_waa
        4 + 64 + // metadata_uri (String with max 64 chars = 4 bytes length + 64 bytes data)
        1;   // bump
    // New size: 275 + 68 = 343 bytes (~0.0024 SOL rent)

    /// Get current fee based on pool configuration
    /// Fees continue throughout the token's lifetime (PreBonding + Graduated)
    /// This ensures creators earn fees forever, not just during initial bonding phase
    /// Fee tiers: 0%, 0.25%, or 1% (set at pool creation)
    #[inline(always)]
    pub fn get_current_fee_bps(&self) -> u16 {
        self.fee_bps // Same fee throughout lifetime
    }

    /// Get reserves to use for pricing (virtual pre-graduation, real post-graduation)
    #[inline(always)]
    pub fn get_pricing_reserves(&self) -> (u64, u64) {
        match self.current_phase {
            CurvePhase::PreBonding => {
                // Use VIRTUAL reserves for bonding curve pricing
                (self.virtual_quote_reserves, self.virtual_base_reserves)
            },
            CurvePhase::Graduated => {
                // Use REAL reserves for constant product AMM
                (self.real_quote_reserves, self.real_base_reserves)
            },
        }
    }

    /// Check and update phase based on accumulated CRX (graduation at $40k)
    /// Returns true if phase changed
    pub fn check_phase_transition(&mut self, _current_slot: u64) -> Result<bool> {
        match self.current_phase {
            CurvePhase::PreBonding => {
                if self.real_quote_reserves >= self.graduation_threshold_crx {
                    // CRITICAL: Validate price continuity to prevent flash loan exploits
                    self.validate_graduation_continuity()?;

                    msg!("Pool graduated!");

                    // Transition to graduated phase
                    // NOW PRICING USES REAL RESERVES (PumpSwap-style)
                    self.current_phase = CurvePhase::Graduated;

                    return Ok(true);
                }
            },
            CurvePhase::Graduated => {
                // Already graduated, stays in this phase forever
            },
        }

        Ok(false)
    }

    /// Calculate output based on bonding curve type
    pub fn calculate_output(
        &self,
        input_amount: u64,
        input_reserve: u64,
        output_reserve: u64,
        fee_bps: u16,
    ) -> Result<u64> {
        require!(input_amount > 0, ErrorCode::InvalidAmount);
        require!(input_reserve > 0 && output_reserve > 0, ErrorCode::InsufficientLiquidity);

        // Calculate output before fee based on curve type
        let output_before_fee = match self.curve_type {
            CurveType::ConstantProduct => {
                // Formula: y = (x * Y) / (X + x)
                // Unisocks/Uniswap constant product curve
                // Balanced price growth, proven model
                let numerator = (input_amount as u128)
                    .checked_mul(output_reserve as u128)
                    .ok_or(ErrorCode::MathOverflow)?;

                let denominator = (input_reserve as u128)
                    .checked_add(input_amount as u128)
                    .ok_or(ErrorCode::MathOverflow)?;

                numerator
                    .checked_div(denominator)
                    .ok_or(ErrorCode::MathOverflow)?
            },
            CurveType::Exponential => {
                // Formula: y = (x * Y) / (X + 1.5*x)
                // Steeper curve - denominator grows 50% faster
                // Reaches graduation ~33% faster than constant product
                // Better for aggressive price discovery and hype cycles
                let numerator = (input_amount as u128)
                    .checked_mul(output_reserve as u128)
                    .ok_or(ErrorCode::MathOverflow)?;

                let input_scaled = (input_amount as u128)
                    .checked_mul(EXPONENTIAL_CURVE_NUMERATOR)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_div(EXPONENTIAL_CURVE_DENOMINATOR)
                    .ok_or(ErrorCode::MathOverflow)?;

                let denominator = (input_reserve as u128)
                    .checked_add(input_scaled)
                    .ok_or(ErrorCode::MathOverflow)?;

                numerator
                    .checked_div(denominator)
                    .ok_or(ErrorCode::MathOverflow)?
            },
        };

        // Apply fee (fee is taken from output)
        let fee_multiplier = (BPS_DENOMINATOR as u128)
            .checked_sub(fee_bps as u128)
            .ok_or(ErrorCode::InvalidFee)?;

        let output_with_fee = output_before_fee
            .checked_mul(fee_multiplier)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(BPS_DENOMINATOR as u128)
            .ok_or(ErrorCode::MathOverflow)?;

        // Ensure output fits in u64
        require!(
            output_with_fee <= u64::MAX as u128,
            ErrorCode::MathOverflow
        );

        Ok(output_with_fee as u64)
    }

    /// Get current spot price (quote per base token)
    /// Uses correct reserves based on phase (virtual in PreBonding, real in Graduated)
    #[inline]
    pub fn get_spot_price(&self) -> Result<u64> {
        let (quote_reserves, base_reserves) = self.get_pricing_reserves();

        require!(base_reserves > 0, ErrorCode::InvalidReserves);

        let price = (quote_reserves as u128)
            .checked_mul(PRICE_PRECISION as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(base_reserves as u128)
            .ok_or(ErrorCode::MathOverflow)?;

        require!(price <= u64::MAX as u128, ErrorCode::MathOverflow);
        Ok(price as u64)
    }

    /// Get current market cap in CRX
    #[inline]
    pub fn get_market_cap_crx(&self) -> Result<u64> {
        let price = self.get_spot_price()?;
        self.get_market_cap_crx_from_price(price)
    }

    /// Get market cap in CRX from pre-calculated price (optimized to avoid redundant price calc)
    #[inline]
    pub fn get_market_cap_crx_from_price(&self, price: u64) -> Result<u64> {
        let market_cap = (self.token_total_supply as u128)
            .checked_mul(price as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(PRICE_PRECISION as u128)
            .ok_or(ErrorCode::MathOverflow)?;

        require!(market_cap <= u64::MAX as u128, ErrorCode::MathOverflow);
        Ok(market_cap as u64)
    }

    /// Get current market cap in USD
    #[inline]
    pub fn get_market_cap_usd(&self) -> Result<u64> {
        let mc_crx = self.get_market_cap_crx()?;
        self.get_market_cap_usd_from_crx(mc_crx)
    }

    /// Get market cap in USD from pre-calculated CRX market cap (optimized)
    #[inline]
    pub fn get_market_cap_usd_from_crx(&self, mc_crx: u64) -> Result<u64> {
        let mc_usd = (mc_crx as u128)
            .checked_mul(self.last_crx_price_usd as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(CRX_DECIMALS as u128)
            .ok_or(ErrorCode::MathOverflow)?;

        require!(mc_usd <= u64::MAX as u128, ErrorCode::MathOverflow);
        Ok(mc_usd as u64)
    }

    /// Get market cap in USD from pre-calculated price (optimized to avoid all redundant calcs)
    #[inline]
    pub fn get_market_cap_usd_from_price(&self, price: u64) -> Result<u64> {
        let mc_crx = self.get_market_cap_crx_from_price(price)?;
        self.get_market_cap_usd_from_crx(mc_crx)
    }

    /// Refresh virtual reserves when CRX price changes (prevents stagnation)
    /// Only updates if in PreBonding phase and price changed significantly
    pub fn refresh_virtual_reserves(&mut self, new_crx_price_usd: u64) -> Result<bool> {
        // Only refresh in PreBonding phase
        if !matches!(self.current_phase, CurvePhase::PreBonding) {
            return Ok(false);
        }

        // Check if price changed significantly (>5% threshold to avoid unnecessary updates)
        let old_price = self.last_crx_price_usd;
        if old_price == 0 {
            return Ok(false); // Safety: avoid division by zero
        }

        let price_change_bps = if new_crx_price_usd > old_price {
            let price_diff = new_crx_price_usd
                .checked_sub(old_price)
                .ok_or(ErrorCode::MathOverflow)?;
            (price_diff as u128)
                .checked_mul(BPS_DENOMINATOR as u128)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(old_price as u128)
                .ok_or(ErrorCode::MathOverflow)?
        } else {
            let price_diff = old_price
                .checked_sub(new_crx_price_usd)
                .ok_or(ErrorCode::MathOverflow)?;
            (price_diff as u128)
                .checked_mul(BPS_DENOMINATOR as u128)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(old_price as u128)
                .ok_or(ErrorCode::MathOverflow)?
        };

        // Only refresh if price changed more than 5% (500 bps)
        const REFRESH_THRESHOLD_BPS: u128 = 500;
        if price_change_bps < REFRESH_THRESHOLD_BPS {
            return Ok(false);
        }

        // Recalculate virtual reserves using updated CRX price
        let (new_virtual_quote, new_virtual_base) =
            crate::utils::oracle::calculate_virtual_reserves_for_market_cap(
                self.target_market_cap_usd,
                self.token_total_supply,
                new_crx_price_usd,
            )?;

        // Update virtual reserves
        self.virtual_quote_reserves = new_virtual_quote;
        self.virtual_base_reserves = new_virtual_base;

        // CRITICAL: Recalculate graduation threshold in CRX to maintain USD target
        // This prevents graduation threshold drift when CRX price changes
        let new_graduation_threshold_crx = (self.graduation_threshold_usd as u128)
            .checked_mul(CRX_DECIMALS as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(new_crx_price_usd as u128)
            .ok_or(ErrorCode::ThresholdCalculationFailed)?;

        // Validate result fits in u64
        require!(
            new_graduation_threshold_crx <= u64::MAX as u128,
            ErrorCode::MathOverflow
        );

        self.graduation_threshold_crx = new_graduation_threshold_crx as u64;

        Ok(true) // Reserves were updated
    }

    /// Validate that graduation won't cause massive price jump
    /// Prevents flash loan attacks by ensuring price continuity
    pub fn validate_graduation_continuity(&self) -> Result<()> {
        // Calculate price using virtual reserves (current pricing)
        let virtual_price = (self.virtual_quote_reserves as u128)
            .checked_mul(PRICE_PRECISION as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(self.virtual_base_reserves as u128)
            .ok_or(ErrorCode::MathOverflow)?;

        // Calculate what price WOULD BE using real reserves (post-graduation pricing)
        require!(self.real_base_reserves > 0, ErrorCode::InsufficientLiquidity);
        let real_price = (self.real_quote_reserves as u128)
            .checked_mul(PRICE_PRECISION as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(self.real_base_reserves as u128)
            .ok_or(ErrorCode::MathOverflow)?;

        // Calculate price ratio (expressed in bps)
        let price_ratio_bps = if real_price > virtual_price {
            let price_diff = real_price
                .checked_sub(virtual_price)
                .ok_or(ErrorCode::MathOverflow)?;
            price_diff
                .checked_mul(BPS_DENOMINATOR as u128)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(virtual_price)
                .ok_or(ErrorCode::MathOverflow)?
        } else {
            let price_diff = virtual_price
                .checked_sub(real_price)
                .ok_or(ErrorCode::MathOverflow)?;
            price_diff
                .checked_mul(BPS_DENOMINATOR as u128)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(virtual_price)
                .ok_or(ErrorCode::MathOverflow)?
        };

        // Allow maximum 20% price deviation (2000 bps) at graduation
        // This prevents 20x exploits while allowing reasonable market price discovery
        const MAX_GRADUATION_PRICE_DEVIATION_BPS: u128 = 2000;
        require!(
            price_ratio_bps <= MAX_GRADUATION_PRICE_DEVIATION_BPS,
            ErrorCode::GraduationPriceJumpTooLarge
        );

        Ok(())
    }
}

/// User position for tracking weighted average entry slot (WAA)
/// Used for decaying sell fees to prevent snipers from instant exit
#[account]
pub struct UserPosition {
    /// The pool this position belongs to
    pub pool: Pubkey,

    /// The user who owns this position
    pub user: Pubkey,

    /// Weighted average entry slot (tracks when user acquired tokens)
    pub avg_entry_slot: u64,

    /// Amount of tokens represented by avg_entry_slot
    /// Used to calculate weighted average when buying more
    pub tracked_amount: u64,

    /// PDA bump
    pub bump: u8,
}

impl UserPosition {
    pub const LEN: usize = 8 + // discriminator
        32 + // pool
        32 + // user
        8 +  // avg_entry_slot
        8 +  // tracked_amount
        1;   // bump

    /// Update WAA when user buys tokens
    /// Formula: new_avg = (old_amount * old_avg + new_amount * now) / (old_amount + new_amount)
    #[inline]
    pub fn update_on_buy(&mut self, buy_amount: u64, current_slot: u64) -> Result<()> {
        if self.tracked_amount == 0 {
            // First buy or position was fully closed - fast path
            self.avg_entry_slot = current_slot;
            self.tracked_amount = buy_amount;
            return Ok(());
        }

        // Calculate weighted average using u128 to prevent overflow
        let old_weighted = (self.tracked_amount as u128)
            .checked_mul(self.avg_entry_slot as u128)
            .ok_or(ErrorCode::MathOverflow)?;

        let new_weighted = (buy_amount as u128)
            .checked_mul(current_slot as u128)
            .ok_or(ErrorCode::MathOverflow)?;

        let numerator = old_weighted
            .checked_add(new_weighted)
            .ok_or(ErrorCode::MathOverflow)?;

        let denominator = (self.tracked_amount as u128)
            .checked_add(buy_amount as u128)
            .ok_or(ErrorCode::MathOverflow)?;

        // CRITICAL: Use checked_div to prevent division by zero panic
        let new_avg = numerator
            .checked_div(denominator)
            .ok_or(ErrorCode::MathOverflow)?;

        // CRITICAL FIX: Validate result fits in u64 before cast
        require!(new_avg <= u64::MAX as u128, ErrorCode::MathOverflow);
        self.avg_entry_slot = new_avg as u64;

        self.tracked_amount = self.tracked_amount
            .checked_add(buy_amount)
            .ok_or(ErrorCode::MathOverflow)?;

        Ok(())
    }

    /// Reduce tracked amount when user sells tokens
    #[inline(always)]
    pub fn update_on_sell(&mut self, sell_amount: u64) -> Result<()> {
        // CRITICAL: Use checked_sub to prevent WAA bypass via overselling
        // If user tries to sell more than tracked, this will error instead of saturating to 0
        self.tracked_amount = self.tracked_amount
            .checked_sub(sell_amount)
            .ok_or(ErrorCode::MathOverflow)?;

        // If fully sold, reset entry slot
        if self.tracked_amount == 0 {
            self.avg_entry_slot = 0;
        }

        Ok(())
    }

    /// Calculate extra sell fee based on hold time
    /// Uses Config WAA values (mutable by authority) instead of hardcoded constants
    #[inline]
    pub fn calculate_extra_sell_fee_bps(&self, current_slot: u64, config: &Config) -> Result<u64> {
        // Calculate age in slots (checked to ensure no underflow)
        let age = current_slot
            .checked_sub(self.avg_entry_slot)
            .unwrap_or(0); // If current_slot < avg_entry_slot, treat as 0 age

        // Piecewise linear decay - optimized with early returns
        if age <= config.waa_tier1_slots {
            return Ok(config.waa_fee_max_bps); // T1: full max fee
        }

        if age <= config.waa_tier2_slots {
            // T1-T2: decay from max → min
            let time_remaining = config.waa_tier2_slots
                .checked_sub(age)
                .ok_or(ErrorCode::MathOverflow)?;
            let decay_range = config.waa_fee_max_bps
                .checked_sub(config.waa_fee_min_bps)
                .ok_or(ErrorCode::MathOverflow)?;
            let time_range_1 = config.waa_tier2_slots
                .checked_sub(config.waa_tier1_slots)
                .ok_or(ErrorCode::MathOverflow)?;
            let decay_component = decay_range
                .checked_mul(time_remaining)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(time_range_1)
                .ok_or(ErrorCode::MathOverflow)?;
            return Ok(config.waa_fee_min_bps
                .checked_add(decay_component)
                .ok_or(ErrorCode::MathOverflow)?);
        }

        if age <= config.waa_tier3_slots {
            // T2-T3: decay from min → 0
            let time_remaining = config.waa_tier3_slots
                .checked_sub(age)
                .ok_or(ErrorCode::MathOverflow)?;
            let time_range_2 = config.waa_tier3_slots
                .checked_sub(config.waa_tier2_slots)
                .ok_or(ErrorCode::MathOverflow)?;
            let fee = config.waa_fee_min_bps
                .checked_mul(time_remaining)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(time_range_2)
                .ok_or(ErrorCode::MathOverflow)?;
            return Ok(fee);
        }

        Ok(0) // T3+: no extra fee
    }
}

use crate::errors::ErrorCode;
