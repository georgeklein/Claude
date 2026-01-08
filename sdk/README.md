# Scale AMM TypeScript SDK

> The easiest way to integrate bonding curve token launches into your Solana app

```typescript
// Three lines. That's it.
const pool = await scale.createPool({
  supply: 1_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 85_000
});
```

---

## Why Developers Love This SDK

### Zero Boilerplate
No PDA derivation. No ATA management. No oracle integration. Just clean, typed functions that work.

```typescript
// ❌ Other SDKs (50+ lines of setup)
const [poolPda, bump] = await PublicKey.findProgramAddress([...], programId);
const poolAta = await getAssociatedTokenAddress(quoteMint, poolPda, true);
const userAta = await getOrCreateAssociatedTokenAddress(...);
const oracle = await getPythPriceAccount(...);
// ... 45 more lines

// ✅ Scale AMM (1 line)
await scale.buy(poolAddress, { crxAmount: 100 });
```

###Human-Readable Parameters
Pass USD amounts and token quantities. No lamports, no decimals, no math.

```typescript
// Pass actual values you care about
await scale.createPool({
  supply: 1_000_000,                  // 1M tokens
  initialMarketCapUsd: 10_000,        // Launch at $10k market cap
  graduationThresholdUsd: 85_000,     // Graduate at $85k
});
```

### Type-Safe & Auto-Complete
Full TypeScript support with detailed JSDoc. Your IDE will love you.

```typescript
// Hover over any method for instant docs
scale.buy(...)  // ← IDE shows params, return type, errors
```

### Clear Error Messages
No more cryptic "0x1234" errors. Human-readable messages that actually help.

```typescript
// ❌ Raw Solana
"Error: failed to send transaction: Transaction simulation failed: Error processing Instruction 0: custom program error: 0x1771"

// ✅ Scale AMM
"SlippageExceeded: Expected 1000 tokens but would receive 950 (5% slippage). Increase slippage tolerance or try again."
```

---

## Installation

```bash
npm install @scale-amm/sdk @solana/web3.js
# or
yarn add @scale-amm/sdk @solana/web3.js
# or
pnpm add @scale-amm/sdk @solana/web3.js
```

**Requirements:**
- Node.js 16+
- @solana/web3.js ^1.87.0
- TypeScript 4.9+ (optional but recommended)

---

## Quick Start

### 1. Initialize SDK

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { ScaleAMM } from '@scale-amm/sdk';

// Connect to Solana
const connection = new Connection(
  'https://api.mainnet-beta.solana.com',
  'confirmed'  // commitment level
);

// Load wallet
const wallet = Keypair.fromSecretKey(
  Buffer.from(process.env.PRIVATE_KEY, 'base64')
);

// Initialize Scale AMM
const scale = new ScaleAMM(connection, wallet);
```

### 2. Create Your First Pool

```typescript
const pool = await scale.createPool({
  baseMint: myTokenMint,              // PublicKey of your SPL token
  supply: 1_000_000,                   // Total supply to bond (in token units)
  initialMarketCapUsd: 10_000,         // Launch at $10k market cap
  graduationThresholdUsd: 85_000,      // Graduate at $85k total value
  creatorFeeBps: 100,                  // 1% creator fee (optional, default: 0)
});

console.log('✅ Pool created:', pool.address.toString());
console.log('📊 Dashboard:', pool.url);
```

### 3. Buy Tokens

```typescript
const result = await scale.buy(pool.address, {
  crxAmount: 100,                      // Spend 100 CRX
  slippage: 1.0,                       // 1% slippage tolerance
});

console.log('Bought:', result.tokensReceived, 'tokens');
console.log('New price:', result.newPrice, 'CRX per token');
console.log('Fee paid:', result.fee, 'CRX');
```

### 4. Sell Tokens

```typescript
const result = await scale.sell(pool.address, {
  tokenAmount: 5000,                   // Sell 5000 tokens
  slippage: 1.0,                       // 1% slippage tolerance
});

console.log('Received:', result.crxReceived, 'CRX');
console.log('New price:', result.newPrice, 'CRX per token');
```

---

## Complete API Reference

### Class: `ScaleAMM`

Main SDK class. All operations go through this.

```typescript
constructor(
  connection: Connection,
  wallet: Wallet,
  programId?: PublicKey  // optional, defaults to mainnet program
)
```

---

### Pool Operations

#### `createPool(params: CreatePoolParams): Promise<PoolInfo>`

Create a new bonding curve pool for your token.

**Parameters:**
```typescript
interface CreatePoolParams {
  baseMint: PublicKey;                  // Your SPL token mint
  supply: number;                        // Total supply to bond (in token units)
  initialMarketCapUsd: number;           // Launch market cap in USD
  graduationThresholdUsd: number;        // Graduation threshold in USD
  creatorFeeBps?: number;                // Creator fee: 0, 25, or 100 bps (default: 0)
  curveType?: 'ConstantProduct' | 'Exponential';  // default: ConstantProduct
}
```

**Returns:** `PoolInfo` with pool address, price, phase, and dashboard URL.

**Example:**
```typescript
const pool = await scale.createPool({
  baseMint: new PublicKey('TokenMint...'),
  supply: 1_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 85_000,
  creatorFeeBps: 100,  // 1% fee to creator
});

