use anchor_lang::prelude::*;
use crate::state::{CurveType, CurvePhase};

/// Emitted when the global AMM configuration is initialized
#[event]
pub struct ConfigInitialized {
    /// Protocol authority
    pub authority: Pubkey,

    /// Fee recipient wallet
    pub fee_recipient: Pubkey,

    /// CRX token mint address
    pub crx_mint: Pubkey,

    /// CRX price oracle (Pyth/Switchboard)
    pub crx_price_oracle: Pubkey,

    /// Pre-bonding fee in basis points (e.g., 300 = 3%)
    pub pre_bonding_fee_bps: u16,

    /// Pre-bonding threshold in USD (6 decimals)
    pub pre_bonding_threshold_usd: u64,

    /// Post-bonding fee in basis points
    pub post_bonding_fee_bps: u16,

    /// Graduation threshold in USD (6 decimals)
    pub graduation_threshold_usd: u64,

    /// Anti-sniper window in slots
    pub anti_sniper_window_slots: u64,

    /// Anti-sniper max trade size in bps
    pub anti_sniper_max_trade_bps: u16,

    /// Oracle max age in seconds
    pub oracle_max_age_seconds: i64,

    /// Oracle max confidence deviation in bps
    pub oracle_max_confidence_bps: u64,

    /// Slot when config was created
    pub slot: u64,

    /// Timestamp when config was created
    pub timestamp: i64,
}

/// Emitted when a new bonding curve pool is created
#[event]
pub struct PoolCreated {
    /// Pool PDA address (indexed for queries)
    #[index]
    pub pool: Pubkey,

    /// Base token mint (indexed for queries by token)
    #[index]
    pub base_mint: Pubkey,

    /// Quote token mint (always CRX)
    pub quote_mint: Pubkey,

    /// Pool creator (indexed for queries by creator)
    #[index]
    pub creator: Pubkey,

    /// Bonding curve type
    pub curve_type: CurveType,

    /// Target initial market cap in USD (6 decimals)
    pub target_market_cap_usd: u64,

    /// Total token supply deposited
    pub token_supply: u64,

    /// Pool fee in basis points (0, 25, or 100)
    pub fee_bps: u16,

    /// Graduation threshold in USD (6 decimals, pool-specific)
    pub graduation_threshold_usd: u64,

    /// Graduation threshold in CRX (calculated from USD threshold and oracle price)
    pub graduation_threshold_crx: u64,

    /// Virtual CRX reserves for pricing
    pub virtual_quote_reserves: u64,

    /// Virtual token reserves for pricing
    pub virtual_base_reserves: u64,

    /// CRX price at pool creation (USD, 6 decimals)
    pub crx_price_at_creation: u64,

    /// Initial spot price (CRX per token, 9 decimals precision)
    pub initial_price: u64,

    /// Initial market cap in USD (6 decimals)
    pub initial_market_cap_usd: u64,

    /// Slot when pool was created
    pub created_at_slot: u64,

    /// Timestamp when pool was created
    pub timestamp: i64,
}

/// Emitted on every buy/sell trade
/// Optimized: Removed computed fields (price, market_cap) to save ~5k CU
/// Indexers can calculate these from reserves
#[event]
pub struct TradeExecuted {
    /// Base token mint (indexed for per-token queries)
    #[index]
    pub base_mint: Pubkey,

    /// Trade type: true = Buy, false = Sell
    pub is_buy: bool,

    /// Input amount (CRX for buys, tokens for sells)
    pub input_amount: u64,

    /// Output amount (tokens for buys, CRX for sells)
    pub output_amount: u64,

    /// Protocol fee charged (in quote token - CRX)
    pub fee_amount: u64,

    /// Fee percentage charged (basis points)
    pub fee_bps: u16,

    /// Current phase at time of trade
    pub phase: CurvePhase,

    /// Quote reserves after trade (virtual for PreBonding, real for Graduated)
    pub quote_reserves_after: u64,

    /// Base reserves after trade (virtual for PreBonding, real for Graduated)
    pub base_reserves_after: u64,

    /// Real CRX accumulated in vault (only meaningful in PreBonding phase)
    pub real_crx_accumulated: u64,

    /// Was anti-sniper protection active during this trade?
    pub anti_sniper_active: bool,

    /// Slot when trade executed
    pub slot: u64,

    /// Timestamp when trade executed
    pub timestamp: i64,
}

/// Emitted when a pool graduates from bonding curve to permanent AMM
#[event]
pub struct PoolGraduated {
    /// Pool address (indexed)
    #[index]
    pub pool: Pubkey,

    /// Base token mint (indexed)
    #[index]
    pub base_mint: Pubkey,

    /// Pool creator
    pub creator: Pubkey,

    /// Slot when graduation occurred
    pub graduation_slot: u64,

    /// Total CRX accumulated at graduation
    pub total_crx_accumulated: u64,

    /// Graduation threshold that was met (in CRX)
    pub graduation_threshold_crx: u64,

    /// Final virtual quote reserves at graduation (frozen)
    pub final_virtual_quote_reserves: u64,

    /// Final virtual base reserves at graduation (frozen)
    pub final_virtual_base_reserves: u64,

    /// Starting real quote reserves for AMM phase
    pub starting_real_quote_reserves: u64,

    /// Starting real base reserves for AMM phase
    pub starting_real_base_reserves: u64,

    /// Final price at graduation (CRX per token, 9 decimals)
    pub price_at_graduation: u64,

    /// Market cap in USD at graduation (6 decimals)
    pub market_cap_usd_at_graduation: u64,

    /// Total volume in CRX during bonding phase
    pub total_volume_crx: u64,

    /// Total fees collected during bonding phase (CRX)
    pub total_fees_collected: u64,

    /// Time from creation to graduation (in slots)
    pub slots_to_graduate: u64,

    /// Timestamp when graduation occurred
    pub timestamp: i64,
}

// PhaseTransition event removed - was duplicate of PoolGraduated (saves ~1k CU)
// Indexers should use PoolGraduated for phase transition tracking

/// Emitted when a pool's graduation threshold is updated by authority
#[event]
pub struct PoolGraduationUpdated {
    /// Pool address (indexed)
    #[index]
    pub pool: Pubkey,

    /// Base token mint (indexed)
    #[index]
    pub base_mint: Pubkey,

    /// Old graduation threshold in USD (6 decimals)
    pub old_graduation_threshold_usd: u64,

    /// New graduation threshold in USD (6 decimals)
    pub new_graduation_threshold_usd: u64,

    /// Old graduation threshold in CRX
    pub old_graduation_threshold_crx: u64,

    /// New graduation threshold in CRX
    pub new_graduation_threshold_crx: u64,

    /// CRX price used for conversion (USD, 6 decimals)
    pub crx_price_usd: u64,

    /// Slot when update occurred
    pub slot: u64,

    /// Timestamp when update occurred
    pub timestamp: i64,
}
