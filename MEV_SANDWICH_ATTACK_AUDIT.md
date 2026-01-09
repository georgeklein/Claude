# MEV & Sandwich Attack Security Audit
**Scale AMM Protocol - Comprehensive Analysis**
**Date:** 2026-01-09
**Auditor:** Security Analysis (Post-Permissionless Refactor)
**Protocol Version:** creator-amm-v2 (commit d67021a)
**Status:** PRE-MAINNET SECURITY ASSESSMENT

---

## Executive Summary

This audit analyzes MEV (Maximal Extractable Value) and sandwich attack vectors in the Scale AMM protocol following the removal of centralized controls (emergency pause, graduation cooldown). The protocol demonstrates **strong protections against standard MEV attacks** via WAA mechanism and oracle staleness validation, but contains **1 CRITICAL graduation exploit** that remains unmitigated.

### Critical Findings

| Attack Vector | Severity | WAA Enabled | WAA Disabled | Profit Potential | Status |
|--------------|----------|-------------|--------------|------------------|--------|
| **Graduation Price Jump** | **CRITICAL** | **Exploitable** | **Exploitable** | **800-1500% ROI** | 🚨 **UNMITIGATED** |
| Standard Sandwich | LOW | Protected | HIGH | -5% to +30% | ⚠️ Conditional |
| Flash Loan (Non-Graduation) | LOW | Protected | MEDIUM | <5% | ⚠️ Conditional |
| JIT Liquidity | N/A | Not Applicable | Not Applicable | 0% | ✅ Protected |
| Oracle Front-Running | LOW | Protected | Protected | <1% | ✅ Mitigated |

### Overall Verdict

**NOT READY FOR MAINNET** - Graduation price discontinuity MUST be fixed before deployment.

---

## 1. Standard MEV: Front-Run → Trade → Back-Run

### Attack Scenario

Classic sandwich attack:
1. Attacker observes victim's pending buy in mempool
2. Attacker front-runs with buy (pushes price up)
3. Victim's trade executes at inflated price
4. Attacker back-runs with sell (captures spread)

### Technical Analysis

**Pre-Conditions:**
- Pool liquidity: 10,000 CRX × 800,000 tokens
- Victim wants to buy with 1,000 CRX (10% of liquidity)
- Attacker has 500 CRX capital

**Attack Execution:**

```
Slot N: Attacker front-run buy
  - Input: 500 CRX (after 1% fee: 495 CRX swap)
  - Output: (495 × 800,000) / (10,000 + 495) = 37,714 tokens
  - New price: 10,495 / 762,286 = 0.01376 CRX/token (+4.76%)

Slot N or N+1: Victim buy executes
  - Input: 1,000 CRX (after 1% fee: 990 CRX swap)
  - Output: (990 × 762,286) / (10,495 + 990) = 65,676 tokens
  - New price: 11,485 / 696,610 = 0.01649 CRX/token (+19.8% from start)

Slot N+1: Attacker back-run sell
  - Input: 37,714 tokens
  - Output before fees: (37,714 × 11,485) / (696,610 + 37,714) = 589.8 CRX
  - Base fee (1%): 5.9 CRX
  - WAA penalty (10% if same slot): 59.0 CRX
  - Net received: 589.8 - 5.9 - 59.0 = 524.9 CRX
```

**Profitability Analysis:**

WITH WAA (same slot):
- Capital: 500 CRX
- Received: 524.9 CRX
- Profit: 24.9 CRX (4.98% ROI)
- Total fees paid: 70.9 CRX (14.18%)

**Break-even calculation:**
- Requires victim trade > 10% of pool liquidity
- Rare except for low-liquidity pools or whales

WITH WAA (30min delay):
- WAA penalty drops to 0%
- Total fees: 1% + 1% = 2%
- Profit: 89.8 CRX (17.96% ROI)
- **BUT:** 30-minute hold exposes attacker to:
  - Price normalization from arbitrageurs
  - Other traders entering/exiting
  - Significant price risk (could lose entire profit)

WITHOUT WAA:
- Total fees: 2%
- Profit: 89.8 CRX (17.96% ROI)
- **Highly profitable and low-risk**

### Protocol-Specific Protections

✅ **WAA (Weighted Average Age) Mechanism**
```rust
// From state.rs:468-502
pub fn calculate_extra_sell_fee_bps(&self, current_slot: u64) -> Result<u64> {
    let age = current_slot.saturating_sub(self.avg_entry_slot);

    if age <= 75 {           // 0-30 seconds
        return Ok(1_000);     // 10% penalty
    }
    if age <= 750 {          // 30s-5min
        // Decay 10% → 1%
    }
    if age <= 4_500 {        // 5-30min
        // Decay 1% → 0%
    }
    Ok(0)                    // 30min+: no penalty
}
```

