# Scale AMM TypeScript SDK - Security Audit Report

**Date:** 2026-01-09
**Auditor:** Claude (AI Security Analysis)
**Scope:** TypeScript SDK (`sdk/ScaleAMM.ts`, `sdk/ScaleUtils.ts`, `sdk/examples.ts`)
**Focus:** Client-side vulnerabilities, transaction safety, user fund protection

---

## Executive Summary

**Overall Assessment:** CRITICAL VULNERABILITIES FOUND

The SDK has **4 critical bugs** and **8 high-priority issues** that could lead to:
- Transaction failures (accounts missing from instruction)
- Incorrect trade estimates (precision loss, wrong fee calculations)
- User confusion (missing WAA fee warnings)
- Potential fund loss (incorrect slippage calculations)

**Recommendation:** DO NOT deploy to mainnet until all critical and high-priority issues are fixed.

---

## Critical Vulnerabilities (P0 - Must Fix)

### 🚨 CRITICAL #1: Missing Accounts in Transaction Instructions

**Severity:** CRITICAL
**File:** `sdk/ScaleAMM.ts` Lines 774-785 (buy), 854-866 (sell)
**Impact:** All buy/sell transactions will FAIL

**Bug:**
The SDK is missing required accounts that the on-chain program expects:
- `user_position` account (required for WAA tracking)
- `system_program` account (required for init_if_needed on buys)

**SDK Code (WRONG):**
```typescript
.accounts({
  config: configPda,
  pool,
  quoteVault: quoteVaultPda,
  baseVault: baseVaultPda,
  userQuoteAccount: accounts.userQuoteAccount,
  userBaseAccount: accounts.userBaseAccount,
  feeRecipientAccount: accounts.feeRecipientAccount,
  user: this.wallet.publicKey,
  tokenProgram: TOKEN_PROGRAM_ID,
})
```

**On-chain Expected (from buy.rs):**
```rust
pub struct Buy<'info> {
    pub config: Account<'info, Config>,
    pub pool: Account<'info, Pool>,
    pub quote_vault: Account<'info, TokenAccount>,
    pub base_vault: Account<'info, TokenAccount>,
    pub user_quote_account: Account<'info, TokenAccount>,
    pub user_base_account: Account<'info, TokenAccount>,
    pub fee_recipient_account: Account<'info, TokenAccount>,
    pub user_position: Account<'info, UserPosition>,  // ❌ MISSING
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,  // ❌ MISSING
}
```

**Exploit Scenario:**
1. User calls `scale.buy()` or `scale.sell()`
2. Transaction is built with missing accounts
3. Anchor account validation fails
4. Transaction reverts, user pays gas but trade doesn't execute
5. User loses SOL on failed transactions

**Fix:**
```typescript
// Derive user position PDA
const [userPositionPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('pos'), pool.toBuffer(), this.wallet.publicKey.toBuffer()],
  this.programId
);

.accounts({
  config: configPda,
  pool,
  quoteVault: quoteVaultPda,
  baseVault: baseVaultPda,
  userQuoteAccount: accounts.userQuoteAccount,
  userBaseAccount: accounts.userBaseAccount,
  feeRecipientAccount: accounts.feeRecipientAccount,
  userPosition: userPositionPda,  // ✅ ADD THIS
  user: this.wallet.publicKey,
  tokenProgram: TOKEN_PROGRAM_ID,
  systemProgram: SystemProgram.programId,  // ✅ ADD THIS
})
```

---

### 🚨 CRITICAL #2: Precision Loss in Trade Estimation

**Severity:** CRITICAL
**File:** `sdk/ScaleAMM.ts` Lines 1417-1464
**Impact:** Incorrect trade estimates, users receive less than expected

**Bug:**
Trade estimation uses JavaScript `number` type which loses precision for large values (>2^53). This can lead to:
- Incorrect output estimates
- Wrong slippage calculations
- Users getting less tokens than estimated

