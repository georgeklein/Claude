# AGENT 5: ANTI-SNIPER PROTECTION SECURITY AUDIT

**Auditor:** Security Agent 5
**Date:** 2026-01-09
**Scope:** Anti-sniper protection circumvention analysis
**Severity Levels:** CRITICAL | HIGH | MEDIUM | LOW | INFO

---

## EXECUTIVE SUMMARY

The anti-sniper protection mechanism in Scale AMM is designed to prevent large single-transaction trades during the first 20 slots (~8 seconds) after pool creation. The system limits individual trades to 5% of total token supply during this window.

**Key Findings:**
- ✅ 5 security vulnerabilities identified
- ⚠️  2 CRITICAL vulnerabilities allow complete circumvention
- ✅ Protection applies correctly to both buys AND sells
- ✅ Protection correctly disabled after graduation
- ⚠️  Multiple attack vectors exist for bypassing limits

---

## 1. MECHANISM ANALYSIS

### 1.1 How Anti-Sniper Works

**Location:** `/programs/creator-amm-v2/src/state.rs` (lines 183-186)

```rust
pub fn is_anti_sniper_active(&self, current_slot: u64, anti_sniper_window: u64) -> bool {
    matches!(self.current_phase, CurvePhase::PreBonding) &&
    current_slot < self.created_at_slot.saturating_add(anti_sniper_window)
}
```

**Activation Criteria:**
1. Pool must be in `PreBonding` phase (before $40k graduation)
2. Current slot must be < (creation_slot + 20 slots)
3. Window duration: 20 slots ≈ 8 seconds (assuming 400ms/slot)

### 1.2 Trade Size Limit Calculation

**Location:** `/programs/creator-amm-v2/src/instructions/trade.rs` (lines 27-57)

```rust
pub fn check_anti_sniper_protection(
    pool: &Pool,
    config: &Config,
    trade_amount: u64,
    base_reserve: u64,
    clock_slot: u64,
) -> Result<()> {
    if pool.is_anti_sniper_active(clock_slot, config.anti_sniper_window_slots) {
        let max_trade_amount_u128 = (base_reserve as u128)
            .checked_mul(config.anti_sniper_max_trade_bps as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(BPS_DENOMINATOR as u128)
            .ok_or(ErrorCode::MathOverflow)?;

        require!(
            trade_amount <= max_trade_amount,
            ErrorCode::AntiSniperActive
        );
    }
    Ok(())
}
```

**Formula:**
```
max_trade_amount = (base_reserve × anti_sniper_max_trade_bps) / 10,000
                 = (base_reserve × 500) / 10,000
                 = base_reserve × 5%
```

**Default Configuration:**
- `anti_sniper_window_slots`: 20 slots (~8 seconds)
- `anti_sniper_max_trade_bps`: 500 (5% of supply)

### 1.3 Application Points

**Buy Transactions:** `/programs/creator-amm-v2/src/instructions/buy.rs` (lines 111-117)
- Checks `estimated_output` (tokens to be received)
- Applied BEFORE fee calculation (conservative)
- Uses virtual reserves in PreBonding phase

**Sell Transactions:** `/programs/creator-amm-v2/src/instructions/sell.rs` (lines 105-112)
- Checks `base_amount` (tokens being sold)
- Applied symmetrically to buys
- Uses same virtual reserve calculation

---

## 2. CRITICAL VULNERABILITIES

### 🚨 VULNERABILITY #1: MULTIPLE WALLET BYPASS (CRITICAL)

**Severity:** CRITICAL
**Impact:** Complete circumvention of anti-sniper protection
**Exploitability:** TRIVIAL

#### Description

The anti-sniper protection checks per-transaction, NOT per-wallet or cumulative across wallets. An attacker can trivially bypass the 5% limit by using multiple wallets.

#### Proof of Concept

```
Scenario: Token launch with 1,000,000,000 tokens (1B supply)
Anti-sniper limit: 5% = 50,000,000 tokens per transaction

Attack:
1. Attacker creates 20 wallets in advance
2. At slot 0 (pool creation), submits 20 transactions simultaneously:
   - Wallet 1 buys 50M tokens (5% ✅ passes)
   - Wallet 2 buys 50M tokens (5% ✅ passes)
   - Wallet 3 buys 50M tokens (5% ✅ passes)
   - ...
   - Wallet 20 buys 50M tokens (5% ✅ passes)

Result: Attacker acquires 1,000M tokens (100% of supply) in slot 0
```