// Pool is live! Share the dashboard:
console.log('Trade here:', pool.url);
```

**Throws:**
- `InsufficientBalance` - Not enough tokens in wallet
- `InvalidFee` - Fee not 0, 25, or 100 bps
- `InvalidThreshold` - Graduation threshold <= initial market cap

---

#### `getPool(baseMint: PublicKey): Promise<PoolInfo>`

Query current pool state.

**Returns:**
```typescript
interface PoolInfo {
  address: PublicKey;                   // Pool account address
  baseMint: PublicKey;                  // Token mint
  quoteMint: PublicKey;                 // CRX mint
  phase: 'PreBonding' | 'Graduated';    // Current phase
  price: number;                        // Current price (CRX per token)
  marketCapUsd: number;                 // Current market cap in USD
  liquidityCrx: number;                 // CRX liquidity
  liquidityTokens: number;              // Token liquidity
  graduationProgress: number;           // 0.0 - 1.0 (0% - 100%)
  totalTrades: number;                  // Total number of trades
  totalVolumeCrx: number;               // Total volume in CRX
  url: string;                          // Dashboard URL
}
```

**Example:**
```typescript
const pool = await scale.getPool(tokenMint);

console.log(`Price: ${pool.price} CRX per token`);
console.log(`Market Cap: $${pool.marketCapUsd.toLocaleString()}`);
console.log(`Phase: ${pool.phase}`);
console.log(`Graduation: ${(pool.graduationProgress * 100).toFixed(1)}%`);
```

---

### Trading Operations

#### `buy(pool: PublicKey, params: BuyParams): Promise<TradeResult>`

Buy tokens with CRX.

**Parameters:**
```typescript
interface BuyParams {
  crxAmount: number;                    // CRX to spend (in CRX units, not lamports)
  slippage?: number;                    // % slippage tolerance (default: 0.5)
  minTokens?: number;                   // Minimum tokens to receive (overrides slippage)
}
```

**Returns:**
```typescript
interface TradeResult {
  signature: string;                    // Transaction signature
  crxSpent: number;                     // CRX spent
  tokensReceived: number;               // Tokens received
  fee: number;                          // Fee paid in CRX
  newPrice: number;                     // New price after trade
  priceImpact: number;                  // % price impact
  graduated: boolean;                   // Did pool graduate from this trade?
}
```

**Example:**
```typescript
// Simple buy
const result = await scale.buy(poolAddress, {
  crxAmount: 100,
  slippage: 1.0,  // 1% slippage tolerance
});

console.log(`Bought ${result.tokensReceived} tokens for ${result.crxSpent} CRX`);
console.log(`Price impact: ${result.priceImpact.toFixed(2)}%`);
console.log(`Transaction: https://solscan.io/tx/${result.signature}`);

if (result.graduated) {
  console.log('🎓 Pool graduated to permanent AMM!');
}
```

**Throws:**
- `SlippageExceeded` - Price moved beyond tolerance
- `InsufficientBalance` - Not enough CRX
- `AntiSniperActive` - Trade too large during launch (first 100 slots)
- `PoolNotFound` - Pool doesn't exist

---

#### `sell(pool: PublicKey, params: SellParams): Promise<TradeResult>`

Sell tokens for CRX.

**Parameters:**
```typescript
interface SellParams {
  tokenAmount: number;                  // Tokens to sell (in token units)
  slippage?: number;                    // % slippage tolerance (default: 0.5)
  minCrx?: number;                      // Minimum CRX to receive (overrides slippage)
}
```

**Returns:** Same `TradeResult` as `buy()`.

**Example:**
```typescript
const result = await scale.sell(poolAddress, {
  tokenAmount: 5000,
  slippage: 2.0,  // 2% slippage (sell has higher impact)
});