**Problematic Code:**
```typescript
private async estimateBuyInternal(poolData: PoolData, crxAmount: number): Promise<EstimateResult> {
  const fee = (crxAmount * poolData.feeBps) / 10000;  // ❌ Uses number
  const swapAmount = crxAmount - fee;

  const output = (swapAmount * reserves.base.toNumber()) /
                 (reserves.quote.toNumber() + swapAmount);  // ❌ Converts BN to number!
}
```

**Example:**
```typescript
// Reserve values from on-chain
const quoteReserve = new BN("100000000000000");  // 100M CRX (6 decimals)
const baseReserve = new BN("500000000000000");   // 500M tokens

// Converting to number loses precision
quoteReserve.toNumber();  // 100000000000000 (OK, below 2^53)
baseReserve.toNumber();   // 500000000000000 (OK, but close to limit)

// But multiplication can overflow
const numerator = 1000000 * 500000000000000;  // May lose precision!
```

**Exploit Scenario:**
1. User estimates trade with large amounts
2. Estimate shows 1,000,000 tokens output
3. User sets minTokens based on estimate (990,000 with 1% slippage)
4. Actual on-chain calculation gives 995,000 tokens
5. Transaction succeeds, user gets tokens, but estimate was inaccurate
6. If user relied on estimate for arbitrage, they could lose money

**Fix:**
Use BN throughout all calculations:
```typescript
private async estimateBuyInternal(poolData: PoolData, crxAmount: number): Promise<EstimateResult> {
  const crxAmountBN = new BN(crxAmount * 1_000_000);  // Convert to lamports with BN

  const feeBN = crxAmountBN
    .mul(new BN(poolData.feeBps))
    .div(new BN(10000));

  const swapAmountBN = crxAmountBN.sub(feeBN);

  // Use BN math throughout
  const numerator = swapAmountBN.mul(reserves.base);
  const denominator = reserves.quote.add(swapAmountBN);
  const outputBN = numerator.div(denominator);

  return {
    output: outputBN.toNumber() / 1_000_000,  // Only convert at the end
    fee: feeBN.toNumber() / 1_000_000,
    // ...
  };
}
```

---

### 🚨 CRITICAL #3: Incorrect Fee Calculation in Estimates

**Severity:** CRITICAL
**File:** `sdk/ScaleAMM.ts` Lines 1425, 1450
**Impact:** Wrong fee estimates, incorrect slippage protection

**Bug:**
The SDK's fee calculation doesn't match the on-chain program's logic:
- Buy: SDK applies fee to input ✅ (correct)
- Sell: SDK applies fee to input ❌ (wrong - should be applied to output)
- Sell: SDK doesn't include WAA extra fees ❌ (users get surprised by higher fees)

**SDK Code (WRONG for sells):**
```typescript
private async estimateSellInternal(poolData: PoolData, tokenAmount: number): Promise<EstimateResult> {
  const fee = (tokenAmount * poolData.feeBps) / 10000;  // ❌ Applied to input
  const swapAmount = tokenAmount - fee;
  const output = (swapAmount * reserves.quote.toNumber()) / ...;  // Wrong!
}
```

**On-chain sell.rs (CORRECT):**
```rust
// Lines 115-144 in sell.rs
let quote_output_before_fee = pool.calculate_output(...);  // Calculate output first
let base_fee_in_quote = calculate_base_fee(quote_output_before_fee, fee_bps)?;  // Fee from OUTPUT
let extra_fee_in_quote = calculate_waa_fee(...);  // WAA fee
let quote_output = quote_output_before_fee - base_fee - extra_fee;  // Subtract from output
```

**Exploit Scenario:**
1. User estimates sell: `estimateSell(100 tokens)`
2. SDK estimates output: 95 CRX (100 CRX - 5% fee)
3. User sets minCrx = 94 CRX (1% slippage)
4. On-chain calculates: 100 tokens → 100 CRX output, minus 5 CRX fee, minus 10 CRX WAA fee = 85 CRX
5. 85 CRX < 94 CRX → slippage exceeded, transaction fails
6. User is confused why estimate was so wrong

