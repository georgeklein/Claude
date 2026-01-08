/**
 * Scale AMM Economic Simulation
 *
 * Simulates the economics of:
 * 1. CRX/SOL pool launch and graduation
 * 2. Creator token economy (10,000 tokens/day)
 * 3. Protocol revenue projections
 * 4. Risk scenarios
 */

import BN from 'bn.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

interface PoolConfig {
  initialMarketCapUsd: number;
  graduationThresholdUsd: number;
  tokenSupply: number;
  feeBps: number;
  crxPriceUsd: number;
}

interface SimulationConfig {
  daysToSimulate: number;
  dailyTokenLaunches: number;
  graduationRate: number; // % of tokens that graduate
  crxPriceUsd: number;
  protocolFeeBps: number; // Additional protocol fee
  listingFeeUsd: number;
}

// ============================================================================
// BONDING CURVE MATH
// ============================================================================

class BondingCurve {
  virtualQuoteReserves: BN;
  virtualBaseReserves: BN;
  realQuoteReserves: BN;
  realBaseReserves: BN;
  graduationThresholdCrx: BN;
  feeBps: number;
  phase: 'PreBonding' | 'Graduated';

  constructor(config: PoolConfig) {
    const { initialMarketCapUsd, graduationThresholdUsd, tokenSupply, feeBps, crxPriceUsd } = config;

    // Convert USD to CRX (6 decimals)
    const targetMcCrx = (initialMarketCapUsd / crxPriceUsd) * 1_000_000;
    const graduationCrx = (graduationThresholdUsd / crxPriceUsd) * 1_000_000;

    // Calculate virtual reserves: sqrt(target_mc_crx * token_supply)
    const k = Math.sqrt(targetMcCrx * tokenSupply);

    this.virtualQuoteReserves = new BN(k);
    this.virtualBaseReserves = new BN(k);
    this.realQuoteReserves = new BN(0);
    this.realBaseReserves = new BN(tokenSupply);
    this.graduationThresholdCrx = new BN(graduationCrx);
    this.feeBps = feeBps;
    this.phase = 'PreBonding';
  }

  /**
   * Calculate output for a buy (quote → base)
   */
  calculateBuyOutput(quoteAmountIn: BN): { output: BN; fee: BN } {
    const feeBps = this.phase === 'PreBonding' ? this.feeBps : 0;
    const feeAmount = quoteAmountIn.muln(feeBps).divn(10000);
    const amountAfterFee = quoteAmountIn.sub(feeAmount);

    const [quoteReserve, baseReserve] = this.getPricingReserves();

    // Constant product: output = (input * Y) / (X + input)
    const numerator = amountAfterFee.mul(baseReserve);
    const denominator = quoteReserve.add(amountAfterFee);
    const output = numerator.div(denominator);

    return { output, fee: feeAmount };
  }

  /**
   * Calculate output for a sell (base → quote)
   */
  calculateSellOutput(baseAmountIn: BN): { output: BN; fee: BN } {
    const [quoteReserve, baseReserve] = this.getPricingReserves();

    // Constant product: output = (input * X) / (Y + input)
    const numerator = baseAmountIn.mul(quoteReserve);
    const denominator = baseReserve.add(baseAmountIn);
    const rawOutput = numerator.div(denominator);

    const feeBps = this.phase === 'PreBonding' ? this.feeBps : 0;
    const feeAmount = rawOutput.muln(feeBps).divn(10000);
    const output = rawOutput.sub(feeAmount);

    return { output, fee: feeAmount };
  }

  /**
   * Execute a buy transaction
   */
  buy(quoteAmountIn: BN): { tokensReceived: BN; fee: BN; graduated: boolean } {
    const { output, fee } = this.calculateBuyOutput(quoteAmountIn);

    // Update reserves
    if (this.phase === 'PreBonding') {
      this.realQuoteReserves = this.realQuoteReserves.add(quoteAmountIn).sub(fee);
      this.realBaseReserves = this.realBaseReserves.sub(output);
    } else {
      this.realQuoteReserves = this.realQuoteReserves.add(quoteAmountIn);
      this.realBaseReserves = this.realBaseReserves.sub(output);
    }

    // Check graduation
    const graduated = this.checkGraduation();

    return { tokensReceived: output, fee, graduated };
  }

