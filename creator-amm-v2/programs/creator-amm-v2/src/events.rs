use anchor_lang::prelude::*;
use crate::state::{CurveType, CurvePhase};

#[event]
pub struct ConfigInitialized {
    pub authority: Pubkey,
    pub fee_recipient: Pubkey,
    pub crx_mint: Pubkey,
    pub crx_price_oracle: Pubkey,
    pub anti_sniper_window_slots: u64,
    pub anti_sniper_max_trade_bps: u16,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct PoolCreated {
    #[index]
    pub pool: Pubkey,
    #[index]
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    #[index]
    pub creator: Pubkey,
    pub curve_type: CurveType,
    pub target_market_cap_usd: u64,
    pub token_supply: u64,
    pub fee_bps: u16,
    pub graduation_threshold_usd: u64,
    pub graduation_threshold_crx: u64,
    pub virtual_quote_reserves: u64,
    pub virtual_base_reserves: u64,
    pub crx_price_at_creation: u64,
    pub initial_price: u64,
    pub initial_market_cap_usd: u64,
    pub created_at_slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct TradeExecuted {
    #[index]
    pub pool: Pubkey,
    #[index]
    pub user: Pubkey,
    #[index]
    pub base_mint: Pubkey,
    pub is_buy: bool,
    pub input_amount: u64,
    pub output_amount: u64,
    pub fee_amount: u64,
    pub fee_bps: u16,
    pub phase: CurvePhase,
    pub price_after: u64,
    pub quote_reserves_after: u64,
    pub base_reserves_after: u64,
    pub real_crx_accumulated: u64,
    pub market_cap_usd: u64,
    pub anti_sniper_active: bool,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct PoolGraduated {
    #[index]
    pub pool: Pubkey,
    #[index]
    pub base_mint: Pubkey,
    pub creator: Pubkey,
    pub graduation_slot: u64,
    pub total_crx_accumulated: u64,
    pub graduation_threshold_crx: u64,
    pub final_virtual_quote_reserves: u64,
    pub final_virtual_base_reserves: u64,
    pub starting_real_quote_reserves: u64,
    pub starting_real_base_reserves: u64,
    pub price_at_graduation: u64,
    pub market_cap_usd_at_graduation: u64,
    pub total_volume_crx: u64,
    pub total_fees_collected: u64,
    pub slots_to_graduate: u64,
    pub timestamp: i64,
}