**Fix:**
Match on-chain logic exactly:
```typescript
private async estimateSellInternal(poolData: PoolData, tokenAmount: number): Promise<EstimateResult> {
  // Calculate output BEFORE fee
  const outputBeforeFee = (tokenAmount * reserves.quote) / (reserves.base + tokenAmount);

  // Apply fee to OUTPUT (not input)
  const baseFee = (outputBeforeFee * poolData.feeBps) / 10000;

  // Calculate WAA fee if applicable
  const waaFee = this.estimateWaaFee(outputBeforeFee, userPosition, currentSlot);

  const totalFee = baseFee + waaFee;
  const finalOutput = outputBeforeFee - totalFee;

  return { output: finalOutput, fee: totalFee, ... };
}
```

---

### 🚨 CRITICAL #4: Floating Point Slippage Calculation

**Severity:** HIGH
**File:** `sdk/ScaleAMM.ts` Lines 760, 841
**Impact:** Incorrect slippage protection, users could lose funds

**Bug:**
Slippage calculation uses floating point arithmetic which can introduce rounding errors:

```typescript
// Line 760 (buy)
minBaseAmount = new BN(estimated.output * (1 - slippage / 100) * Math.pow(10, baseDecimals));

// Line 841 (sell)
minQuoteAmount = new BN(estimated.output * (1 - slippage / 100) * Math.pow(10, quoteDecimals));
```

**Problem:**
```javascript
// Example with 0.5% slippage
1000 * (1 - 0.5 / 100) * 1000000
= 1000 * 0.995 * 1000000
= 995000000

// But with floating point:
1000.123456789 * 0.995 * 1000000
= 995122839.506...
// Gets truncated to 995122839 (loses precision)
```

**Fix:**
Use integer math:
```typescript
// Calculate slippage using BPS (basis points)
const slippageBps = slippage * 100;  // 0.5% → 50 bps
const outputBN = new BN(estimated.output * Math.pow(10, baseDecimals));
const minBaseAmount = outputBN
  .mul(new BN(10000 - slippageBps))
  .div(new BN(10000));
```

---

## High Priority Issues (P1 - Fix Before Mainnet)

### ⚠️ HIGH #1: No WAA Fee Warning for Sells

**Severity:** HIGH
**File:** `sdk/ScaleAMM.ts` sell() method
**Impact:** Users surprised by extra 1-10% fees on sells

**Bug:**
The SDK doesn't warn users about WAA (Weighted Average Age) extra fees when selling. Users who buy and immediately sell will pay up to 10% extra fee, but the SDK doesn't inform them.

**Missing Information:**
- No warning before sell if WAA fee will apply
- No way to estimate WAA fee amount
- No explanation in documentation

**Fix:**
```typescript
async sell(pool: PublicKey, params: SellParams): Promise<TradeResult> {
  // Check user position and estimate WAA fee
  const position = await this.getUserPosition(this.wallet.publicKey, pool);
  const currentSlot = await this.connection.getSlot();

  if (position && position.hasWaaFee) {
    const waaFeeBps = position.weightedAverageEntrySlot
      ? this.calculateWaaFeeBps(currentSlot - position.weightedAverageEntrySlot)
      : 0;

    if (waaFeeBps > 0) {
      console.warn(
        `⚠️ WAA Fee Active: ${waaFeeBps / 100}% extra fee for selling within 30 minutes. ` +
        `Age: ${position.waaAgeSeconds.toFixed(0)}s`
      );
    }
  }

  // Continue with sell...
}
```

---

### ⚠️ HIGH #2: No Input Validation on Trade Amounts

**Severity:** HIGH
**File:** `sdk/ScaleAMM.ts` buy/sell methods
**Impact:** Users can submit dust trades or impossibly large trades

