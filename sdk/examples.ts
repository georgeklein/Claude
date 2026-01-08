/**
 * Scale AMM SDK Examples
 *
 * Essential examples showing core SDK features.
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { ScaleAMM } from './ScaleAMM';
import { ScaleUtils } from './ScaleUtils';
import { ScaleError } from './errors';

// ============================================================================
// EXAMPLE 1: Create Pool
// ============================================================================

export async function example1_createPool() {
  console.log('=== Example 1: Create Pool ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();
  const scale = new ScaleAMM(connection, wallet);

  const myTokenMint = new PublicKey('YOUR_TOKEN_MINT');

  const pool = await scale.createPool({
    baseMint: myTokenMint,
    supply: 1_000_000,
    initialMarketCapUsd: 10_000,
    graduationThresholdUsd: 40_000,
  });

  console.log('Pool created:', pool.address.toBase58());
  console.log('Initial price:', pool.price, 'CRX per token');
  console.log('Trade URL:', pool.url);
}

// ============================================================================
// EXAMPLE 2: Buy Tokens
// ============================================================================

export async function example2_buy() {
  console.log('=== Example 2: Buy Tokens ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();
  const scale = new ScaleAMM(connection, wallet);

  const poolAddress = new PublicKey('POOL_ADDRESS');

  const result = await scale.buy(poolAddress, {
    crxAmount: 100,
    slippage: 1.0,
  });

  console.log('Bought:', result.tokensReceived, 'tokens');
  console.log('Fee:', result.fee, 'CRX');
  console.log('New price:', result.newPrice);
  console.log('Price impact:', result.priceImpact.toFixed(2), '%');

  if (result.graduated) {
    console.log('Pool graduated!');
  }
}

// ============================================================================
// EXAMPLE 3: Sell Tokens
// ============================================================================

export async function example3_sell() {
  console.log('=== Example 3: Sell Tokens ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();
  const scale = new ScaleAMM(connection, wallet);

  const poolAddress = new PublicKey('POOL_ADDRESS');

  const result = await scale.sell(poolAddress, {
    tokenAmount: 50,
    slippage: 1.0,
  });

  console.log('Sold:', result.tokensSold, 'tokens');
  console.log('Received:', result.crxReceived, 'CRX');
  console.log('Fee:', result.fee, 'CRX');
}

// ============================================================================
// EXAMPLE 4: Query Pool Info
// ============================================================================

export async function example4_queryPool() {
  console.log('=== Example 4: Query Pool Info ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();
  const scale = new ScaleAMM(connection, wallet);

  const tokenMint = new PublicKey('TOKEN_MINT');
  const pool = await scale.getPool(tokenMint);

  console.log('Pool Info:');
  console.log('  Address:', pool.address.toBase58());
  console.log('  Phase:', pool.phase);
  console.log('  Price:', ScaleUtils.formatPrice(pool.price));
  console.log('  Market Cap:', ScaleUtils.formatMarketCap(pool.marketCapUsd));
  console.log('  Liquidity:', pool.liquidityCrx, 'CRX');
  console.log('  Volume:', pool.volumeCrx, 'CRX');
  console.log('  Graduation:', pool.graduationProgress.toFixed(1), '%');
}

// ============================================================================
// EXAMPLE 5: Estimate Trade
// ============================================================================

export async function example5_estimate() {
  console.log('=== Example 5: Estimate Trade ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();
  const scale = new ScaleAMM(connection, wallet);

  const poolAddress = new PublicKey('POOL_ADDRESS');

  const buyEstimate = await scale.estimateBuy(poolAddress, 100);
  console.log('Buy 100 CRX:');
  console.log('  Will receive:', buyEstimate.output, 'tokens');
  console.log('  Fee:', buyEstimate.fee, 'CRX');
  console.log('  Price impact:', buyEstimate.priceImpact.toFixed(2), '%');

  const sellEstimate = await scale.estimateSell(poolAddress, 50);
  console.log('\nSell 50 tokens:');
  console.log('  Will receive:', sellEstimate.output, 'CRX');
  console.log('  Fee:', sellEstimate.fee, 'CRX');
  console.log('  Price impact:', sellEstimate.priceImpact.toFixed(2), '%');
}

// ============================================================================
// EXAMPLE 6: Event Listeners
// ============================================================================

export async function example6_events() {
  console.log('=== Example 6: Event Listeners ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();
  const scale = new ScaleAMM(connection, wallet);

  const poolAddress = new PublicKey('POOL_ADDRESS');

  const tradeListener = scale.onTrade(poolAddress, (trade) => {
    console.log(`${trade.isBuy ? 'BUY' : 'SELL'}:`, trade.amount, 'tokens');
    console.log('  Price:', trade.price, 'CRX');
    console.log('  MC:', ScaleUtils.formatMarketCap(trade.marketCapUsd));
  });

  const gradListener = scale.onGraduation(poolAddress, (event) => {
    console.log('POOL GRADUATED!');
    console.log('  Final MC:', ScaleUtils.formatMarketCap(event.marketCapUsd));
    console.log('  Total volume:', event.totalVolume, 'CRX');
  });

  await ScaleUtils.sleep(60_000);

  await scale.removeListener(tradeListener);
  await scale.removeListener(gradListener);
}

// ============================================================================
// EXAMPLE 7: Trading Bot
// ============================================================================

export async function example7_tradingBot() {
  console.log('=== Example 7: Trading Bot ===\n');

  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();
  const scale = new ScaleAMM(connection, wallet);

  const tokenMint = new PublicKey('TOKEN_MINT');

  // Get pool info
  const pool = await scale.getPool(tokenMint);
  console.log('Price:', pool.price, 'CRX | MC:', pool.marketCapUsd, 'USD');

  // Estimate trade
  const estimate = await scale.estimateBuy(pool.address, 100);
  console.log('Will receive:', estimate.output, 'tokens');

  // Execute if price impact acceptable
  if (estimate.priceImpact < 5) {
    const result = await scale.buy(pool.address, {
      crxAmount: 100,
      slippage: 1.0,
    });
    console.log('Bought', result.tokensReceived, 'tokens');

    // Listen for price changes
    scale.onTrade(pool.address, async (trade) => {
      const profitTarget = pool.price * 1.1; // 10% profit
      if (trade.price >= profitTarget) {
        const sellResult = await scale.sell(pool.address, {
          tokenAmount: estimate.output,
          slippage: 1.0,
        });
        console.log('Sold for', sellResult.crxReceived, 'CRX');
        process.exit(0);
      }
    });
  }
}

// ============================================================================
// Run examples
// ============================================================================

export async function runAllExamples() {
  const examples = [
    example1_createPool,
    example2_buy,
    example3_sell,
    example4_queryPool,
    example5_estimate,
    example6_events,
    example7_tradingBot,
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

if (require.main === module) {
  runAllExamples().catch(console.error);
}
