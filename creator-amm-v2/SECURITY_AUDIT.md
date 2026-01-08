# 🔒 **CREATOR AMM V2 - COMPREHENSIVE SECURITY AUDIT**

**Audit Date:** 2026-01-08
**Auditor:** AI Security Analysis
**Protocol Version:** Pre-mainnet
**Severity Levels:** 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

---

## 🔴 **CRITICAL VULNERABILITIES**

### **CRIT-001: Virtual Reserve Accounting Mismatch**
**File:** `buy.rs:200-205`
**Severity:** 🔴 **CRITICAL - BREAKS BONDING CURVE MATH**

**Issue:**
```rust
// WRONG: Mixing before-fee and after-fee amounts
pool.virtual_quote_reserves += quote_amount;        // Full amount
pool.virtual_base_reserves -= base_output;          // After-fee amount
```

**Impact:**
- Breaks constant product invariant (x * y = k)
- Each trade permanently corrupts the bonding curve
- Price calculations become increasingly wrong
- Virtual reserves drift from mathematical correctness
- After many trades, pricing could fail catastrophically

**Exploit:**
1. User buys tokens
2. Virtual reserves update with mismatched amounts
3. K value increases artificially
4. Subsequent trades get worse prices
5. Attacker can manipulate curve by making many small trades

**Fix:**
```rust
// CORRECT: Use before-fee amount for virtual reserves
pool.virtual_quote_reserves = pool.virtual_quote_reserves
    .checked_add(quote_amount)
    .ok_or(ErrorCode::MathOverflow)?;
pool.virtual_base_reserves = pool.virtual_base_reserves
    .checked_sub(base_output_before_fee)  // ← Use before-fee
    .ok_or(ErrorCode::MathOverflow)?;
```

**Status:** ❌ MUST FIX BEFORE ANY DEPLOYMENT

---

### **CRIT-002: Same Accounting Bug in Sell**
**File:** `sell.rs:182-187`
**Severity:** 🔴 **CRITICAL - SAME AS CRIT-001**

**Issue:**
```rust
// WRONG: Same mixing of before/after fee
pool.virtual_base_reserves += base_amount;
pool.virtual_quote_reserves -= quote_output_before_fee;  // Uses before-fee here!
```

**Impact:** Same as CRIT-001 but in reverse direction

**Fix:**
```rust
// Should use quote_output (after fee) to match the transfer
// OR change transfer logic to match reserve accounting
```

**Status:** ❌ MUST FIX BEFORE ANY DEPLOYMENT

---

### **CRIT-003: Re-entrancy Possible via Check-Phase-Transition**
**File:** `buy.rs:230`, `sell.rs:189`
**Severity:** 🔴 **CRITICAL - RE-ENTRANCY RISK**

**Issue:**
```rust
// Updates happen BEFORE checking phase transition
pool.real_quote_reserves = ...;
pool.real_base_reserves = ...;

// Then checks if graduation threshold met
let transitioned = pool.check_phase_transition()?;
```

**Impact:**
- If CPI call happens during phase transition, state is dirty
- Graduation could happen mid-trade
- Next trade in same transaction sees mixed state
- Potential for flash loan attacks at graduation boundary

**Fix:**
```rust
// Check phase transition BEFORE reserve updates
let will_graduate = pool.real_quote_reserves + quote_amount >= pool.graduation_threshold_crx;

// Update reserves
...

// Then apply transition if needed
if will_graduate {
    pool.current_phase = CurvePhase::Graduated;
}
```