✅ **Slippage Protection**
```rust
// From trade.rs:86-95
pub fn validate_slippage(output_amount: u64, min_output_amount: u64) -> Result<()> {
    require!(output_amount >= min_output_amount, ErrorCode::SlippageExceeded);
}
```
- Victim sets `min_base_amount` to prevent execution at unfavorable prices
- If attacker front-run moves price too much, victim's tx fails
- Victim loses nothing (except tx fees)

✅ **Solana Parallel Execution**
- Unlike Ethereum's sequential execution, Solana runs non-conflicting txs in parallel
- Front-running harder to guarantee (transactions may execute out of order)
- Reduces sandwich attack success rate

### Verdict: Standard Sandwich Attacks

| Pool Type | Protection | Risk Level | User Action |
|-----------|-----------|------------|-------------|
| WAA Enabled | Strong (10-12% penalty) | ✅ LOW | Set 2-5% slippage |
| WAA Disabled | Weak (2% fees only) | 🚨 HIGH | Set 5-10% slippage |

**READY:** Yes (with WAA enabled)
**NOT READY:** Pools with `disable_waa=true` vulnerable

---

## 2. Graduation Transition Sandwich (CRITICAL)

### Unique Protocol Vector

This is the **most critical MEV vulnerability** in Scale AMM and represents a **fundamental design flaw** not present in standard AMMs.

### Root Cause: Virtual Reserve Discontinuity

**Pool Initialization (from create_pool.rs:209-213):**
```rust
pool.virtual_quote_reserves = virtual_quote_reserves;  // Calculated from target MC
pool.virtual_base_reserves = virtual_base_reserves;    // = token_supply

pool.real_quote_reserves = 0;           // STARTS AT ZERO!
pool.real_base_reserves = token_supply; // All tokens deposited
```

**Pricing Logic (from state.rs:198-210):**
```rust
pub fn get_pricing_reserves(&self) -> (u64, u64) {
    match self.current_phase {
        CurvePhase::PreBonding => {
            // Uses VIRTUAL reserves (calculated from target MC)
            (self.virtual_quote_reserves, self.virtual_base_reserves)
        },
        CurvePhase::Graduated => {
            // Uses REAL reserves (actual vault balances)
            (self.real_quote_reserves, self.real_base_reserves)
        },
    }
}
```

**Reserve Updates During PreBonding (from trade.rs:130-136):**
```rust
// PRE-BONDING: Update real reserves only (virtual reserves stay constant)
pool.real_quote_reserves = pool.real_quote_reserves
    .checked_add(input_amount)
    .ok_or(ErrorCode::MathOverflow)?;
pool.real_base_reserves = pool.real_base_reserves
    .checked_sub(output_amount)
    .ok_or(ErrorCode::MathOverflow)?;
// NOTE: virtual_quote_reserves and virtual_base_reserves NEVER CHANGE!
```

### The Exploit: Price Jump at Graduation

**Concrete Example:**

Initial State (Pool Creation):
```
Target MC: $10,000 USD
CRX Price: $2.00
Token Supply: 1,000,000 (6 decimals)
Graduation Threshold: $40,000 = 20,000 CRX

Virtual Reserves (for pricing):
- Virtual CRX = ($10k / $2) = 5,000 CRX
- Virtual Tokens = 1,000,000
- Initial Price = 0.005 CRX/token

Real Reserves (actual vault):
- Real CRX = 0 (empty!)
- Real Tokens = 1,000,000
```

After Trading Accumulates 19,900 CRX (just below graduation):
```
Virtual Reserves (UNCHANGED since creation):
- Virtual CRX = 5,000 CRX (still!)
- Virtual Tokens = 1,000,000 (still!)
- Price = 0.005 CRX/token (FLAT!)

Real Reserves (accumulated from trades):
- Real CRX = 19,900 CRX
- Real Tokens = ~200,000 (most sold)
```

**Attack: Flash Loan Graduation Trigger**

Slot N: Attacker flash borrows 1,000 CRX
```
Buy using VIRTUAL pricing (PreBonding phase):
- Swap amount: 990 CRX (after 1% fee)
- Output = (990 × 1,000,000) / (5,000 + 990) = 165,275 tokens
- Cost per token = 990 / 165,275 = 0.00599 CRX

Real reserves after buy:
- Real CRX: 19,900 + 990 = 20,890 CRX
- Real tokens: 200,000 - 165,275 = 34,725 tokens

Pool graduates! (real_quote_reserves >= 20,000)
Pricing switches to REAL reserves!
```

