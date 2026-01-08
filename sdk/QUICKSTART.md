# Scale AMM Quick Start Templates

**Launch a token in under 60 seconds with copy-paste templates.**

## Table of Contents

1. [5-Line Token Launch](#1-5-line-token-launch)
2. [3-Line Token Buy](#2-3-line-token-buy)
3. [2-Line Price Check](#3-2-line-price-check)
4. [2-Line Fee Claim](#4-2-line-fee-claim)
5. [Trading Bot Template](#5-trading-bot-template)
6. [DEX Aggregator Integration](#6-dex-aggregator-integration)
7. [Portfolio Tracker](#7-portfolio-tracker)
8. [Real-Time Price Monitor](#8-real-time-price-monitor)
9. [Sniper Bot (Anti-Sniper Safe)](#9-sniper-bot-anti-sniper-safe)
10. [Analytics Dashboard](#10-analytics-dashboard)

---

## 1. 5-Line Token Launch

**Perfect for:** Token creators who want to launch in seconds.

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { ScaleAMM } from '@scale-amm/sdk';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.fromSecretKey(YOUR_SECRET_KEY);
const scale = new ScaleAMM(connection, wallet);

// Launch your token - that's it!
const pool = await scale.createPool({
  baseMint: YOUR_TOKEN_MINT,
  supply: 1_000_000,              // 1M tokens
  initialMarketCapUsd: 10_000,    // Launch at $10k
  graduationThresholdUsd: 40_000, // Graduate at $40k
});

console.log('🚀 Pool created:', pool.url);
```

**What you get:**
- Pool created at exact target market cap
- Auto-calculated bonding curve
- Instant tradability
- Anti-sniper protection enabled
- Public trading URL

---

## 2. 3-Line Token Buy

**Perfect for:** Traders who want to buy tokens quickly.

```typescript
import { ScaleAMM } from '@scale-amm/sdk';

const scale = new ScaleAMM(connection, wallet);

// Buy tokens - that's it!
const result = await scale.buy(POOL_ADDRESS, {
  crxAmount: 100,    // Spend 100 CRX
  slippage: 1.0,     // 1% slippage tolerance
});

console.log('✅ Bought:', result.tokensReceived, 'tokens');
```

**What you get:**
- Automatic slippage protection
- No PDA calculations needed
- No ATA management
- Clear error messages
- Transaction signature

---

## 3. 2-Line Price Check

**Perfect for:** Quick price lookups for analytics or bots.

```typescript
const pool = await scale.getPool(TOKEN_MINT);
console.log('Price:', pool.price, 'CRX | MC:', pool.marketCapUsd, 'USD');
```

**What you get:**
- Current price in CRX
- Market cap in USD
- Liquidity depth
- Graduation progress
- Volume stats

---

## 4. 2-Line Fee Claim

**Perfect for:** Creators claiming accumulated fees.

```typescript
// Fees are automatically sent to creator on each trade
// Just check your CRX balance - no manual claim needed!
const balance = await connection.getBalance(wallet.publicKey);
console.log('Your fees:', balance / 1e9, 'CRX');
```

**How it works:**
- Fees automatically transferred on every trade
- No gas-heavy claim transactions
- Instant fee receipt
- Zero friction

---

## 5. Trading Bot Template

**Perfect for:** Automated trading strategies.

```typescript
import { ScaleAMM, ScaleUtils } from '@scale-amm/sdk';

async function tradingBot(tokenMint, buyAmount, targetProfit) {
  const scale = new ScaleAMM(connection, wallet);

  // 1. Get current state
  const pool = await scale.getPool(tokenMint);
  const entryPrice = pool.price;

  // 2. Estimate trade
  const estimate = await scale.estimateBuy(pool.address, buyAmount);

  // 3. Execute if price impact acceptable
  if (estimate.priceImpact < 5) {
    await scale.buy(pool.address, { crxAmount: buyAmount, slippage: 2.0 });
    console.log('✅ Bought at', entryPrice);

    // 4. Monitor for profit target
    scale.onTrade(pool.address, async (trade) => {
      const profitPercent = ((trade.price - entryPrice) / entryPrice) * 100;

      if (profitPercent >= targetProfit) {
        await scale.sell(pool.address, {
          tokenAmount: estimate.output,
          slippage: 2.0,
        });
        console.log('✅ Sold at', trade.price, `(+${profitPercent.toFixed(1)}%)`);
        process.exit(0);
      }
    });
  }
}

// Run bot
tradingBot(TOKEN_MINT, 100, 10); // Buy 100 CRX, sell at +10% profit
```

---

## 6. DEX Aggregator Integration

**Perfect for:** Routing platforms comparing quotes.

```typescript
import { ScaleAMM } from '@scale-amm/sdk';

async function getScaleQuote(tokenIn, tokenOut, amountIn) {
  const scale = new ScaleAMM(connection, wallet);

  // Find pool
  const poolAddress = ScaleUtils.findPoolAddress(tokenOut);

  // Get quote
  const quote = await scale.estimateBuy(poolAddress, amountIn);

  return {
    protocol: 'Scale AMM',
    inputAmount: amountIn,
    outputAmount: quote.output,
    priceImpact: quote.priceImpact,
    fee: quote.fee,
    route: [tokenIn, tokenOut],
  };
}

// Compare with other DEXes
const scaleQuote = await getScaleQuote(CRX_MINT, TOKEN_MINT, 100);
const jupiterQuote = await getJupiterQuote(...);
const orcaQuote = await getOrcaQuote(...);

// Route through best price
const best = [scaleQuote, jupiterQuote, orcaQuote]
  .sort((a, b) => b.outputAmount - a.outputAmount)[0];

console.log('Best route:', best.protocol, '->', best.outputAmount, 'tokens');
```

---

## 7. Portfolio Tracker

**Perfect for:** Tracking token holdings value.

```typescript
import { ScaleAMM } from '@scale-amm/sdk';

async function trackPortfolio(holdings) {
  const scale = new ScaleAMM(connection, wallet);

  let totalValueCRX = 0;

  for (const { mint, amount } of holdings) {
    const pool = await scale.getPool(mint);
    const valueCRX = amount * pool.price;
    const valueUSD = valueCRX * pool.price; // Assume CRX price known

    console.log(`${mint.toBase58().slice(0, 8)}...`);
    console.log(`  Amount: ${amount} tokens`);
    console.log(`  Price: ${pool.price} CRX`);
    console.log(`  Value: ${valueCRX.toFixed(2)} CRX ($${valueUSD.toFixed(2)})`);

    totalValueCRX += valueCRX;
  }

  console.log(`\n💰 Total Portfolio: ${totalValueCRX.toFixed(2)} CRX`);
}

// Track your holdings
trackPortfolio([
  { mint: TOKEN_1_MINT, amount: 1000 },
  { mint: TOKEN_2_MINT, amount: 500 },
]);
```

---

## 8. Real-Time Price Monitor

**Perfect for:** Price alerts and live tracking.

```typescript
import { ScaleAMM, ScaleUtils } from '@scale-amm/sdk';

async function monitorPrice(tokenMint, alertPrice) {
  const scale = new ScaleAMM(connection, wallet);
  const poolAddress = ScaleUtils.findPoolAddress(tokenMint);

  // Get initial price
  const pool = await scale.getPool(tokenMint);
  console.log(`📊 Monitoring ${tokenMint.toBase58()}`);
  console.log(`Current: ${pool.price} CRX | Target: ${alertPrice} CRX\n`);

  // Listen for trades
  scale.onTrade(poolAddress, (trade) => {
    console.log(`${trade.isBuy ? '📈 BUY ' : '📉 SELL'}: ${trade.price.toFixed(8)} CRX`);
    console.log(`MC: ${ScaleUtils.formatMarketCap(trade.marketCapUsd)}`);

    // Alert if target reached
    if (trade.price >= alertPrice) {
      console.log(`\n🚨 PRICE ALERT! Reached ${trade.price} CRX`);
      // Send webhook, email, SMS, etc.
    }
  });

  console.log('Watching... Press Ctrl+C to stop');
}

// Monitor for $0.01 target
monitorPrice(TOKEN_MINT, 0.01);
```

---

## 9. Sniper Bot (Anti-Sniper Safe)

**Perfect for:** Early buying with anti-sniper awareness.

```typescript
import { ScaleAMM } from '@scale-amm/sdk';

async function sniperBot(tokenMint, buyAmount) {
  const scale = new ScaleAMM(connection, wallet);

  try {
    // Get pool info
    const pool = await scale.getPool(tokenMint);

    // Check if anti-sniper active
    const currentSlot = await connection.getSlot();
    const poolAge = currentSlot - (pool.createdAt.getTime() / 400); // slots since creation

    if (poolAge < 20) {
      console.log('⚠️  Anti-sniper active - using conservative trade');

      // Buy small amount (under 5% of supply to avoid anti-sniper)
      await scale.buy(pool.address, {
        crxAmount: buyAmount * 0.1, // 10% of planned amount
        slippage: 2.0,
      });

      console.log('✅ Small position taken. Waiting for anti-sniper window...');

      // Wait for anti-sniper to expire
      await ScaleUtils.sleep(10_000); // 10 seconds

      // Buy remaining
      await scale.buy(pool.address, {
        crxAmount: buyAmount * 0.9,
        slippage: 1.5,
      });

      console.log('✅ Full position acquired');
    } else {
      // Anti-sniper expired - normal buy
      await scale.buy(pool.address, {
        crxAmount: buyAmount,
        slippage: 1.0,
      });

      console.log('✅ Position acquired (anti-sniper inactive)');
    }
  } catch (error) {
    if (error.code === 'ANTI_SNIPER_ACTIVE') {
      console.log('❌ Trade too large for anti-sniper window. Reduce size.');
    } else {
      console.error('❌ Error:', error.message);
    }
  }
}

// Snipe new token
sniperBot(NEW_TOKEN_MINT, 50); // Attempt to buy with 50 CRX
```

---

## 10. Analytics Dashboard

**Perfect for:** Tracking top pools and trends.

```typescript
import { ScaleAMM, ScaleUtils } from '@scale-amm/sdk';

async function analyticsDashboard(tokenMints) {
  const scale = new ScaleAMM(connection, wallet);

  // Fetch all pools in parallel
  const pools = await Promise.all(
    tokenMints.map(mint => scale.getPool(mint).catch(() => null))
  );

  // Filter out failed fetches
  const validPools = pools.filter(p => p !== null);

  // Sort by volume
  const topByVolume = validPools
    .sort((a, b) => b.volumeCrx - a.volumeCrx)
    .slice(0, 10);

  console.log('🏆 Top 10 Pools by Volume:\n');
  topByVolume.forEach((pool, i) => {
    console.log(`${i + 1}. ${pool.baseMint.toBase58().slice(0, 8)}...`);
    console.log(`   Volume: ${pool.volumeCrx.toFixed(0)} CRX`);
    console.log(`   MC: ${ScaleUtils.formatMarketCap(pool.marketCapUsd)}`);
    console.log(`   Phase: ${pool.phase}`);
    console.log(`   Graduation: ${pool.graduationProgress.toFixed(1)}%`);
    console.log();
  });

  // Calculate stats
  const totalVolume = validPools.reduce((sum, p) => sum + p.volumeCrx, 0);
  const totalLiquidity = validPools.reduce((sum, p) => sum + p.liquidityCrx, 0);
  const graduatedCount = validPools.filter(p => p.phase === 'Graduated').length;

  console.log('📊 Network Stats:');
  console.log(`  Total Pools: ${validPools.length}`);
  console.log(`  Total Volume: ${totalVolume.toFixed(0)} CRX`);
  console.log(`  Total Liquidity: ${totalLiquidity.toFixed(0)} CRX`);
  console.log(`  Graduated: ${graduatedCount} (${(graduatedCount/validPools.length*100).toFixed(1)}%)`);
}

// Track token list
analyticsDashboard([TOKEN_1, TOKEN_2, TOKEN_3, /* ... */]);
```

---

## Environment Setup

### Prerequisites

```bash
npm install @scale-amm/sdk @solana/web3.js @coral-xyz/anchor
```

### Wallet Configuration

```typescript
// Option 1: From secret key
import { Keypair } from '@solana/web3.js';
const wallet = Keypair.fromSecretKey(new Uint8Array([...]));

// Option 2: From file
import * as fs from 'fs';
const secretKey = JSON.parse(fs.readFileSync('wallet.json', 'utf-8'));
const wallet = Keypair.fromSecretKey(new Uint8Array(secretKey));

// Option 3: From env variable
const wallet = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(process.env.SOLANA_PRIVATE_KEY))
);
```

### Connection Setup

```typescript
import { Connection } from '@solana/web3.js';

// Mainnet
const connection = new Connection('https://api.mainnet-beta.solana.com');

// Devnet (testing)
const connection = new Connection('https://api.devnet.solana.com');

// Custom RPC (recommended for production)
const connection = new Connection(process.env.SOLANA_RPC_URL);
```

---

## Error Handling Template

```typescript
import { ScaleError, isScaleError, getErrorAction } from '@scale-amm/sdk';

try {
  await scale.buy(pool, { crxAmount: 100 });
} catch (error) {
  if (error instanceof ScaleError) {
    console.error('❌', error.code);
    console.error('💡', getErrorAction(error));

    // Handle specific errors
    switch (error.code) {
      case 'SLIPPAGE_EXCEEDED':
        // Retry with 2% slippage
        await scale.buy(pool, { crxAmount: 100, slippage: 2.0 });
        break;

      case 'INSUFFICIENT_BALANCE':
        console.log('Add more CRX to your wallet');
        break;

      case 'ANTI_SNIPER_ACTIVE':
        console.log('Wait 10 seconds or reduce trade size');
        break;

      case 'POOL_NOT_FOUND':
        console.log('Pool does not exist for this token');
        break;
    }
  } else {
    console.error('Unexpected error:', error);
  }
}
```

---

## Best Practices

### 1. Always Estimate Before Trading

```typescript
// ❌ Bad: Trade blindly
await scale.buy(pool, { crxAmount: 1000 });

// ✅ Good: Estimate first
const estimate = await scale.estimateBuy(pool, 1000);
if (estimate.priceImpact < 5) {
  await scale.buy(pool, { crxAmount: 1000, slippage: 1.0 });
}
```

### 2. Use Appropriate Slippage

```typescript
// ❌ Bad: Too tight (likely to fail)
await scale.buy(pool, { crxAmount: 100, slippage: 0.1 });

// ✅ Good: Reasonable tolerance
await scale.buy(pool, { crxAmount: 100, slippage: 1.0 });

// ✅ Good for high volatility
await scale.buy(pool, { crxAmount: 100, slippage: 2.0 });
```

### 3. Handle Graduation Events

```typescript
// Listen for graduation to adjust strategy
scale.onGraduation(pool, (event) => {
  console.log('Pool graduated! Fees now lower:', event.marketCapUsd);
  // Adjust trading parameters
});
```

### 4. Use Retry Logic for RPC Issues

```typescript
import { ScaleUtils } from '@scale-amm/sdk';

const result = await ScaleUtils.retry(
  async () => scale.buy(pool, { crxAmount: 100 }),
  3,     // max retries
  1000   // initial delay ms
);
```

---

## CLI Quick Start

```bash
# Install globally
npm install -g @scale-amm/sdk

# Interactive token launch
npx @scale-amm/sdk launch

# Buy tokens
npx @scale-amm/sdk buy

# Check pool info
npx @scale-amm/sdk info

# Monitor price
npx @scale-amm/sdk price --watch
```

---

## Support

- **Documentation:** [SDK README](./README.md)
- **Examples:** [Complete Examples](./examples.ts)
- **GitHub:** [Scale AMM Repository](https://github.com/georgeklein/Scale-AMM)

---

**Built with Scale AMM - Launch tokens in under 60 seconds.**