#### Technical Analysis

**File:** `/programs/creator-amm-v2/src/instructions/trade.rs`

The `check_anti_sniper_protection()` function operates in isolation for each transaction:
- No state tracking across wallets
- No cumulative limit enforcement
- No wallet association tracking
- No UserPosition requirement for buys (only for sells)

**Virtual Reserve Behavior:**
- In PreBonding: `virtual_base_reserves` remains constant
- Each transaction checks against the SAME virtual reserve value
- Real reserves decrease, but check uses virtual (unchanging) reserves
- Result: Every transaction in the same slot sees the same 5% limit

#### Economic Impact

```
Example: Token worth $0.01 at launch
- Fair launch intended price: $0.01 per token
- Attacker's 20 wallets acquire 100% at $0.01
- Attacker controls entire supply
- Can manipulate price to $1+ before normal traders enter
- Profit: 100x on entire supply = massive rugpull potential
```

#### Recommended Fix

**Option 1: Global per-slot tracking (complex)**
```rust
// Track cumulative buys per slot in pool state
pub struct Pool {
    // ... existing fields
    pub anti_sniper_cumulative_traded_this_slot: u64,
    pub anti_sniper_last_tracked_slot: u64,
}

// In check_anti_sniper_protection:
if pool.anti_sniper_last_tracked_slot < clock_slot {
    pool.anti_sniper_cumulative_traded_this_slot = 0;
    pool.anti_sniper_last_tracked_slot = clock_slot;
}

let remaining_quota = max_trade_amount
    .saturating_sub(pool.anti_sniper_cumulative_traded_this_slot);

require!(trade_amount <= remaining_quota, ErrorCode::AntiSniperActive);

pool.anti_sniper_cumulative_traded_this_slot = pool
    .anti_sniper_cumulative_traded_this_slot
    .checked_add(trade_amount)?;
```

**Option 2: Use real reserves instead of virtual (simpler)**
```rust
// In buy.rs and sell.rs, pass real_base_reserves instead of pricing reserves
let base_reserve_for_anti_sniper = pool.real_base_reserves; // NOT virtual

trade::check_anti_sniper_protection(
    pool,
    config,
    estimated_output,
    base_reserve_for_anti_sniper, // Use real, not virtual
    clock.slot,
)?;
```

This makes the limit dynamic:
- First buyer: 5% of 1B = 50M tokens max
- After 50M sold: 5% of 950M = 47.5M tokens max
- After 100M sold: 5% of 900M = 45M tokens max
- Naturally rate-limits total acquisition

**Option 3: Require UserPosition for buys (breaks UX)**
- Not recommended: Adds CPI calls and rent costs
- Would allow tracking per-wallet, but too expensive

---

### 🚨 VULNERABILITY #2: MULTIPLE TRANSACTIONS PER WALLET (CRITICAL)

**Severity:** CRITICAL
**Impact:** Single wallet can bypass limit via transaction spam
**Exploitability:** EASY

#### Description

Even a SINGLE wallet can bypass anti-sniper by submitting multiple transactions rapidly. Each transaction is evaluated independently.

#### Proof of Concept

```
Scenario: Same 1B token pool, 5% limit per transaction

Attack (single wallet):
1. Attacker submits 10 transactions in rapid succession (same slot or consecutive slots)
   - Transaction 1: Buy 50M tokens (5% ✅)
   - Transaction 2: Buy 50M tokens (5% ✅)
   - Transaction 3: Buy 50M tokens (5% ✅)
   - ...
   - Transaction 10: Buy 50M tokens (5% ✅)

Result: Single wallet acquires 500M tokens (50% of supply) within anti-sniper window

If transactions span multiple slots (still within 20-slot window):
- Slots 0-19 all have anti-sniper active
- Can execute 20 trades across 20 slots
- Total: 20 × 50M = 1B tokens (100%)
```

#### Why This Works

**Solana Transaction Ordering:**
- Multiple transactions from same wallet can be included in same block
- No built-in rate limiting per wallet
- Each transaction is atomic and independent
- Validators don't coordinate anti-sniper state across transactions

**Current Implementation:**
```rust
// Each transaction reads pool state fresh
let pool = &mut ctx.accounts.pool; // Fresh account load
let base_reserve = pool.get_pricing_reserves().1; // Always virtual in PreBonding
// No memory of previous transactions in this slot
```

#### Transaction Timing Analysis