**Missing Validations:**
```typescript
async buy(pool: PublicKey, params: BuyParams): Promise<TradeResult> {
  // ❌ No check for minimum amount
  // ❌ No check for maximum amount
  // ❌ No check for amount > user balance
  // ❌ No check for reasonable slippage

  if (params.crxAmount <= 0) {
    throw new ScaleError('INVALID_AMOUNT', 'Amount must be greater than zero');
  }

  // Should also check:
  if (params.crxAmount < 0.01) {
    throw new ScaleError('INVALID_AMOUNT', 'Minimum trade: 0.01 CRX (dust protection)');
  }

  if (params.slippage && (params.slippage < 0.1 || params.slippage > 50)) {
    throw new ScaleError('INVALID_SLIPPAGE', 'Slippage must be between 0.1% and 50%');
  }
}
```

---

### ⚠️ HIGH #3: No High Slippage Warning

**Severity:** HIGH
**File:** `sdk/ScaleAMM.ts`, `sdk/ScaleUtils.ts`
**Impact:** Users could accidentally set 50% slippage and lose funds to MEV

**Fix:**
```typescript
async buy(pool: PublicKey, params: BuyParams): Promise<TradeResult> {
  const slippage = params.slippage ?? 0.5;

  // Warn on high slippage
  if (slippage > 5) {
    console.warn(
      `⚠️ HIGH SLIPPAGE: ${slippage}% - You may lose funds to MEV bots. ` +
      `Consider reducing slippage or splitting trade into smaller chunks.`
    );
  }

  if (slippage > 20) {
    throw new ScaleError(
      'DANGEROUS_SLIPPAGE',
      `Slippage ${slippage}% is dangerous. Maximum recommended: 20%. ` +
      `Set explicitly to override.`
    );
  }
}
```

---

### ⚠️ HIGH #4: Missing User Balance Check

**Severity:** HIGH
**File:** `sdk/ScaleAMM.ts` buy/sell methods
**Impact:** Transactions fail on-chain, user wastes gas

**Fix:**
```typescript
async buy(pool: PublicKey, params: BuyParams): Promise<TradeResult> {
  // Fetch pool data
  const poolData = await this.program.account.pool.fetch(pool) as PoolData;

  // Get user's CRX balance
  const userQuoteAccount = await getOrCreateAssociatedTokenAccount(
    this.connection,
    this.wallet.payer,
    poolData.quoteMint,
    this.wallet.publicKey
  );

  const userBalance = userQuoteAccount.amount;
  const requiredAmount = params.crxAmount * Math.pow(10, 6);  // Assuming 6 decimals

  if (userBalance < requiredAmount) {
    throw new ScaleError(
      'INSUFFICIENT_BALANCE',
      `Insufficient CRX balance. Have: ${userBalance / 1e6}, Need: ${params.crxAmount}`
    );
  }

  // Continue with trade...
}
```

---

### ⚠️ HIGH #5: No Anti-Sniper Check Helper

**Severity:** MEDIUM
**File:** `sdk/ScaleAMM.ts`, `sdk/ScaleUtils.ts`
**Impact:** Users don't know if anti-sniper is active, transactions fail

**Missing Functionality:**
```typescript
/**
 * Check if anti-sniper protection is active for a pool
 */
async isAntiSniperActive(pool: PublicKey): Promise<{
  active: boolean;
  remainingSlots: number;
  maxTradeAmount: number;
}> {
  const poolData = await this.program.account.pool.fetch(pool) as PoolData;
  const config = await this.getConfig();
  const currentSlot = await this.connection.getSlot();

  const slotsElapsed = currentSlot - poolData.createdAtSlot.toNumber();
  const active = slotsElapsed < config.antiSniperWindowSlots;
  const remainingSlots = config.antiSniperWindowSlots - slotsElapsed;

  // Calculate max trade amount (5% of supply by default)
  const maxTradeAmount = poolData.tokenTotalSupply
    .mul(new BN(config.antiSniperMaxTradeBps))
    .div(new BN(10000))
    .toNumber() / 1_000_000;

  return { active, remainingSlots, maxTradeAmount };
}
```

---

### ⚠️ HIGH #6: Hardcoded Decimal Assumptions

