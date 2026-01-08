use anchor_lang::prelude::*;

/// Global configuration for the AMM protocol
#[account]
pub struct Config {
    /// Authority that can update config
    pub authority: Pubkey,
    /// Protocol fee wallet
    pub fee_recipient: Pubkey,
    /// Default protocol fee in basis points (100 = 1%)
    pub protocol_fee_bps: u16,
    /// Anti-sniper window in slots (e.g., 20 slots ≈ 8 seconds)
    pub anti_sniper_window: u64,
    /// Max trade size during anti-sniper window (basis points of total supply)
    pub anti_sniper_max_trade_bps: u16,
    /// Bump for PDA derivation
    pub bump: u8,
}

impl Config {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // fee_recipient
        2 +  // protocol_fee_bps
        8 +  // anti_sniper_window
        2 +  // anti_sniper_max_trade_bps
        1;   // bump
}

/// Bonding curve pool state
#[account]
pub struct Pool {
    /// Pool authority (PDA)
    pub authority: Pubkey,
    /// Quote token mint (SOL = wrapped SOL, or CRX, USDC, etc.)
    pub quote_mint: Pubkey,
    /// Base token mint (the token being launched)
    pub base_mint: Pubkey,
    /// Pool's quote token account
    pub quote_vault: Pubkey,
    /// Pool's base token account
    pub base_vault: Pubkey,

    /// Virtual quote reserves (for bonding curve pricing)
    pub virtual_quote_reserves: u64,
    /// Virtual base reserves (for bonding curve pricing)
    pub virtual_base_reserves: u64,

    /// Real quote reserves (actual tokens in pool)
    pub real_quote_reserves: u64,
    /// Real base reserves (actual tokens in pool)
    pub real_base_reserves: u64,

    /// Slot when pool was created (for anti-sniper)
    pub created_at_slot: u64,
    /// Has this pool graduated to a DEX?
    pub graduated: bool,
    /// Graduation threshold in quote tokens
    pub graduation_threshold: u64,

    /// Total quote token volume traded
    pub total_quote_volume: u64,
    /// Total base token volume traded
    pub total_base_volume: u64,

    /// Creator of the pool (receives LP tokens on graduation)
    pub creator: Pubkey,

    /// Bump for PDA derivation
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
        8 +  // created_at_slot
        1 +  // graduated
        8 +  // graduation_threshold
        8 +  // total_quote_volume
        8 +  // total_base_volume
        32 + // creator
        1;   // bump

    /// Check if anti-sniper protection is currently active
    pub fn is_anti_sniper_active(&self, current_slot: u64, anti_sniper_window: u64) -> bool {
        !self.graduated && current_slot < self.created_at_slot.saturating_add(anti_sniper_window)
    }

    /// Calculate output amount for a given input using constant product formula
    /// Formula: output = (input * output_reserve) / (input_reserve + input)
    /// With fee: output = output * (10000 - fee_bps) / 10000
    pub fn calculate_output(
        &self,
        input_amount: u64,
        input_reserve: u64,
        output_reserve: u64,
        fee_bps: u16,
    ) -> Result<u64> {
        require!(input_amount > 0, ErrorCode::InvalidAmount);
        require!(input_reserve > 0 && output_reserve > 0, ErrorCode::InsufficientLiquidity);

        // Calculate output without fee using x * y = k
        let numerator = (input_amount as u128)
            .checked_mul(output_reserve as u128)
            .ok_or(ErrorCode::MathOverflow)?;

        let denominator = (input_reserve as u128)
            .checked_add(input_amount as u128)
            .ok_or(ErrorCode::MathOverflow)?;

        let output_before_fee = numerator
            .checked_div(denominator)
            .ok_or(ErrorCode::MathOverflow)?;

        // Apply fee
        let fee_multiplier = 10000u128.checked_sub(fee_bps as u128)
            .ok_or(ErrorCode::InvalidFee)?;

        let output_with_fee = output_before_fee
            .checked_mul(fee_multiplier)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000u128)
            .ok_or(ErrorCode::MathOverflow)?;

        Ok(output_with_fee as u64)
    }

    /// Calculate required input amount for a desired output
    /// Formula: input = (output * input_reserve) / (output_reserve - output) + 1
    pub fn calculate_input_for_output(
        &self,
        output_amount: u64,
        input_reserve: u64,
        output_reserve: u64,
        fee_bps: u16,
    ) -> Result<u64> {
        require!(output_amount > 0, ErrorCode::InvalidAmount);
        require!(output_amount < output_reserve, ErrorCode::InsufficientLiquidity);
        require!(input_reserve > 0, ErrorCode::InsufficientLiquidity);

        // Adjust output for fee (we need more input to account for fee)
        let fee_multiplier = 10000u128.checked_sub(fee_bps as u128)
            .ok_or(ErrorCode::InvalidFee)?;

        let output_before_fee = (output_amount as u128)
            .checked_mul(10000u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(fee_multiplier)
            .ok_or(ErrorCode::MathOverflow)?;

        let numerator = output_before_fee
            .checked_mul(input_reserve as u128)
            .ok_or(ErrorCode::MathOverflow)?;

        let denominator = (output_reserve as u128)
            .checked_sub(output_before_fee)
            .ok_or(ErrorCode::InsufficientLiquidity)?;

        let input = numerator
            .checked_div(denominator)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_add(1) // Add 1 to round up
            .ok_or(ErrorCode::MathOverflow)?;

        Ok(input as u64)
    }

    /// Check if pool has reached graduation threshold
    pub fn can_graduate(&self) -> bool {
        !self.graduated && self.real_quote_reserves >= self.graduation_threshold
    }
}

use crate::errors::ErrorCode;