console.log(`Sold ${result.tokensSold} tokens for ${result.crxReceived} CRX`);
console.log(`Fee: ${result.fee} CRX`);
```

**Note:** Selling during the first 100 slots (~60 seconds) incurs WAA (Weighted Average Age) penalties up to 10% extra fee to prevent sniping.

---

### Estimation (No Transactions)

#### `estimateBuy(pool: PublicKey, crxAmount: number): Promise<EstimateResult>`

Estimate buy without executing transaction. Zero cost, instant result.

**Returns:**
```typescript
interface EstimateResult {
  tokensReceived: number;               // Tokens you'd receive
  priceImpact: number;                  // % price impact
  fee: number;                          // Fee in CRX
  newPrice: number;                     // Price after trade
}
```

**Example:**
```typescript
// Check before buying
const estimate = await scale.estimateBuy(poolAddress, 100);

console.log(`100 CRX would buy ${estimate.tokensReceived} tokens`);
console.log(`Price impact: ${estimate.priceImpact.toFixed(2)}%`);
console.log(`Fee: ${estimate.fee} CRX`);

if (estimate.priceImpact > 5) {
  console.warn('⚠️  High price impact, consider buying less');
}
```

#### `estimateSell(pool: PublicKey, tokenAmount: number): Promise<EstimateResult>`

Estimate sell without executing transaction.

---

### Event Listeners

#### `onTrade(pool: PublicKey, callback: (event: TradeEvent) => void): number`

Listen for trades on a pool. Returns listener ID for removal.

**Event:**
```typescript
interface TradeEvent {
  pool: PublicKey;
  user: PublicKey;
  direction: 'buy' | 'sell';
  crxAmount: number;
  tokenAmount: number;
  price: number;
  timestamp: number;
  signature: string;
}
```

**Example:**
```typescript
const listenerId = scale.onTrade(poolAddress, (trade) => {
  console.log(`${trade.direction}: ${trade.user.toString().slice(0, 8)}...`);
  console.log(`  ${trade.tokenAmount} tokens for ${trade.crxAmount} CRX`);
  console.log(`  Price: ${trade.price} CRX per token`);
});

// Later: remove listener
await scale.removeListener(listenerId);
```

#### `onGraduation(pool: PublicKey, callback: (event: GraduationEvent) => void): number`

Listen for pool graduation.

**Event:**
```typescript
interface GraduationEvent {
  pool: PublicKey;
  marketCapUsd: number;
  totalCrxLocked: number;
  totalTrades: number;
  timestamp: number;
}
```

**Example:**
```typescript
scale.onGraduation(poolAddress, (event) => {
  console.log('🎓 Pool graduated!');
  console.log(`  Final market cap: $${event.marketCapUsd.toLocaleString()}`);
  console.log(`  CRX locked: ${event.totalCrxLocked}`);
  console.log(`  Total trades: ${event.totalTrades}`);

  // Send notification, update UI, etc.
});
```

---

### Utility Class: `ScaleUtils`

Helper functions for common operations.

#### Conversions

```typescript
// USD ↔ MicroUSD (on-chain representation)
ScaleUtils.usdToMicroUsd(100)           // 100000000 (6 decimals)
ScaleUtils.microUsdToUsd(100000000)     // 100

// Token amounts ↔ Lamports
ScaleUtils.toLamports(100, 9)           // 100000000000n (bigint)
ScaleUtils.fromLamports(100000000000n, 9)  // 100
```

#### PDA Derivation

```typescript
// Get pool address without RPC call
const poolAddress = ScaleUtils.findPoolAddress(tokenMint);

// Get config address
const configAddress = ScaleUtils.findConfigAddress();
```

#### Formatting

```typescript
ScaleUtils.formatPrice(0.00123)         // "0.00123 CRX"
ScaleUtils.formatMarketCap(10000)       // "$10,000"
ScaleUtils.formatAmount(1000000, 'TOKEN')  // "1,000,000 TOKEN"
```

#### Helpers

```typescript
// Sleep
await ScaleUtils.sleep(1000);  // 1 second

// Retry with exponential backoff
const result = await ScaleUtils.retry(
  async () => await scale.buy(pool, { crxAmount: 100 }),
  3  // max 3 retries
);
```

---

## Error Handling

All SDK methods throw typed errors with clear messages.

```typescript
import { ScaleError, ErrorCode } from '@scale-amm/sdk';