  /**
   * Execute a sell transaction
   */
  sell(baseAmountIn: BN): { crxReceived: BN; fee: BN } {
    const { output, fee } = this.calculateSellOutput(baseAmountIn);

    // Update reserves
    if (this.phase === 'PreBonding') {
      this.realQuoteReserves = this.realQuoteReserves.sub(output).sub(fee);
      this.realBaseReserves = this.realBaseReserves.add(baseAmountIn);
    } else {
      this.realQuoteReserves = this.realQuoteReserves.sub(output);
      this.realBaseReserves = this.realBaseReserves.add(baseAmountIn);
    }

    return { crxReceived: output, fee };
  }

  /**
   * Get reserves used for pricing (phase-dependent)
   */
  getPricingReserves(): [BN, BN] {
    if (this.phase === 'PreBonding') {
      return [this.virtualQuoteReserves, this.virtualBaseReserves];
    } else {
      return [this.realQuoteReserves, this.realBaseReserves];
    }
  }

  /**
   * Get current spot price (quote per base)
   */
  getSpotPrice(): number {
    const [quoteReserve, baseReserve] = this.getPricingReserves();
    return quoteReserve.toNumber() / baseReserve.toNumber();
  }

  /**
   * Get market cap in CRX
   */
  getMarketCapCrx(): number {
    const price = this.getSpotPrice();
    const totalSupply = this.virtualBaseReserves.toNumber(); // Original supply
    return price * totalSupply;
  }

  /**
   * Check if pool should graduate
   */
  checkGraduation(): boolean {
    if (this.phase === 'PreBonding' && this.realQuoteReserves.gte(this.graduationThresholdCrx)) {
      this.phase = 'Graduated';
      console.log(`🎓 Pool graduated! Real CRX: ${this.realQuoteReserves.toNumber() / 1_000_000}`);
      return true;
    }
    return false;
  }

  /**
   * Get graduation progress (0-100%)
   */
  getGraduationProgress(): number {
    const progress = (this.realQuoteReserves.toNumber() / this.graduationThresholdCrx.toNumber()) * 100;
    return Math.min(progress, 100);
  }
}

// ============================================================================
// CREATOR TOKEN SIMULATOR
// ============================================================================

interface TokenSimulationResult {
  tokenId: number;
  initialMarketCap: number;
  finalMarketCap: number;
  totalVolume: number;
  creatorFees: number;
  protocolFees: number;
  graduated: boolean;
  daysToGraduate: number | null;
}

class CreatorTokenSimulator {
  private config: SimulationConfig;
  private results: TokenSimulationResult[] = [];

  constructor(config: SimulationConfig) {
    this.config = config;
  }