**Severity:** MEDIUM
**File:** `sdk/ScaleAMM.ts` Lines 752, 833, 934, 940, etc.
**Impact:** If token decimals != 6, calculations will be wrong

**Bug:**
The SDK assumes all tokens have 6 decimals in many places:

```typescript
// Line 934
liquidityCrx: poolData.realQuoteReserves.toNumber() / 1_000_000,  // Assumes 6 decimals

// Line 935
liquidityTokens: poolData.realBaseReserves.toNumber() / 1_000_000,  // Assumes 6 decimals

// Line 937
volumeCrx: poolData.totalQuoteVolume.toNumber() / 1_000_000,  // Assumes 6 decimals
```

**Problem:**
If quote mint (CRX) has 9 decimals instead of 6, all these values will be 1000x wrong!

**Fix:**
Always fetch and use actual decimals:
```typescript
async getPool(baseMint: PublicKey): Promise<PoolInfo> {
  const [poolPda] = this.derivePoolPda(baseMint);
  const poolData = await this.program.account.pool.fetch(poolPda) as PoolData;

  // Fetch actual decimals
  const quoteDecimals = await this.getMintDecimals(poolData.quoteMint);
  const baseDecimals = await this.getMintDecimals(poolData.baseMint);

  return {
    liquidityCrx: poolData.realQuoteReserves.toNumber() / Math.pow(10, quoteDecimals),
    liquidityTokens: poolData.realBaseReserves.toNumber() / Math.pow(10, baseDecimals),
    // ...
  };
}
```

---

### ⚠️ HIGH #7: No Price Impact Warning

**Severity:** MEDIUM
**File:** `sdk/ScaleAMM.ts` buy/sell methods
**Impact:** Users unknowingly make trades with huge price impact

**Missing Check:**
```typescript
async buy(pool: PublicKey, params: BuyParams): Promise<TradeResult> {
  // Estimate trade first
  const estimate = await this.estimateBuy(pool, params.crxAmount);

  // Warn on high price impact
  if (estimate.priceImpact > 10) {
    console.warn(
      `⚠️ HIGH PRICE IMPACT: ${estimate.priceImpact.toFixed(2)}%\n` +
      `Your trade will significantly move the price. Consider:\n` +
      `1. Reducing trade size\n` +
      `2. Splitting into multiple trades\n` +
      `3. Waiting for more liquidity`
    );
  }

  if (estimate.priceImpact > 50) {
    throw new ScaleError(
      'EXCESSIVE_PRICE_IMPACT',
      `Price impact ${estimate.priceImpact.toFixed(2)}% is excessive. ` +
      `Split trade or wait for liquidity.`
    );
  }
}
```

---

### ⚠️ HIGH #8: Incomplete Error Translation

**Severity:** MEDIUM
**File:** `sdk/ScaleAMM.ts` Lines 1518-1544
**Impact:** Users see generic errors instead of helpful messages

**Bug:**
The `translateError()` method only maps a few error codes:

```typescript
const errorMap: { [key: string]: { code: ErrorCode; message: string } } = {
  '6001': { code: 'SLIPPAGE_EXCEEDED', message: '...' },
  '6002': { code: 'ANTI_SNIPER_ACTIVE', message: '...' },
  '6003': { code: 'INSUFFICIENT_BALANCE', message: '...' },
  // ... map all error codes  // ❌ Comment says "map all" but only 3 are mapped!
};
```

**Fix:**
Import complete error map from `sdk/errors.ts`:
```typescript
import { translateAnchorError } from './errors';

private translateError(error: unknown): ScaleError {
  return translateAnchorError(error);  // Use comprehensive error translation
}
```

---

## Medium Priority Issues (P2 - Fix Soon)

### ⚠️ MEDIUM #1: Missing Priority Fee Estimation

**Severity:** MEDIUM
**File:** `sdk/ScaleUtils.ts`
**Impact:** Users may not know what priority fee to set

