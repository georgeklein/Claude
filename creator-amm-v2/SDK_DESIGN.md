# Scale AMM TypeScript SDK Design

**Goal:** 3rd parties can integrate in <10 lines of code

## 🎯 Core Principle: ZERO COMPLEXITY EXPOSED

The SDK hides:
- PDA derivations
- Account lookups
- Token account management
- Parameter conversions
- Oracle interactions
- Transaction building

Users only provide:
- Wallet
- Token addresses
- Amounts
- Slippage tolerance

---

## 📦 SDK Class Structure

```typescript
// Main SDK class
class ScaleAMM {
  constructor(connection: Connection, wallet: Wallet, programId?: PublicKey)

  // Protocol setup (one-time, admin only)
  initialize(config: InitializeConfig): Promise<string>
  updateApprovedQuotes(tokens: PublicKey[]): Promise<string>

  // Creator operations
  createPool(params: CreatePoolParams): Promise<PoolInfo>

  // Trader operations
  buy(pool: PublicKey, params: BuyParams): Promise<TradeResult>
  sell(pool: PublicKey, params: SellParams): Promise<TradeResult>

  // Query operations (no transactions)
  getPool(baseMint: PublicKey): Promise<PoolInfo>
  getPrice(pool: PublicKey): Promise<PriceInfo>
  estimateBuy(pool: PublicKey, crxAmount: number): Promise<EstimateResult>
  estimateSell(pool: PublicKey, tokenAmount: number): Promise<EstimateResult>

  // Event listening
  onTrade(pool: PublicKey, callback: (trade: TradeEvent) => void): number
  onGraduation(pool: PublicKey, callback: (event: GraduationEvent) => void): number
  removeListener(listenerId: number): void
}

// Helper utilities (exported separately)
class ScaleUtils {
  static findPoolAddress(baseMint: PublicKey, programId: PublicKey): PublicKey
  static usdToMicroUsd(usd: number): number // Convert $10,000 → 10_000_000_000
  static microUsdToUsd(microUsd: number): number // Convert 10_000_000_000 → $10,000
}
```

---

## 🚀 Example 1: Initialize Protocol (One-Time, Admin Only)

**5 lines of code**

```typescript
import { ScaleAMM } from '@scale-amm/sdk';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.fromSecretKey(adminSecret);
const scale = new ScaleAMM(connection, wallet);

// Initialize with sensible defaults
await scale.initialize({
  crxMint: new PublicKey('CRX_MINT_ADDRESS'),
  crxPriceOracle: new PublicKey('PYTH_ORACLE_ADDRESS'),
  feeRecipient: wallet.publicKey,
});

console.log('✅ Scale AMM initialized!');
```

**With custom config:**

```typescript
await scale.initialize({
  crxMint: new PublicKey('CRX_MINT_ADDRESS'),
  crxPriceOracle: new PublicKey('PYTH_ORACLE_ADDRESS'),
  feeRecipient: feeWallet.publicKey,

  // Optional: defaults provided
  preBondingFeeBps: 300,           // 3% (default)
  preBondingThresholdUsd: 40_000,  // $40k (default)
  postBondingFeeBps: 100,          // 1% (default)
  graduationThresholdUsd: 85_000,  // $85k (default)
  antiSniperWindowSlots: 20,       // ~8 seconds (default)
  antiSniperMaxTradeBps: 500,      // 5% (default)
});
```

---

## 🎨 Example 2: Create Pool (Creators)

**7 lines of code**

```typescript
import { ScaleAMM } from '@scale-amm/sdk';

const scale = new ScaleAMM(connection, creatorWallet);

// Create pool with minimal config
const pool = await scale.createPool({
  baseMint: myTokenMint,                    // Your token
  supply: 1_000_000,                        // 1M tokens
  initialMarketCapUsd: 10_000,              // Launch at $10k
  graduationThresholdUsd: 40_000,           // Graduate at $40k
});

console.log('Pool created:', pool.address);
console.log('Initial price:', pool.initialPrice, 'CRX per token');
console.log('Trade now:', pool.url);
```

**With advanced options:**

```typescript
const pool = await scale.createPool({
  baseMint: myTokenMint,
  supply: 1_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 40_000,

  // Optional advanced settings
  feeBps: 25,                               // 0.25% fee (0, 25, or 100)
  curveType: 'Exponential',                 // 'ConstantProduct' (default) or 'Exponential'
});
```

---

## 💰 Example 3: Buy Tokens (Traders)

**6 lines of code**

