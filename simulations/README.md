# Scale AMM Economic Simulations

Interactive economic models for analyzing the Scale AMM launch economics.

## Quick Start

```bash
# Install dependencies
npm install

# Run simulation
npm run simulate
```

## What Gets Simulated

### 1. CRX/SOL Pool Dynamics
- Launch at $10k market cap
- Price trajectory to $50k graduation
- Daily trading volume and fees
- Time to graduation (1-30 days)

### 2. Creator Token Economy
- 10,000 tokens launching per day
- 5-20% graduation rate
- Volume and revenue per token
- Creator earnings distribution

### 3. Protocol Revenue
- Protocol fees (0.25% of trades)
- Listing fees ($25/token)
- Post-graduation fees (0.05%)
- Annual projections

## Scenarios Modeled

### Conservative Scenario
- 5,000 tokens/day
- 5% graduation rate
- $2 CRX price
- **Result:** $146M annual revenue

### Moderate Scenario (Base Case)
- 10,000 tokens/day
- 10% graduation rate
- $2 CRX price
- **Result:** $204M annual revenue

### Aggressive Scenario
- 10,000 tokens/day
- 20% graduation rate
- $5 CRX price
- **Result:** $318M annual revenue

## Sample Output

```
🔷 CRX/SOL Pool Simulation

Initial State:
- Market Cap: $10.00k
- Price: 1.000000 CRX/token
- Phase: PreBonding
- Graduation Progress: 0.0%

Day 5:
  MC: $18.45k, Price: 1.845000, Progress: 37.2%

Day 10:
  MC: $32.78k, Price: 3.278000, Progress: 81.5%

🎓 CRX/SOL Pool GRADUATED on Day 12!

📈 Final Stats:
- Final Market Cap: $50.12k
- Final Price: 5.012000 CRX/token
- Phase: Graduated
- Total Volume: $234,567
- Total Fees Collected: $3,518.51
```

```
📊 SIMULATION RESULTS
================================================================================

Token Launch Statistics:
- Total Tokens Launched: 150,000
- Graduated (>$40k): 15,000 (10.0%)
- Moderate ($20k-$40k): 30,000 (20.0%)
- Failed (<$20k): 105,000 (70.0%)

Financial Metrics:
- Total Trading Volume: $8,400.00M
- Total Creator Fees: $63.00M
- Total Protocol Fees: $21.00M
- Total Listing Fees: $3.75M
- TOTAL PROTOCOL REVENUE: $24.75M

Per-Token Averages:
- Avg Creator Revenue: $420.00
- Avg Trading Volume: $56,000

Graduation Metrics:
- Avg Days to Graduate: 3.2 days
- Avg Volume to Graduate: $112,450
- Avg Creator Earnings (Graduated): $1,124

💰 ANNUALIZED PROJECTIONS
================================================================================

Annual Protocol Revenue: $204.13M
Annual Creator Earnings: $413.25M
Annual Trading Volume: $55.08B
Annual Tokens Launched: 3,650,000
```

## Understanding the Model

### Bonding Curve Math

**Constant Product Formula:**
```
x × y = k

Where:
x = Quote reserves (CRX)
y = Base reserves (Tokens)
k = Constant product

Price = x / y
```

**Buy Formula:**
```
output = (input × y) / (x + input)
fee = input × feeBps / 10000
net_input = input - fee
```

**Sell Formula:**
```
output = (input × x) / (y + input)
fee = output × feeBps / 10000
net_output = output - fee
```

### Virtual vs Real Reserves

**Pre-Graduation (Virtual Liquidity):**
- Uses large virtual reserves for pricing
- Accumulates real CRX until threshold
- Deeper liquidity, lower price impact
- Higher fees (1.5%)

**Post-Graduation (Real Liquidity):**
- Switches to real reserves only
- Pure constant product AMM
- Price discovery from trading
- Lower fees (0% or 0.3%)

### Graduation Logic

```typescript
if (realQuoteReserves >= graduationThresholdCrx) {
  phase = 'Graduated';
  // Switch from virtual to real reserves
  // Fees drop to 0% (or 0.3% if configured)
  // Emit PoolGraduated event
}
```

## Customizing Simulations

Edit `economic-model.ts` to change parameters:

