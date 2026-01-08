# Scale AMM TypeScript SDK

**Integrate Scale AMM in <10 lines of code.**

Dead-simple SDK for creating bonding curve pools, trading tokens, and building DeFi apps on Solana.

## Features

- **Zero boilerplate** - No PDA math, account lookups, or ATA management
- **Human-readable** - Use USD and token amounts, not micro-USD and lamports
- **Type-safe** - Full TypeScript support with autocomplete
- **Error-friendly** - Clear error messages, not cryptic Anchor codes
- **Real-time** - Event listeners for trades and graduations
- **Battle-tested** - Production-ready with comprehensive test coverage

## Installation

```bash
npm install @scale-amm/sdk
# or
yarn add @scale-amm/sdk
```

## Quick Start

### 1. Buy Tokens (6 lines)

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { ScaleAMM } from '@scale-amm/sdk';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.fromSecretKey(yourSecret);
const scale = new ScaleAMM(connection, wallet);

const result = await scale.buy(poolAddress, {
  crxAmount: 100,      // Spend 100 CRX
  slippage: 1.0,       // 1% slippage tolerance
});

console.log('Bought:', result.tokensReceived, 'tokens');
```

### 2. Create Pool (7 lines)

```typescript
import { ScaleAMM } from '@scale-amm/sdk';

const scale = new ScaleAMM(connection, creatorWallet);

const pool = await scale.createPool({
  baseMint: myTokenMint,
  supply: 1_000_000,                    // 1M tokens
  initialMarketCapUsd: 10_000,          // Launch at $10k
  graduationThresholdUsd: 40_000,       // Graduate at $40k
});

console.log('Pool created:', pool.address);
console.log('Trade now:', pool.url);
```

### 3. Query Pool Info (4 lines)

```typescript
const pool = await scale.getPool(tokenMint);

console.log('Price:', pool.price, 'CRX per token');
console.log('Market Cap:', pool.marketCapUsd, 'USD');
console.log('Phase:', pool.phase); // 'PreBonding' or 'Graduated'
```

### 4. Listen to Events (8 lines)

```typescript
const listener = scale.onTrade(poolAddress, (trade) => {
  console.log(`${trade.isBuy ? 'BUY' : 'SELL'}:`, trade.amount);
  console.log('Price:', trade.price);
  console.log('MC:', trade.marketCapUsd);
});

scale.onGraduation(poolAddress, (event) => {
  console.log('🎉 Pool graduated at', event.marketCapUsd, 'USD');
});

// Cleanup
await scale.removeListener(listener);
```

## API Reference

### ScaleAMM Class

Main SDK class for all operations.

```typescript
class ScaleAMM {
  constructor(connection: Connection, wallet: Wallet, programId?: PublicKey);

  // Protocol setup (admin only, one-time)
  initialize(config: InitializeConfig): Promise<string>;
  updateApprovedQuotes(tokens: PublicKey[]): Promise<string>;

  // Creator operations
  createPool(params: CreatePoolParams): Promise<PoolInfo>;

  // Trader operations
  buy(pool: PublicKey, params: BuyParams): Promise<TradeResult>;
  sell(pool: PublicKey, params: SellParams): Promise<TradeResult>;

  // Query operations (no transactions)
  getPool(baseMint: PublicKey): Promise<PoolInfo>;
  getPrice(pool: PublicKey): Promise<PriceInfo>;
  estimateBuy(pool: PublicKey, crxAmount: number): Promise<EstimateResult>;
  estimateSell(pool: PublicKey, tokenAmount: number): Promise<EstimateResult>;

  // Event listening
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

  // Calculations
  static calculatePriceImpact(oldPrice: number, newPrice: number): number;
  static applySlippage(expectedOutput: number, slippageBps: number): number;
  static calculateConstantProductOutput(input: number, inputReserve: number, outputReserve: number): number;

  // Formatting
  static formatPrice(price: number): string;
  static formatMarketCap(marketCapUsd: number): string;
  static formatAmount(amount: number, symbol: string): string;

  // URLs
  static getPoolUrl(pool: PublicKey, network?: 'mainnet' | 'devnet'): string;
  static getExplorerUrl(signature: string, network?: 'mainnet' | 'devnet'): string;

  // Utilities
  static sleep(ms: number): Promise<void>;
  static retry<T>(fn: () => Promise<T>, maxRetries?: number, delayMs?: number): Promise<T>;
}
```

## Error Handling

All operations throw `ScaleError` with friendly messages:

```typescript
import { ScaleError, isScaleError } from '@scale-amm/sdk';