```typescript
import { ScaleAMM } from '@scale-amm/sdk';

const scale = new ScaleAMM(connection, traderWallet);

// Buy tokens with CRX
const result = await scale.buy(poolAddress, {
  crxAmount: 100,      // Spend 100 CRX
  slippage: 1.0,       // 1% slippage tolerance (default: 0.5%)
});

console.log('Bought:', result.tokensReceived, 'tokens');
console.log('Paid:', result.crxSpent, 'CRX');
console.log('Fee:', result.fee, 'CRX');
console.log('New price:', result.newPrice, 'CRX per token');
```

**With manual slippage control:**

```typescript
// Option 1: Percentage slippage
await scale.buy(poolAddress, {
  crxAmount: 100,
  slippage: 2.0,  // 2% slippage
});

// Option 2: Minimum tokens (exact control)
await scale.buy(poolAddress, {
  crxAmount: 100,
  minTokens: 95,  // Must receive at least 95 tokens
});
```

---

## 💸 Example 4: Sell Tokens (Traders)

**6 lines of code**

```typescript
import { ScaleAMM } from '@scale-amm/sdk';

const scale = new ScaleAMM(connection, traderWallet);

// Sell tokens for CRX
const result = await scale.sell(poolAddress, {
  tokenAmount: 50,     // Sell 50 tokens
  slippage: 1.0,       // 1% slippage tolerance
});

console.log('Sold:', result.tokensSold, 'tokens');
console.log('Received:', result.crxReceived, 'CRX');
console.log('Fee:', result.fee, 'CRX');
console.log('New price:', result.newPrice, 'CRX per token');
```

---

## 📊 Example 5: Query Pool Info (No Transaction)

**4 lines of code**

```typescript
const scale = new ScaleAMM(connection, wallet);

// Get complete pool state
const pool = await scale.getPool(tokenMint);

console.log('Pool:', pool.address);
console.log('Phase:', pool.phase);              // 'PreBonding' or 'Graduated'
console.log('Price:', pool.price);              // CRX per token
console.log('Market Cap:', pool.marketCapUsd);  // Current MC in USD
console.log('Liquidity:', pool.liquidityCrx);   // CRX in pool
console.log('Volume:', pool.volumeCrx);         // Total volume
console.log('Progress:', pool.graduationProgress); // % to graduation
console.log('Fee:', pool.feeBps / 100, '%');    // Current fee
```

---

## 🔮 Example 6: Estimate Trade (Before Execution)

**5 lines of code**

```typescript
const scale = new ScaleAMM(connection, wallet);

// Estimate buy (no transaction)
const estimate = await scale.estimateBuy(poolAddress, 100); // 100 CRX

console.log('You will receive:', estimate.output, 'tokens');
console.log('Fee:', estimate.fee, 'CRX');
console.log('Price impact:', estimate.priceImpact, '%');
console.log('New price:', estimate.newPrice, 'CRX per token');
```

**Estimate sell:**

```typescript
const estimate = await scale.estimateSell(poolAddress, 50); // 50 tokens

console.log('You will receive:', estimate.output, 'CRX');
console.log('Fee:', estimate.fee, 'CRX');
console.log('Price impact:', estimate.priceImpact, '%');
```

---

## 🎧 Example 7: Listen to Events

**8 lines of code**

```typescript
const scale = new ScaleAMM(connection, wallet);

// Listen to all trades on a pool
const tradeListener = scale.onTrade(poolAddress, (trade) => {
  console.log(`${trade.isBuy ? 'BUY' : 'SELL'}:`, trade.amount, 'tokens');
  console.log('Price:', trade.price);
  console.log('Trader:', trade.trader);
});

// Listen for graduation
const gradListener = scale.onGraduation(poolAddress, (event) => {
  console.log('🎉 Pool graduated!');
  console.log('Final MC:', event.marketCapUsd);
  console.log('Slots to graduate:', event.slotsToGraduate);
});

// Cleanup when done
scale.removeListener(tradeListener);
scale.removeListener(gradListener);
```

---

## 🔧 Example 8: Helper Utilities

**Convert between USD formats:**

```typescript
import { ScaleUtils } from '@scale-amm/sdk';

// USD → micro-USD (6 decimals)
const microUsd = ScaleUtils.usdToMicroUsd(10_000); // 10_000_000_000

// micro-USD → USD
const usd = ScaleUtils.microUsdToUsd(10_000_000_000); // 10_000

// Find pool address (deterministic)
const poolAddress = ScaleUtils.findPoolAddress(
  tokenMint,
  new PublicKey('SCALE_AMM_PROGRAM_ID')
);
```

---