**Status:** 🟡 MEDIUM RISK (Solana's single-threaded execution reduces risk, but still bad practice)

---

## 🟠 **HIGH SEVERITY ISSUES**

### **HIGH-001: No Vault Authority Validation**
**File:** `buy.rs:26-34`, `sell.rs:24-34`
**Severity:** 🟠 **HIGH**

**Issue:**
```rust
#[account(
    mut,
    constraint = quote_vault.key() == pool.quote_vault,
)]
pub quote_vault: Account<'info, TokenAccount>,
```

**Missing:** No check that vault.authority == pool.authority!

**Impact:**
- Attacker could create pool with malicious vault authority
- Could drain funds after pool creation
- Pool creator could rug by using vault with different authority

**Fix:**
```rust
#[account(
    mut,
    constraint = quote_vault.key() == pool.quote_vault,
    constraint = quote_vault.authority == pool.key() @ ErrorCode::InvalidVaultAuthority,
)]
pub quote_vault: Account<'info, TokenAccount>,
```

**Status:** ❌ MUST FIX

---

### **HIGH-002: Fee Recipient Can Be Anyone**
**File:** `buy.rs:56`, `sell.rs:56`
**Severity:** 🟠 **HIGH**

**Issue:**
```rust
constraint = fee_recipient_account.owner == config.fee_recipient,
```

**Missing:** No check that fee_recipient_account.mint == pool.quote_mint!

**Impact:**
- Attacker passes wrong mint fee recipient account
- Transfer fails OR goes to wrong token account
- Protocol fees lost or misdirected

**Fix:**
```rust
constraint = fee_recipient_account.owner == config.fee_recipient,
constraint = fee_recipient_account.mint == pool.quote_mint @ ErrorCode::InvalidFeeRecipient,
```

**Status:** ❌ MUST FIX

---

### **HIGH-003: No Pool Initialization Check**
**File:** `buy.rs`, `sell.rs`
**Severity:** 🟠 **HIGH**

**Issue:**
- No validation that pool is properly initialized
- Could interact with half-initialized pool
- No check that vaults actually have tokens

**Impact:**
- Undefined behavior with uninitialized pools
- Potential for exploiting race conditions during initialization

**Fix:**
```rust
// In Pool state, add:
pub is_initialized: bool,

// In buy/sell, check:
require!(pool.is_initialized, ErrorCode::PoolNotInitialized);
```

**Status:** 🟡 MEDIUM (Anchor's init constraint helps, but explicit check is better)

---

## 🟡 **MEDIUM SEVERITY ISSUES**

### **MED-001: Oracle Price Not Refreshed**
**File:** `buy.rs`, `sell.rs`
**Severity:** 🟡 **MEDIUM**

**Issue:**
- Oracle price only fetched at pool creation
- Never refreshed during trades
- `pool.last_crx_price_usd` becomes stale

**Impact:**
- Graduation threshold calculated at launch CRX price
- If CRX 10x, pools graduate too early (in USD terms)
- If CRX drops 90%, pools never graduate

**Trade-off:**
- **Pro:** Availability (trading continues if oracle fails)
- **Con:** Threshold not actually "$40k" over time

**Recommendation:**
- Add optional oracle refresh every N trades
- OR clearly document this is "CRX-denominated graduation" not "USD-denominated"

**Status:** ⚠️ **DESIGN DECISION** (Not a bug, but understand the implications)

---

### **MED-002: No Maximum Trade Size (Post Anti-Sniper)**
**File:** `buy.rs`, `sell.rs`
**Severity:** 🟡 **MEDIUM**

**Issue:**
- Anti-sniper only active for first N slots
- After that, no trade size limits
- Someone could buy entire supply in one trade

**Impact:**
- Flash loan attacks possible
- Price manipulation
- MEV opportunities

**Recommendation:**
- Add global max trade size (e.g., 10% of supply per trade)
- Or accept this as feature (permissionless trading)

**Status:** ⚠️ **DESIGN DECISION**

---

### **MED-003: Graduated Pools Never Update Virtual Reserves**
**File:** `buy.rs:195-206`
**Severity:** 🟡 **MEDIUM**

**Issue:**
```rust
if matches!(pool.current_phase, CurvePhase::Graduated) {
    // Post-graduation: Update REAL reserves only
    // (Virtual reserves frozen at graduation)
} else {
    // Update virtual reserves
}
```

**Impact:**
- After graduation, virtual reserves frozen forever
- `get_spot_price()` still uses virtual reserves!
- Price reporting wrong after graduation

**Fix:**
```rust
pub fn get_spot_price(&self) -> Result<u64> {
    let (quote_res, base_res) = self.get_pricing_reserves(); // Use correct reserves
    ...
}
```

**Status:** 🔍 **CHECK IF ISSUE** (depends on how spot price is used)

---

## 🟢 **LOW SEVERITY / INFO**

### **LOW-001: Floating Point in Messages**
**File:** Multiple
**Severity:** 🟢 **LOW**

**Issue:**
```rust
msg!("   New Price: {} CRX per token",
    (new_quote_res as f64) / (new_base_res as f64)
);
```

**Impact:**
- Only in logging, not in state
- Could theoretically differ from actual integer price
- Confusing for debugging

**Recommendation:** Add comment that this is display-only

---

### **LOW-002: Dead Code in Linear Curve (Fixed)**
**Status:** ✅ **RESOLVED** (Linear curve removed)

---

### **LOW-003: Config Fields Unused**
**File:** `state.rs:16-22`, `initialize.rs:36-39`
**Severity:** 🟢 **LOW**

**Issue:**
```rust
pub pre_bonding_fee_bps: u16,     // NOT USED ANYMORE
pub post_bonding_fee_bps: u16,    // NOT USED ANYMORE
pub pre_bonding_threshold_usd: u64, // NOT USED
pub graduation_threshold_usd: u64,  // NOT USED
```

**Impact:**
- Wasted storage (rent)
- Confusing code
- initialize.rs sets them but they're never read

**Recommendation:** Remove unused fields in next version

**Status:** ⚠️ TECHNICAL DEBT

---

## 🎯 **ARCHITECTURE REVIEW**

### ✅ **STRENGTHS**

1. **Checked Math Everywhere** - All arithmetic uses checked_ operations
2. **No Floating Point in State** - Only integers in calculations
3. **Slippage Protection Required** - min_base_amount / min_quote_amount mandatory
4. **PDA Security** - Proper seeds and bump seeds
5. **CRX Enforcement** - Protocol-level constraint cannot be bypassed
6. **PumpSwap Model** - Correctly implements virtual→real transition
7. **No Admin Backdoors** - No emergency withdraw functions

### ⚠️ **WEAKNESSES**

1. **Reserve Accounting Bug** - CRIT-001 and CRIT-002 are showstoppers
2. **Missing Vault Validation** - HIGH-001 allows malicious vaults
3. **Oracle Not Refreshed** - Thresholds drift from USD values
4. **No Pause Mechanism** - Can't stop protocol in emergency
5. **No Upgrade Authority** - Can't fix bugs without migration

---

## 🔍 **COMPARISON TO KNOWN EXPLOITS**

### **vs PumpSwap Vulnerabilities:**
✅ **Fixed:** Missing slippage protection
✅ **Fixed:** Floating point precision issues
❌ **New:** Virtual reserve accounting bug

### **vs Meteora:**
✅ **Simpler:** Fewer attack vectors due to simplicity
❌ **Missing:** Their battle-tested vault security patterns

### **vs Unisocks:**
✅ **Similar:** Core constant product formula
❌ **Different:** They didn't have dual-phase transitions

---

## 📋 **PRE-MAINNET CHECKLIST**

### **MUST FIX (Blockers):**
- [ ] CRIT-001: Fix virtual reserve accounting in buy.rs
- [ ] CRIT-002: Fix virtual reserve accounting in sell.rs
- [ ] HIGH-001: Add vault authority validation
- [ ] HIGH-002: Add fee recipient mint validation

### **SHOULD FIX (Important):**
- [ ] Add pool initialization flag
- [ ] Add vault authority checks in create_pool
- [ ] Fix get_spot_price() to use correct reserves
- [ ] Remove unused Config fields
- [ ] Add emergency pause mechanism

### **NICE TO HAVE:**
- [ ] Oracle price refresh option
- [ ] Maximum trade size limits
- [ ] Upgrade authority pattern
- [ ] Events for indexing

### **REQUIRED BEFORE MAINNET:**
- [ ] Professional security audit (2+ firms)
- [ ] Formal verification of bonding curve math
- [ ] Extensive fuzzing tests
- [ ] Economic exploit testing
- [ ] Bug bounty program ($100k+)
- [ ] Insurance/coverage analysis

---

## 💰 **POTENTIAL ECONOMIC EXPLOITS**

### **Exploit 1: Reserve Corruption**
1. Attacker makes many small buys
2. Each trade corrupts virtual reserves slightly (CRIT-001)
3. After 1000 trades, K value drifted significantly
4. Attacker sells at manipulated price
5. **Profit:** Depends on drift magnitude

### **Exploit 2: Graduation Boundary**
1. Pool near graduation threshold
2. Attacker flash loans large CRX amount
3. Buys to push over graduation
4. Phase switches to Graduated mid-transaction
5. Arbitrages price difference between virtual/real
6. Repays flash loan
7. **Profit:** ~0.5-2% of graduation threshold

### **Exploit 3: Malicious Pool Creation**
1. Attacker creates pool with vault authority they control
2. Users trade normally
3. Once pool has value, attacker drains vault
4. **Profit:** All funds in vault

---

## 🛠️ **SDK DESIGN RECOMMENDATIONS**

To make this AI-compatible and developer-friendly:

```typescript
// Simple, declarative API
const pool = await creatorAMM.createPool({
  targetMarketCap: "10k",           // AI-friendly: accepts "$10k" or 10000
  tokenSupply: 1_000_000,
  fee: "0.25%",                     // Or 25 (basis points)
  curve: "exponential",             // Or "constant"
  graduationThreshold: "40k",
  token: {
    name: "My Token",
    symbol: "MTK",
    // Mint created automatically
  },
});

// AI can generate this easily from natural language:
// "Launch a token with 1M supply at $10k market cap with exponential curve and 0.25% fees"
```

**Key Features for AI Compatibility:**
1. **String parsing** - Accept "$40k", "40000", or 40_000_000_000
2. **Sensible defaults** - Most params optional
3. **Validation** - Clear error messages
4. **Simulation** - Dry-run mode to preview results
5. **Examples** - Comprehensive docs with copy-paste snippets

---

## 🎓 **EDUCATION: WHAT THE BUGS TEACH US**

**Reserve Accounting (CRIT-001):**
Always match reserve updates to actual token transfers. If you transfer X tokens, reserves should change by exactly X, not X-fee or X+fee. The AMM curve math depends on this invariant.

**Vault Security (HIGH-001):**
Never assume accounts are correct just because keys match. Always validate:
- Authority
- Owner
- Mint
- Initialized state

**Phase Transitions (CRIT-003):**
State changes during transactions need careful ordering. Check-Effect-Interaction pattern:
1. Check (validation)
2. Effect (state updates)
3. Interaction (external calls)

---

## ✅ **VERDICT**

**Current State:** ❌ **NOT READY FOR MAINNET**

**Critical Issues:** 2 showstoppers (reserve accounting)
**High Issues:** 2 important (vault validation)
**Medium Issues:** 3 design questions

**Timeline to Mainnet:**
1. Fix critical + high issues: **1-2 weeks**
2. Professional audit: **4-6 weeks**
3. Bug bounty + testing: **4-8 weeks**
4. **Total:** 9-16 weeks minimum

**After Fixes:** Core design is solid, PumpSwap model correctly implemented, good foundation.

