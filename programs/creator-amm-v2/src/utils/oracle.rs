use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::ErrorCode;

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
        .checked_mul(USD_DECIMALS as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(token_supply as u128)
        .ok_or(ErrorCode::MathOverflow)?;

    // Step 2: Convert USD price to CRX price
    // price_in_crx = price_in_usd / crx_price_usd
    let price_per_token_crx = price_per_token_usd
        .checked_mul(CRX_DECIMALS as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(crx_price_usd as u128)
        .ok_or(ErrorCode::MathOverflow)?;

    // Step 3: Calculate virtual CRX reserves
    // For constant product curve: price = virtual_quote / virtual_base
    // Therefore: virtual_quote = price * virtual_base
    let virtual_crx_reserves = price_per_token_crx
        .checked_mul(token_supply as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(USD_DECIMALS as u128)
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
