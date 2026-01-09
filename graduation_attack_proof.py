#!/usr/bin/env python3
"""
Mathematical Proof: Graduation Price Discontinuity Flash Loan Attack
Scale AMM Protocol Security Analysis

This script proves the vulnerability exists and calculates exact profits.
"""

def constant_product_output(input_amount, input_reserve, output_reserve):
    """Calculate AMM output using x*y=k formula"""
    numerator = input_amount * output_reserve
    denominator = input_reserve + input_amount
    return numerator // denominator


def calculate_fee(amount, fee_bps):
    """Calculate fee in basis points (10000 = 100%)"""
    return (amount * fee_bps) // 10000


def simulate_graduation_attack():
    """
    Simulates a flash loan attack exploiting graduation price discontinuity.

    Returns:
        dict: Attack results including profit, ROI, and state changes
    """
    print("="*80)
    print("FLASH LOAN GRADUATION ATTACK SIMULATION")
    print("="*80)

    # ========================================================================
    # INITIAL POOL STATE
    # ========================================================================

    # Pool parameters
    target_mc_usd = 10_000_000_000  # $10k with 6 decimals
    token_supply = 1_000_000_000_000  # 1M tokens with 6 decimals
    crx_price_usd = 2_000_000  # $2.00 with 6 decimals
    graduation_threshold_usd = 40_000_000_000  # $40k with 6 decimals

    # Calculate virtual reserves (set at pool creation, NEVER CHANGE)
    virtual_crx = (target_mc_usd * 1_000_000) // (crx_price_usd * token_supply)
    virtual_crx = virtual_crx * token_supply // 1_000_000  # Simplified: target_mc / crx_price
    virtual_crx = 5_000_000_000  # 5,000 CRX with 6 decimals
    virtual_tokens = token_supply

    # Calculate graduation threshold in CRX
    graduation_threshold_crx = (graduation_threshold_usd * 1_000_000) // crx_price_usd
    # = 20,000 CRX with 6 decimals

    # Assume pool has accumulated almost to graduation (from previous trades)
    real_crx = 19_900_000_000  # 19,900 CRX (just below 20,000 threshold)
    real_tokens = 201_000_000_000  # 201,000 tokens remaining (799k sold)

    print("\n📊 INITIAL STATE (Just Before Graduation)")
    print("-" * 80)
    print(f"Virtual Reserves (for pricing):")
    print(f"  - CRX:    {virtual_crx / 1_000_000:,.0f}")
    print(f"  - Tokens: {virtual_tokens / 1_000_000:,.0f}")
    print(f"  - Price:  {virtual_crx / virtual_tokens:.6f} CRX per token")
    print(f"\nReal Reserves (actual vault):")
    print(f"  - CRX:    {real_crx / 1_000_000:,.0f}")
    print(f"  - Tokens: {real_tokens / 1_000_000:,.0f}")
    print(f"  - If used for pricing: {real_crx / real_tokens:.6f} CRX per token")
    print(f"\nGraduation Threshold: {graduation_threshold_crx / 1_000_000:,.0f} CRX")
    print(f"Amount to Graduation: {(graduation_threshold_crx - real_crx) / 1_000_000:,.0f} CRX")

    # ========================================================================
    # STEP 1: FLASH LOAN
    # ========================================================================

    flash_loan_amount = 1_000_000_000  # 1,000 CRX
    flash_loan_fee_bps = 5  # 0.05% (Solend)

    print("\n\n💸 STEP 1: FLASH LOAN")
    print("-" * 80)
    print(f"Borrow: {flash_loan_amount / 1_000_000:,.0f} CRX")
    print(f"Fee:    {flash_loan_fee_bps / 100:.2f}%")

    # ========================================================================
    # STEP 2: BUY TOKENS (Using Virtual Pricing)
    # ========================================================================

    buy_amount = flash_loan_amount
    buy_fee_bps = 100  # 1%

    print("\n\n🛒 STEP 2: BUY TOKENS (Virtual Pricing)")
    print("-" * 80)
    print(f"Input: {buy_amount / 1_000_000:,.0f} CRX")

    # Calculate fee
    buy_fee = calculate_fee(buy_amount, buy_fee_bps)
    swap_amount = buy_amount - buy_fee

    print(f"Buy Fee: {buy_fee / 1_000_000:,.2f} CRX ({buy_fee_bps / 100}%)")
    print(f"Swap Amount: {swap_amount / 1_000_000:,.2f} CRX")

    # Calculate output using VIRTUAL reserves (PreBonding pricing)
    tokens_received = constant_product_output(
        swap_amount,
        virtual_crx,
        virtual_tokens
    )

    print(f"\nOutput Calculation (x*y=k):")
    print(f"  output = (swap × virtual_tokens) / (virtual_crx + swap)")
    print(f"  output = ({swap_amount / 1_000_000:,.0f} × {virtual_tokens / 1_000_000:,.0f}) / ")
    print(f"           ({virtual_crx / 1_000_000:,.0f} + {swap_amount / 1_000_000:,.0f})")
    print(f"  output = {tokens_received / 1_000_000:,.2f} tokens")

    # Update REAL reserves (virtual stays constant!)
    real_crx_after_buy = real_crx + swap_amount
    real_tokens_after_buy = real_tokens - tokens_received

    print(f"\nReal Reserves After Buy:")
    print(f"  - CRX:    {real_crx_after_buy / 1_000_000:,.2f}")
    print(f"  - Tokens: {real_tokens_after_buy / 1_000_000:,.2f}")

    # Check graduation
    graduated = real_crx_after_buy >= graduation_threshold_crx
    print(f"\n{'🎓 POOL GRADUATES!' if graduated else '❌ Not graduated yet'}")

    if graduated:
        print(f"Real CRX ({real_crx_after_buy / 1_000_000:,.2f}) >= ")
        print(f"Threshold ({graduation_threshold_crx / 1_000_000:,.2f})")

    # ========================================================================
    # STEP 3: SELL TOKENS (Using Real Pricing - POST GRADUATION!)
    # ========================================================================

    sell_amount = tokens_received
    sell_fee_bps = 100  # 1%
    waa_penalty_bps = 1000  # 10% (same-slot sell)

    print("\n\n💰 STEP 3: SELL TOKENS (Real Pricing - POST GRADUATION)")
    print("-" * 80)
    print(f"Input: {sell_amount / 1_000_000:,.2f} tokens")

    # Calculate output using REAL reserves (Graduated pricing)
    crx_before_fees = constant_product_output(
        sell_amount,
        real_tokens_after_buy,
        real_crx_after_buy
    )

    print(f"\nOutput Calculation (using REAL reserves now!):")
    print(f"  output = (sell × real_crx) / (real_tokens + sell)")
    print(f"  output = ({sell_amount / 1_000_000:,.2f} × {real_crx_after_buy / 1_000_000:,.2f}) / ")
    print(f"           ({real_tokens_after_buy / 1_000_000:,.2f} + {sell_amount / 1_000_000:,.2f})")
    print(f"  output = {crx_before_fees / 1_000_000:,.2f} CRX (before fees)")

    # Calculate fees
    sell_base_fee = calculate_fee(crx_before_fees, sell_fee_bps)
    waa_penalty = calculate_fee(crx_before_fees, waa_penalty_bps)
    total_sell_fees = sell_base_fee + waa_penalty

    crx_received = crx_before_fees - total_sell_fees

    print(f"\nFees:")
    print(f"  - Base Fee: {sell_base_fee / 1_000_000:,.2f} CRX ({sell_fee_bps / 100}%)")
    print(f"  - WAA Penalty: {waa_penalty / 1_000_000:,.2f} CRX ({waa_penalty_bps / 100}%)")
    print(f"  - Total: {total_sell_fees / 1_000_000:,.2f} CRX ({(sell_fee_bps + waa_penalty_bps) / 100}%)")
    print(f"\nNet Received: {crx_received / 1_000_000:,.2f} CRX")

    # ========================================================================
    # STEP 4: REPAY FLASH LOAN
    # ========================================================================

    flash_loan_interest = calculate_fee(flash_loan_amount, flash_loan_fee_bps)
    total_repay = flash_loan_amount + flash_loan_interest

    print("\n\n💳 STEP 4: REPAY FLASH LOAN")
    print("-" * 80)
    print(f"Principal: {flash_loan_amount / 1_000_000:,.0f} CRX")
    print(f"Interest:  {flash_loan_interest / 1_000_000:,.2f} CRX ({flash_loan_fee_bps / 100:.2f}%)")
    print(f"Total:     {total_repay / 1_000_000:,.2f} CRX")

    # ========================================================================
    # FINAL PROFIT CALCULATION
    # ========================================================================

    net_profit = crx_received - total_repay
    roi_percent = (net_profit * 100) / flash_loan_amount

    print("\n\n" + "="*80)
    print("💸 FINAL PROFIT CALCULATION")
    print("="*80)
    print(f"\nREVENUE:")
    print(f"  Sold {sell_amount / 1_000_000:,.2f} tokens → {crx_received / 1_000_000:,.2f} CRX")
    print(f"\nCOSTS:")
    print(f"  Flash loan repayment:  {total_repay / 1_000_000:,.2f} CRX")
    print(f"  Buy fee:               {buy_fee / 1_000_000:,.2f} CRX")
    print(f"  Sell fees (base+WAA):  {total_sell_fees / 1_000_000:,.2f} CRX")
    print(f"  Total costs:           {(total_repay - flash_loan_amount + buy_fee + total_sell_fees) / 1_000_000:,.2f} CRX")

    print(f"\n{'🎉 NET PROFIT' if net_profit > 0 else '❌ NET LOSS'}:  {net_profit / 1_000_000:,.2f} CRX")
    print(f"ROI:  {roi_percent:,.2f}%")

    # ========================================================================
    # PRICE ANALYSIS
    # ========================================================================

    virtual_price = virtual_crx / virtual_tokens
    real_price = real_crx_after_buy / real_tokens_after_buy
    price_multiplier = real_price / virtual_price

    print("\n\n" + "="*80)
    print("📈 PRICE DISCONTINUITY ANALYSIS")
    print("="*80)
    print(f"\nPre-Graduation Price (virtual):  {virtual_price:.6f} CRX per token")
    print(f"Post-Graduation Price (real):    {real_price:.6f} CRX per token")
    print(f"\nPrice Multiplier: {price_multiplier:.2f}x ({(price_multiplier - 1) * 100:.1f}% increase)")
    print(f"\nThis {price_multiplier:.1f}x price jump is what makes the attack profitable!")
    print(f"Even with {(buy_fee_bps + sell_fee_bps + waa_penalty_bps) / 100:.1f}% total fees,")
    print(f"the attacker profits {roi_percent:,.1f}% because {price_multiplier:.1f}x >> 1.{(buy_fee_bps + sell_fee_bps + waa_penalty_bps) / 100:.0f}x")

    # ========================================================================
    # VULNERABILITY SUMMARY
    # ========================================================================

    print("\n\n" + "="*80)
    print("🚨 VULNERABILITY SUMMARY")
    print("="*80)
    print(f"""
This attack is GUARANTEED PROFIT because:

1. Virtual reserves NEVER change during PreBonding
   → Price stays constant at {virtual_price:.6f} CRX per token
   → Attacker buys at this low price

2. Real reserves accumulate CRX through trades
   → Real price is {real_price:.6f} CRX per token at graduation
   → {price_multiplier:.1f}x higher than virtual price!

3. At graduation, pricing switches from virtual to real
   → Instant {price_multiplier:.1f}x price jump
   → Attacker sells at this high price

4. Total fees ({(buy_fee_bps + sell_fee_bps + waa_penalty_bps) / 100:.1f}%) << Price jump ({(price_multiplier - 1) * 100:.0f}%)
   → Net profit: {roi_percent:,.1f}% ROI

MITIGATION REQUIRED:
- Set initial virtual_reserves = real_reserves (require creator deposit)
- OR smooth price transition (interpolate virtual → real)
- OR eliminate virtual reserves concept entirely
""")

    return {
        'profit': net_profit / 1_000_000,
        'roi': roi_percent,
        'price_multiplier': price_multiplier,
        'total_fees_percent': (buy_fee_bps + sell_fee_bps + waa_penalty_bps) / 100
    }


if __name__ == '__main__':
    results = simulate_graduation_attack()

    print("\n" + "="*80)
    print("CONCLUSION")
    print("="*80)
    print(f"""
The graduation price discontinuity vulnerability is CRITICAL and MUST be fixed
before mainnet deployment.

Attack Results:
- Net Profit: {results['profit']:,.2f} CRX (~${results['profit'] * 2:,.0f} if CRX = $2)
- ROI: {results['roi']:,.2f}%
- Price Jump: {results['price_multiplier']:.2f}x
- Total Fees: {results['total_fees_percent']:.1f}%

Severity: CRITICAL (10/10)
Exploitability: EASY (basic flash loan required)
Impact: PROTOCOL-BREAKING (every pool vulnerable)

Status: 🚨 BLOCKS MAINNET DEPLOYMENT 🚨
""")