## 📝 Type Definitions

```typescript
// Configuration types
interface InitializeConfig {
  crxMint: PublicKey;
  crxPriceOracle: PublicKey;
  feeRecipient: PublicKey;

  // Optional with defaults
  preBondingFeeBps?: number;
  preBondingThresholdUsd?: number;
  postBondingFeeBps?: number;
  graduationThresholdUsd?: number;
  antiSniperWindowSlots?: number;
  antiSniperMaxTradeBps?: number;
}

interface CreatePoolParams {
  baseMint: PublicKey;
  supply: number;                    // Token supply (human-readable)
  initialMarketCapUsd: number;       // Launch MC in USD
  graduationThresholdUsd: number;    // Graduate at X USD

  // Optional
  feeBps?: number;                   // 0, 25, or 100 (default: 0)
  curveType?: 'ConstantProduct' | 'Exponential'; // default: ConstantProduct
}

// Trading types
interface BuyParams {
  crxAmount: number;      // CRX to spend
  slippage?: number;      // % slippage (default: 0.5)
  minTokens?: number;     // Alternative to slippage
}

interface SellParams {
  tokenAmount: number;    // Tokens to sell
  slippage?: number;      // % slippage (default: 0.5)
  minCrx?: number;        // Alternative to slippage
}

// Result types
interface PoolInfo {
  address: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  creator: PublicKey;

  phase: 'PreBonding' | 'Graduated';
  curveType: 'ConstantProduct' | 'Exponential';

  price: number;                  // CRX per token
  marketCapUsd: number;           // Current MC in USD
  liquidityCrx: number;           // CRX in pool
  liquidityTokens: number;        // Tokens in pool

  volumeCrx: number;              // Total volume
  feeBps: number;                 // Current fee

  graduationThresholdCrx: number; // CRX needed to graduate
  graduationProgress: number;     // % progress (0-100)

  initialPrice: number;           // Launch price
  targetMarketCapUsd: number;     // Initial target MC

  createdAt: Date;
  url: string;                    // Frontend URL to trade
}

interface TradeResult {
  signature: string;

  // Trade details
  crxSpent?: number;        // For buys
  tokensReceived?: number;  // For buys
  tokensSold?: number;      // For sells
  crxReceived?: number;     // For sells

  fee: number;              // Fee paid in CRX
  newPrice: number;         // Price after trade
  priceImpact: number;      // % price change

  // Phase transition (if occurred)
  graduated?: boolean;
  newPhase?: 'PreBonding' | 'Graduated';
}

interface EstimateResult {
  output: number;           // Tokens (buy) or CRX (sell)
  fee: number;              // Fee in CRX
  priceImpact: number;      // % change
  newPrice: number;         // Price after trade
}

interface PriceInfo {
  price: number;            // CRX per token
  marketCapUsd: number;     // Current MC
  liquidityCrx: number;     // CRX liquidity
  phase: 'PreBonding' | 'Graduated';
}

// Event types
interface TradeEvent {
  pool: PublicKey;
  trader: PublicKey;
  isBuy: boolean;
  amount: number;           // Tokens traded
  price: number;            // Price at trade
  marketCapUsd: number;     // MC after trade
  timestamp: Date;
  signature: string;
}

interface GraduationEvent {
  pool: PublicKey;
  baseMint: PublicKey;
  creator: PublicKey;

  crxAccumulated: number;
  marketCapUsd: number;
  finalPrice: number;

  totalVolume: number;
  totalFees: number;
  slotsToGraduate: number;

  timestamp: Date;
}
```

---

## ⚠️ Error Handling Pattern

The SDK wraps all Anchor errors into friendly messages:

```typescript
import { ScaleError } from '@scale-amm/sdk';

try {
  await scale.buy(poolAddress, { crxAmount: 100 });
} catch (error) {
  if (error instanceof ScaleError) {
    switch (error.code) {
      case 'SLIPPAGE_EXCEEDED':
        console.error('Price moved too much! Try increasing slippage.');
        break;
      case 'INSUFFICIENT_BALANCE':
        console.error('Not enough CRX in your wallet.');
        break;
      case 'ANTI_SNIPER_ACTIVE':
        console.error('Anti-sniper protection active. Trade size too large.');
        break;
      case 'POOL_NOT_FOUND':
        console.error('Pool does not exist for this token.');
        break;
      default:
        console.error('Trade failed:', error.message);
    }
  } else {
    console.error('Unexpected error:', error);
  }
}
```

