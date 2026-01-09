# Scale AMM SDK

**TypeScript SDK for integrating Scale AMM into your Solana applications**

Production-ready SDK with full TypeScript support, error handling, and event listeners.

---

## Installation

```bash
npm install @scale-amm/sdk @solana/web3.js @coral-xyz/anchor
```

**Requirements:**
- Node.js 18+
- @solana/web3.js ^1.87.0
- @coral-xyz/anchor ^0.30.1

---

## Quick Start

```typescript
import { ScaleAMM } from '@scale-amm/sdk';
import { Connection, Keypair } from '@solana/web3.js';

// Initialize SDK
const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.fromSecretKey(yourPrivateKey);
const scale = new ScaleAMM(connection, wallet);

// Create a pool
const pool = await scale.createPool({
  baseMint: tokenMint,
  supply: 1_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 40_000,
});

// Trade
await scale.buy(pool.address, { crxAmount: 100, slippage: 1.0 });
await scale.sell(pool.address, { tokenAmount: 5000, slippage: 1.0 });
```

---

## API

### Protocol

#### `initialize(config)`
Initialize Scale AMM protocol (one-time, admin only).

**Parameters:**
```typescript
{
  crxMint: PublicKey,
  crxPriceOracle: PublicKey,
  feeRecipient: PublicKey,
  initialCrxPriceUsd: number,
}
```

---

#### `getConfig()`
Get protocol configuration.

**Returns:**
```typescript
{
  authority: PublicKey,
  crxMint: PublicKey,
  feeRecipient: PublicKey,
  crxPriceUsd: number,
  protocolFeeBps: number,         // Current protocol fee (0-1000 bps)
}
```

---

### Admin Operations (Authority Only)

#### `updateProtocolFee(newProtocolFeeBps)`
Update global protocol fee applied to all pools (authority only).

**Parameters:**
- `newProtocolFeeBps` (number): Fee in basis points (0-1000 = 0-10%)

**Returns:** `Promise<string>` (transaction signature)

**Example:**
```typescript
// Enable 0.1% protocol fee
await scale.updateProtocolFee(10);

// Disable protocol fee
await scale.updateProtocolFee(0);

// Set 1% protocol fee
await scale.updateProtocolFee(100);
```

**Notes:**
- Retroactive - affects all existing pools immediately
- Only callable by protocol authority
- Fees go to `config.feeRecipient` for CRX deflation/treasury

---

#### `updateCrxPrice(newPriceUsd)`
Update CRX price in USD (authority only).

**Parameters:**
- `newPriceUsd` (number): New price (e.g., 2.15 for $2.15)

**Example:**
```typescript
await scale.updateCrxPrice(2.15);
```

---

#### `updatePoolGraduation(poolAddress, newGraduationThresholdUsd)`
Update pool graduation threshold (authority only).

**Parameters:**
- `poolAddress` (PublicKey): Pool to update
- `newGraduationThresholdUsd` (number): New threshold in USD

**Example:**
```typescript
await scale.updatePoolGraduation(poolAddress, 50_000);
```

---

#### `updateApprovedQuotes(tokens)`
Update approved quote token whitelist (authority only).

**Parameters:**
- `tokens` (PublicKey[]): Array of approved quote token mints (max 5)

**Example:**
```typescript
await scale.updateApprovedQuotes([solMint, usdcMint, usdtMint]);
```

---

### Pool Operations

#### `createPool(params)`
Create new bonding curve pool.

**Parameters:**
```typescript
{
  baseMint: PublicKey,
  supply: number,
  initialMarketCapUsd: number,
  graduationThresholdUsd: number,
  feeBps?: number,                  // 0, 25, or 100 (default: 0)
  curveType?: 'ConstantProduct' | 'Exponential',
  disableWaa?: boolean,
}
```

**Returns:** `Promise<PoolInfo>`

**Example:**
```typescript
const pool = await scale.createPool({
  baseMint: tokenMint,
  supply: 1_000_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 40_000,
  feeBps: 100,
  curveType: 'ConstantProduct',
  disableWaa: false,
});
```

---

#### `getPool(baseMint)`
Query pool state by token mint.