  /**
   * Simulate a single token launch
   */
  simulateToken(tokenId: number): TokenSimulationResult {
    const poolConfig: PoolConfig = {
      initialMarketCapUsd: 10_000,
      graduationThresholdUsd: 40_000,
      tokenSupply: 1_000_000_000_000, // 1M tokens with 6 decimals
      feeBps: 100, // 1%
      crxPriceUsd: this.config.crxPriceUsd,
    };

    const pool = new BondingCurve(poolConfig);
    let totalVolume = 0;
    let creatorFees = 0;
    let protocolFees = 0;
    let daysToGraduate: number | null = null;

    // Determine token success category
    const random = Math.random();
    let volumeTarget: number;

    if (random < 0.70) {
      // 70% fail (die before $20k)
      volumeTarget = 5_000;
    } else if (random < 0.90) {
      // 20% moderate ($20k-$40k)
      volumeTarget = 30_000;
    } else if (random < 0.995) {
      // 10% graduate (>$40k)
      volumeTarget = 112_000;
    } else {
      // 0.5% viral (>$500k)
      volumeTarget = 2_000_000;
    }

    // Simulate trading over days
    const daysToTrade = Math.ceil(Math.random() * 7) + 1; // 1-7 days
    const dailyVolume = volumeTarget / daysToTrade;

    for (let day = 0; day < daysToTrade; day++) {
      const numTrades = Math.floor(Math.random() * 20) + 10; // 10-30 trades per day
      const avgTradeSize = (dailyVolume / numTrades) * 1_000_000; // Convert to lamports

      for (let i = 0; i < numTrades; i++) {
        const tradeSize = new BN(avgTradeSize * (0.5 + Math.random())); // Random size ±50%

        // 60% buys, 40% sells
        if (Math.random() < 0.6) {
          const { tokensReceived, fee, graduated } = pool.buy(tradeSize);
          totalVolume += tradeSize.toNumber() / 1_000_000;
          creatorFees += fee.toNumber() / 1_000_000;
          protocolFees += (fee.toNumber() * this.config.protocolFeeBps) / 10000 / 1_000_000;

          if (graduated && daysToGraduate === null) {
            daysToGraduate = day + 1;
          }
        } else {
          // Sell (only if they have tokens from previous buys)
          try {
            const { crxReceived, fee } = pool.sell(tradeSize);
            totalVolume += crxReceived.toNumber() / 1_000_000;
            creatorFees += fee.toNumber() / 1_000_000;
            protocolFees += (fee.toNumber() * this.config.protocolFeeBps) / 10000 / 1_000_000;
          } catch {
            // Skip sell if not enough liquidity
          }
        }
      }
    }

    const finalMarketCap = pool.getMarketCapCrx() * this.config.crxPriceUsd / 1_000_000;

    return {
      tokenId,
      initialMarketCap: poolConfig.initialMarketCapUsd,
      finalMarketCap,
      totalVolume: totalVolume * this.config.crxPriceUsd, // Convert to USD
      creatorFees: creatorFees * this.config.crxPriceUsd,
      protocolFees: protocolFees * this.config.crxPriceUsd,
      graduated: pool.phase === 'Graduated',
      daysToGraduate,
    };
  }

  /**
   * Simulate all tokens for the configured period
   */
  simulate(): void {
    console.log('\n🚀 Starting Creator Token Economy Simulation...\n');
    console.log(`Parameters:`);
    console.log(`- Daily Tokens: ${this.config.dailyTokenLaunches.toLocaleString()}`);
    console.log(`- Simulation Days: ${this.config.daysToSimulate}`);
    console.log(`- CRX Price: $${this.config.crxPriceUsd}`);
    console.log(`- Protocol Fee: ${this.config.protocolFeeBps} bps`);
    console.log(`- Listing Fee: $${this.config.listingFeeUsd}\n`);

    const totalTokens = this.config.dailyTokenLaunches * this.config.daysToSimulate;

    // Simulate each token (sample for performance)
    const sampleSize = Math.min(totalTokens, 10000);
    for (let i = 0; i < sampleSize; i++) {
      const result = this.simulateToken(i);
      this.results.push(result);

      if (i % 1000 === 0) {
        console.log(`Simulated ${i.toLocaleString()} / ${sampleSize.toLocaleString()} tokens...`);
      }
    }

    // Scale up results if we sampled
    const scalingFactor = totalTokens / sampleSize;

    this.printResults(scalingFactor);
  }

