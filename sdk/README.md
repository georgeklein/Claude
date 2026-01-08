# Scale AMM SDK

**The easiest way to integrate bonding curves into your Solana app**

```typescript
// Three lines to launch a token
const pool = await scale.createPool({
  supply: 1_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 85_000
});
```

---

## Installation

```bash
npm install @scale-amm/sdk @solana/web3.js
```

**Requirements:**
- Node.js 16+
- @solana/web3.js ^1.87.0

---

## Quick Start

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { ScaleAMM } from '@scale-amm/sdk';

// Initialize
const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.fromSecretKey(yourSecretKey);
const scale = new ScaleAMM(connection, wallet);

// Create pool
const pool = await scale.createPool({
  baseMint: myTokenMint,
  supply: 1_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 85_000,
});

// Buy tokens
await scale.buy(pool.address, {
  crxAmount: 100,
  slippage: 1.0,
});

// Sell tokens
await scale.sell(pool.address, {
  tokenAmount: 5000,
  slippage: 1.0,
});
```

---

## API Reference

### `ScaleAMM`

Main SDK class.

**Constructor:**
```typescript
constructor(
  connection: Connection,
  wallet: Wallet,
  programId?: PublicKey  // optional, defaults to mainnet
)
```

---

### Pool Operations

#### `createPool(params: CreatePoolParams): Promise<PoolInfo>`

Create a new bonding curve pool.

**Parameters:**
```typescript
interface CreatePoolParams {
  baseMint: PublicKey;                  // Your SPL token
  supply: number;                        // Total supply to bond
  initialMarketCapUsd: number;           // Launch market cap in USD
  graduationThresholdUsd: number;        // Graduation threshold in USD
  creatorFeeBps?: number;                // Fee: 0, 25, or 100 bps (default: 0)
  curveType?: 'ConstantProduct' | 'Exponential';  // default: ConstantProduct
}
```

**Returns:**
```typescript
interface PoolInfo {
  address: PublicKey;
  baseMint: PublicKey;
  phase: 'PreBonding' | 'Graduated';
  price: number;                        // CRX per token
  marketCapUsd: number;
  liquidityCrx: number;
  liquidityTokens: number;
  graduationProgress: number;           // 0.0 - 1.0
}
```

---

#### `getPool(baseMint: PublicKey): Promise<PoolInfo>`

Query current pool state.

---

### Trading Operations

#### `buy(pool: PublicKey, params: BuyParams): Promise<TradeResult>`

Buy tokens with CRX.

**Parameters:**
```typescript
interface BuyParams {
  crxAmount: number;
  slippage?: number;    // % tolerance (default: 0.5)
  minTokens?: number;
}
```

**Returns:**
```typescript
interface TradeResult {
  signature: string;
  crxSpent: number;
  tokensReceived: number;
  fee: number;
  newPrice: number;
  priceImpact: number;  // %
  graduated: boolean;
}
```

---

#### `sell(pool: PublicKey, params: SellParams): Promise<TradeResult>`

Sell tokens for CRX.

**Parameters:**
```typescript
interface SellParams {
  tokenAmount: number;
  slippage?: number;    // % tolerance (default: 0.5)
  minCrx?: number;
}
```

**Note:** Selling in first 100 slots incurs WAA penalties (up to 10% extra fee).

---

### Estimation

#### `estimateBuy(pool: PublicKey, crxAmount: number): Promise<EstimateResult>`

Estimate buy without executing. Zero cost.

**Returns:**
```typescript
interface EstimateResult {
  tokensReceived: number;
  priceImpact: number;
  fee: number;
  newPrice: number;
}
```

---

#### `estimateSell(pool: PublicKey, tokenAmount: number): Promise<EstimateResult>`

Estimate sell without executing.

---

### Event Listeners

#### `onTrade(pool: PublicKey, callback: (event: TradeEvent) => void): number`

Listen for trades on a pool. Returns listener ID.

```typescript
interface TradeEvent {
  pool: PublicKey;
  user: PublicKey;
  direction: 'buy' | 'sell';
  crxAmount: number;
  tokenAmount: number;
  price: number;
  timestamp: number;
}
```

**Example:**
```typescript
const listenerId = scale.onTrade(poolAddress, (trade) => {
  console.log(`${trade.direction}: ${trade.tokenAmount} tokens`);
});

// Remove listener
await scale.removeListener(listenerId);
```

---

#### `onGraduation(pool: PublicKey, callback: (event: GraduationEvent) => void): number`

Listen for pool graduation.

```typescript
interface GraduationEvent {
  pool: PublicKey;
  marketCapUsd: number;
  totalCrxLocked: number;
  totalTrades: number;
  timestamp: number;
}
```

---

### Utilities: `ScaleUtils`

#### Conversions

```typescript
ScaleUtils.usdToMicroUsd(100)           // → 100000000
ScaleUtils.microUsdToUsd(100000000)     // → 100
ScaleUtils.toLamports(100, 9)           // → 100000000000n
ScaleUtils.fromLamports(100000000000n, 9)  // → 100
```

#### PDA Derivation

```typescript
ScaleUtils.findPoolAddress(tokenMint)
ScaleUtils.findConfigAddress()
```

#### Formatting

```typescript
ScaleUtils.formatPrice(0.00123)         // → "0.00123 CRX"
ScaleUtils.formatMarketCap(10000)       // → "$10,000"
ScaleUtils.formatAmount(1000000, 'TOKEN')  // → "1,000,000 TOKEN"
```

---

## Error Handling

```typescript
import { ScaleError, ErrorCode } from '@scale-amm/sdk';

try {
  await scale.buy(poolAddress, { crxAmount: 100 });
} catch (error) {
  if (error instanceof ScaleError) {
    console.error('Error:', error.code, '-', error.message);
  }
}
```

**Common Errors:**
- `SLIPPAGE_EXCEEDED` - Price moved beyond tolerance
- `INSUFFICIENT_BALANCE` - Not enough tokens/CRX
- `ANTI_SNIPER_ACTIVE` - Trade too large during launch
- `POOL_NOT_FOUND` - Pool doesn't exist

---

## Advanced Usage

### Concurrent Trading

```typescript
const results = await Promise.allSettled([
  scale.buy(pool1, { crxAmount: 50 }),
  scale.buy(pool2, { crxAmount: 100 }),
  scale.buy(pool3, { crxAmount: 75 }),
]);
```

### Auto-Buy on Price Dip

```typescript
const targetPrice = 0.01;

scale.onTrade(poolAddress, async (trade) => {
  const pool = await scale.getPool(poolAddress);
  if (pool.price <= targetPrice && trade.direction === 'sell') {
    await scale.buy(poolAddress, { crxAmount: 100 });
  }
});
```

---

## Examples

See [examples.ts](./examples.ts) for complete examples:
- Create pool
- Buy/sell tokens
- Query pool info
- Estimate trades
- Event listeners

Run examples:
```bash
ts-node sdk/examples.ts create-pool
ts-node sdk/examples.ts buy --pool=<address> --amount=100
```

---

## License

MIT