Slot N (same transaction): Sell using REAL pricing
```
Sell 165,275 tokens using GRADUATED pricing:
- Input: 165,275 tokens
- Output before fees: (165,275 × 20,890) / (34,725 + 165,275) = 17,232 CRX
- Price per token = 17,232 / 165,275 = 0.1043 CRX

PRICE JUMPED FROM 0.00599 → 0.1043 CRX (1,741% increase!)

Fees:
- Base (1%): 172 CRX
- WAA (10%): 1,723 CRX
- Total fees: 1,895 CRX

Net received: 17,232 - 1,895 = 15,337 CRX

Flash loan repayment: 1,000 + 1 (0.1% fee) = 1,001 CRX

PROFIT: 15,337 - 1,001 = 14,336 CRX (1,433% ROI!)
```

### Attack Variations

**Variation 1: Minimal Capital (Pool at 19,990 CRX)**
```
- Flash loan only 100 CRX
- Buy tokens at virtual price (0.005 CRX)
- Triggers graduation
- Sell at real price (0.10+ CRX)
- Estimated ROI: 800-1200%
```

**Variation 2: Patient Attacker (No Flash Loan)**
```
- Buy tokens normally when pool at 15,000 CRX
- Hold until pool reaches 19,900 CRX
- Buy 100 CRX more to trigger graduation
- Sell all tokens at 20x higher price
- Avoids WAA penalty (held >30min)
- Estimated ROI: 1,500-2,000%
```

**Variation 3: Multi-Pool Exploit**
```
- Identify 10 pools near graduation
- Execute attack on all 10 in single transaction
- Total profit: 10 × 14,000 CRX = 140,000 CRX
- Attack window: Any pool approaching $40k
```

### Why Traditional Protections FAIL

🚫 **WAA Penalty (10-12%):**
- Designed to stop normal flash loans
- 1,433% profit >> 12% fees
- Completely ineffective

🚫 **Anti-Sniper (5% limit, 8 seconds):**
- Only active first 20 slots after pool creation
- Graduation happens later (after accumulating $40k)
- Not applicable

🚫 **Slippage Protection:**
- Attacker controls their own `min_base_amount`
- No protection against self-inflicted trades
- Irrelevant

🚫 **Oracle Staleness (60 seconds):**
- Prevents stale CRX price exploitation
- Does NOT prevent graduation price jump
- Different vulnerability

🚫 **Emergency Pause (REMOVED):**
- Was removed for permissionlessness
- Can't stop attack even if it existed
- Attack completes in single slot

### Mathematical Proof

Price discontinuity at graduation:
```
Virtual Price (PreBonding) = virtual_quote / virtual_base
Real Price (Graduated) = real_quote / real_base

At graduation:
- virtual_quote = 5,000 (initial, never changes)
- virtual_base ≈ 1,000,000 (initial, never changes)
- real_quote = 20,000 (accumulated threshold)
- real_base ≈ 200,000 (80% sold during bonding)

Price jump = (real_quote / real_base) / (virtual_quote / virtual_base)
           = (20,000 / 200,000) / (5,000 / 1,000,000)
           = 0.10 / 0.005
           = 20x (2,000% increase)

Worst case (90% sold):
real_base = 100,000
Price jump = (20,000 / 100,000) / (5,000 / 1,000,000)
           = 0.20 / 0.005
           = 40x (4,000% increase!)
```

### Impact Assessment

**Every Pool Vulnerable:**
- 100% of pools can be exploited at graduation
- Predictable attack window (approaching $40k)
- Trivial to execute (basic flash loan)

**Economic Damage:**
- Attacker profit: $14,000+ per pool (at $2 CRX)
- Early supporters: Miss graduation price discovery
- Protocol reputation: Severe damage
- Creator fees: Reduced from instant dump

**Exploitability:**
- Skill required: Low (copy-paste flash loan code)
- Capital required: 0 (flash loans)
- Success rate: 100% (deterministic)

### Verdict: Graduation Sandwich

🚨🚨🚨 **CRITICAL - BLOCKS MAINNET DEPLOYMENT**

**READY:** NO - Must fix before launch
**Severity:** 10/10
**Priority:** URGENT

---

## 3. JIT (Just-In-Time) Liquidity Attacks

### Attack Scenario

Attacker adds liquidity right before large trade, then removes it after:
1. Detect large pending trade in mempool
2. Add liquidity to pool (increase reserves)
3. Large trade executes with less slippage
4. Attacker captures fees
5. Remove liquidity

### Analysis: Not Applicable to Scale AMM

**Why JIT Doesn't Work:**

❌ **No Liquidity Provider Mechanism**
```rust
// From lib.rs - Available Instructions:
pub fn initialize(...)      // Admin only
pub fn create_pool(...)     // Creates pool, no add_liquidity
pub fn buy(...)             // Users can only buy/sell
pub fn sell(...)
pub fn update_crx_price(...) // Admin only
```

No `add_liquidity()` or `remove_liquidity()` instructions exist!

❌ **Virtual Reserves Are Constant**
- PreBonding: Virtual reserves never change
- Graduated: Only trades affect reserves
- No way to inject liquidity and extract it

