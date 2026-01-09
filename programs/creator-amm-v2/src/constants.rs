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

/// Maximum fee allowed (100% = 10,000 bps)
pub const MAX_FEE_BPS: u16 = 10_000;

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
// WAA (Weighted Average Anti-Dump) Thresholds
// ============================================================================

/// Tier 1 threshold: 75 slots (~30 seconds at 400ms/slot)
pub const WAA_TIER1_SLOTS: u64 = 75;

/// Tier 2 threshold: 750 slots (~5 minutes)
pub const WAA_TIER2_SLOTS: u64 = 750;

/// Tier 3 threshold: 4,500 slots (~30 minutes)
pub const WAA_TIER3_SLOTS: u64 = 4_500;

/// Maximum WAA fee: 10%
pub const WAA_FEE_MAX: u64 = 1_000;

/// Minimum WAA fee: 1%
pub const WAA_FEE_MIN: u64 = 100;

/// WAA decay range: difference between max and min fees
pub const WAA_DECAY_RANGE: u64 = WAA_FEE_MAX - WAA_FEE_MIN; // 900 bps

/// WAA time range 1: T2 - T1 (675 slots)
pub const WAA_TIME_RANGE_1: u64 = WAA_TIER2_SLOTS - WAA_TIER1_SLOTS;

/// WAA time range 2: T3 - T2 (3,750 slots)
pub const WAA_TIME_RANGE_2: u64 = WAA_TIER3_SLOTS - WAA_TIER2_SLOTS;

// ============================================================================
// CRX Price Validation
// ============================================================================

/// Minimum CRX price: $0.01 (with 6 decimals)
pub const CRX_PRICE_MIN_USD: u64 = 10_000;

/// Maximum CRX price: $1,000 (with 6 decimals)
pub const CRX_PRICE_MAX_USD: u64 = 1_000_000_000;

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

/// Graduation cooldown: 150 slots (~60 seconds)
/// Prevents rapid back-to-back graduations that could be exploited
pub const GRADUATION_COOLDOWN_SLOTS: u64 = 150;

// ============================================================================
// Configuration Limits
// ============================================================================

/// Maximum number of approved quote tokens in whitelist
pub const MAX_APPROVED_QUOTE_TOKENS: usize = 5;