**Common error codes:**
- `SLIPPAGE_EXCEEDED`: Price moved beyond tolerance
- `INSUFFICIENT_BALANCE`: Not enough tokens/CRX
- `ANTI_SNIPER_ACTIVE`: Trade too large in first ~20 slots
- `POOL_NOT_FOUND`: Pool doesn't exist
- `INVALID_FEE`: Fee not 0, 25, or 100 bps
- `MINT_AUTHORITY_NOT_REVOKED`: Token mint not frozen
- `QUOTE_TOKEN_NOT_APPROVED`: Quote token not whitelisted
- `OUTPUT_TOO_SMALL`: Trade amount too small (dust)

---

## 🎁 Complete Integration Example (10 Lines)

**Full trader integration:**

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { ScaleAMM } from '@scale-amm/sdk';

// Setup
const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.fromSecretKey(yourSecret);
const scale = new ScaleAMM(connection, wallet);

// Get pool info
const pool = await scale.getPool(tokenMint);
console.log('Price:', pool.price, 'CRX | MC:', pool.marketCapUsd, 'USD');

// Estimate trade
const estimate = await scale.estimateBuy(pool.address, 100);
console.log('Will receive:', estimate.output, 'tokens');

// Execute trade
const result = await scale.buy(pool.address, { crxAmount: 100, slippage: 1.0 });
console.log('✅ Bought', result.tokensReceived, 'tokens for', result.crxSpent, 'CRX');