  /**
   * Print simulation results
   */
  printResults(scalingFactor: number = 1): void {
    const graduated = this.results.filter(r => r.graduated);
    const failed = this.results.filter(r => !r.graduated && r.finalMarketCap < 20_000);
    const moderate = this.results.filter(r => !r.graduated && r.finalMarketCap >= 20_000);

    const totalVolume = this.results.reduce((sum, r) => sum + r.totalVolume, 0) * scalingFactor;
    const totalCreatorFees = this.results.reduce((sum, r) => sum + r.creatorFees, 0) * scalingFactor;
    const totalProtocolFees = this.results.reduce((sum, r) => sum + r.protocolFees, 0) * scalingFactor;
    const totalListingFees = this.results.length * this.config.listingFeeUsd * scalingFactor;

    const avgCreatorRevenue = this.results.reduce((sum, r) => sum + r.creatorFees, 0) / this.results.length;

    console.log('\n' + '='.repeat(80));
    console.log('📊 SIMULATION RESULTS');
    console.log('='.repeat(80) + '\n');

    console.log('Token Launch Statistics:');
    console.log(`- Total Tokens Launched: ${(this.results.length * scalingFactor).toLocaleString()}`);
    console.log(`- Graduated (>$40k): ${(graduated.length * scalingFactor).toLocaleString()} (${((graduated.length / this.results.length) * 100).toFixed(1)}%)`);
    console.log(`- Moderate ($20k-$40k): ${(moderate.length * scalingFactor).toLocaleString()} (${((moderate.length / this.results.length) * 100).toFixed(1)}%)`);
    console.log(`- Failed (<$20k): ${(failed.length * scalingFactor).toLocaleString()} (${((failed.length / this.results.length) * 100).toFixed(1)}%)`);

    console.log('\nFinancial Metrics:');
    console.log(`- Total Trading Volume: $${(totalVolume / 1_000_000).toFixed(2)}M`);
    console.log(`- Total Creator Fees: $${(totalCreatorFees / 1_000_000).toFixed(2)}M`);
    console.log(`- Total Protocol Fees: $${(totalProtocolFees / 1_000_000).toFixed(2)}M`);
    console.log(`- Total Listing Fees: $${(totalListingFees / 1_000_000).toFixed(2)}M`);
    console.log(`- TOTAL PROTOCOL REVENUE: $${((totalProtocolFees + totalListingFees) / 1_000_000).toFixed(2)}M`);

    console.log('\nPer-Token Averages:');
    console.log(`- Avg Creator Revenue: $${avgCreatorRevenue.toFixed(2)}`);
    console.log(`- Avg Trading Volume: $${(totalVolume / (this.results.length * scalingFactor)).toFixed(2)}`);

    if (graduated.length > 0) {
      const avgDaysToGraduate = graduated
        .filter(r => r.daysToGraduate !== null)
        .reduce((sum, r) => sum + (r.daysToGraduate || 0), 0) / graduated.length;

      console.log(`\nGraduation Metrics:`);
      console.log(`- Avg Days to Graduate: ${avgDaysToGraduate.toFixed(1)} days`);
      console.log(`- Avg Volume to Graduate: $${(graduated.reduce((s, r) => s + r.totalVolume, 0) / graduated.length).toFixed(2)}`);
      console.log(`- Avg Creator Earnings (Graduated): $${(graduated.reduce((s, r) => s + r.creatorFees, 0) / graduated.length).toFixed(2)}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('💰 ANNUALIZED PROJECTIONS');
    console.log('='.repeat(80) + '\n');

    const annualMultiplier = 365 / this.config.daysToSimulate;

    console.log(`Annual Protocol Revenue: $${((totalProtocolFees + totalListingFees) * annualMultiplier / 1_000_000).toFixed(2)}M`);
    console.log(`Annual Creator Earnings: $${(totalCreatorFees * annualMultiplier / 1_000_000).toFixed(2)}M`);
    console.log(`Annual Trading Volume: $${(totalVolume * annualMultiplier / 1_000_000_000).toFixed(2)}B`);
    console.log(`Annual Tokens Launched: ${((this.results.length * scalingFactor) * annualMultiplier).toLocaleString()}`);

    console.log('\n' + '='.repeat(80) + '\n');
  }
}

// ============================================================================
// CRX/SOL POOL SIMULATOR
// ============================================================================

class CrxSolPoolSimulator {
  private pool: BondingCurve;
  private days: number;

  constructor(days: number) {
    this.days = days;
    this.pool = new BondingCurve({
      initialMarketCapUsd: 10_000,
      graduationThresholdUsd: 50_000,
      tokenSupply: 1_000_000_000_000, // 1M CRX
      feeBps: 150, // 1.5%
      crxPriceUsd: 2.00,
    });
  }

  simulate(): void {
    console.log('\n🔷 CRX/SOL Pool Simulation\n');
    console.log('Initial State:');
    console.log(`- Market Cap: $${(this.pool.getMarketCapCrx() * 2.00 / 1_000_000).toFixed(2)}`);
    console.log(`- Price: ${this.pool.getSpotPrice().toFixed(6)} CRX/token`);
    console.log(`- Phase: ${this.pool.phase}`);
    console.log(`- Graduation Progress: ${this.pool.getGraduationProgress().toFixed(1)}%\n`);

    let totalFees = 0;
    let totalVolume = 0;

    // Simulate daily trading
    for (let day = 0; day < this.days; day++) {
      const dailyVolume = 500_000 * 1_000_000; // $500k in CRX lamports
      const numTrades = 50;

      for (let i = 0; i < numTrades; i++) {
        const tradeSize = new BN((dailyVolume / numTrades) * (0.5 + Math.random()));

        if (Math.random() < 0.65) { // 65% buys (net positive)
          const { fee, graduated } = this.pool.buy(tradeSize);
          totalFees += fee.toNumber();
          totalVolume += tradeSize.toNumber();

          if (graduated) {
            console.log(`\n🎓 CRX/SOL Pool GRADUATED on Day ${day + 1}!`);
            break;
          }
        } else {
          const { fee } = this.pool.sell(tradeSize.divn(2)); // Smaller sells
          totalFees += fee.toNumber();
          totalVolume += tradeSize.toNumber() / 2;
        }
      }

      if (day % 5 === 0 || this.pool.phase === 'Graduated') {
        console.log(`Day ${day + 1}:`);
        console.log(`  MC: $${(this.pool.getMarketCapCrx() * 2.00 / 1_000_000).toFixed(2)}, ` +
                    `Price: ${this.pool.getSpotPrice().toFixed(6)}, ` +
                    `Progress: ${this.pool.getGraduationProgress().toFixed(1)}%`);
      }

      if (this.pool.phase === 'Graduated') {
        break;
      }
    }

    console.log('\n📈 Final Stats:');
    console.log(`- Final Market Cap: $${(this.pool.getMarketCapCrx() * 2.00 / 1_000_000).toFixed(2)}`);
    console.log(`- Final Price: ${this.pool.getSpotPrice().toFixed(6)} CRX/token`);
    console.log(`- Phase: ${this.pool.phase}`);
    console.log(`- Total Volume: $${(totalVolume / 1_000_000 * 2.00).toFixed(2)}`);
    console.log(`- Total Fees Collected: $${(totalFees / 1_000_000 * 2.00).toFixed(2)}`);
    console.log('');
  }
}

// ============================================================================
// MAIN SIMULATION
// ============================================================================

function main() {
  console.log('\n' + '='.repeat(80));
  console.log('Scale AMM Economic Simulation - Agent 9 Analysis');
  console.log('='.repeat(80));

  // Simulate CRX/SOL pool
  const crxPoolSim = new CrxSolPoolSimulator(30);
  crxPoolSim.simulate();

  // Simulate creator token economy - CONSERVATIVE
  console.log('\n\n' + '='.repeat(80));
  console.log('SCENARIO 1: CONSERVATIVE (5% graduation rate)');
  console.log('='.repeat(80));

  const conservativeSim = new CreatorTokenSimulator({
    daysToSimulate: 30,
    dailyTokenLaunches: 5000, // Start with 5k/day
    graduationRate: 0.05,
    crxPriceUsd: 2.00,
    protocolFeeBps: 25, // 0.25%
    listingFeeUsd: 25,
  });
  conservativeSim.simulate();

  // Simulate creator token economy - MODERATE
  console.log('\n\n' + '='.repeat(80));
  console.log('SCENARIO 2: MODERATE (10% graduation rate)');
  console.log('='.repeat(80));

  const moderateSim = new CreatorTokenSimulator({
    daysToSimulate: 30,
    dailyTokenLaunches: 10000,
    graduationRate: 0.10,
    crxPriceUsd: 2.00,
    protocolFeeBps: 25,
    listingFeeUsd: 25,
  });
  moderateSim.simulate();

  // Simulate creator token economy - AGGRESSIVE
  console.log('\n\n' + '='.repeat(80));
  console.log('SCENARIO 3: AGGRESSIVE (20% graduation rate)');
  console.log('='.repeat(80));

  const aggressiveSim = new CreatorTokenSimulator({
    daysToSimulate: 30,
    dailyTokenLaunches: 10000,
    graduationRate: 0.20,
    crxPriceUsd: 5.00, // Higher CRX price in bull market
    protocolFeeBps: 25,
    listingFeeUsd: 50, // Higher listing fee
  });
  aggressiveSim.simulate();

  console.log('\n✅ Simulation Complete!\n');
  console.log('📄 See ECONOMIC_ANALYSIS.md for detailed breakdown\n');
}

// Run simulation
main();