**Returns:**
```typescript
{
  address: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  creator: PublicKey,
  phase: 'PreBonding' | 'Graduated',
  curveType: 'ConstantProduct' | 'Exponential',
  price: number,
  marketCapUsd: number,
  liquidityCrx: number,
  liquidityTokens: number,
  graduationProgress: number,
  feeBps: number,
  disableWaa: boolean,
}
```

---

#### `getAllPools(limit?, offset?)`
Get all pools with pagination.

**Parameters:**
- `limit` (optional): Max pools to fetch (default: 100)
- `offset` (optional): Skip first N pools (default: 0)

**Returns:** `Promise<PoolInfo[]>`

---

#### `getPoolsByCreator(creator)`
Get all pools created by a specific address.

**Parameters:**
- `creator`: Creator's public key

**Returns:** `Promise<PoolInfo[]>`

---

#### `getPrice(pool)`
Get current pool price (CRX per token).

**Returns:** `Promise<number>`

---

### Trading

#### `buy(pool, params)`
Buy tokens with CRX.

**Parameters:**
```typescript
{
  crxAmount: number,
  slippage: number,    // Max slippage % (e.g., 1.0 = 1%)
}
```

**Returns:**
```typescript
{
  signature: string,
  fee: number,
  newPrice: number,
  priceImpact: number,
}
```

**Example:**
```typescript
const result = await scale.buy(pool.address, {
  crxAmount: 100,
  slippage: 1.0,
});

console.log('Transaction:', result.signature);
console.log('Price after trade:', result.newPrice);
```

---

#### `sell(pool, params)`
Sell tokens for CRX.

**Parameters:**
```typescript
{
  tokenAmount: number,
  slippage: number,
}
```

**Returns:** `Promise<TradeResult>`

---

#### `estimateBuy(pool, crxAmount)`
Estimate buy without executing.

**Returns:**
```typescript
{
  output: number,        // Tokens received
  priceImpact: number,   // Impact %
  fee: number,           // Fee in CRX
}
```

**Example:**
```typescript
const estimate = await scale.estimateBuy(pool.address, 100);

console.log('You will receive:', estimate.output, 'tokens');
console.log('Price impact:', estimate.priceImpact + '%');

// Execute if acceptable
if (estimate.priceImpact < 5) {
  await scale.buy(pool.address, { crxAmount: 100, slippage: 1.0 });
}
```

---

#### `estimateSell(pool, tokenAmount)`
Estimate sell without executing.

**Returns:** `Promise<EstimateResult>`

---

### User Data

#### `getUserPosition(user, pool)`
Get user's weighted average age (WAA) position and fee state.

**Returns:**
```typescript
{
  pool: PublicKey,
  user: PublicKey,
  avgEntrySlot: number,
  trackedAmount: number,
  currentSellFeeBps: number,   // Current sell fee (0-3000 bps)
}
```

**Example:**
```typescript
const position = await scale.getUserPosition(wallet.publicKey, pool.address);

console.log('Average entry slot:', position.avgEntrySlot);
console.log('Current sell fee:', position.currentSellFeeBps / 100 + '%');
```

---

### Events

#### `onTrade(pool, callback)`
Listen for trades on a pool.

**Example:**
```typescript
const listenerId = scale.onTrade(pool.address, (event) => {
  console.log('Trade:', event.isBuy ? 'BUY' : 'SELL');
  console.log('User:', event.user.toBase58());
  console.log('Amount:', event.isBuy ? event.crxAmount : event.tokenAmount);
  console.log('New price:', event.newPrice);
});

// Stop listening
scale.removeListener(listenerId);
```

---

#### `onGraduation(pool, callback)`
Listen for pool graduation events.

**Example:**
```typescript
scale.onGraduation(pool.address, (event) => {
  console.log('Pool graduated!');
  console.log('Slot:', event.slot);
  console.log('Final CRX:', event.finalCrxReserves);
});
```

---

#### `onConfigInitialized(callback)`
Listen for protocol initialization (one-time event).

---

#### `onPhaseTransition(pool, callback)`
Listen for phase changes (PreBonding → Graduated).

---

#### `removeListener(id)`
Remove event listener by ID.

---

### Utilities

