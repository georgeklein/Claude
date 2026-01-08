use anchor_lang::prelude::*;

/// Global configuration for the Creator AMM v2
#[account]
pub struct Config {
    /// Protocol authority
    pub authority: Pubkey,
    /// Protocol fee recipient
    pub fee_recipient: Pubkey,

    /// CRX price oracle (Pyth or Switchboard)
    pub crx_price_oracle: Pubkey,
    /// CRX token mint
    pub crx_mint: Pubkey,

    /// Pre-bonding phase settings (0 → threshold_1)
    pub pre_bonding_fee_bps: u16,           // e.g., 300 = 3%
    pub pre_bonding_threshold_usd: u64,     // e.g., 40_000 USD (6 decimals)

    /// Post-bonding phase settings (threshold_1 → threshold_2)
    pub post_bonding_fee_bps: u16,          // e.g., 100 = 1%
    pub graduation_threshold_usd: u64,      // e.g., 85_000 USD (6 decimals)

    /// Anti-sniper settings
    pub anti_sniper_window_slots: u64,      // e.g., 20 slots (~8 seconds)
    pub anti_sniper_max_trade_bps: u16,     // e.g., 500 = 5% of supply

    /// Oracle settings
    pub oracle_max_age_seconds: i64,        // e.g., 60 seconds
    pub oracle_max_confidence_bps: u64,     // e.g., 100 = 1% max deviation

    /// Whitelist for premium quote tokens (Tier 2 - Permissioned)
    /// Tier 1 (Permissionless): CRX pairs - always allowed for anyone
    /// Tier 2 (Permissioned): SOL/USDC/USDT pairs - whitelist only
    /// Fixed array of 5 slots to avoid dynamic Vec complexity
    pub approved_quote_tokens: [Pubkey; 5], // Whitelisted quote tokens (SOL, USDC, USDT, etc.)
    pub approved_quote_count: u8,           // How many slots are actually used (0-5)

    pub bump: u8,
}

impl Config {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // fee_recipient
        32 + // crx_price_oracle
        32 + // crx_mint
        2 +  // pre_bonding_fee_bps
        8 +  // pre_bonding_threshold_usd
        2 +  // post_bonding_fee_bps
        8 +  // graduation_threshold_usd
        8 +  // anti_sniper_window_slots
        2 +  // anti_sniper_max_trade_bps
        8 +  // oracle_max_age_seconds
        8 +  // oracle_max_confidence_bps
        160 + // approved_quote_tokens (32 * 5 = 160 bytes)
        1 +  // approved_quote_count
        1;   // bump
}