❌ **Permanent Liquidity Model**
- CRX accumulates permanently in graduated pools
- No withdrawal mechanism
- Tokens trapped in pool forever

### Verdict: JIT Attacks

✅ **PROTECTED** - Architecture prevents JIT liquidity attacks
**Reason:** No LP mechanism, permanent liquidity model

---

## 4. Oracle Front-Running

### Attack Scenario

Attacker exploits CRX price updates:
1. Monitor for `update_crx_price` instruction
2. Front-run with trade before price updates
3. Price update affects virtual reserves/graduation threshold
4. Profit from price change

### Analysis

**Price Update Mechanism (from update_crx_price.rs):**
```rust
#[account(
    constraint = authority.key() == config.authority @ ErrorCode::Unauthorized
)]
pub authority: Signer<'info>,

pub fn handler(ctx: Context<UpdateCrxPrice>, new_price_usd: u64) -> Result<()> {
    // Validation
    require!(new_price_usd >= CRX_PRICE_MIN_USD); // $0.01
    require!(new_price_usd <= CRX_PRICE_MAX_USD); // $1,000

    // Update
    config.crx_price_usd = new_price_usd;
    config.crx_price_last_updated = clock.unix_timestamp;
}
```

**Protections:**

✅ **Authority-Only Updates**
- Only protocol authority can call
- External attackers can't manipulate
- Not exploitable by traders

✅ **Price Bounds Validation**
- Min: $0.01
- Max: $1,000
- Prevents extreme manipulation

✅ **Staleness Validation (60 seconds)**
```rust
// From state.rs:70-81
pub fn validate_price_freshness(&self, clock: &Clock) -> Result<()> {
    let age = clock.unix_timestamp
        .checked_sub(self.crx_price_last_updated)?;

    require!(age <= self.oracle_max_age_seconds, ErrorCode::OraclePriceStale);
}
```
- Rejects trades if price >60 seconds old
- Prevents flash loan arbitrage on stale prices
- Blocks multi-block manipulation

**Theoretical Attack (Requires Compromised Authority):**

IF authority is malicious:
```
1. Authority updates CRX price from $2 → $2.20 (+10%)
2. Virtual reserves recalculated (affects graduation threshold)
3. Malicious authority could profit from:
   - Knowing price change before public
   - Trading before announcing

Expected profit: <5% (price change is small, one-time)
```

**Reality:**
- Requires compromised authority (trusted entity)
- Not external MEV attack
- Different threat model (insider risk)

### Verdict: Oracle Front-Running

✅ **PROTECTED** - Authority-controlled with bounds validation
**Risk:** LOW - Requires insider threat, not external MEV

---

## 5. Unique MEV Vectors in Scale AMM

### 5.1 Anti-Sniper Bypass (Multiple Wallets)

**Current Implementation:**
```rust
// From trade.rs:24-57
pub fn check_anti_sniper_protection(
    pool: &Pool,
    config: &Config,
    trade_amount: u64,  // Checks SINGLE TRADE only!
    base_reserve: u64,
    clock_slot: u64,
) -> Result<()> {
    if pool.is_anti_sniper_active(clock_slot, config.anti_sniper_window_slots) {
        let max_trade_amount = (base_reserve × 500) / 10_000; // 5% limit
        require!(trade_amount <= max_trade_amount, ErrorCode::AntiSniperActive);
    }
}
```

**Vulnerability:**
- Only checks per-trade amount
- Does NOT track cumulative per-user
- Can be bypassed with multiple wallets/transactions

**Exploit:**
```
Attacker creates 10 wallets during first 20 slots:
- Wallet 1: Buy 5% at slot 1
- Wallet 2: Buy 5% at slot 2
- ...
- Wallet 10: Buy 5% at slot 10

Total accumulated: 50% of supply in 10 slots (~4 seconds)
Anti-sniper limit bypassed!
```

**With WAA Enabled:**
- All wallets tracked separately
- When selling, each pays 10% penalty
- Total fees: 1% buy + 1% sell + 10% WAA = 12%
- **Mitigated** - Sniping unprofitable

**With WAA Disabled:**
- No cumulative tracking
- Each wallet independent
- Dump with only 2% total fees
- **VULNERABLE** - Profitable sniping

**Risk:** MODERATE (with WAA disabled)

---

### 5.2 Multi-Instruction Atomic Attacks

**Solana Transactions Can Bundle:**
```
Single Transaction:
1. Borrow flash loan
2. Buy from Pool A
3. Sell to Pool B (different pool for same token)
4. Sell back to Pool A
5. Repay flash loan
```

**Protection:**
```rust
// From state.rs:403-445
pub fn update_on_buy(&mut self, buy_amount: u64, current_slot: u64) -> Result<()> {
    // Weighted average entry slot tracked per-instruction
    // All buys in same slot still tracked with avg_entry_slot = current_slot

    // Later sells in same transaction:
    let age = current_slot - self.avg_entry_slot; // = 0
    let penalty = 10%; // Full WAA penalty
}
```