try {
  await scale.buy(poolAddress, { crxAmount: 100, slippage: 1.0 });
} catch (error) {
  if (error instanceof ScaleError) {
    switch (error.code) {
      case ErrorCode.SLIPPAGE_EXCEEDED:
        console.error('Price moved too much, try increasing slippage');
        break;
      case ErrorCode.INSUFFICIENT_BALANCE:
        console.error('Not enough CRX in wallet');
        break;
      case ErrorCode.ANTI_SNIPER_ACTIVE:
        console.error('Trade too large during launch, wait or reduce size');
        break;
      default:
        console.error('Error:', error.message);
    }
  } else {
    // Network error, etc.
    console.error('Unexpected error:', error);
  }
}
```

### Common Error Codes

| Code | Meaning | Solution |
|------|---------|----------|
| `SLIPPAGE_EXCEEDED` | Price moved beyond tolerance | Increase slippage or retry |
| `INSUFFICIENT_BALANCE` | Not enough tokens/CRX | Check wallet balance |
| `ANTI_SNIPER_ACTIVE` | Trade too large during launch | Wait 60s or reduce size |
| `POOL_NOT_FOUND` | Pool doesn't exist | Verify pool address |
| `INVALID_FEE` | Fee not 0, 25, or 100 bps | Use valid fee tier |
| `ORACLE_STALE` | CRX price oracle is stale | Wait and retry |
| `PROTOCOL_PAUSED` | Protocol emergency pause | Wait for unpause |

---

## Advanced Usage

### Custom Program ID (Devnet)

```typescript
import { PublicKey } from '@solana/web3.js';

const scale = new ScaleAMM(
  connection,
  wallet,
  new PublicKey('YourDevnetProgramID...')
);
```

### Concurrent Trading Bot

```typescript
// Process buy orders concurrently
const orders = [
  { pool: pool1, crxAmount: 50 },
  { pool: pool2, crxAmount: 100 },
  { pool: pool3, crxAmount: 75 },
];

const results = await Promise.allSettled(
  orders.map(order => scale.buy(order.pool, { crxAmount: order.crxAmount }))
);

results.forEach((result, i) => {
  if (result.status === 'fulfilled') {
    console.log(`Order ${i}: Success -`, result.value.tokensReceived, 'tokens');
  } else {
    console.error(`Order ${i}: Failed -`, result.reason.message);
  }
});
```

### Real-Time Price Monitoring

```typescript
// Monitor price and auto-buy on dip
const targetPrice = 0.01;

scale.onTrade(poolAddress, async (trade) => {
  const pool = await scale.getPool(poolAddress);

  if (pool.price <= targetPrice && trade.direction === 'sell') {
    console.log(`Price dipped to ${pool.price}, buying!`);
    await scale.buy(poolAddress, { crxAmount: 100 });
  }
});
```

### Dollar-Cost Averaging

```typescript
// Buy 100 CRX worth every hour
setInterval(async () => {
  try {
    const result = await scale.buy(poolAddress, {
      crxAmount: 100,
      slippage: 2.0,  // Accept higher slippage for automation
    });

    console.log(`DCA: Bought ${result.tokensReceived} tokens`);
  } catch (error) {
    console.error('DCA failed:', error.message);
  }
}, 3600 * 1000);  // 1 hour
```

---

## Examples

See [examples.ts](./examples.ts) for 7 complete, runnable examples:

1. **Create Pool** - Launch a token bonding curve
2. **Buy Tokens** - Purchase tokens from a pool
3. **Sell Tokens** - Sell tokens back to a pool
4. **Query Pool** - Get current pool state
5. **Estimate Trades** - Preview trades without executing
6. **Event Listeners** - Listen for trades and graduations
7. **Trading Bot** - Automated trading strategy

Run examples:
```bash
ts-node sdk/examples.ts create-pool
ts-node sdk/examples.ts buy --pool=<address> --amount=100
```

---

## Performance

The SDK is optimized for speed:

- **No unnecessary RPC calls** - PDAs derived locally
- **Parallel requests** - Buy/sell multiple pools concurrently
- **Smart retries** - Exponential backoff on failures
- **Caching** - Pool data cached for 5 seconds

Benchmark (localhost RPC):
```
Operation          Time
─────────────────────────
createPool()       ~3s
buy()              ~2s
sell()             ~2s
getPool()          ~200ms
estimateBuy()      ~200ms
estimateSell()     ~200ms
```

---

## TypeScript Configuration

For best experience, add to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true
  }
}
```

---

## Contributing

Found a bug? Want a feature? [Open an issue](https://github.com/georgeklein/Scale-AMM/issues) or submit a PR!

---

## License

MIT License - see [LICENSE](../LICENSE) for details.

---

## Support

- **Docs:** [docs.creatorcoin.io](https://docs.creatorcoin.io)
- **Discord:** [discord.gg/creator](https://discord.gg/creator)
- **Twitter:** [@CreatorCoinIO](https://twitter.com/CreatorCoinIO)

---

<p align="center">
  <strong>Ready to integrate Scale AMM?</strong><br/>
  <code>npm install @scale-amm/sdk</code>
</p>