#### `ScaleUtils`
Helper functions for conversions, PDA derivation, and formatting.

**Methods:**
- `derivePda(seeds, programId)` - Derive program-derived address
- `calculateVirtualReserves(marketCap, supply, crxPrice)` - Calculate virtual reserves
- `formatAmount(amount, decimals)` - Format token amount
- `parseAmount(amount, decimals)` - Parse human-readable amount

**Example:**
```typescript
import { ScaleUtils } from '@scale-amm/sdk';

const [poolPda, bump] = ScaleUtils.derivePda(
  ['pool', tokenMint.toBuffer()],
  programId
);

const formatted = ScaleUtils.formatAmount(1_000_000_000, 9);
// Returns: "1.000000000"
```

---

#### `FeeSponsor`
Gasless transaction sponsorship for improved UX.

**Example:**
```typescript
import { FeeSponsor } from '@scale-amm/sdk';

const sponsor = new FeeSponsor(connection, sponsorWallet);

// Sponsor a transaction
const tx = await scale.buy(pool.address, {
  crxAmount: 100,
  slippage: 1.0,
});

await sponsor.sponsorTransaction(tx, userWallet);
```

---

## Error Handling

The SDK throws typed `ScaleError` instances:

```typescript
import { ScaleError, isScaleError, getErrorAction } from '@scale-amm/sdk';

try {
  await scale.buy(pool, { crxAmount: 100, slippage: 1.0 });
} catch (error) {
  if (isScaleError(error)) {
    console.error('Error code:', error.code);
    console.error('Message:', error.message);

    // Get suggested action
    const action = getErrorAction(error.code);
    console.log('Suggested action:', action);
  }
}
```

**Common Error Codes:**
- `SLIPPAGE_EXCEEDED` - Price moved beyond tolerance
- `INSUFFICIENT_BALANCE` - Not enough tokens/CRX
- `POOL_NOT_FOUND` - Pool doesn't exist
- `INVALID_AMOUNT` - Amount must be > 0
- `INSUFFICIENT_LIQUIDITY` - Not enough liquidity
- `GRADUATION_PRICE_JUMP_TOO_LARGE` - Price discontinuity at graduation

---

## TypeScript Support

Full TypeScript support with complete type definitions:

```typescript
import {
  ScaleAMM,
  PoolInfo,
  TradeResult,
  EstimateResult,
  CreatePoolParams,
  BuyParams,
  SellParams,
  ScaleError,
  ErrorCode,
} from '@scale-amm/sdk';
```

---

## Advanced Usage

### Custom RPC Configuration

```typescript
import { Connection } from '@solana/web3.js';

const connection = new Connection('https://your-rpc.com', {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 60000,
});

const scale = new ScaleAMM(connection, wallet);
```

### Batch Operations

```typescript
// Create multiple pools in parallel
const pools = await Promise.all([
  scale.createPool({ ...params1 }),
  scale.createPool({ ...params2 }),
  scale.createPool({ ...params3 }),
]);
```

### Event Filtering

```typescript
// Listen for large trades only
scale.onTrade(pool.address, (event) => {
  const tradeSize = event.isBuy ? event.crxAmount : event.tokenAmount;

  if (tradeSize > 1000) {
    console.log('Large trade detected:', tradeSize);
  }
});
```

### Price Monitoring

```typescript
// Monitor price changes
let lastPrice = 0;

setInterval(async () => {
  const pool = await scale.getPool(poolAddress);

  if (pool.price !== lastPrice) {
    const change = ((pool.price - lastPrice) / lastPrice * 100).toFixed(2);
    console.log(`Price changed: ${change}%`);
    lastPrice = pool.price;
  }
}, 10000);  // Check every 10 seconds
```

---

## Testing

```bash
npm test
```

See [main README](../README.md) for complete testing documentation.

---

## Support

**Documentation:** [docs.creator.so](https://docs.creator.so)
**Issues:** [GitHub Issues](https://github.com/georgeklein/Scale-AMM/issues)
**Discord:** [Creator Community](https://discord.gg/creator)

---

## License

Apache-2.0

---

**Built for [Creator](https://www.creator.so) · Powered by $CRX**