**Missing Helper:**
```typescript
/**
 * Estimate recommended priority fee based on network congestion
 */
static async estimatePriorityFee(connection: Connection): Promise<{
  low: number;      // 5th percentile (slow)
  medium: number;   // 50th percentile (normal)
  high: number;     // 95th percentile (fast)
}> {
  // Get recent priority fees from recent blocks
  const recentFees = await connection.getRecentPrioritizationFees();

  const fees = recentFees.map(f => f.prioritizationFee).sort((a, b) => a - b);

  return {
    low: fees[Math.floor(fees.length * 0.05)],
    medium: fees[Math.floor(fees.length * 0.50)],
    high: fees[Math.floor(fees.length * 0.95)],
  };
}
```

---

### ⚠️ MEDIUM #2: No Rate Limiting Guidance

**Severity:** MEDIUM
**File:** Documentation
**Impact:** Users may hit RPC rate limits

**Missing Documentation:**
```typescript
/**
 * IMPORTANT: Rate Limiting
 *
 * Public RPC endpoints have rate limits:
 * - Free tier: ~100 requests/min
 * - Paid tier: 1000-10000 requests/min
 *
 * Recommendations:
 * 1. Use paid RPC for production (Helius, QuickNode, etc.)
 * 2. Cache pool data (valid for ~400ms per slot)
 * 3. Use websockets for real-time price updates (cheaper than polling)
 * 4. Batch requests where possible
 *
 * Example caching:
 * ```typescript
 * const cache = new Map<string, { data: PoolInfo, timestamp: number }>();
 * const CACHE_TTL = 1000; // 1 second
 *
 * async function getPoolCached(pool: PublicKey): Promise<PoolInfo> {
 *   const key = pool.toBase58();
 *   const cached = cache.get(key);
 *
 *   if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
 *     return cached.data;
 *   }
 *
 *   const data = await scale.getPool(pool);
 *   cache.set(key, { data, timestamp: Date.now() });
 *   return data;
 * }
 * ```
 */
```

---

### ⚠️ MEDIUM #3: Example 7 Has Unsafe Pattern

**Severity:** MEDIUM
**File:** `sdk/examples.ts` Lines 173-211
**Impact:** Example teaches bad practices

**Problematic Code:**
```typescript
// Example 7: Trading bot
scale.onTrade(pool.address, async (trade) => {
  const profitTarget = pool.price * 1.1;  // ❌ Uses stale pool price!
  if (trade.price >= profitTarget) {
    await scale.sell(...);  // ❌ No error handling!
    process.exit(0);
  }
});
```

**Problems:**
1. Uses stale `pool.price` instead of `trade.price`
2. No error handling on sell
3. `process.exit(0)` is abrupt
4. Doesn't remove listener before exiting
5. No protection against multiple simultaneous sells

**Fixed Example:**
```typescript
let sellInProgress = false;

scale.onTrade(pool.address, async (trade) => {
  if (sellInProgress) return;  // Prevent concurrent sells

  const profitTarget = initialPrice * 1.1;  // Use initial price, not current

  if (trade.price >= profitTarget && !sellInProgress) {
    sellInProgress = true;

    try {
      const sellResult = await scale.sell(pool.address, {
        tokenAmount: estimate.output,
        slippage: 2.0,  // Higher slippage for fast exit
      });
      console.log('✅ Sold for', sellResult.crxReceived, 'CRX');

      await scale.removeListener(listenerId);
      process.exit(0);
    } catch (error) {
      console.error('❌ Sell failed:', error);
      sellInProgress = false;
    }
  }
});
```

---

## Low Priority Issues (P3 - Nice to Have)

### 📝 LOW #1: No Batch Transaction Support

**Severity:** LOW
**File:** `sdk/ScaleAMM.ts`

**Enhancement:**
```typescript
/**
 * Build unsigned transaction for later signing/sending
 * Useful for:
 * - Multisig wallets
 * - Transaction batching
 * - Custom fee logic
 */
async buildBuyTransaction(
  pool: PublicKey,
  params: BuyParams
): Promise<Transaction> {
  // Build transaction without sending
  const tx = new Transaction();

  // Add instructions
  // Return unsigned transaction

  return tx;
}
```

