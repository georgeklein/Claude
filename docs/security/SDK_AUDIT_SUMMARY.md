# SDK Security Audit - Quick Summary

**Date:** 2026-01-09
**Status:** ⛔ CRITICAL ISSUES FOUND - DO NOT DEPLOY

---

## Critical Bugs (Must Fix Immediately)

### 🚨 1. Missing Accounts in Transactions
**Impact:** ALL buy/sell transactions will FAIL
**Location:** `ScaleAMM.ts` lines 774-785, 854-866
**Issue:** SDK missing `user_position` and `system_program` accounts
**Result:** Every trade attempt fails, users waste gas

### 🚨 2. Precision Loss in Estimates
**Impact:** Wrong estimates, users get less than expected
**Location:** `ScaleAMM.ts` lines 1417-1464
**Issue:** Uses JavaScript `number` instead of `BN` for math
**Result:** Large trades have inaccurate estimates (±0.1-1% error)

### 🚨 3. Wrong Fee Calculation
**Impact:** Sell estimates completely wrong
**Location:** `ScaleAMM.ts` lines 1443-1464
**Issue:** Doesn't match on-chain fee logic, ignores WAA fees
**Result:** Estimates 95 CRX but actual is 85 CRX → slippage fail

### 🚨 4. Floating Point Slippage
**Impact:** Incorrect slippage protection
**Location:** `ScaleAMM.ts` lines 760, 841
**Issue:** Uses float math → rounding errors
**Result:** User sets 0.5% slippage but actually gets 0.48%

---

## High Priority Issues

1. **No WAA Fee Warning** - Users surprised by 1-10% extra fees on quick sells
2. **No Input Validation** - Can submit dust trades or excessive amounts
3. **No High Slippage Warning** - Users could set 50% slippage accidentally
4. **No Balance Check** - Transactions fail on-chain, waste gas
5. **No Anti-Sniper Helper** - Users don't know if they'll hit limits
6. **Hardcoded Decimals** - Assumes 6 decimals everywhere (wrong if != 6)
7. **No Price Impact Warning** - Users unknowingly make 50% price impact trades
8. **Incomplete Error Translation** - Generic errors instead of helpful messages

---

## What Works ✅

- PDA derivation (matches on-chain)
- Error handling structure (just needs complete mapping)
- Priority fee support
- Event listeners
- Basic documentation

---

## Fix Priority

**Week 1 (Critical):**
1. Add missing accounts to buy/sell instructions
2. Replace `number` with `BN` in all calculations
3. Fix fee calculation logic to match on-chain
4. Fix slippage calculation to use integer math

**Week 2 (High Priority):**
5. Add input validation (amounts, slippage, balances)
6. Add WAA fee warnings and estimation
7. Add high slippage/price impact warnings
8. Complete error mapping
9. Fix documentation

**Week 3 (Polish):**
10. Add rate limiting guidance
11. Fix example 7 unsafe pattern
12. Add comprehensive tests
13. Add simulation before send

---

## Testing Checklist

Before any deployment:
- [ ] Test buy with correct accounts (should succeed)
- [ ] Test estimation accuracy vs on-chain results (< 0.01% error)
- [ ] Test sell estimation includes WAA fees
- [ ] Test slippage protection works correctly
- [ ] Test all error codes map to friendly messages
- [ ] Test with tokens of different decimals (6, 8, 9)
- [ ] Test anti-sniper protection warning
- [ ] Test high slippage warning triggers

---

## Deployment Readiness

| Environment | Status | Notes |
|-------------|--------|-------|
| Devnet | ⛔ BLOCKED | Fix critical bugs first |
| Testnet | ⛔ BLOCKED | Need comprehensive tests |
| Mainnet | ⛔ BLOCKED | Need all HIGH priority fixes |

**ETA to Mainnet-Ready:** 2-3 weeks (after fixes + testing)

---

## Quick Fix Code Snippets

### Fix #1: Add Missing Accounts
```typescript
// In buy() and sell() methods, add:
const [userPositionPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('pos'), pool.toBuffer(), this.wallet.publicKey.toBuffer()],
  this.programId
);

.accounts({
  // ... existing accounts ...
  userPosition: userPositionPda,  // ADD THIS
  user: this.wallet.publicKey,
  tokenProgram: TOKEN_PROGRAM_ID,
  systemProgram: SystemProgram.programId,  // ADD THIS
})
```

### Fix #2: Use BN for Calculations
```typescript
// Replace estimateBuyInternal with:
const crxAmountBN = new BN(crxAmount * 1_000_000);
const feeBN = crxAmountBN.mul(new BN(feeBps)).div(new BN(10000));
const swapAmountBN = crxAmountBN.sub(feeBN);
const numerator = swapAmountBN.mul(reserves.base);
const denominator = reserves.quote.add(swapAmountBN);
const outputBN = numerator.div(denominator);
return { output: outputBN.toNumber() / 1_000_000, ... };
```

### Fix #3: Fix Sell Fee Calculation
```typescript
// In estimateSellInternal:
const outputBeforeFee = (baseAmount * quoteReserve) / (baseReserve + baseAmount);
const baseFee = (outputBeforeFee * feeBps) / 10000;  // Fee from OUTPUT
const waaFee = this.estimateWaaFee(...);  // ADD WAA fee
const totalFee = baseFee + waaFee;
const finalOutput = outputBeforeFee - totalFee;
```

### Fix #4: Integer Slippage Calculation
```typescript
const slippageBps = slippage * 100;  // 0.5% → 50 bps
const outputBN = new BN(estimated.output * Math.pow(10, decimals));
const minAmount = outputBN.mul(new BN(10000 - slippageBps)).div(new BN(10000));
```

---

## Security Contact

If you find additional vulnerabilities, report to: [security@scale-amm.xyz]

---

**⚠️ REMINDER: Do not deploy SDK until all CRITICAL and HIGH issues are fixed!**