```
Slot duration: ~400ms
Anti-sniper window: 20 slots = 8 seconds

Theoretical maximum transactions per wallet:
- Conservative: 1 tx per slot × 20 slots = 20 transactions
- Aggressive: Multiple tx per slot × 20 slots = 40+ transactions
- With jito bundles: 10+ tx in single atomic bundle = even easier

Each tx gets 5% → Total acquisition: 100%+ possible
```

#### Recommended Fix

**Same as Vulnerability #1** - requires global per-slot tracking or real reserve usage.

---

### ⚠️  VULNERABILITY #3: TIMING ATTACK AT SLOT BOUNDARY (MEDIUM)

**Severity:** MEDIUM
**Impact:** Attacker can trade unlimited amount at slot 20
**Exploitability:** MODERATE

#### Description

The anti-sniper check uses strict inequality (`<` instead of `<=`), creating an off-by-one vulnerability at the boundary.

#### Code Analysis

```rust
// From state.rs line 185
current_slot < self.created_at_slot.saturating_add(anti_sniper_window)
```

**Boundary Behavior:**
```
Pool created at slot 1000
Anti-sniper window: 20 slots

Active slots:  1000, 1001, 1002, ..., 1019 (20 slots)
Inactive slots: 1020, 1021, 1022, ... (all subsequent)

At slot 1019: anti-sniper ACTIVE (1019 < 1020 ✅)
At slot 1020: anti-sniper INACTIVE (1020 < 1020 ❌)
```

#### Attack Scenario

```
Attacker strategy:
1. Wait until slot 1019 (last anti-sniper slot)
2. Submit maximum 5% trade at slot 1019
3. Immediately submit unlimited trade at slot 1020 (no anti-sniper)
4. Acquire 5% + 95% = 100% within ~400ms window

Timeline:
- Slot 1019 (t=7.6s): Buy 5% (50M tokens)
- Slot 1020 (t=8.0s): Buy 95% (950M tokens)
- Total time from launch: 8 seconds
- Anti-sniper intended protection: 8 seconds
- Effective protection: 7.6 seconds
```

#### Impact Assessment

**Low-Medium Impact:**
- Only affects last 400ms of protection window
- Still requires precise timing
- Doesn't allow 100% acquisition WITHIN window (only immediately after)
- Most users won't notice 400ms difference

**However:**
- Sophisticated bots can exploit this
- Negates the "fair launch" claim
- Creates advantage for technical traders

#### Recommended Fix

**Option 1: Use <= instead of <**
```rust
current_slot <= self.created_at_slot.saturating_add(anti_sniper_window)
```
This extends protection to 21 slots (8.4 seconds).

**Option 2: Keep as-is but document clearly**
```rust
// Anti-sniper active for slots [created_at_slot, created_at_slot + 20)
// Duration: 20 slots (~8 seconds)
// Window closes at slot (created_at_slot + 20)
```

---

### ℹ️  FINDING #4: VIRTUAL RESERVE CALCULATION (INFORMATIONAL)

**Severity:** INFORMATIONAL
**Impact:** Intentional design, not a vulnerability
**Status:** WORKING AS INTENDED ✅

#### Analysis

The anti-sniper check uses **virtual reserves** (which remain constant) rather than **real reserves** (which decrease as tokens are bought).

```rust
// From state.rs get_pricing_reserves()
match self.current_phase {
    CurvePhase::PreBonding => {
        // Returns virtual reserves (constant)
        (self.virtual_quote_reserves, self.virtual_base_reserves)
    },
    CurvePhase::Graduated => {
        // Returns real reserves (dynamic)
        (self.real_quote_reserves, self.real_base_reserves)
    },
}
```

#### Why This Design?

**Virtual reserves represent total supply:**
- Calculated from target market cap and CRX price
- Remain constant throughout PreBonding phase
- Represent the "ideal" bonding curve

**Anti-sniper limit calculation:**
```
max_trade = virtual_base_reserves × 5%
          = total_supply × 5%
          = constant value
```

**Implications:**
- Every transaction sees the same 5% limit (of total supply)
- Does NOT adapt to remaining supply
- Consistent with "no single wallet should get >5% of total"

#### Alternative Interpretation (If Using Real Reserves)

```
Scenario: 1B token supply

Transaction 1 (real reserves = 1B):
- Max trade = 1B × 5% = 50M ✅

Transaction 2 (real reserves = 950M after first trade):
- Max trade = 950M × 5% = 47.5M ✅

Transaction 3 (real reserves = 902.5M):
- Max trade = 902.5M × 5% = 45.1M ✅

This creates DYNAMIC limiting that adapts to remaining supply.
```