---

### 📝 LOW #2: No WebSocket Subscription Helpers

**Severity:** LOW
**File:** `sdk/ScaleAMM.ts`

**Enhancement:**
```typescript
/**
 * Subscribe to pool account changes (more efficient than polling)
 */
subscribeToPool(
  pool: PublicKey,
  callback: (poolInfo: PoolInfo) => void
): number {
  return this.connection.onAccountChange(
    pool,
    async (accountInfo) => {
      const poolData = this.program.coder.accounts.decode('pool', accountInfo.data);
      const poolInfo = this.parsePoolData(pool, poolData);
      callback(poolInfo);
    },
    'confirmed'
  );
}
```

---

### 📝 LOW #3: No Simulation Before Sending

**Severity:** LOW
**File:** `sdk/ScaleAMM.ts`

**Enhancement:**
```typescript
async buy(pool: PublicKey, params: BuyParams): Promise<TradeResult> {
  // ... build transaction ...

  // Simulate before sending to catch errors early
  const simulation = await this.connection.simulateTransaction(transaction);

  if (simulation.value.err) {
    throw new ScaleError(
      'SIMULATION_FAILED',
      `Transaction would fail: ${JSON.stringify(simulation.value.err)}\n` +
      `Logs: ${simulation.value.logs?.join('\n')}`
    );
  }

  // If simulation succeeds, send transaction
  const signature = await tx.rpc();
  // ...
}
```

---

## PDA Derivation Verification

✅ **PASS** - All PDA seeds match on-chain program:

| PDA | SDK Seeds | On-chain Seeds | Status |
|-----|-----------|----------------|--------|
| Config | `['config']` | `[b"config"]` | ✅ Match |
| Pool | `['pool', baseMint]` | `[b"pool", base_mint]` | ✅ Match |
| QuoteVault | `['quote_vault', pool]` | `[b"quote_vault", pool]` | ✅ Match |
| BaseVault | `['base_vault', pool]` | `[b"base_vault", pool]` | ✅ Match |
| UserPosition | `['pos', pool, user]` | `[b"pos", pool, user]` | ✅ Match |

---

## Account Ordering Verification

❌ **FAIL** - SDK missing required accounts:

**Buy Instruction:**
| Account | SDK | On-chain | Status |
|---------|-----|----------|--------|
| config | ✅ | ✅ | Match |
| pool | ✅ | ✅ | Match |
| quote_vault | ✅ | ✅ | Match |
| base_vault | ✅ | ✅ | Match |
| user_quote_account | ✅ | ✅ | Match |
| user_base_account | ✅ | ✅ | Match |
| fee_recipient_account | ✅ | ✅ | Match |
| user_position | ❌ | ✅ | **MISSING** |
| user | ✅ | ✅ | Match |
| token_program | ✅ | ✅ | Match |
| system_program | ❌ | ✅ | **MISSING** |

**Sell Instruction:** Same issues as buy

---

## ScaleUtils.ts Analysis

✅ **PASS** - No critical issues in utility functions

Minor observations:
- `calculateConstantProductOutput()` - Good, but should warn about precision loss for large values
- `applySlippage()` - Uses floating point, but acceptable for display/estimation
- `validateSlippage()` - Good validation range (0.1% - 50%)
- `retry()` - Good exponential backoff implementation

---

## Examples.ts Analysis

Issues found:
1. ⚠️ Example 7 has unsafe pattern (documented above)
2. ⚠️ No examples demonstrate slippage protection
3. ⚠️ No examples show how to check anti-sniper status
4. ⚠️ No examples show WAA fee handling
5. ✅ Basic examples (1-6) are safe

---

## Documentation Assessment

**Missing Critical Documentation:**
1. ❌ No warning about WAA fees in sell documentation
2. ❌ No explanation of when graduation occurs
3. ❌ No gas cost estimates
4. ❌ No rate limiting guidance
5. ❌ No security best practices section
6. ✅ Method signatures are documented
7. ✅ Parameters are explained
8. ⚠️ Return values could be more detailed