**Multiple buys in same transaction:**
- All tracked with same entry slot
- Weighted correctly
- Selling pays 10% penalty

**Verdict:** ✅ PROTECTED (with WAA)

---

### 5.3 Cross-Pool Arbitrage

**Scenario:**
Same token has multiple pools with different prices:
- Pool 1: 0.01 CRX/token
- Pool 2: 0.012 CRX/token (20% premium)

**Arbitrage:**
```
1. Buy from Pool 1 (cheap)
2. Sell to Pool 2 (expensive)
3. Profit: 20% - fees
```

**Analysis:**
- Rare (most tokens have one active pool)
- If it happens, arbitrage is BENEFICIAL (price discovery)
- Improves market efficiency
- Not a vulnerability

**Verdict:** ✅ EXPECTED BEHAVIOR - Market efficiency

---

## 6. Standard MEV Protections Analysis

### Existing Protections

✅ **Oracle Staleness Validation**
- File: `/programs/creator-amm-v2/src/state.rs:70-81`
- Rejects prices >60 seconds old
- Prevents stale price exploitation
- Effectiveness: HIGH

✅ **WAA (Weighted Average Age) Anti-Dump**
- File: `/programs/creator-amm-v2/src/state.rs:468-502`
- 10% penalty for <30s holds
- 1% penalty for <5min holds
- 0% penalty after 30min
- Effectiveness: HIGH (when enabled)

✅ **Slippage Limits (User-Defined)**
- File: `/programs/creator-amm-v2/src/instructions/buy.rs:84`
- Parameters: `min_base_amount`, `min_quote_amount`
- User sets acceptable slippage
- Effectiveness: MEDIUM (user-dependent)

✅ **Anti-Sniper Window (5% limit, 8 seconds)**
- File: `/programs/creator-amm-v2/src/instructions/trade.rs:24-57`
- Active for first 20 slots (~8s)
- Limits trades to 5% of supply
- Effectiveness: MEDIUM (can be bypassed)

✅ **CEI Pattern + Re-entrancy Defense**
- File: `/programs/creator-amm-v2/src/instructions/buy.rs:145-266`
- Checks-Effects-Interactions pattern
- Account reloads after CPI
- Vault balance validation
- Effectiveness: HIGH

✅ **Constant Product Curve (Predictable Pricing)**
- File: `/programs/creator-amm-v2/src/state.rs:235-306`
- Formula: x × y = k (PreBonding uses virtual reserves)
- Predictable slippage calculation
- No hidden manipulation
- Effectiveness: HIGH

✅ **Token-2022 Blocking**
- Prevents transfer hook attacks
- Only SPL Token standard allowed
- Effectiveness: HIGH

### Missing/Removed Protections

❌ **Emergency Pause (REMOVED)**
- Intentionally removed for permissionlessness
- Was in errors.rs but no implementation
- **Decision:** Correct for decentralized protocol

