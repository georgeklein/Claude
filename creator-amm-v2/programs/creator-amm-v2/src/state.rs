use anchor_lang::prelude::*;

/// Global configuration for the Creator AMM v2
#[account]
pub struct Config {
    pub authority: Pubkey,
    pub fee_recipient: Pubkey,
    pub crx_price_oracle: Pubkey,
    pub crx_mint: Pubkey,
    pub anti_sniper_window_slots: u64,
    pub anti_sniper_max_trade_bps: u16,
    pub oracle_max_age_seconds: i64,
    pub oracle_max_confidence_bps: u64,
    pub bump: u8,
}

impl Config {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 8 + 2 + 8 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum CurveType {
    ConstantProduct,  // x * y = k
    Exponential,      // y = (x * Y) / (X + 1.5*x)
    Custom,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum CurvePhase {
    PreBonding,  // Uses virtual reserves
    Graduated,   // Uses real reserves
}

#[account]
pub struct Pool {
    pub authority: Pubkey,
    pub quote_mint: Pubkey,
    pub base_mint: Pubkey,
    pub quote_vault: Pubkey,
    pub base_vault: Pubkey,
    pub virtual_quote_reserves: u64,
    pub virtual_base_reserves: u64,
    pub real_quote_reserves: u64,
    pub real_base_reserves: u64,
    pub current_phase: CurvePhase,
    pub curve_type: CurveType,
    pub target_market_cap_usd: u64,
    pub token_total_supply: u64,
    pub fee_bps: u16,
    pub graduation_threshold_crx: u64,
    pub created_at_slot: u64,
    pub total_quote_volume: u64,
    pub total_base_volume: u64,
    pub total_fees_collected: u64,
    pub creator: Pubkey,
    pub last_crx_price_usd: u64,
    pub is_paused: bool,
    pub bump: u8,
}

impl Pool {
    pub const LEN: usize = 8 + 32*5 + 8*10 + 1 + 1 + 2 + 32 + 1 + 1; // 271 bytes

    pub fn is_anti_sniper_active(&self, current_slot: u64, window: u64) -> bool {
        matches!(self.current_phase, CurvePhase::PreBonding) &&
        current_slot < self.created_at_slot.saturating_add(window)
    }

    pub fn get_current_fee_bps(&self) -> u16 {
        match self.current_phase {
            CurvePhase::PreBonding => self.fee_bps,
            CurvePhase::Graduated => 0,
        }
    }

    pub fn get_pricing_reserves(&self) -> (u64, u64) {
        match self.current_phase {
            CurvePhase::PreBonding => (self.virtual_quote_reserves, self.virtual_base_reserves),
            CurvePhase::Graduated => (self.real_quote_reserves, self.real_base_reserves),
        }
    }

    pub fn check_phase_transition(&mut self) -> Result<bool> {
        if matches!(self.current_phase, CurvePhase::PreBonding) &&
           self.real_quote_reserves >= self.graduation_threshold_crx {
            self.current_phase = CurvePhase::Graduated;
            return Ok(true);
        }
        Ok(false)
    }

    pub fn calculate_output(&self, input: u64, in_res: u64, out_res: u64, fee_bps: u16) -> Result<u64> {
        require!(input > 0, ErrorCode::InvalidAmount);
        require!(in_res > 0 && out_res > 0, ErrorCode::InsufficientLiquidity);

        let (i, ir, or) = (input as u128, in_res as u128, out_res as u128);
        let output = match self.curve_type {
            CurveType::ConstantProduct => i.checked_mul(or).ok_or(ErrorCode::MathOverflow)?
                .checked_div(ir.checked_add(i).ok_or(ErrorCode::MathOverflow)?).ok_or(ErrorCode::MathOverflow)?,
            CurveType::Exponential => {
                let scaled = i.checked_mul(150).ok_or(ErrorCode::MathOverflow)?.checked_div(100).ok_or(ErrorCode::MathOverflow)?;
                i.checked_mul(or).ok_or(ErrorCode::MathOverflow)?
                    .checked_div(ir.checked_add(scaled).ok_or(ErrorCode::MathOverflow)?).ok_or(ErrorCode::MathOverflow)?
            },
            CurveType::Custom => return Err(ErrorCode::CustomCurveNotImplemented.into()),
        };

        let with_fee = output.checked_mul(10000 - fee_bps as u128).ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000).ok_or(ErrorCode::MathOverflow)?;
        require!(with_fee <= u64::MAX as u128, ErrorCode::MathOverflow);
        Ok(with_fee as u64)
    }

    pub fn get_spot_price(&self) -> Result<u64> {
        let (q, b) = self.get_pricing_reserves();
        require!(b > 0, ErrorCode::InvalidReserves);
        Ok(((q as u128).checked_mul(1_000_000_000).ok_or(ErrorCode::MathOverflow)?
            .checked_div(b as u128).ok_or(ErrorCode::MathOverflow)?) as u64)
    }

    pub fn get_market_cap_crx(&self) -> Result<u64> {
        let price = self.get_spot_price()?;
        Ok(((self.token_total_supply as u128).checked_mul(price as u128).ok_or(ErrorCode::MathOverflow)?
            .checked_div(1_000_000_000).ok_or(ErrorCode::MathOverflow)?) as u64)
    }

    pub fn get_market_cap_usd(&self) -> Result<u64> {
        let mc = self.get_market_cap_crx()?;
        Ok(((mc as u128).checked_mul(self.last_crx_price_usd as u128).ok_or(ErrorCode::MathOverflow)?
            .checked_div(1_000_000).ok_or(ErrorCode::MathOverflow)?) as u64)
    }
}

use crate::errors::ErrorCode;
