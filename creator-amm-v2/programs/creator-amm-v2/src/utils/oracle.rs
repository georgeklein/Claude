use anchor_lang::prelude::*;
use crate::errors::ErrorCode;

/// Pyth price feed account data (simplified)
/// In production, use: pyth-solana-receiver-sdk
#[account]
pub struct PythPriceFeed {
    // Simplified structure - replace with actual Pyth SDK in production
    pub price: i64,
    pub conf: u64,
    pub expo: i32,
    pub publish_time: i64,
}

/// Get CRX price in USD from oracle
/// Returns price with 6 decimals (e.g., 2_000_000 = $2.00)
pub fn get_crx_price_usd(
    price_feed: &Account<PythPriceFeed>,
    max_age_seconds: i64,
    max_confidence_bps: u64,
) -> Result<u64> {
    let clock = Clock::get()?;

    // Check price freshness
    let price_age = clock.unix_timestamp - price_feed.publish_time;
    require!(
        price_age <= max_age_seconds,
        ErrorCode::OraclePriceStale
    );

    // Check confidence interval
    let price_abs = price_feed.price.abs() as u64;
    let confidence_bps = (price_feed.conf as u128)
        .checked_mul(10000)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(price_abs as u128)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    require!(
        confidence_bps <= max_confidence_bps,
        ErrorCode::OracleConfidenceTooLow
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

/// Calculate CRX thresholds in CRX based on USD targets
pub fn calculate_crx_thresholds(
    pre_bonding_usd: u64,      // e.g., 40_000_000_000 (40k with 6 decimals)
    graduation_usd: u64,        // e.g., 85_000_000_000 (85k with 6 decimals)
    crx_price_usd: u64,         // e.g., 2_000_000 ($2.00 with 6 decimals)
) -> Result<(u64, u64)> {
    // Pre-bonding threshold in CRX
    let pre_threshold_crx = (pre_bonding_usd as u128)
        .checked_mul(1_000_000) // CRX decimals
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(crx_price_usd as u128)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    // Graduation threshold in CRX
    let grad_threshold_crx = (graduation_usd as u128)
        .checked_mul(1_000_000) // CRX decimals
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(crx_price_usd as u128)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    Ok((pre_threshold_crx, grad_threshold_crx))
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

    msg!("💡 Calculated virtual reserves:");
    msg!("   Target MC: ${}", target_market_cap_usd as f64 / 1_000_000.0);
    msg!("   CRX Price: ${}", crx_price_usd as f64 / 1_000_000.0);
    msg!("   Virtual CRX: {}", virtual_quote);
    msg!("   Virtual BASE: {}", virtual_base);
    msg!("   Initial Price: {} CRX per token",
        (virtual_quote as f64) / (virtual_base as f64));

    Ok((virtual_quote, virtual_base))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_virtual_reserves_calculation() {
        // Target: $50k market cap
        // Token supply: 1M tokens
        // CRX price: $2.00

        let target_mc = 50_000_000_000; // $50k with 6 decimals
        let supply = 1_000_000_000_000;  // 1M with 6 decimals
        let crx_price = 2_000_000;       // $2.00 with 6 decimals

        let (virtual_crx, virtual_base) =
            calculate_virtual_reserves_for_market_cap(target_mc, supply, crx_price).unwrap();

        // Expected: $50k / $2 = 25,000 CRX
        assert_eq!(virtual_crx, 25_000_000_000); // 25k with 6 decimals
        assert_eq!(virtual_base, 1_000_000_000_000); // 1M with 6 decimals

        // Verify price: 25k / 1M = 0.025 CRX per token
        let price = (virtual_crx as f64) / (virtual_base as f64);
        assert!((price - 0.025).abs() < 0.0001);
    }

    #[test]
    fn test_crx_thresholds() {
        // Pre-bonding: $40k
        // Graduation: $85k
        // CRX price: $5.00

        let pre_usd = 40_000_000_000;   // $40k
        let grad_usd = 85_000_000_000;  // $85k
        let crx_price = 5_000_000;      // $5.00

        let (pre_crx, grad_crx) =
            calculate_crx_thresholds(pre_usd, grad_usd, crx_price).unwrap();

        // Expected: $40k / $5 = 8,000 CRX
        assert_eq!(pre_crx, 8_000_000_000);   // 8k with 6 decimals

        // Expected: $85k / $5 = 17,000 CRX
        assert_eq!(grad_crx, 17_000_000_000); // 17k with 6 decimals
    }

    #[test]
    fn test_different_crx_prices() {
        let target_mc = 100_000_000_000; // $100k
        let supply = 10_000_000_000_000;  // 10M tokens

        // CRX = $0.50
        let (v_crx_1, _) = calculate_virtual_reserves_for_market_cap(
            target_mc, supply, 500_000
        ).unwrap();

        // CRX = $10.00
        let (v_crx_2, _) = calculate_virtual_reserves_for_market_cap(
            target_mc, supply, 10_000_000
        ).unwrap();

        // Higher CRX price = fewer CRX needed
        assert!(v_crx_2 < v_crx_1);

        // Verify actual amounts
        assert_eq!(v_crx_1, 200_000_000_000); // 200k CRX at $0.50
        assert_eq!(v_crx_2, 10_000_000_000);  // 10k CRX at $10.00
    }
}
