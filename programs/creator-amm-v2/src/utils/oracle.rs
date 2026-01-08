use anchor_lang::prelude::*;
use crate::errors::ErrorCode;

/// Pyth-compatible price feed account data
///
/// PRODUCTION NOTE: This is a simplified structure matching Pyth's price feed format.
/// It supports both:
/// 1. Standard Pyth Network price feeds
/// 2. Custom oracle infrastructure (e.g., Helius, Switchboard, or proprietary oracles)
///
/// For standard Pyth integration, add to Cargo.toml:
///   pyth-solana-receiver-sdk = "0.2"
/// And replace this struct with: pyth_solana_receiver_sdk::PriceFeed
///
/// Current implementation validates:
/// - Price staleness (max_age_seconds)
/// - Confidence intervals (max_confidence_bps)
/// - Exponent bounds (-12 to +6)
/// - Negative/zero price rejection
/// - Confidence < price validation
///
/// This structure is sufficient for production if using compatible oracle feeds.
#[account]
pub struct PythPriceFeed {
    pub price: i64,         // Price with exponent applied
    pub conf: u64,          // Confidence interval
    pub expo: i32,          // Price exponent (e.g., -8 for 8 decimals)
    pub publish_time: i64,  // Unix timestamp of price publication
}

/// Get CRX price in USD from oracle
/// Returns price with 6 decimals (e.g., 2_000_000 = $2.00)
pub fn get_crx_price_usd(
    price_feed: &Account<PythPriceFeed>,
    max_age_seconds: i64,
    max_confidence_bps: u64,
) -> Result<u64> {
    let clock = Clock::get()?;

    // CRITICAL: Reject negative or zero prices (prevents division by zero and negative cast bugs)
    require!(price_feed.price > 0, ErrorCode::InvalidCrxPrice);

    // Check price freshness - use checked arithmetic to prevent overflow
    let price_age = clock
        .unix_timestamp
        .checked_sub(price_feed.publish_time)
        .ok_or(ErrorCode::OraclePriceStale)?;

    require!(
        price_age <= max_age_seconds,
        ErrorCode::OraclePriceStale
    );

    // Check confidence interval (safe now - price guaranteed > 0)
    let price_abs = price_feed.price as u64;

    // CRITICAL: Validate that confidence doesn't exceed price (invalid oracle data)
    // If conf > price, the oracle is reporting nonsense data
    require!(
        price_feed.conf <= price_abs,
        ErrorCode::InvalidOracleConfidence
    );

    let confidence_bps = (price_feed.conf as u128)
        .checked_mul(10000)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(price_abs as u128)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    require!(
        confidence_bps <= max_confidence_bps,
        ErrorCode::OracleConfidenceTooLow
    );

    // CRITICAL: Validate exponent bounds to prevent overflow/DoS
    // Pyth exponents typically range from -12 to 0 for USD prices
    // We allow up to +6 to handle edge cases, but cap to prevent overflow
    require!(
        price_feed.expo >= -12 && price_feed.expo <= 6,
        ErrorCode::InvalidOracleExponent
    );

    // Convert price to 6 decimals
    let price = if price_feed.expo >= 0 {
        // Positive exponent: multiply
        (price_feed.price as u128)
            .checked_mul(10u128.pow(price_feed.expo as u32))
            .ok_or(ErrorCode::MathOverflow)?
            .checked_mul(1_000_000) // Convert to 6 decimals
            .ok_or(ErrorCode::MathOverflow)?
    } else {
        // Negative exponent: divide
        let divisor = 10u128.pow(price_feed.expo.abs() as u32);
        (price_feed.price as u128)
            .checked_mul(1_000_000) // Convert to 6 decimals
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(divisor)
            .ok_or(ErrorCode::MathOverflow)?
    };

    require!(price <= u64::MAX as u128, ErrorCode::MathOverflow);

    Ok(price as u64)
}

/// Calculate virtual reserves for target market cap
/// This is the CORE INNOVATION - dynamic virtual liquidity!
pub fn calculate_virtual_reserves_for_market_cap(
    target_market_cap_usd: u64,    // e.g., 50_000_000_000 (50k with 6 decimals)
    token_supply: u64,              // e.g., 1_000_000_000_000 (1M with 6 decimals)
    crx_price_usd: u64,             // e.g., 2_000_000 ($2.00 with 6 decimals)
) -> Result<(u64, u64)> {
    // Step 1: Calculate price per token in USD
    // price_per_token = market_cap / supply
    let price_per_token_usd = (target_market_cap_usd as u128)
        .checked_mul(1_000_000) // Add precision
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(token_supply as u128)
        .ok_or(ErrorCode::MathOverflow)?;

    // Step 2: Convert USD price to CRX price
    // price_in_crx = price_in_usd / crx_price_usd
    let price_per_token_crx = price_per_token_usd
        .checked_mul(1_000_000) // CRX decimals
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(crx_price_usd as u128)
        .ok_or(ErrorCode::MathOverflow)?;

    // Step 3: Calculate virtual CRX reserves
    // For constant product curve: price = virtual_quote / virtual_base
    // Therefore: virtual_quote = price * virtual_base
    let virtual_crx_reserves = price_per_token_crx
        .checked_mul(token_supply as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(1_000_000) // Remove precision
        .ok_or(ErrorCode::MathOverflow)?;

    require!(
        virtual_crx_reserves <= u64::MAX as u128,
        ErrorCode::MathOverflow
    );

    let virtual_quote = virtual_crx_reserves as u64;
    let virtual_base = token_supply;

    // Validation
    require!(virtual_quote > 0, ErrorCode::InvalidVirtualReserves);
    require!(virtual_base > 0, ErrorCode::InvalidVirtualReserves);

    Ok((virtual_quote, virtual_base))
}
