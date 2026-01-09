/// Scale AMM Protocol Constants
///
/// All magic numbers extracted to a single location for maintainability.
/// This ensures consistent use of values across the codebase and makes
/// updates easier when protocol parameters need adjustment.

// ============================================================================
// Basis Points & Decimals
// ============================================================================

/// Basis points denominator (100% = 10,000 bps)
pub const BPS_DENOMINATOR: u16 = 10_000;

/// USD decimals (6 decimals for dollar amounts)
pub const USD_DECIMALS: u64 = 1_000_000;

/// CRX token decimals (6 decimals)
pub const CRX_DECIMALS: u64 = 1_000_000;

/// Price precision for spot price calculations (9 decimals)
pub const PRICE_PRECISION: u64 = 1_000_000_000;

// ============================================================================
// Fee Tiers
// ============================================================================

/// Fee tier: Free (0%)
pub const FEE_TIER_FREE: u16 = 0;

/// Fee tier: Low (0.25%)
pub const FEE_TIER_LOW: u16 = 25;

/// Fee tier: Standard (1%)
pub const FEE_TIER_STANDARD: u16 = 100;

// ============================================================================
// Token Supply & Decimal Limits
// ============================================================================

/// Minimum token supply: 1,000,000 tokens (with 6 decimals = 1e12)
/// Prevents spam pool creation with dust amounts
pub const MIN_TOKEN_SUPPLY: u64 = 1_000_000_000_000;

/// Maximum token supply: 1,000,000,000 tokens (with 6 decimals = 1e15)
/// Prevents overflow in market cap calculations
pub const MAX_TOKEN_SUPPLY: u64 = 1_000_000_000_000_000;

/// Minimum token decimals (standard Solana token)
pub const MIN_TOKEN_DECIMALS: u8 = 6;

/// Maximum token decimals (standard Solana token)
pub const MAX_TOKEN_DECIMALS: u8 = 9;

/// Minimum input amount to prevent fee rounding exploit (1,000 lamports)
pub const MIN_INPUT_AMOUNT: u64 = 1_000;

// ============================================================================
// Trade Limits
// ============================================================================

/// Minimum output amount to prevent dust trades (0.001 tokens with 6 decimals)
pub const MIN_OUTPUT_AMOUNT: u64 = 1_000;

// ============================================================================
// Market Cap Limits (USD with 6 decimals)
// ============================================================================

/// Minimum market cap: $1,000
pub const MIN_MARKET_CAP_USD: u64 = 1_000_000_000;

/// Maximum market cap: $1,000,000
pub const MAX_MARKET_CAP_USD: u64 = 1_000_000_000_000;

/// Minimum graduation threshold: $5,000
pub const MIN_GRADUATION_USD: u64 = 5_000_000_000;

/// Maximum graduation threshold: $10,000,000
pub const MAX_GRADUATION_USD: u64 = 10_000_000_000_000;

// ============================================================================
// WAA (Weighted Average Anti-Dump) Default Configuration
// ============================================================================
// These constants set the initial WAA config values on protocol initialization.
// Authority can update these post-deployment via update_waa_config instruction.

/// Default tier 1 threshold: 25 slots (~10 seconds at 400ms/slot)
pub const WAA_TIER1_SLOTS: u64 = 25;

/// Default tier 2 threshold: 150 slots (~1 minute)
pub const WAA_TIER2_SLOTS: u64 = 150;

/// Default tier 3 threshold: 750 slots (~5 minutes)
pub const WAA_TIER3_SLOTS: u64 = 750;

/// Default maximum WAA fee: 3%
pub const WAA_FEE_MAX: u64 = 300;

/// Default minimum WAA fee: 0.5%
pub const WAA_FEE_MIN: u64 = 50;

// ============================================================================
// CRX Price Validation
// ============================================================================

/// Minimum CRX price: $0.01 (with 6 decimals)
pub const CRX_PRICE_MIN_USD: u64 = 10_000;

/// Maximum CRX price: $1,000 (with 6 decimals)
pub const CRX_PRICE_MAX_USD: u64 = 1_000_000_000;

/// Maximum CRX price change per update: 10% (prevents graduation manipulation)
pub const CRX_PRICE_CHANGE_MAX_BPS: u128 = 1000;

/// Minimum price ratio allowed: 90% (9000 bps)
pub const CRX_PRICE_RATIO_MIN: u128 = 9000;

/// Maximum price ratio allowed: 110% (11000 bps)
pub const CRX_PRICE_RATIO_MAX: u128 = 11000;

/// Basis points multiplier for ratio calculation
pub const PRICE_RATIO_BPS_MULTIPLIER: u128 = 10000;

// ============================================================================
// Exponential Curve Constants
// ============================================================================

/// Exponential curve multiplier numerator (3/2 = 1.5x)
pub const EXPONENTIAL_CURVE_NUMERATOR: u128 = 3;

/// Exponential curve multiplier denominator (3/2 = 1.5x)
pub const EXPONENTIAL_CURVE_DENOMINATOR: u128 = 2;

// ============================================================================
// Graduation Protection
// ============================================================================

// ============================================================================
// Configuration Limits
// ============================================================================