#### Conclusion

**Current design using virtual reserves is INTENTIONAL** and enforces:
- "No transaction can acquire more than 5% of TOTAL supply"

**Alternative design using real reserves would enforce:**
- "No transaction can acquire more than 5% of REMAINING supply"

Both are valid, but current design is more permissive (allows Vulnerabilities #1 and #2).

**Recommendation:** Consider switching to real reserves for better protection (see Vulnerability #1 fix).

---

### ✅ FINDING #5: BUY VS SELL ASYMMETRY CHECK (VERIFIED CORRECT)

**Severity:** N/A
**Status:** ✅ SECURE - Applied symmetrically

#### Verification

**Buy transactions:** `/programs/creator-amm-v2/src/instructions/buy.rs` (lines 111-117)
```rust
trade::check_anti_sniper_protection(
    pool,
    config,
    estimated_output, // Tokens user will receive
    base_reserve,
    clock.slot,
)?;
```

**Sell transactions:** `/programs/creator-amm-v2/src/instructions/sell.rs` (lines 105-112)
```rust
trade::check_anti_sniper_protection(
    pool,
    config,
    base_amount, // Tokens user is selling
    base_reserve,
    clock.slot,
)?;
```

**Conclusion:** ✅ Anti-sniper correctly applied to BOTH buy and sell operations.

---

### ✅ FINDING #6: GRADUATED POOL ANTI-SNIPER (VERIFIED CORRECT)

**Severity:** N/A
**Status:** ✅ SECURE - Correctly disabled after graduation

#### Verification

```rust
// From state.rs line 184
pub fn is_anti_sniper_active(&self, current_slot: u64, anti_sniper_window: u64) -> bool {
    matches!(self.current_phase, CurvePhase::PreBonding) &&  // Must be PreBonding
    current_slot < self.created_at_slot.saturating_add(anti_sniper_window)
}
```

**Behavior:**
- PreBonding phase: Anti-sniper active for first 20 slots ✅
- Graduated phase: Anti-sniper ALWAYS disabled (permanent AMM) ✅

**Rationale:**
- PreBonding is the "fair launch" phase requiring protection
- Graduated pools are permanent constant-product AMMs
- No need for anti-sniper in mature pools

**Conclusion:** ✅ Correct behavior. Graduated pools should NOT have anti-sniper.

---

### ✅ FINDING #7: SLOT MANIPULATION ATTACK (VERIFIED SECURE)

**Severity:** N/A
**Status:** ✅ SECURE - Not exploitable

#### Analysis

Anti-sniper uses `clock.slot` from Solana's Clock sysvar:

```rust
let clock = Clock::get()?;
trade::check_anti_sniper_protection(
    pool,
    config,
    trade_amount,
    base_reserve,
    clock.slot, // From Clock sysvar
)?;
```

**Clock Sysvar Security:**
- Provided by Solana runtime
- Cannot be manipulated by users
- Validators reach consensus on slot numbers
- Attempting to fake clock.slot would invalidate transaction

**Conclusion:** ✅ Slot value is secure and tamper-proof.

---

### ⚠️  FINDING #8: BOUNDARY CALCULATION PRECISION (LOW)

**Severity:** LOW
**Impact:** Potential off-by-one in edge cases
**Exploitability:** VERY LOW

#### Code Analysis

```rust
// From trade.rs check_anti_sniper_protection
let max_trade_amount_u128 = (base_reserve as u128)
    .checked_mul(config.anti_sniper_max_trade_bps as u128)
    .ok_or(ErrorCode::MathOverflow)?
    .checked_div(BPS_DENOMINATOR as u128)
    .ok_or(ErrorCode::MathOverflow)?;

require!(
    trade_amount <= max_trade_amount, // Uses <= (inclusive)
    ErrorCode::AntiSniperActive
);
```

#### Edge Case: Exact 5% Boundary

```
Supply: 1,000,000,000 tokens
Max trade: (1,000,000,000 × 500) / 10,000 = 50,000,000 tokens exactly

Trade of exactly 50,000,000 tokens:
- trade_amount = 50,000,000
- max_trade_amount = 50,000,000
- Check: 50,000,000 <= 50,000,000 ✅ PASSES
```

**Behavior:** Trades at EXACTLY 5% are allowed (inclusive boundary).

#### Rounding Edge Cases

```
Supply: 1,000,000,001 tokens (odd number)
Max trade: (1,000,000,001 × 500) / 10,000 = 50,000,000.05 → 50,000,000 (u64 truncation)

Actual maximum: 50,000,000 tokens
Percentage: (50,000,000 / 1,000,000,001) × 100 = 4.9999999995%
```

**Impact:** Negligible. Truncation always rounds DOWN (conservative).

**Conclusion:** ✅ Boundary logic is secure and conservative.

---

## 3. ATTACK VECTOR SUMMARY

### Exploitable Attacks

| Attack Vector | Severity | Difficulty | Cost | Impact |
|--------------|----------|------------|------|--------|
| Multiple wallets (20+) | CRITICAL | Trivial | ~0.02 SOL/wallet | 100% acquisition |
| Multiple transactions per wallet | CRITICAL | Easy | Gas fees only | 50-100% acquisition |
| Slot boundary timing (slot 20) | MEDIUM | Moderate | Gas + timing precision | 100% acquisition in 8.4s |
| Jito bundle atomic execution | HIGH | Moderate | Jito fees + bundle | Guaranteed 50%+ |

### Non-Exploitable (Secure)

| Vector | Status | Reason |
|--------|--------|--------|
| Slot manipulation | ✅ SECURE | Clock sysvar is consensus-based |
| Graduated pool bypass | ✅ SECURE | Correctly disabled (intentional) |
| Buy vs sell asymmetry | ✅ SECURE | Applied symmetrically |
| Rounding errors | ✅ SECURE | Conservative (rounds down) |

---

## 4. RECOMMENDED TEST CASES

### Test Suite: Anti-Sniper Edge Cases

**Location:** Create new file `/tests/anti-sniper-comprehensive.ts`

#### Test Case 1: Multiple Wallet Bypass
```typescript
it("CRITICAL: Should prevent multiple wallets from exceeding cumulative limit", async () => {
  const wallets = Array(10).fill(0).map(() => Keypair.generate());

  // Each wallet tries to buy 5%
  const results = await Promise.all(
    wallets.map(wallet => executeBuy(pool, wallet, fivePercentAmount))
  );

  // EXPECTED: Only first ~2-3 should succeed (if using real reserves)
  // ACTUAL: All 10 succeed (using virtual reserves) ❌
});
```

#### Test Case 2: Rapid Transaction Spam
```typescript
it("CRITICAL: Should prevent single wallet from submitting multiple 5% trades", async () => {
  const trader = Keypair.generate();

  // Submit 5 rapid transactions
  const txPromises = Array(5).fill(0).map(() =>
    executeBuy(pool, trader, fivePercentAmount)
  );

  const results = await Promise.allSettled(txPromises);

  // EXPECTED: Only first should succeed
  // ACTUAL: Multiple succeed ❌
});
```

#### Test Case 3: Boundary Testing
```typescript
it("Should allow trade at exactly 5% limit", async () => {
  const supply = poolData.tokenTotalSupply;
  const exactFivePercent = supply.mul(new BN(500)).div(new BN(10000));

  await executeBuy(pool, trader, exactFivePercent);
  // Should succeed ✅
});

it("Should reject trade at 5.01%", async () => {
  const supply = poolData.tokenTotalSupply;
  const slightlyOver = supply.mul(new BN(501)).div(new BN(10000));

  try {
    await executeBuy(pool, trader, slightlyOver);
    expect.fail("Should have been rejected");
  } catch (e) {
    expect(e.toString()).to.include("AntiSniperActive");
  }
  // Should fail ✅
});
```

#### Test Case 4: Slot Boundary Attack
```typescript
it("Should prevent unlimited trade at slot boundary", async () => {
  // Wait until slot 19 (last anti-sniper slot)
  await waitForSlot(pool.createdAtSlot.add(new BN(19)));

  // Small trade at slot 19 (should pass)
  await executeBuy(pool, trader1, fivePercentAmount);

  // Advance to slot 20
  await waitForSlot(pool.createdAtSlot.add(new BN(20)));

  // Large trade at slot 20 (should pass - anti-sniper disabled)
  await executeBuy(pool, trader2, fiftyPercentAmount);

  // Verify trader2 acquired 50%+ immediately after window
  // This demonstrates the vulnerability
});
```

#### Test Case 5: Virtual vs Real Reserves
```typescript
it("Should reduce max trade size as supply is bought (if using real reserves)", async () => {
  const initialMaxTrade = await getMaxTradeAmount(pool);

  // Execute trade taking 50% of supply
  await graduatePool(pool); // Buy lots of tokens

  const updatedMaxTrade = await getMaxTradeAmount(pool);

  // EXPECTED (if using real reserves): updatedMaxTrade < initialMaxTrade
  // ACTUAL (using virtual): updatedMaxTrade === initialMaxTrade
});
```

#### Test Case 6: Graduated Pool Anti-Sniper
```typescript
it("Should disable anti-sniper after graduation", async () => {
  await graduatePool(pool); // Accumulate 40k CRX

  const poolData = await program.account.pool.fetch(pool);
  expect(poolData.currentPhase).to.have.property('graduated');

  // Large trade should succeed (no anti-sniper)
  await executeBuy(pool, trader, hundredPercentAmount);
  // Should succeed ✅
});
```

#### Test Case 7: Sell-Side Anti-Sniper
```typescript
it("Should apply anti-sniper to sells with same limits as buys", async () => {
  // Buy small amount first
  await executeBuy(pool, trader, onePercentAmount);

  // Try to sell 10% (should fail if > 5% limit)
  const tenPercent = poolData.tokenTotalSupply.mul(new BN(1000)).div(new BN(10000));

  try {
    await executeSell(pool, trader, tenPercent);
    expect.fail("Should have been rejected");
  } catch (e) {
    expect(e.toString()).to.include("AntiSniperActive");
  }
});
```

---

## 5. ADDITIONAL OBSERVATIONS

### Calculation Accuracy

✅ **All arithmetic is properly checked:**
```rust
.checked_mul(config.anti_sniper_max_trade_bps as u128)
.ok_or(ErrorCode::MathOverflow)?
.checked_div(BPS_DENOMINATOR as u128)
.ok_or(ErrorCode::MathOverflow)?
```

✅ **Proper u128 intermediate values prevent overflow**

✅ **Result validated before downcasting to u64:**
```rust
require!(
    max_trade_amount_u128 <= u64::MAX as u128,
    ErrorCode::MathOverflow
);
```

### Fee Interaction

The anti-sniper check in buys uses `estimated_output` which is calculated with `fee = 0`:

```rust
// buy.rs line 103-108
let estimated_output = pool.calculate_output(
    quote_amount,
    quote_reserve,
    base_reserve,
    0, // No fee for estimate
)?;
```

This means:
- Anti-sniper checks the PRE-FEE output
- Actual output will be slightly lower (after fee deduction)
- This is CONSERVATIVE (allows slightly less than checked)
- ✅ Secure design

### WAA Interaction

Anti-sniper and WAA (Weighted Average Anti-dump) are complementary:
- **Anti-sniper:** Limits trade SIZE in first 20 slots
- **WAA:** Adds time-based sell fees (0-30 minutes)

Both can be active simultaneously in early slots:
- Slot 0-19: Anti-sniper active (size limit) + WAA active (sell fee)
- Slot 20-4500: Only WAA active (sell fee)
- Slot 4500+: Neither active

No conflicts or interaction issues identified.

---

## 6. MAINNET DEPLOYMENT CHECKLIST

### Pre-Deployment Fixes Required

⚠️  **CRITICAL - Must fix before mainnet:**

1. **Fix Vulnerability #1 & #2: Multiple wallet/transaction bypass**
   - [ ] Implement global per-slot tracking, OR
   - [ ] Switch to real reserves instead of virtual for anti-sniper, OR
   - [ ] Accept risk and document clearly

2. **Configuration Validation**
   - [ ] Verify `anti_sniper_window_slots = 20` in initialize call
   - [ ] Verify `anti_sniper_max_trade_bps = 500` (5%)
   - [ ] Test with actual mainnet timing (not simulated)

3. **Update DEPLOYER_PUBKEY**
   - [ ] Change from `11111111111111111111111111111111` in `initialize.rs:23`
   - [ ] Use actual deployer wallet address

### Testing Requirements

- [ ] Run all 7 test cases from Section 4
- [ ] Execute 72-hour devnet soak test
- [ ] Simulate 100+ wallet attack
- [ ] Measure actual slot timing on devnet/mainnet-beta
- [ ] Test jito bundle attacks

### Documentation Updates

- [ ] Document known limitations (if not fixing Vuln #1 & #2)
- [ ] Add disclaimer about multiple wallet attacks
- [ ] Update SDK examples with anti-sniper warnings
- [ ] Create monitoring alerts for unusual trading patterns

---

## 7. FINAL ASSESSMENT

### Security Score: 3/10 (UNSAFE FOR MAINNET)

**Critical Issues:**
- 2 CRITICAL vulnerabilities allow complete bypass
- Anti-sniper provides FALSE SENSE OF SECURITY
- Sophisticated attackers can acquire 100% of supply within window
- Current implementation only blocks naive single-transaction large buys

### Recommendations

**Short-term (Pre-Mainnet):**
1. **MUST FIX:** Implement global per-slot tracking or switch to real reserves
2. Test extensively with multiple wallet scenarios
3. Consider reducing window to 10 slots (more realistic protection)

**Medium-term (Post-Mainnet):**
1. Add on-chain monitoring for unusual trading patterns
2. Implement graduated rate limits (e.g., 5% in first 10 slots, 10% in next 10)
3. Consider whitelist for first few slots (KYC'd wallets only)

**Long-term:**
1. Explore cross-transaction cumulative limits
2. Implement reputation system for traders
3. Add circuit breakers for suspicious activity

### Risk Acceptance

If deploying without fixes:
- ✅ Document clearly: "Anti-sniper limits SINGLE transactions, not cumulative"
- ✅ Set expectations: "Sophisticated traders may bypass limits"
- ✅ Consider this a "soft" protection, not hard security
- ✅ Focus marketing on other security features (WAA, graduation continuity, etc.)

---

## 8. QUESTIONS FOR PROTOCOL TEAM

1. **Is the current anti-sniper design intentional?**
   - Are you aware multiple wallets can bypass the 5% limit?
   - Is this acceptable for your threat model?

2. **What is the primary goal of anti-sniper?**
   - Prevent bots? (Current design fails)
   - Prevent retail FOMO? (Current design works)
   - Signal "fair launch" to users? (Current design gives false confidence)

3. **Would you accept trade-offs for stronger protection?**
   - Higher CU costs (for per-slot tracking)?
   - Slightly worse UX (require UserPosition for buys)?
   - More complex graduation logic (if using real reserves)?

4. **What is your risk tolerance?**
   - Can you accept 20 wallets acquiring 100% in first 8 seconds?
   - Would you prefer tighter restrictions (e.g., 1% per transaction)?
   - Do you want additional rate limiting mechanisms?

---

## APPENDIX A: FILE REFERENCES

**Core Implementation:**
- `/programs/creator-amm-v2/src/state.rs` - Lines 183-186 (is_anti_sniper_active)
- `/programs/creator-amm-v2/src/instructions/trade.rs` - Lines 27-57 (check_anti_sniper_protection)
- `/programs/creator-amm-v2/src/instructions/buy.rs` - Lines 111-117 (buy application)
- `/programs/creator-amm-v2/src/instructions/sell.rs` - Lines 105-112 (sell application)

**Configuration:**
- `/programs/creator-amm-v2/src/instructions/initialize.rs` - Lines 70-71 (init parameters)
- `/programs/creator-amm-v2/src/constants.rs` - (No anti-sniper constants, configured at init)

**Existing Tests:**
- `/tests/CRITICAL_TESTS_IMPLEMENTED.ts` - Lines 1117-1260 (5 anti-sniper tests)
- `/tests/critical-coverage.ts` - Lines 1138-1365 (7 anti-sniper tests)
- `/tests/platform-integration-tests.ts` - Lines 328-416 (integration tests)

**Errors:**
- `/programs/creator-amm-v2/src/errors.rs` - Line 20-21 (AntiSniperActive error)

---

## APPENDIX B: RECOMMENDED CODE CHANGES

### Fix Option 1: Use Real Reserves (Simpler)

**File:** `/programs/creator-amm-v2/src/instructions/buy.rs`

```diff
-    // Get correct reserves based on phase (virtual or real)
-    let (quote_reserve, base_reserve) = pool.get_pricing_reserves();
+    // Get pricing reserves for swap calculation
+    let (quote_reserve, base_reserve_for_pricing) = pool.get_pricing_reserves();
+
+    // CRITICAL: Use REAL reserves for anti-sniper (not virtual)
+    // This makes the limit dynamic and prevents multi-wallet bypass
+    let base_reserve_for_anti_sniper = pool.real_base_reserves;

     // Estimate output for anti-sniper check
     let estimated_output = pool.calculate_output(
         quote_amount,
         quote_reserve,
-        base_reserve,
+        base_reserve_for_pricing,
         0, // No fee for estimate
     )?;

     // Shared anti-sniper protection check
     trade::check_anti_sniper_protection(
         pool,
         config,
         estimated_output,
-        base_reserve,
+        base_reserve_for_anti_sniper,  // Use real reserves
         clock.slot,
     )?;
```

**File:** `/programs/creator-amm-v2/src/instructions/sell.rs`

```diff
-    // Get correct reserves based on phase (virtual or real)
-    let (quote_reserve, base_reserve) = pool.get_pricing_reserves();
+    // Get pricing reserves for swap calculation
+    let (quote_reserve, base_reserve_for_pricing) = pool.get_pricing_reserves();
+
+    // CRITICAL: Use REAL reserves for anti-sniper (not virtual)
+    let base_reserve_for_anti_sniper = pool.real_base_reserves;

     // Shared anti-sniper protection check (also applies to sells)
     trade::check_anti_sniper_protection(
         pool,
         config,
         base_amount,
-        base_reserve,
+        base_reserve_for_anti_sniper,  // Use real reserves
         clock.slot,
     )?;
```

**Impact:**
- Limits become dynamic: 5% of REMAINING supply (not total)
- First buyer: 5% of 1B = 50M max
- Second buyer: 5% of 950M = 47.5M max
- Makes multi-wallet attacks less effective (still possible, but harder)
- No additional CU costs
- Simple 2-line change per file

**Trade-off:**
- Doesn't fully prevent multi-wallet attacks (just makes them harder)
- Changes economic behavior slightly (limit decreases over time)

---

### Fix Option 2: Per-Slot Tracking (Comprehensive)

**File:** `/programs/creator-amm-v2/src/state.rs`

```diff
 pub struct Pool {
     // ... existing fields
+
+    /// Anti-sniper cumulative tracking
+    pub anti_sniper_cumulative_bought_this_slot: u64,
+    pub anti_sniper_last_tracked_slot: u64,

     pub bump: u8,
 }

 impl Pool {
-    pub const LEN: usize = ... + 1;   // bump
+    pub const LEN: usize = ... + 8 + 8 + 1;   // +16 bytes for tracking
```

**File:** `/programs/creator-amm-v2/src/instructions/trade.rs`

```diff
 pub fn check_anti_sniper_protection(
-    pool: &Pool,
+    pool: &mut Pool,  // Need mutable for tracking
     config: &Config,
     trade_amount: u64,
     base_reserve: u64,
     clock_slot: u64,
 ) -> Result<()> {
     if pool.is_anti_sniper_active(clock_slot, config.anti_sniper_window_slots) {
+        // Reset counter if new slot
+        if pool.anti_sniper_last_tracked_slot < clock_slot {
+            pool.anti_sniper_cumulative_bought_this_slot = 0;
+            pool.anti_sniper_last_tracked_slot = clock_slot;
+        }
+
         let max_trade_amount_u128 = (base_reserve as u128)
             .checked_mul(config.anti_sniper_max_trade_bps as u128)
             .ok_or(ErrorCode::MathOverflow)?
             .checked_div(BPS_DENOMINATOR as u128)
             .ok_or(ErrorCode::MathOverflow)?;

         require!(
             max_trade_amount_u128 <= u64::MAX as u128,
             ErrorCode::MathOverflow
         );
         let max_trade_amount = max_trade_amount_u128 as u64;

+        // Check remaining quota in this slot
+        let remaining_quota = max_trade_amount
+            .saturating_sub(pool.anti_sniper_cumulative_bought_this_slot);

         require!(
-            trade_amount <= max_trade_amount,
+            trade_amount <= remaining_quota,
             ErrorCode::AntiSniperActive
         );

+        // Update cumulative counter
+        pool.anti_sniper_cumulative_bought_this_slot = pool
+            .anti_sniper_cumulative_bought_this_slot
+            .checked_add(trade_amount)
+            .ok_or(ErrorCode::MathOverflow)?;
     }
     Ok(())
 }
```

**Impact:**
- Fully prevents multi-wallet and multi-transaction attacks
- Enforces TRUE 5% per slot limit (cumulative across all traders)
- Adds ~16 bytes to Pool struct (minimal rent increase)
- Adds ~1-2k CU per trade (for counter logic)
- More complex implementation

**Trade-off:**
- Higher compute units
- Larger account size
- More complex state management
- Could create race conditions if not careful

---

**END OF REPORT**

Generated: 2026-01-09
Agent: Security Agent 5 - Anti-Sniper Circumvention Analysis
Status: CRITICAL VULNERABILITIES FOUND - NOT SAFE FOR MAINNET DEPLOYMENT WITHOUT FIXES
