# Scale AMM TypeScript SDK

Dead-simple SDK for creating bonding curve pools and trading tokens on Solana.

## Installation

```bash
npm install @scale-amm/sdk
# or
yarn add @scale-amm/sdk
```

## Quick Start

### Buy Tokens

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { ScaleAMM } from '@scale-amm/sdk';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.fromSecretKey(yourSecret);
const scale = new ScaleAMM(connection, wallet);

const result = await scale.buy(poolAddress, {
  crxAmount: 100,
  slippage: 1.0,
});

console.log('Bought:', result.tokensReceived, 'tokens');
```

### Create Pool

```typescript
const pool = await scale.createPool({
  baseMint: myTokenMint,
  supply: 1_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 40_000,
});

console.log('Pool created:', pool.address);
```

### Query Pool

```typescript
const pool = await scale.getPool(tokenMint);

console.log('Price:', pool.price, 'CRX per token');
console.log('Market Cap:', pool.marketCapUsd, 'USD');
console.log('Phase:', pool.phase);
```

## API Reference

### ScaleAMM

Main SDK class for all operations.

```typescript
class ScaleAMM {
  constructor(connection: Connection, wallet: Wallet, programId?: PublicKey);

  // Pool operations
  createPool(params: CreatePoolParams): Promise<PoolInfo>;
  getPool(baseMint: PublicKey): Promise<PoolInfo>;

  // Trading
  buy(pool: PublicKey, params: BuyParams): Promise<TradeResult>;
  sell(pool: PublicKey, params: SellParams): Promise<TradeResult>;

  // Estimates (no transactions)
  estimateBuy(pool: PublicKey, crxAmount: number): Promise<EstimateResult>;
  estimateSell(pool: PublicKey, tokenAmount: number): Promise<EstimateResult>;

  // Events
  onTrade(pool: PublicKey, callback: (trade: TradeEvent) => void): number;
  onGraduation(pool: PublicKey, callback: (event: GraduationEvent) => void): number;
  removeListener(listenerId: number): Promise<void>;
}
```

### ScaleUtils

Helper utilities for common operations.

```typescript
class ScaleUtils {
  // Conversions
  static usdToMicroUsd(usd: number): number;
  static microUsdToUsd(microUsd: number): number;
  static toLamports(amount: number, decimals: number): bigint;
  static fromLamports(lamports: bigint, decimals: number): number;

  // PDA derivation
  static findPoolAddress(baseMint: PublicKey, programId?: PublicKey): PublicKey;
  static findConfigAddress(programId?: PublicKey): PublicKey;

  // Formatting
  static formatPrice(price: number): string;
  static formatMarketCap(marketCapUsd: number): string;
  static formatAmount(amount: number, symbol: string): string;

  // Utilities
  static sleep(ms: number): Promise<void>;
  static retry<T>(fn: () => Promise<T>, maxRetries?: number): Promise<T>;
}
```

## Types

### CreatePoolParams

```typescript
interface CreatePoolParams {
  baseMint: PublicKey;
  supply: number;
  initialMarketCapUsd: number;
  graduationThresholdUsd: number;
  feeBps?: number;                               // 0, 25, or 100 (default: 0)
  curveType?: 'ConstantProduct' | 'Exponential'; // default: ConstantProduct
}
```

### BuyParams / SellParams

```typescript
interface BuyParams {
  crxAmount: number;
  slippage?: number;    // % slippage (default: 0.5)
  minTokens?: number;
}

interface SellParams {
  tokenAmount: number;
  slippage?: number;    // % slippage (default: 0.5)
  minCrx?: number;
}
```

### PoolInfo

```typescript
interface PoolInfo {
  address: PublicKey;
  baseMint: PublicKey;
  phase: 'PreBonding' | 'Graduated';
  price: number;
  marketCapUsd: number;
  liquidityCrx: number;
  liquidityTokens: number;
  graduationProgress: number;
  url: string;
}
```

### TradeResult

```typescript
interface TradeResult {
  signature: string;
  crxSpent?: number;
  tokensReceived?: number;
  tokensSold?: number;
  crxReceived?: number;
  fee: number;
  newPrice: number;
  priceImpact: number;
  graduated?: boolean;
}
```

## Error Handling

All operations throw `ScaleError` with friendly messages:

```typescript
import { ScaleError } from '@scale-amm/sdk';

try {
  await scale.buy(poolAddress, { crxAmount: 100 });
} catch (error) {
  if (error instanceof ScaleError) {
    console.error('Error:', error.code, '-', error.message);
  }
}
```

**Common error codes:**
- `SLIPPAGE_EXCEEDED` - Price moved beyond tolerance
- `INSUFFICIENT_BALANCE` - Not enough tokens/CRX
- `ANTI_SNIPER_ACTIVE` - Trade too large in first ~20 slots
- `POOL_NOT_FOUND` - Pool doesn't exist
- `INVALID_FEE` - Fee not 0, 25, or 100 bps

## Examples

See [examples.ts](./examples.ts) for complete examples including:
- Create pool
- Buy/sell tokens
- Query pool info
- Estimate trades
- Event listeners
- Trading bot

## License

MIT License