**Recommended Additions:**
```typescript
/**
 * Sell tokens for CRX
 *
 * ⚠️ WARNING: Anti-Dump Protection (WAA)
 * If you bought tokens recently, you'll pay extra fees:
 * - 0-30s: 10% extra fee
 * - 30s-5m: 10% → 1% decaying fee
 * - 5m-30m: 1% → 0% decaying fee
 * - 30m+: No extra fee
 *
 * Use getUserPosition() to check your WAA status before selling.
 *
 * @example
 * ```typescript
 * // Check WAA fee before selling
 * const position = await scale.getUserPosition(wallet.publicKey, poolAddress);
 * if (position?.hasWaaFee) {
 *   console.warn(`WAA fee active: ${position.waaAgeSeconds}s old`);
 * }
 *
 * const result = await scale.sell(poolAddress, {
 *   tokenAmount: 50,
 *   slippage: 1.0,
 * });
 * ```
 */
async sell(pool: PublicKey, params: SellParams): Promise<TradeResult>
```

---

## Recommendations

### Immediate (Before Any Deployment):
1. ✅ Fix CRITICAL #1: Add missing accounts to buy/sell
2. ✅ Fix CRITICAL #2: Use BN throughout estimation
3. ✅ Fix CRITICAL #3: Fix fee calculations to match on-chain
4. ✅ Fix CRITICAL #4: Use integer math for slippage

### Before Mainnet:
5. ✅ Fix all HIGH priority issues
6. ✅ Add comprehensive input validation
7. ✅ Add WAA fee warnings and helpers
8. ✅ Improve documentation with security warnings
9. ✅ Fix example 7 trading bot
10. ✅ Add unit tests for all estimation functions

### Before Public Launch:
11. ⚠️ Fix MEDIUM priority issues
12. ⚠️ Add rate limiting guidance
13. ⚠️ Add batch transaction support
14. ⚠️ Add simulation before send

### Nice to Have:
15. 📝 Add LOW priority enhancements
16. 📝 Add WebSocket subscription helpers
17. 📝 Add transaction builder methods

---

## Testing Recommendations

**Critical Tests Needed:**
```typescript
describe('SDK Trade Execution', () => {
  it('should include all required accounts in buy instruction', async () => {
    const accounts = await scale.buildBuyAccounts(...);
    expect(accounts).toHaveProperty('userPosition');
    expect(accounts).toHaveProperty('systemProgram');
  });

  it('should calculate buy estimates matching on-chain math', async () => {
    const sdkEstimate = await scale.estimateBuy(pool, 100);
    const onChainResult = await executeActualBuy(pool, 100);
    expect(sdkEstimate.output).toBeCloseTo(onChainResult.tokensReceived, 0.001);
  });

  it('should calculate sell estimates including WAA fees', async () => {
    // Buy tokens
    await scale.buy(pool, { crxAmount: 100 });

    // Immediately estimate sell
    const estimate = await scale.estimateSell(pool, 50);

    // Fee should include base + WAA
    expect(estimate.fee).toBeGreaterThan(0.5);  // More than just base fee
  });

  it('should warn on high slippage', async () => {
    const consoleSpy = jest.spyOn(console, 'warn');
    await scale.buy(pool, { crxAmount: 100, slippage: 10 });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('HIGH SLIPPAGE'));
  });
});
```

---

## Conclusion

**The SDK has critical bugs that will cause transaction failures.** Do not deploy to mainnet until:

1. ✅ All 4 CRITICAL issues are fixed
2. ✅ All 8 HIGH priority issues are addressed
3. ✅ Comprehensive testing is performed
4. ✅ Documentation is improved with security warnings

**Estimated Fix Time:** 2-3 days for critical issues, 1 week for all high-priority issues

**Risk Level After Fixes:** LOW (if all recommendations are implemented)

---

**Audit Complete**
Next Steps: Create GitHub issues for each finding and assign priorities