// Listen for events
scale.onTrade(pool.address, (trade) => {
  console.log(`New ${trade.isBuy ? 'BUY' : 'SELL'}:`, trade.amount, 'tokens');
});
```

**10 lines. Zero complexity. Production ready.**

---

## 📚 Internal SDK Architecture (Hidden from Users)

The SDK internally handles:

### 1. PDA Derivation
```typescript
// Automatically derives all PDAs
const [config] = PublicKey.findProgramAddressSync([Buffer.from('config')], programId);
const [pool] = PublicKey.findProgramAddressSync([Buffer.from('pool'), baseMint.toBuffer()], programId);
const [quoteVault] = PublicKey.findProgramAddressSync([Buffer.from('quote_vault'), pool.toBuffer()], programId);
const [baseVault] = PublicKey.findProgramAddressSync([Buffer.from('base_vault'), pool.toBuffer()], programId);
```

### 2. Token Account Management
```typescript
// Automatically creates/fetches ATAs
const userQuoteAccount = await getOrCreateAssociatedTokenAccount(
  connection, wallet.payer, quoteMint, wallet.publicKey
);
const userBaseAccount = await getOrCreateAssociatedTokenAccount(
  connection, wallet.payer, baseMint, wallet.publicKey
);
```

### 3. Parameter Conversion
```typescript
// Converts human-readable → on-chain format
const targetMarketCapUsd = new BN(params.initialMarketCapUsd * 1_000_000); // USD → micro-USD
const tokenSupply = new BN(params.supply * Math.pow(10, decimals)); // Human → lamports
const minBaseAmount = new BN(estimatedOutput * (1 - slippage / 100)); // Slippage calc
```

### 4. Transaction Building
```typescript
// Builds complete transaction with all accounts
const tx = await program.methods
  .buy(quoteAmount, minBaseAmount)
  .accounts({
    config,
    pool,
    quoteVault,
    baseVault,
    userQuoteAccount: userQuoteAccount.address,
    userBaseAccount: userBaseAccount.address,
    feeRecipientAccount,
    user: wallet.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .transaction();

// Signs and sends
const signature = await sendAndConfirmTransaction(connection, tx, [wallet.payer]);
```

### 5. Event Parsing
```typescript
// Subscribes to program logs and parses events
const listener = connection.onLogs(programId, (logs) => {
  const events = parseAnchorEvents(logs, program.idl);
  events.forEach(event => {
    if (event.name === 'TradeExecuted' && event.data.pool.equals(pool)) {
      callback(formatTradeEvent(event.data));
    }
  });
});
```

### 6. Error Translation
```typescript
// Maps Anchor errors to friendly messages
function translateError(error: any): ScaleError {
  const errorCode = extractAnchorErrorCode(error);

  const messages = {
    6000: { code: 'INSUFFICIENT_LIQUIDITY', message: 'Pool has insufficient liquidity' },
    6001: { code: 'SLIPPAGE_EXCEEDED', message: 'Price moved beyond your slippage tolerance' },
    6002: { code: 'ANTI_SNIPER_ACTIVE', message: 'Trade size too large during anti-sniper window' },
    // ... all error codes mapped
  };

  return new ScaleError(messages[errorCode] || { code: 'UNKNOWN', message: error.message });
}
```

---

## 🎯 Key SDK Features

### ✅ What Makes This SDK Great

1. **Zero boilerplate** - No PDA math, no account lookups, no ATA creation
2. **Human-readable** - USD amounts, not micro-USD. Tokens, not lamports.
3. **Sensible defaults** - 0.5% slippage, ConstantProduct curve, 0% fees
4. **Type-safe** - Full TypeScript support with autocomplete
5. **Error-friendly** - Clear error messages, not cryptic Anchor codes
6. **Event-driven** - Real-time updates via simple callbacks
7. **Estimate first** - Preview trades before execution
8. **Framework agnostic** - Works with any Solana wallet adapter

### 🚀 Integration Speed

- **Trader bot:** 6 lines of code
- **DEX aggregator:** 10 lines of code
- **Analytics dashboard:** 4 lines of code (read-only)
- **Creator platform:** 7 lines of code

### 📦 Package Structure

```
@scale-amm/sdk/
├── src/
│   ├── ScaleAMM.ts         # Main SDK class
│   ├── ScaleUtils.ts       # Helper utilities
│   ├── errors.ts           # Error types
│   ├── types.ts            # TypeScript types
│   ├── constants.ts        # Program IDs, defaults
│   └── internal/           # Internal helpers (not exported)
│       ├── pdas.ts         # PDA derivation
│       ├── accounts.ts     # Account management
│       ├── conversions.ts  # Parameter conversions
│       ├── events.ts       # Event parsing
│       └── transactions.ts # Transaction building
├── test/
│   └── examples.test.ts    # All examples as tests
├── package.json
├── tsconfig.json
└── README.md               # This document
```

---

## 🎉 Summary

**Before SDK (Vanilla Anchor):**
- 50+ lines to execute a buy
- Manual PDA derivation
- Manual ATA creation
- Manual parameter conversion
- Cryptic error messages

**With SDK:**
- 6 lines to execute a buy
- Zero manual work
- Clear error messages
- Type-safe
- Production ready

**Example comparison:**

```typescript
// ❌ WITHOUT SDK (50+ lines)
const [config] = PublicKey.findProgramAddressSync([Buffer.from('config')], programId);
const [pool] = PublicKey.findProgramAddressSync([Buffer.from('pool'), baseMint.toBuffer()], programId);
const [quoteVault] = PublicKey.findProgramAddressSync([Buffer.from('quote_vault'), pool.toBuffer()], programId);
const [baseVault] = PublicKey.findProgramAddressSync([Buffer.from('base_vault'), pool.toBuffer()], programId);
const userQuoteAccount = await getOrCreateAssociatedTokenAccount(connection, payer, quoteMint, user);
const userBaseAccount = await getOrCreateAssociatedTokenAccount(connection, payer, baseMint, user);
const feeRecipientAccount = await getOrCreateAssociatedTokenAccount(connection, payer, quoteMint, feeRecipient);
const poolData = await program.account.pool.fetch(pool);
const (quoteReserves, baseReserves) = poolData.getPricingReserves();
const estimatedOutput = calculateOutput(quoteAmount, quoteReserves, baseReserves, poolData.feeBps);
const minBaseAmount = new BN(estimatedOutput.muln(995).divn(1000)); // 0.5% slippage
const tx = await program.methods.buy(new BN(quoteAmount * 1_000_000), minBaseAmount)
  .accounts({ config, pool, quoteVault, baseVault, userQuoteAccount: userQuoteAccount.address,
    userBaseAccount: userBaseAccount.address, feeRecipientAccount: feeRecipientAccount.address,
    user, tokenProgram: TOKEN_PROGRAM_ID })
  .rpc();
// ... handle errors, parse events, convert outputs ...

// ✅ WITH SDK (6 lines)
const scale = new ScaleAMM(connection, wallet);
const result = await scale.buy(poolAddress, { crxAmount: 100, slippage: 0.5 });
console.log('Bought:', result.tokensReceived, 'tokens');
```

**The SDK reduces integration complexity by 90%+ while maintaining full functionality.**

---

## 📖 Next Steps

1. **Implement SDK** - Build based on this design
2. **Add tests** - Convert all examples to tests
3. **Write docs** - Generate from type definitions
4. **Publish NPM** - `@scale-amm/sdk` on npmjs.com
5. **Example repos** - Trading bot, DEX aggregator, analytics dashboard
6. **Developer onboarding** - "Integrate Scale AMM in 5 minutes" guide

**Result:** Fastest integration time in DeFi. 10 lines of code = production-ready trading.
