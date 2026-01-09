#!/usr/bin/env python3
"""
Virtual Reserves Calculation Verification Script
Replicates the Rust formula in Python to verify correctness
"""

# Constants (matching Rust)
USD_DECIMALS = 1_000_000
CRX_DECIMALS = 1_000_000

def calculate_virtual_reserves(target_market_cap_usd, token_supply, crx_price_usd):
    """
    Replicate the Rust calculation:
    1. price_per_token_usd = (target_market_cap_usd * USD_DECIMALS) / token_supply
    2. price_per_token_crx = (price_per_token_usd * CRX_DECIMALS) / crx_price_usd
    3. virtual_crx_reserves = (price_per_token_crx * token_supply) / USD_DECIMALS
    """
    # Step 1: Calculate price per token in USD
    price_per_token_usd = (target_market_cap_usd * USD_DECIMALS) // token_supply

    # Step 2: Convert USD price to CRX price
    price_per_token_crx = (price_per_token_usd * CRX_DECIMALS) // crx_price_usd

    # Step 3: Calculate virtual CRX reserves
    virtual_crx_reserves = (price_per_token_crx * token_supply) // USD_DECIMALS
    virtual_base_reserves = token_supply

    return virtual_crx_reserves, virtual_base_reserves, price_per_token_crx

def to_real_value(stored_value, decimals=1_000_000):
    """Convert stored value to real value"""
    return stored_value / decimals

def test_scenario(name, market_cap_usd, supply_tokens, crx_price_usd_real):
    """Test a specific scenario"""
    print(f"\n{'='*70}")
    print(f"Scenario: {name}")
    print(f"{'='*70}")

    # Convert to stored format (with 6 decimals)
    mc_stored = int(market_cap_usd * USD_DECIMALS)
    supply_stored = int(supply_tokens * CRX_DECIMALS)
    crx_price_stored = int(crx_price_usd_real * USD_DECIMALS)

    print(f"\nInputs:")
    print(f"  Market Cap: ${market_cap_usd:,.2f} (stored: {mc_stored:,})")
    print(f"  Token Supply: {supply_tokens:,.0f} tokens (stored: {supply_stored:,})")
    print(f"  CRX Price: ${crx_price_usd_real:.2f} (stored: {crx_price_stored:,})")

    # Calculate virtual reserves
    v_quote, v_base, price_crx = calculate_virtual_reserves(
        mc_stored, supply_stored, crx_price_stored
    )

    # Convert to real values
    v_quote_real = to_real_value(v_quote)
    v_base_real = to_real_value(v_base)
    price_crx_real = to_real_value(price_crx)

    # Expected values
    expected_price_per_token = market_cap_usd / supply_tokens
    expected_price_crx = expected_price_per_token / crx_price_usd_real
    expected_virtual_crx = market_cap_usd / crx_price_usd_real

    print(f"\nCalculated:")
    print(f"  Virtual Quote Reserves: {v_quote_real:,.2f} CRX (stored: {v_quote:,})")
    print(f"  Virtual Base Reserves: {v_base_real:,.0f} tokens (stored: {v_base:,})")
    print(f"  Price per token: {price_crx_real:.6f} CRX/token")

    print(f"\nExpected:")
    print(f"  Virtual CRX: {expected_virtual_crx:,.2f} CRX")
    print(f"  Price: {expected_price_crx:.6f} CRX/token")

    # Verify constant product
    calculated_price = v_quote_real / v_base_real
    print(f"\nVerification:")
    print(f"  Price from reserves (quote/base): {calculated_price:.6f} CRX/token")
    print(f"  Match expected: {abs(calculated_price - expected_price_crx) < 0.000001}")
    print(f"  CRX reserves match: {abs(v_quote_real - expected_virtual_crx) < 0.01}")

    # K-value
    k_value = v_quote * v_base
    print(f"  K-value: {k_value:,.0f} (< u128 max: {k_value < 2**128})")

    return abs(v_quote_real - expected_virtual_crx) < 0.01

# Run all test scenarios
print("="*70)
print("VIRTUAL RESERVES CALCULATION VERIFICATION")
print("="*70)

results = []

# Scenario 1: $50k market cap, 1M tokens, $2 CRX
results.append(test_scenario(
    "$50k market cap, 1M supply, $2 CRX",
    50_000, 1_000_000, 2.00
))

# Scenario 2: $100M market cap, 1B tokens, $0.50 CRX
results.append(test_scenario(
    "$100M market cap, 1B supply, $0.50 CRX",
    100_000_000, 1_000_000_000, 0.50
))

# Scenario 3: Very small market cap
results.append(test_scenario(
    "Very small: $10 market cap, 1M supply, $2 CRX",
    10, 1_000_000, 2.00
))

# Scenario 4: Very large market cap
results.append(test_scenario(
    "Very large: $1B market cap, 1B supply, $2 CRX",
    1_000_000_000, 1_000_000_000, 2.00
))

# Scenario 5: High CRX price
results.append(test_scenario(
    "High CRX price: $50k market cap, 1M supply, $1000 CRX",
    50_000, 1_000_000, 1000.00
))

# Scenario 6: Very small token price
results.append(test_scenario(
    "Very small token: $50k market cap, 100B supply, $2 CRX",
    50_000, 100_000_000_000, 2.00
))

# Summary
print(f"\n{'='*70}")
print("SUMMARY")
print(f"{'='*70}")
print(f"Total scenarios tested: {len(results)}")
print(f"Passed: {sum(results)}")
print(f"Failed: {len(results) - sum(results)}")

if all(results):
    print("\n✅ ALL TESTS PASSED - Formula is CORRECT!")
else:
    print("\n🚨 SOME TESTS FAILED - Review calculations")

print(f"{'='*70}\n")
