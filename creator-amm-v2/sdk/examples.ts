/**
 * Scale AMM SDK Examples
 *
 * Complete examples showing every SDK feature in <10 lines of code.
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { ScaleAMM } from './ScaleAMM';
import { ScaleUtils, SCALE_CONSTANTS } from './ScaleUtils';
import { ScaleError, isScaleError } from './errors';

// ============================================================================
// EXAMPLE 1: Initialize Protocol (Admin Only, One-Time)
// ============================================================================

export async function example1_initialize() {
  console.log('=== Example 1: Initialize Protocol ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate(); // Load your admin keypair
  const scale = new ScaleAMM(connection, wallet);

  // Initialize with sensible defaults
  const tx = await scale.initialize({
    crxMint: new PublicKey('CRX_MINT_ADDRESS'),
    crxPriceOracle: new PublicKey('PYTH_ORACLE_ADDRESS'),
    feeRecipient: wallet.publicKey,
  });

  console.log('✅ Scale AMM initialized!');
  console.log('Transaction:', tx);
}

// ============================================================================
// EXAMPLE 2: Create Pool (Creators)
// ============================================================================

export async function example2_createPool() {
  console.log('=== Example 2: Create Pool ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate(); // Load your creator keypair
  const scale = new ScaleAMM(connection, wallet);

  // Your token mint (must have revoked mint authority)
  const myTokenMint = new PublicKey('YOUR_TOKEN_MINT');

  // Create pool - dead simple!
  const pool = await scale.createPool({
    baseMint: myTokenMint,
    supply: 1_000_000,                    // 1M tokens
    initialMarketCapUsd: 10_000,          // Launch at $10k
    graduationThresholdUsd: 40_000,       // Graduate at $40k
  });

  console.log('🚀 Pool created!');
  console.log('Address:', pool.address.toBase58());
  console.log('Initial price:', pool.initialPrice, 'CRX per token');
  console.log('Target MC:', pool.targetMarketCapUsd, 'USD');
  console.log('Trade now:', pool.url);
}

// ============================================================================
// EXAMPLE 3: Create Pool with Custom Settings
// ============================================================================

export async function example3_createPoolAdvanced() {
  console.log('=== Example 3: Create Pool (Advanced) ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();
  const scale = new ScaleAMM(connection, wallet);

  const pool = await scale.createPool({
    baseMint: new PublicKey('YOUR_TOKEN_MINT'),
    supply: 1_000_000,
    initialMarketCapUsd: 10_000,
    graduationThresholdUsd: 40_000,

    // Advanced options
    feeBps: 25,                           // 0.25% fee (earn forever!)
    curveType: 'Exponential',             // Steeper price discovery
  });

  console.log('🚀 Pool created with custom settings!');
  console.log('Fee:', pool.feeBps / 100, '%');
  console.log('Curve:', pool.curveType);
  console.log('Phase:', pool.phase);
}

// ============================================================================
// EXAMPLE 4: Buy Tokens
// ============================================================================

export async function example4_buy() {
  console.log('=== Example 4: Buy Tokens ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();
  const scale = new ScaleAMM(connection, wallet);

  const poolAddress = new PublicKey('POOL_ADDRESS');

  // Buy tokens - dead simple!
  const result = await scale.buy(poolAddress, {
    crxAmount: 100,        // Spend 100 CRX
    slippage: 1.0,         // 1% slippage tolerance
  });

  console.log('✅ Buy executed!');
  console.log('Spent:', result.crxSpent, 'CRX');
  console.log('Received:', result.tokensReceived, 'tokens');
  console.log('Fee:', result.fee, 'CRX');
  console.log('New price:', result.newPrice, 'CRX per token');
  console.log('Price impact:', result.priceImpact.toFixed(2), '%');

  if (result.graduated) {
    console.log('🎉 Pool graduated to permanent AMM!');
  }
}

// ============================================================================
// EXAMPLE 5: Sell Tokens
// ============================================================================

export async function example5_sell() {
  console.log('=== Example 5: Sell Tokens ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();
  const scale = new ScaleAMM(connection, wallet);

  const poolAddress = new PublicKey('POOL_ADDRESS');

  // Sell tokens - dead simple!
  const result = await scale.sell(poolAddress, {
    tokenAmount: 50,       // Sell 50 tokens
    slippage: 1.0,         // 1% slippage
  });

  console.log('✅ Sell executed!');
  console.log('Sold:', result.tokensSold, 'tokens');
  console.log('Received:', result.crxReceived, 'CRX');
  console.log('Fee:', result.fee, 'CRX');
  console.log('New price:', result.newPrice, 'CRX per token');
}

// ============================================================================
// EXAMPLE 6: Query Pool Info
// ============================================================================

export async function example6_queryPool() {
  console.log('=== Example 6: Query Pool Info ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();
  const scale = new ScaleAMM(connection, wallet);

  const tokenMint = new PublicKey('TOKEN_MINT');

  // Get complete pool state (no transaction)
  const pool = await scale.getPool(tokenMint);

  console.log('Pool Info:');
  console.log('  Address:', pool.address.toBase58());
  console.log('  Phase:', pool.phase);
  console.log('  Price:', ScaleUtils.formatPrice(pool.price), 'CRX per token');
  console.log('  Market Cap:', ScaleUtils.formatMarketCap(pool.marketCapUsd));
  console.log('  Liquidity:', pool.liquidityCrx, 'CRX');
  console.log('  Volume:', pool.volumeCrx, 'CRX');
  console.log('  Fee:', pool.feeBps / 100, '%');
  console.log('  Graduation:', pool.graduationProgress.toFixed(1), '% complete');
  console.log('  Created:', pool.createdAt.toLocaleString());
  console.log('  Trade URL:', pool.url);
}

// ============================================================================
// EXAMPLE 7: Estimate Trade Before Execution
// ============================================================================

export async function example7_estimate() {
  console.log('=== Example 7: Estimate Trade ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();
  const scale = new ScaleAMM(connection, wallet);

  const poolAddress = new PublicKey('POOL_ADDRESS');

  // Estimate buy (no transaction, instant)
  const buyEstimate = await scale.estimateBuy(poolAddress, 100);

  console.log('Buy 100 CRX estimate:');
  console.log('  Will receive:', buyEstimate.output, 'tokens');
  console.log('  Fee:', buyEstimate.fee, 'CRX');
  console.log('  Price impact:', buyEstimate.priceImpact.toFixed(2), '%');
  console.log('  New price:', buyEstimate.newPrice, 'CRX per token');

  // Estimate sell
  const sellEstimate = await scale.estimateSell(poolAddress, 50);

  console.log('\nSell 50 tokens estimate:');
  console.log('  Will receive:', sellEstimate.output, 'CRX');
  console.log('  Fee:', sellEstimate.fee, 'CRX');
  console.log('  Price impact:', sellEstimate.priceImpact.toFixed(2), '%');
}

// ============================================================================
// EXAMPLE 8: Listen to Events
// ============================================================================

export async function example8_events() {
  console.log('=== Example 8: Listen to Events ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();
  const scale = new ScaleAMM(connection, wallet);

  const poolAddress = new PublicKey('POOL_ADDRESS');

  // Listen to all trades
  const tradeListener = scale.onTrade(poolAddress, (trade) => {
    console.log(`${trade.isBuy ? '📈 BUY' : '📉 SELL'}:`, trade.amount, 'tokens');
    console.log('  Price:', trade.price, 'CRX per token');
    console.log('  MC:', ScaleUtils.formatMarketCap(trade.marketCapUsd));
    console.log('  Trader:', trade.trader.toBase58().slice(0, 8), '...');
  });

  // Listen for graduation
  const gradListener = scale.onGraduation(poolAddress, (event) => {
    console.log('🎉 POOL GRADUATED!');
    console.log('  Final MC:', ScaleUtils.formatMarketCap(event.marketCapUsd));
    console.log('  Total volume:', event.totalVolume, 'CRX');
    console.log('  Time to graduate:', event.slotsToGraduate, 'slots');
  });

  // Run for 60 seconds
  await ScaleUtils.sleep(60_000);

  // Cleanup
  await scale.removeListener(tradeListener);
  await scale.removeListener(gradListener);
}

// ============================================================================
// EXAMPLE 9: Error Handling
// ============================================================================

export async function example9_errorHandling() {
  console.log('=== Example 9: Error Handling ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();
  const scale = new ScaleAMM(connection, wallet);

  const poolAddress = new PublicKey('POOL_ADDRESS');

  try {
    await scale.buy(poolAddress, {
      crxAmount: 100,
      slippage: 0.1, // Very tight slippage - likely to fail
    });
  } catch (error) {
    if (error instanceof ScaleError) {
      console.error('❌ Trade failed:', error.code);
      console.error('   Message:', error.message);

      // Handle specific errors
      switch (error.code) {
        case 'SLIPPAGE_EXCEEDED':
          console.log('💡 Try increasing slippage to 1% and retry');
          // Retry with higher slippage
          break;

        case 'INSUFFICIENT_BALANCE':
          console.log('💡 Add more CRX to your wallet');
          break;

        case 'ANTI_SNIPER_ACTIVE':
          console.log('💡 Wait a few seconds or reduce trade size');
          break;

        default:
          console.log('💡 See error details:', error.details);
      }
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

// ============================================================================
// EXAMPLE 10: Complete Trading Bot (10 Lines)
// ============================================================================

export async function example10_tradingBot() {
  console.log('=== Example 10: Complete Trading Bot ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();
  const scale = new ScaleAMM(connection, wallet);

  const tokenMint = new PublicKey('TOKEN_MINT');

  // 1. Get pool info
  const pool = await scale.getPool(tokenMint);
  console.log('Price:', pool.price, 'CRX | MC:', pool.marketCapUsd, 'USD');

  // 2. Estimate trade
  const estimate = await scale.estimateBuy(pool.address, 100);
  console.log('Will receive:', estimate.output, 'tokens');

  // 3. Execute if price impact < 5%
  if (estimate.priceImpact < 5) {
    const result = await scale.buy(pool.address, { crxAmount: 100, slippage: 1.0 });
    console.log('✅ Bought', result.tokensReceived, 'tokens');
  }

  // 4. Listen for price changes
  scale.onTrade(pool.address, (trade) => {
    console.log(`Price update: ${trade.price} CRX per token`);
  });

  // 5. Wait for 10% profit
  await ScaleUtils.sleep(60_000);

  // 6. Sell
  const sellResult = await scale.sell(pool.address, {
    tokenAmount: estimate.output,
    slippage: 1.0,
  });
  console.log('✅ Sold for', sellResult.crxReceived, 'CRX');
}

// ============================================================================
// EXAMPLE 11: DEX Aggregator Integration (6 Lines)
// ============================================================================

export async function example11_dexAggregator() {
  console.log('=== Example 11: DEX Aggregator Integration ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();
  const scale = new ScaleAMM(connection, wallet);

  // Get quote for routing comparison
  const poolAddress = ScaleUtils.findPoolAddress(new PublicKey('TOKEN_MINT'));
  const quote = await scale.estimateBuy(poolAddress, 100);

  console.log('Scale AMM quote:');
  console.log('  Input: 100 CRX');
  console.log('  Output:', quote.output, 'tokens');
  console.log('  Price impact:', quote.priceImpact.toFixed(2), '%');

  // Execute if Scale AMM has best price
  if (quote.priceImpact < 2) {
    await scale.buy(poolAddress, { crxAmount: 100, slippage: 1.0 });
    console.log('✅ Routed through Scale AMM');
  }
}

// ============================================================================
// EXAMPLE 12: Analytics Dashboard (4 Lines)
// ============================================================================

export async function example12_analytics() {
  console.log('=== Example 12: Analytics Dashboard ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();
  const scale = new ScaleAMM(connection, wallet);

  // Fetch multiple pools
  const tokens = [
    new PublicKey('TOKEN_1'),
    new PublicKey('TOKEN_2'),
    new PublicKey('TOKEN_3'),
  ];

  const pools = await Promise.all(
    tokens.map(token => scale.getPool(token).catch(() => null))
  );

  // Display leaderboard
  console.log('Top Pools by Volume:');
  pools
    .filter(p => p !== null)
    .sort((a, b) => b!.volumeCrx - a!.volumeCrx)
    .forEach((pool, i) => {
      console.log(`${i + 1}. ${pool!.baseMint.toBase58().slice(0, 8)}...`);
      console.log(`   Volume: ${pool!.volumeCrx} CRX`);
      console.log(`   MC: ${ScaleUtils.formatMarketCap(pool!.marketCapUsd)}`);
      console.log(`   Phase: ${pool!.phase}`);
    });
}

// ============================================================================
// EXAMPLE 13: Portfolio Tracker
// ============================================================================

export async function example13_portfolio() {
  console.log('=== Example 13: Portfolio Tracker ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();
  const scale = new ScaleAMM(connection, wallet);

  const myHoldings = [
    { mint: new PublicKey('TOKEN_1'), amount: 1000 },
    { mint: new PublicKey('TOKEN_2'), amount: 500 },
  ];

  let totalValue = 0;

  for (const holding of myHoldings) {
    const pool = await scale.getPool(holding.mint);
    const value = holding.amount * pool.price;
    totalValue += value;

    console.log(`${holding.mint.toBase58().slice(0, 8)}...`);
    console.log(`  Amount: ${holding.amount} tokens`);
    console.log(`  Price: ${pool.price} CRX`);
    console.log(`  Value: ${value} CRX`);
  }

  console.log(`\nTotal portfolio value: ${totalValue} CRX`);
}

// ============================================================================
// EXAMPLE 14: Sniper Bot with Anti-Sniper Check
// ============================================================================

export async function example14_sniperBot() {
  console.log('=== Example 14: Sniper Bot ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();
  const scale = new ScaleAMM(connection, wallet);

  // Monitor for new pools
  // (In production, use WebSocket to listen for PoolCreated events)

  const newPoolMint = new PublicKey('NEW_TOKEN_MINT');

  try {
    // Get pool info
    const pool = await scale.getPool(newPoolMint);

    // Check if anti-sniper is active
    const currentSlot = await connection.getSlot();
    const slotsOld = currentSlot - pool.createdAt.getTime() / 400;

    if (slotsOld < 20) {
      console.log('⚠️  Anti-sniper active - using small trade size');
      // Buy small amount (< 5% of supply)
      await scale.buy(pool.address, {
        crxAmount: 10, // Small amount
        slippage: 2.0,
      });
    } else {
      // Anti-sniper expired - normal trade
      await scale.buy(pool.address, {
        crxAmount: 100,
        slippage: 1.0,
      });
    }

    console.log('✅ Sniped successfully!');
  } catch (error) {
    if (isScaleError(error, 'ANTI_SNIPER_ACTIVE')) {
      console.log('❌ Trade too large for anti-sniper window');
    }
  }
}

// ============================================================================
// EXAMPLE 15: Price Alerts
// ============================================================================

export async function example15_priceAlerts() {
  console.log('=== Example 15: Price Alerts ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();
  const scale = new ScaleAMM(connection, wallet);

  const poolAddress = new PublicKey('POOL_ADDRESS');
  const targetPrice = 0.01; // Alert when price reaches 0.01 CRX

  // Listen to trades
  scale.onTrade(poolAddress, (trade) => {
    if (trade.price >= targetPrice) {
      console.log('🚨 PRICE ALERT!');
      console.log(`Price reached ${trade.price} CRX per token`);
      console.log(`MC: ${ScaleUtils.formatMarketCap(trade.marketCapUsd)}`);

      // Send notification (webhook, email, etc.)
    }
  });

  console.log(`Monitoring price... Alert at ${targetPrice} CRX`);
  await ScaleUtils.sleep(60_000);
}

// ============================================================================
// Run all examples
// ============================================================================

export async function runAllExamples() {
  const examples = [
    // example1_initialize,      // Admin only
    example2_createPool,
    example3_createPoolAdvanced,
    example4_buy,
    example5_sell,
    example6_queryPool,
    example7_estimate,
    example8_events,
    example9_errorHandling,
    example10_tradingBot,
    example11_dexAggregator,
    example12_analytics,
    example13_portfolio,
    example14_sniperBot,
    example15_priceAlerts,
  ];

  for (const example of examples) {
    try {
      await example();
      console.log('\n' + '='.repeat(60) + '\n');
    } catch (error) {
      console.error('Example failed:', error);
    }
  }
}

// Run if executed directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}