try {
  await scale.buy(poolAddress, { crxAmount: 100 });
} catch (error) {
  if (error instanceof ScaleError) {
    console.error('Error:', error.code, '-', error.message);

    switch (error.code) {
      case 'SLIPPAGE_EXCEEDED':
        // Retry with higher slippage
        break;
      case 'INSUFFICIENT_BALANCE':
        // Add more tokens
        break;
      case 'ANTI_SNIPER_ACTIVE':
        // Wait or reduce trade size
        break;
    }
  }
}
```

**Common error codes:**

- `SLIPPAGE_EXCEEDED` - Price moved beyond tolerance
- `INSUFFICIENT_BALANCE` - Not enough tokens/CRX
- `ANTI_SNIPER_ACTIVE` - Trade too large in first ~20 slots
- `POOL_NOT_FOUND` - Pool doesn't exist
- `INVALID_FEE` - Fee not 0, 25, or 100 bps
- `MINT_AUTHORITY_NOT_REVOKED` - Token mint not frozen
- `QUOTE_TOKEN_NOT_APPROVED` - Quote token not whitelisted
- `OUTPUT_TOO_SMALL` - Trade amount too small

## Types

### CreatePoolParams

```typescript
interface CreatePoolParams {
  baseMint: PublicKey;           // Your token mint
  supply: number;                // Token supply (human-readable)
  initialMarketCapUsd: number;   // Launch MC in USD
  graduationThresholdUsd: number;// Graduate at X USD

  // Optional
  feeBps?: number;               // 0, 25, or 100 (default: 0)
  curveType?: 'ConstantProduct' | 'Exponential'; // default: ConstantProduct
}
```

### BuyParams

```typescript
interface BuyParams {
  crxAmount: number;    // CRX to spend
  slippage?: number;    // % slippage (default: 0.5)
  minTokens?: number;   // Alternative to slippage
}
```

### SellParams

```typescript
interface SellParams {
  tokenAmount: number;  // Tokens to sell
  slippage?: number;    // % slippage (default: 0.5)
  minCrx?: number;      // Alternative to slippage
}
```

### PoolInfo

```typescript
interface PoolInfo {
  address: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  creator: PublicKey;

  phase: 'PreBonding' | 'Graduated';
  curveType: 'ConstantProduct' | 'Exponential';

  price: number;                // CRX per token
  marketCapUsd: number;         // Current MC in USD
  liquidityCrx: number;         // CRX in pool
  liquidityTokens: number;      // Tokens in pool

  volumeCrx: number;            // Total volume
  feeBps: number;               // Current fee

  graduationProgress: number;   // % progress (0-100)
  createdAt: Date;
  url: string;                  // Frontend URL
}
```

### TradeResult

```typescript
interface TradeResult {
  signature: string;

  crxSpent?: number;        // For buys
  tokensReceived?: number;  // For buys
  tokensSold?: number;      // For sells
  crxReceived?: number;     // For sells

  fee: number;              // Fee paid
  newPrice: number;         // Price after trade
  priceImpact: number;      // % price change

  graduated?: boolean;      // Did pool graduate?
}
```

## Examples

See [examples.ts](./examples.ts) for 15 complete examples:

1. Initialize protocol (admin)
2. Create pool (basic)
3. Create pool (advanced)
4. Buy tokens
5. Sell tokens
6. Query pool info
7. Estimate trades
8. Listen to events
9. Error handling
10. Complete trading bot (10 lines)
11. DEX aggregator integration (6 lines)
12. Analytics dashboard (4 lines)
13. Portfolio tracker
14. Sniper bot with anti-sniper check
15. Price alerts

## Use Cases

### Trading Bots

```typescript
const pool = await scale.getPool(tokenMint);
const estimate = await scale.estimateBuy(pool.address, 100);

if (estimate.priceImpact < 5) {
  await scale.buy(pool.address, { crxAmount: 100, slippage: 1.0 });
}
```

### DEX Aggregators

```typescript
const quote = await scale.estimateBuy(poolAddress, 100);

if (quote.output > bestQuote) {
  await scale.buy(poolAddress, { crxAmount: 100 });
}
```

### Analytics Dashboards

```typescript
const pools = await Promise.all(
  tokens.map(token => scale.getPool(token))
);

const topPools = pools.sort((a, b) => b.volumeCrx - a.volumeCrx);
```

### Portfolio Trackers

```typescript
for (const holding of portfolio) {
  const pool = await scale.getPool(holding.mint);
  const value = holding.amount * pool.price;
  console.log('Value:', value, 'CRX');
}
```

## Documentation

- [Examples](./examples.ts) - Complete code examples
- [Protocol Documentation](../README.md) - Scale AMM protocol overview
- [Architecture](../ARCHITECTURE.md) - Technical architecture
- [Security](../SECURITY.md) - Security considerations

## Support

- **GitHub:** https://github.com/georgeklein/Scale-AMM

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

**Built with Scale AMM SDK - Integrate in <10 lines of code.**