/// Bonding curve type
/// Creators can choose the curve shape at launch, or implement custom formulas
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum CurveType {
    /// Constant product: x * y = k (Uniswap/Unisocks-style, balanced growth)
    /// Best for: Standard fair launches, community tokens
    ConstantProduct,

    /// Exponential: y = (x * Y) / (X + 1.5*x) (steeper curve, faster price growth)
    /// Best for: Hype/meme tokens, aggressive price discovery
    /// Reaches graduation threshold ~33% faster than constant product
    Exponential,

    /// Custom: Allows on-chain programs to implement their own curve math
    /// For advanced users experimenting with novel bonding curve designs
    /// Must implement calculate_output_custom() in their program
    Custom,
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

    /// Graduation threshold (in CRX, calculated from $40k USD)
    pub graduation_threshold_crx: u64,     // Dynamic based on CRX price

    /// Statistics
    pub created_at_slot: u64,
    pub total_quote_volume: u64,
    pub total_base_volume: u64,
    pub total_fees_collected: u64,
    pub unique_traders: u64,

    /// Pool creator
    pub creator: Pubkey,

    /// Last oracle price (cached)
    pub last_crx_price_usd: u64,          // 6 decimals
    pub last_price_update_slot: u64,

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
        8 +  // graduation_threshold_crx
        8 +  // created_at_slot
        8 +  // total_quote_volume
        8 +  // total_base_volume
        8 +  // total_fees_collected
        8 +  // unique_traders
        32 + // creator
        8 +  // last_crx_price_usd
        8 +  // last_price_update_slot
        1;   // bump

    /// Check if anti-sniper protection is active (only in PreBonding phase)
    pub fn is_anti_sniper_active(&self, current_slot: u64, anti_sniper_window: u64) -> bool {
        matches!(self.current_phase, CurvePhase::PreBonding) &&
        current_slot < self.created_at_slot.saturating_add(anti_sniper_window)
    }

    /// Get current fee based on pool configuration
    /// Fees continue throughout the token's lifetime (PreBonding + Graduated)
    /// This ensures creators earn fees forever, not just during initial bonding phase
    /// Fee tiers: 0%, 0.25%, or 1% (set at pool creation)
    pub fn get_current_fee_bps(&self) -> u16 {
        self.fee_bps // Same fee throughout lifetime
    }

    /// Get reserves to use for pricing (virtual pre-graduation, real post-graduation)
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
    pub fn check_phase_transition(&mut self) -> Result<bool> {
        match self.current_phase {
            CurvePhase::PreBonding => {
                if self.real_quote_reserves >= self.graduation_threshold_crx {
                    msg!("🚀 GRADUATION at $40k!");
                    msg!("   Accumulated: {} CRX (threshold: {})",
                        self.real_quote_reserves,
                        self.graduation_threshold_crx
                    );
                    msg!("   Remaining tokens: {}", self.real_base_reserves);
                    msg!("   🔄 Switching from VIRTUAL to REAL reserves for pricing");
                    msg!("   Now a permanent constant-product AMM!");
                    msg!("   Pool address stays the same - No migration needed");
                    msg!("   Creator continues earning {} bps fees forever", self.fee_bps);

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
                    .checked_mul(150)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_div(100)
                    .ok_or(ErrorCode::MathOverflow)?;

                let denominator = (input_reserve as u128)
                    .checked_add(input_scaled)
                    .ok_or(ErrorCode::MathOverflow)?;

                numerator
                    .checked_div(denominator)
                    .ok_or(ErrorCode::MathOverflow)?
            },
            CurveType::Custom => {
                // Custom curves not implemented in base protocol
                // Advanced users can fork and implement custom math
                // Or use CPI to call their own curve calculation program
                //
                // Ideas for custom curves:
                // - Polynomial curves (quadratic, cubic)
                // - Logarithmic curves (slower initial growth)
                // - Sigmoid curves (S-shaped, controlled ramps)
                // - Step functions (discrete price levels)
                // - Hybrid curves (different formulas per phase)
                //
                // For now, return error to prevent misconfiguration
                return Err(ErrorCode::CustomCurveNotImplemented.into());
            },
        };

        // Apply fee (fee is taken from output)
        let fee_multiplier = 10000u128
            .checked_sub(fee_bps as u128)
            .ok_or(ErrorCode::InvalidFee)?;

        let output_with_fee = output_before_fee
            .checked_mul(fee_multiplier)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000u128)
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
    pub fn get_spot_price(&self) -> Result<u64> {
        let (quote_reserves, base_reserves) = self.get_pricing_reserves();

        require!(base_reserves > 0, ErrorCode::InvalidReserves);

        let price = (quote_reserves as u128)
            .checked_mul(1_000_000_000) // 9 decimals for precision
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(base_reserves as u128)
            .ok_or(ErrorCode::MathOverflow)?;

        Ok(price as u64)
    }

    /// Get current market cap in CRX
    pub fn get_market_cap_crx(&self) -> Result<u64> {
        let price = self.get_spot_price()?;

        let market_cap = (self.token_total_supply as u128)
            .checked_mul(price as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(1_000_000_000) // Remove precision
            .ok_or(ErrorCode::MathOverflow)?;

        Ok(market_cap as u64)
    }

    /// Get current market cap in USD
    pub fn get_market_cap_usd(&self) -> Result<u64> {
        let mc_crx = self.get_market_cap_crx()?;

        let mc_usd = (mc_crx as u128)
            .checked_mul(self.last_crx_price_usd as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(1_000_000) // CRX has 6 decimals
            .ok_or(ErrorCode::MathOverflow)?;

        Ok(mc_usd as u64)
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
    pub fn update_on_buy(&mut self, buy_amount: u64, current_slot: u64) -> Result<()> {
        if self.tracked_amount == 0 {
            // First buy or position was fully closed
            self.avg_entry_slot = current_slot;
            self.tracked_amount = buy_amount;
        } else {
            // Calculate weighted average using u128 to prevent overflow
            let numerator = (self.tracked_amount as u128)
                .checked_mul(self.avg_entry_slot as u128)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_add(
                    (buy_amount as u128)
                        .checked_mul(current_slot as u128)
                        .ok_or(ErrorCode::MathOverflow)?
                )
                .ok_or(ErrorCode::MathOverflow)?;

            let denominator = (self.tracked_amount as u128)
                .checked_add(buy_amount as u128)
                .ok_or(ErrorCode::MathOverflow)?;

            self.avg_entry_slot = (numerator / denominator) as u64;
            self.tracked_amount = self.tracked_amount
                .checked_add(buy_amount)
                .ok_or(ErrorCode::MathOverflow)?;
        }

        Ok(())
    }

    /// Reduce tracked amount when user sells tokens
    pub fn update_on_sell(&mut self, sell_amount: u64) -> Result<()> {
        self.tracked_amount = self.tracked_amount.saturating_sub(sell_amount);

        // If fully sold, reset entry slot
        if self.tracked_amount == 0 {
            self.avg_entry_slot = 0;
        }

        Ok(())
    }

    /// Calculate extra sell fee based on hold time
    /// Decays from 10% (1000 bps) → 1% (100 bps) → 0% over time
    ///
    /// Time thresholds (assuming ~400ms/slot):
    /// - T1: 75 slots (~30s) - 10% fee
    /// - T2: 750 slots (~5min) - 1% fee
    /// - T3: 4500 slots (~30min) - 0% fee
    pub fn calculate_extra_sell_fee_bps(&self, current_slot: u64) -> u64 {
        // Constants
        const T1: u64 = 75;      // ~30 seconds
        const T2: u64 = 750;     // ~5 minutes
        const T3: u64 = 4500;    // ~30 minutes
        const F1: u64 = 1000;    // 10.00%
        const F2: u64 = 100;     // 1.00%

        // Calculate age in slots
        let age = current_slot.saturating_sub(self.avg_entry_slot);

        // Piecewise linear decay
        if age <= T1 {
            // 0-30s: full 10% fee
            F1
        } else if age <= T2 {
            // 30s-5m: decay from 10% → 1%
            // extra = F2 + (F1 - F2) * (T2 - age) / (T2 - T1)
            let decay_range = F1 - F2;
            let time_remaining = T2 - age;
            let time_range = T2 - T1;

            F2 + (decay_range * time_remaining) / time_range
        } else if age <= T3 {
            // 5m-30m: decay from 1% → 0%
            // extra = F2 * (T3 - age) / (T3 - T2)
            let time_remaining = T3 - age;
            let time_range = T3 - T2;

            (F2 * time_remaining) / time_range
        } else {
            // 30m+: no extra fee
            0
        }
    }
}

use crate::errors::ErrorCode;