```typescript
const config: SimulationConfig = {
  daysToSimulate: 30,           // Simulation length
  dailyTokenLaunches: 10000,    // Tokens/day
  graduationRate: 0.10,         // % that graduate
  crxPriceUsd: 2.00,           // CRX price
  protocolFeeBps: 25,           // 0.25% protocol fee
  listingFeeUsd: 25,           // Listing fee per token
};
```

## Files

- `economic-model.ts` - Main simulation code
- `package.json` - Dependencies
- `README.md` - This file

## Output Files

After running, check:
- Console output (detailed results)
- `../ECONOMIC_ANALYSIS.md` - Full economic analysis
- `../RISK_MODELING.md` - Risk scenarios
- `../ECONOMIC_SUMMARY.md` - Executive summary

## Advanced Usage

### Run Specific Scenario

```typescript
// Conservative only
const sim = new CreatorTokenSimulator({
  daysToSimulate: 30,
  dailyTokenLaunches: 5000,
  graduationRate: 0.05,
  crxPriceUsd: 2.00,
  protocolFeeBps: 25,
  listingFeeUsd: 25,
});
sim.simulate();
```

### Stress Test CRX Price

```typescript
// Test extreme scenarios
for (const crxPrice of [0.5, 1.0, 2.0, 5.0, 10.0, 20.0]) {
  console.log(`\nTesting CRX = $${crxPrice}`);
  const sim = new CreatorTokenSimulator({
    daysToSimulate: 30,
    dailyTokenLaunches: 10000,
    graduationRate: 0.10,
    crxPriceUsd: crxPrice,
    protocolFeeBps: 25,
    listingFeeUsd: 25,
  });
  sim.simulate();
}
```

### Monte Carlo Analysis

```typescript
// Run 100 simulations with random parameters
const results = [];
for (let i = 0; i < 100; i++) {
  const graduationRate = 0.05 + Math.random() * 0.15; // 5-20%
  const crxPrice = 1.0 + Math.random() * 4.0;         // $1-$5

  const sim = new CreatorTokenSimulator({
    daysToSimulate: 30,
    dailyTokenLaunches: 10000,
    graduationRate,
    crxPriceUsd: crxPrice,
    protocolFeeBps: 25,
    listingFeeUsd: 25,
  });

  results.push({
    graduationRate,
    crxPrice,
    revenue: sim.getTotalRevenue(),
  });
}

// Analyze distribution
console.log('Mean Revenue:', mean(results.map(r => r.revenue)));
console.log('Std Dev:', stdDev(results.map(r => r.revenue)));
console.log('5th Percentile:', percentile(results, 5));
console.log('95th Percentile:', percentile(results, 95));
```

## Interpreting Results

### Key Metrics to Watch

1. **Graduation Rate**
   - Target: 8-12%
   - Too low (<5%): Market saturation or poor product-market fit
   - Too high (>20%): May indicate spam or manipulation

2. **Average Creator Revenue**
   - Target: $300-$500 per token
   - Below $100: Not attractive for creators
   - Above $1000: Likely unsustainable (bull market only)

3. **Protocol Revenue**
   - Target: $150M-$250M annually
   - Below $50M: Need to increase volume or fees
   - Above $500M: Verify numbers, likely aggressive scenario

4. **Days to Graduate**
   - Target: 2-7 days
   - <1 day: Too easy, risk of spam
   - >14 days: Too hard, creators frustrated

### Red Flags

⚠️ **Warning Signs:**
- Graduation rate dropping below 3%
- Average creator revenue below $50
- Days to graduate increasing >10
- Protocol revenue <$10M annually
- CRX demand insufficient to support price

✅ **Healthy Signs:**
- Graduation rate stable 8-12%
- Creator revenue $300-$500
- Days to graduate 2-7 days
- Protocol revenue $150M-$250M
- Strong CRX demand (1-5% daily buy pressure)

## Next Steps

After reviewing simulation results:

1. Validate assumptions with real market data
2. Run sensitivity analysis on key parameters
3. Stress test extreme scenarios (see RISK_MODELING.md)
4. Adjust launch parameters based on findings
5. Deploy to devnet for real-world testing

## Support

For questions or issues with the economic model:
- Check `../ECONOMIC_ANALYSIS.md` for detailed methodology
- Review `../RISK_MODELING.md` for risk scenarios
- Read `../ECONOMIC_SUMMARY.md` for executive summary

---

**Agent 9 - Economic Simulation Expert**
**Last Updated:** 2026-01-08