❌ **Graduation Cooldown (REMOVED)**
- Previously 20-slot delay after graduation
- Removed as ineffective against single-slot attacks
- **Decision:** Correct (didn't prevent flash loans anyway)

❌ **Cumulative Anti-Sniper Tracking**
- Would prevent multi-wallet bypass
- Not implemented (per-trade only)
- **Gap:** Should consider adding

❌ **Graduation Price Smoothing**
- No transition mechanism
- Instant switch from virtual → real reserves
- **Gap:** CRITICAL missing protection

---

## 7. User Protection Recommendations

### For Traders

**When Buying:**
```typescript
// RECOMMENDED: Set conservative slippage
await scaleAmm.buy(poolAddress, quoteAmount, {
  minBaseAmount: calculateWithSlippage(expectedOutput, 0.02), // 2% slippage
  // AVOID: minBaseAmount: 0 (no protection!)
});
```

**When Selling:**
```typescript
// RECOMMENDED: Wait for WAA penalty to decay
const position = await getUserPosition(poolAddress, wallet);
const age = currentSlot - position.avg_entry_slot;

if (age < 75) {
  console.warn("10% WAA penalty! Wait 30 seconds or proceed?");
}

await scaleAmm.sell(poolAddress, baseAmount, {
  minQuoteAmount: calculateWithSlippage(expectedOutput, 0.03), // 3% slippage
});
```

**Near Graduation:**
```typescript
// WARNING: Check if pool near graduation
const pool = await program.account.pool.fetch(poolAddress);
const remaining = pool.graduationThresholdCrx - pool.realQuoteReserves;

if (remaining < 1000) {
  console.error("DANGER: Pool near graduation - PRICE JUMP RISK!");
  // Consider waiting until after graduation
}
```

### For Pool Creators

**At Pool Creation:**
```typescript
// RECOMMENDED: Always enable WAA protection
await scaleAmm.createPool({
  targetMarketCapUsd: 10_000_000_000, // $10k
  tokenSupply: 1_000_000_000_000,     // 1M tokens
  feeBps: 100,                         // 1% fee
  curveType: CurveType.ConstantProduct,
  graduationThresholdUsd: 40_000_000_000, // $40k
  disableWaa: false,  // KEEP WAA ENABLED!
});
```

**Monitoring:**
```typescript
// Monitor for graduation approach
setInterval(async () => {
  const pool = await program.account.pool.fetch(poolAddress);
  const progress = (pool.realQuoteReserves / pool.graduationThresholdCrx) * 100;

  if (progress > 95) {
    alert("Pool at 95% to graduation - EXPLOIT RISK!");
  }
}, 10000); // Check every 10 seconds
```

---

## 8. Attack Profitability Matrix

### Standard Sandwich (1,000 CRX victim trade, 10,000 CRX pool)

| Scenario | Capital | Revenue | Fees | Profit | ROI | Verdict |
|----------|---------|---------|------|--------|-----|---------|
| WAA enabled, same slot | 500 | 589.8 | 70.9 | 24.9 | 4.98% | Marginal |
| WAA enabled, 30min delay | 500 | 589.8 | 10.9 | 78.9 | 15.8% | Risky |
| WAA disabled | 500 | 589.8 | 10.9 | 78.9 | 15.8% | Profitable |

### Graduation Exploit (Pool at 19,900 CRX)

| Scenario | Capital | Revenue | Fees | Profit | ROI | Verdict |
|----------|---------|---------|------|--------|-----|---------|
| Flash loan (1,000 CRX) | 0 | 17,232 | 1,896 | 14,335 | 1,433% | **HIGHLY PROFITABLE** |
| Flash loan (100 CRX) | 0 | ~1,500 | ~180 | ~1,319 | 1,319% | **HIGHLY PROFITABLE** |
| Patient hold | 1,000 | 17,232 | 20 | 16,212 | 1,621% | **HIGHLY PROFITABLE** |

### Multi-Pool Graduation (10 pools)

| Scenario | Pools | Per-Pool | Total Profit | Time | Verdict |
|----------|-------|----------|--------------|------|---------|
| Flash loan sweep | 10 | 14,335 | 143,350 CRX | 1 slot | **CRITICAL RISK** |

---

## 9. Recommended Fixes

### URGENT (Fix Before Mainnet)

**1. Graduation Price Discontinuity (CRITICAL)**

**Option A: Require Initial CRX Deposit (RECOMMENDED)**
```rust
// Modify create_pool.rs
pub fn create_pool(
    ctx: Context<CreatePool>,
    token_supply: u64,
    initial_crx_deposit: u64,  // NEW: Required seed liquidity
    fee_bps: u16,
    curve_type: CurveType,
    graduation_threshold_usd: u64,
    disable_waa: bool,
) -> Result<()> {
    // Require minimum seed (e.g., 100 CRX = $200)
    require!(
        initial_crx_deposit >= 100 * CRX_DECIMALS,
        ErrorCode::InvalidAmount
    );

    // Transfer initial CRX from creator to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.creator_crx_account.to_account_info(),
                to: ctx.accounts.quote_vault.to_account_info(),
                authority: ctx.accounts.creator.to_account_info(),
            },
        ),
        initial_crx_deposit,
    )?;

    // Set virtual = real (eliminates discontinuity!)
    pool.virtual_quote_reserves = initial_crx_deposit;
    pool.virtual_base_reserves = token_supply;
    pool.real_quote_reserves = initial_crx_deposit;  // Same!
    pool.real_base_reserves = token_supply;

    // Calculate graduation threshold based on real growth
    // (20,000 CRX accumulated = graduation at 20,100 CRX total)
    pool.graduation_threshold_crx = initial_crx_deposit
        .checked_add(graduation_threshold_crx_from_usd)?;

    Ok(())
}
```

**Benefits:**
- Eliminates price jump (virtual = real throughout)
- Aligns with standard AMM design (Uniswap, Raydium)
- Creator skin-in-the-game (better quality pools)
- Simple implementation

**Tradeoffs:**
- Requires creators to have initial CRX
- Changes "zero-seed" value proposition
- But: prevents $14k+ exploits per pool!

**Estimated Work:** 4-6 hours implementation + 3 hours testing

**Option B: Smooth Price Transition (Alternative)**
```rust
pub fn get_pricing_reserves(&self) -> (u64, u64) {
    match self.current_phase {
        CurvePhase::PreBonding => {
            // Interpolate virtual → real as graduation approaches
            let progress_bps = (self.real_quote_reserves * 10_000)
                .checked_div(self.graduation_threshold_crx)?;

            let quote = interpolate(
                self.virtual_quote_reserves,
                self.real_quote_reserves,
                progress_bps,
            );
            let base = interpolate(
                self.virtual_base_reserves,
                self.real_base_reserves,
                progress_bps,
            );

            (quote, base)
        },
        CurvePhase::Graduated => {
            (self.real_quote_reserves, self.real_base_reserves)
        },
    }
}

fn interpolate(start: u64, end: u64, progress_bps: u64) -> u64 {
    // Linear interpolation: result = start + (end - start) × progress
    let start_u128 = start as u128;
    let end_u128 = end as u128;
    let delta = end_u128.saturating_sub(start_u128);
    let adjusted = (delta * progress_bps as u128) / 10_000;
    (start_u128 + adjusted) as u64
}
```

**Benefits:**
- Gradual price transition (no jump)
- Keeps zero-seed model
- More complex but preserves innovation

**Tradeoffs:**
- Complex pricing logic
- Gas cost increase (~3-5k CU)
- Harder to understand for traders

**Estimated Work:** 8-12 hours implementation + 6 hours testing

**RECOMMENDATION: Option A** - Simpler, safer, industry-standard

---

**2. Remove WAA Disable Option (HIGH)**

```rust
// Remove disable_waa parameter from create_pool
pub fn create_pool(
    ctx: Context<CreatePool>,
    // ... other params
    // REMOVED: disable_waa: bool,
) -> Result<()> {
    // Always enable WAA protection
    pool.disable_waa = false;
}

// OR: Require minimum WAA protection
pool.waa_min_penalty_bps = 500; // Minimum 5% penalty for <30s holds
```

**Benefits:**
- Protects all pools from sandwich/flash loan attacks
- Prevents creators from shooting themselves in the foot
- Minimal code change

**Tradeoffs:**
- Reduces flexibility for "pure permissionless" pools
- But: 10% penalty only for <30s holds (reasonable)

**Estimated Work:** 1 hour

---

### MEDIUM PRIORITY (Week 2)

**3. Cumulative Anti-Sniper Tracking**

```rust
pub struct UserPosition {
    // ... existing fields
    pub anti_sniper_cumulative_bought: u64,
    pub anti_sniper_reset_slot: u64,
}

// In buy handler:
if pool.is_anti_sniper_active(clock.slot, config.anti_sniper_window_slots) {
    let user_position = &mut ctx.accounts.user_position;

    // Track cumulative buys during window
    let cumulative = user_position.anti_sniper_cumulative_bought
        .checked_add(base_output)?;

    let max_allowed = (base_reserve * config.anti_sniper_max_trade_bps as u64) / 10_000;

    require!(cumulative <= max_allowed, ErrorCode::AntiSniperActive);

    user_position.anti_sniper_cumulative_bought = cumulative;
} else if user_position.anti_sniper_reset_slot != clock.slot {
    // Reset after window expires
    user_position.anti_sniper_cumulative_bought = 0;
    user_position.anti_sniper_reset_slot = clock.slot;
}
```

**Benefits:**
- Prevents multi-wallet/multi-tx bypass
- Closes anti-sniper loophole
- Stronger launch protection

**Estimated Work:** 3-4 hours

---

## 10. Overall Verdict

### Current Security Posture

| Protection Category | Status | Effectiveness |
|-------------------|--------|---------------|
| Standard Sandwich Attacks | ✅ Strong | High (with WAA) |
| Flash Loans (Normal) | ✅ Strong | High (with WAA) |
| **Graduation Exploit** | 🚨 **CRITICAL** | **None** |
| JIT Liquidity | ✅ N/A | N/A (no LP mechanism) |
| Oracle Front-Running | ✅ Protected | High |
| Anti-Sniper | ⚠️ Moderate | Medium (can bypass) |

### Mainnet Readiness Assessment

🚨 **NOT READY FOR MAINNET**

**Blocking Issue:**
- Graduation price discontinuity allows 800-1500% ROI exploits
- Every pool vulnerable at graduation threshold
- Trivial to execute (flash loans)
- MUST fix before deployment

**Required Actions:**
1. ✅ Fix graduation exploit (Option A or B) - **URGENT**
2. ✅ Remove WAA disable option - **HIGH**
3. ⚠️ Add cumulative anti-sniper tracking - **MEDIUM**
4. ⚠️ Comprehensive testing of fixes - **HIGH**

**Timeline:**
- Option A (seed liquidity): 4-6 hours dev + 3 hours test = **7-9 hours**
- Option B (smoothing): 8-12 hours dev + 6 hours test = **14-18 hours**
- WAA removal: 1 hour
- Testing suite: 4-6 hours
- **Total: 12-27 hours** depending on approach

### Post-Fix Security Posture

**After implementing Option A + WAA requirement:**

| Attack Vector | Status | Risk Level |
|--------------|--------|------------|
| Standard Sandwich | ✅ Protected | LOW |
| Flash Loans | ✅ Protected | LOW |
| Graduation Exploit | ✅ Mitigated | LOW |
| Multi-Pool Attacks | ✅ Mitigated | LOW |
| Anti-Sniper Bypass | ⚠️ Possible | MODERATE |

**READY FOR MAINNET:** YES (after fixes)

---

## 11. Testing Requirements

### Critical Tests (Must Pass)

```typescript
describe("MEV Attack Prevention", () => {

  it("should prevent graduation flash loan exploit", async () => {
    // Create pool, trade to 19,900 CRX
    // Attempt flash loan buy+sell in same tx
    // MUST: Profit < flash loan fee
    // CURRENTLY: FAILS (1400% profit)
  });

  it("should have smooth price transition at graduation", async () => {
    // Trade to just before graduation
    // Record price before
    // Trigger graduation
    // Record price after
    // MUST: Price change < 10%
    // CURRENTLY: FAILS (20x jump)
  });

  it("should prevent sandwich attacks with WAA", async () => {
    // Front-run victim buy
    // Victim buy executes
    // Back-run sell immediately
    // MUST: Attacker profit < 5%
    // SHOULD: PASS (12% fees)
  });

  it("should prevent multi-wallet anti-sniper bypass", async () => {
    // Create 10 wallets
    // Each buy 5% during anti-sniper window
    // MUST: Total < 5% OR pay 10% WAA penalty
    // CURRENTLY: VULNERABLE (bypasses)
  });

  it("should reject stale oracle prices", async () => {
    // Set CRX price
    // Wait 61 seconds
    // Attempt trade
    // MUST: Fail with OraclePriceStale
    // SHOULD: PASS (already implemented)
  });

});
```

---

## 12. Monitoring Recommendations

### On-Chain Monitoring (Critical)

```typescript
// Monitor all pools for graduation approach
async function monitorGraduationExploits() {
  const pools = await program.account.pool.all();

  for (const pool of pools) {
    const progress = (pool.realQuoteReserves / pool.graduationThresholdCrx);

    if (progress > 0.95) {
      console.error(`ALERT: Pool ${pool.publicKey} at ${progress * 100}% to graduation`);
      console.error(`Expected price jump: ${calculatePriceJump(pool)}%`);
      console.error(`Potential exploit profit: ${estimateExploitProfit(pool)} CRX`);

      // Alert operators
      await sendAlert({
        severity: 'CRITICAL',
        pool: pool.publicKey,
        progress,
        risk: 'HIGH',
      });
    }
  }
}

// Run every block
connection.onSlotChange((slotInfo) => {
  monitorGraduationExploits();
});
```

### User Warning System

```typescript
// SDK should warn users about graduation risk
async function buy(poolAddress: PublicKey, amount: BN) {
  const pool = await program.account.pool.fetch(poolAddress);

  // Check graduation proximity
  const remaining = pool.graduationThresholdCrx - pool.realQuoteReserves;
  const isNearGraduation = remaining < 1000 * CRX_DECIMALS; // <1000 CRX

  if (isNearGraduation) {
    throw new Error(
      `DANGER: Pool near graduation. Price may jump ${estimatePriceJump(pool)}%. ` +
      `Consider waiting until after graduation or accept high volatility risk.`
    );
  }

  // Proceed with trade
  return await executeTradeInstruction(...);
}
```

---

## Appendix: Code References

### Critical Files
- `/programs/creator-amm-v2/src/state.rs` - Pool struct, reserve logic, WAA
- `/programs/creator-amm-v2/src/instructions/trade.rs` - Shared trade logic, reserve updates
- `/programs/creator-amm-v2/src/instructions/buy.rs` - Buy execution
- `/programs/creator-amm-v2/src/instructions/sell.rs` - Sell execution
- `/programs/creator-amm-v2/src/instructions/create_pool.rs` - Pool initialization
- `/programs/creator-amm-v2/src/utils/oracle.rs` - Virtual reserve calculation
- `/programs/creator-amm-v2/src/constants.rs` - WAA thresholds, limits

### Key Functions
- `Pool::get_pricing_reserves()` - Lines 198-210 (virtual vs real selection)
- `Pool::check_phase_transition()` - Lines 214-232 (graduation trigger)
- `UserPosition::calculate_extra_sell_fee_bps()` - Lines 468-502 (WAA penalty)
- `trade::update_reserves()` - Lines 112-161 (reserve updates, NOTE: virtual constant!)
- `check_anti_sniper_protection()` - Lines 24-57 (per-trade limit only)

---

**Audit Completed:** 2026-01-09
**Status:** BLOCKS MAINNET - Fix graduation exploit
**Next Review:** After graduation fix implementation
**Estimated Fix Time:** 12-27 hours total
