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
        1;   // bump
}

/// Bonding curve phase
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum CurvePhase {
    /// Phase 1: Pre-bonding (0 → 40k USD)
    PreBonding,
    /// Phase 2: Post-bonding (40k → 85k USD)
    PostBonding,
    /// Phase 3: Graduated to Meteora DAMM
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
    pub target_market_cap_usd: u64,      // Initial target MC (6 decimals)
    pub token_total_supply: u64,          // Total token supply

    /// Phase thresholds (in CRX, calculated from USD)
    pub pre_bonding_threshold_crx: u64,   // Dynamic based on CRX price
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
        8 +  // target_market_cap_usd
        8 +  // token_total_supply
        8 +  // pre_bonding_threshold_crx
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

    /// Check if anti-sniper protection is active
    pub fn is_anti_sniper_active(&self, current_slot: u64, anti_sniper_window: u64) -> bool {
        !matches!(self.current_phase, CurvePhase::Graduated) &&
        current_slot < self.created_at_slot.saturating_add(anti_sniper_window)
    }

    /// Get current fee based on phase
    pub fn get_current_fee_bps(
        &self,
        config: &Config,
    ) -> u16 {
        match self.current_phase {
            CurvePhase::PreBonding => config.pre_bonding_fee_bps,
            CurvePhase::PostBonding => config.post_bonding_fee_bps,
            CurvePhase::Graduated => 0, // No trading after graduation
        }
    }

    /// Check and update phase based on accumulated CRX
    pub fn check_phase_transition(&mut self) -> Result<bool> {
        let mut transitioned = false;

        match self.current_phase {
            CurvePhase::PreBonding => {
                if self.real_quote_reserves >= self.pre_bonding_threshold_crx {
                    msg!("🎉 Phase transition: PreBonding → PostBonding");
                    msg!("Accumulated: {} CRX (threshold: {})",
                        self.real_quote_reserves,
                        self.pre_bonding_threshold_crx
                    );
                    self.current_phase = CurvePhase::PostBonding;
                    transitioned = true;
                }
            },
            CurvePhase::PostBonding => {
                if self.real_quote_reserves >= self.graduation_threshold_crx {
                    msg!("🚀 Pool ready for graduation!");
                    msg!("Accumulated: {} CRX (threshold: {})",
                        self.real_quote_reserves,
                        self.graduation_threshold_crx
                    );
                    self.current_phase = CurvePhase::Graduated;
                    transitioned = true;
                }
            },
            CurvePhase::Graduated => {},
        }

        Ok(transitioned)
    }

    /// Calculate output for constant product bonding curve
    /// Formula: y = (x * Y) / (X + x)
    /// Where: x = input, X = input_reserve, Y = output_reserve
    pub fn calculate_output(
        &self,
        input_amount: u64,
        input_reserve: u64,
        output_reserve: u64,
        fee_bps: u16,
    ) -> Result<u64> {
        require!(input_amount > 0, ErrorCode::InvalidAmount);
        require!(input_reserve > 0 && output_reserve > 0, ErrorCode::InsufficientLiquidity);

        // Calculate output before fee using x * y = k
        let numerator = (input_amount as u128)
            .checked_mul(output_reserve as u128)
            .ok_or(ErrorCode::MathOverflow)?;

        let denominator = (input_reserve as u128)
            .checked_add(input_amount as u128)
            .ok_or(ErrorCode::MathOverflow)?;

        let output_before_fee = numerator
            .checked_div(denominator)
            .ok_or(ErrorCode::MathOverflow)?;

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
    pub fn get_spot_price(&self) -> Result<u64> {
        require!(self.virtual_base_reserves > 0, ErrorCode::InvalidReserves);

        let price = (self.virtual_quote_reserves as u128)
            .checked_mul(1_000_000_000) // 9 decimals for precision
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(self.virtual_base_reserves as u128)
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

use crate::errors::ErrorCode;
