# CRITICAL: Anti-Sniper Protection Can Be Bypassed

**Date:** 2026-01-09
**Security Level:** 🚨 CRITICAL - NOT SAFE FOR MAINNET
**Auditor:** Agent 5 - Anti-Sniper Circumvention Analysis

---

## TL;DR - Critical Findings

The anti-sniper protection **CAN BE COMPLETELY BYPASSED** using multiple wallets or multiple transactions. Current implementation only prevents single large transactions, not cumulative acquisition.

### Exploit Proof of Concept

```
Pool: 1,000,000,000 tokens (1B supply)
Anti-sniper: 5% per transaction limit (50M tokens)
Window: First 20 slots (~8 seconds)

ATTACK SCENARIO:
- Attacker creates 20 wallets
- Each wallet buys 50M tokens (5% each - PASSES ✅)
- Total acquisition: 1,000M tokens (100% of supply)
- Time: Within first 8 seconds (all in anti-sniper window)

RESULT: Complete circumvention of anti-sniper protection
```

---

## Two Critical Vulnerabilities

### 🚨 Vulnerability #1: Multiple Wallets
**File:** `/programs/creator-amm-v2/src/instructions/trade.rs`

**Issue:** Anti-sniper checks per-transaction, NOT per-wallet or cumulative.

**Impact:**
- Attacker with 20 wallets = 100% of supply in 8 seconds
- Cost: ~0.02 SOL per wallet (~0.4 SOL total)
- Difficulty: TRIVIAL (no technical skill needed)

### 🚨 Vulnerability #2: Multiple Transactions
**File:** Same as above

**Issue:** Single wallet can submit multiple transactions rapidly.

**Impact:**
- Single wallet can submit 10+ transactions
- Each gets 5% → Total 50%+ acquisition
- Still within anti-sniper window

---

## Why This Happens

### Root Cause: Virtual Reserves

The anti-sniper check uses **virtual reserves** which NEVER change during PreBonding:

```rust
// From state.rs get_pricing_reserves()
match self.current_phase {
    CurvePhase::PreBonding => {
        // Returns virtual reserves (CONSTANT - never changes!)
        (self.virtual_quote_reserves, self.virtual_base_reserves)
    }
}
```

**Every transaction sees:**
- Same base_reserve value (virtual, constant)
- Same 5% limit calculation
- No memory of previous transactions
- No tracking across wallets

---

## What Works Correctly

✅ **Anti-sniper IS correctly applied to:**
- Both buy AND sell transactions
- Only in PreBonding phase (disabled after graduation)
- Uses secure clock.slot (cannot be manipulated)
- Proper overflow protection

✅ **The code quality is excellent** - just the design allows bypass.

---

## Two Simple Fixes

### Fix Option 1: Use Real Reserves (Simpler)

**Change:** Use `real_base_reserves` instead of `virtual_base_reserves` for anti-sniper check.

**File:** `/programs/creator-amm-v2/src/instructions/buy.rs` and `sell.rs`

```rust
// BEFORE (vulnerable):
let (quote_reserve, base_reserve) = pool.get_pricing_reserves();
trade::check_anti_sniper_protection(pool, config, amount, base_reserve, slot)?;

// AFTER (more secure):
let (quote_reserve, base_reserve_for_pricing) = pool.get_pricing_reserves();
let base_reserve_for_anti_sniper = pool.real_base_reserves;  // Use REAL
trade::check_anti_sniper_protection(pool, config, amount, base_reserve_for_anti_sniper, slot)?;
```

**Effect:**
- First transaction: 5% of 1B = 50M max ✅
- Second transaction: 5% of 950M = 47.5M max ✅
- Third transaction: 5% of 902.5M = 45M max ✅
- Makes multi-wallet attacks MUCH harder (not impossible, but harder)

**Pros:**
- Simple 2-line change per file
- No additional CU costs
- No state changes needed

**Cons:**
- Doesn't FULLY prevent multi-wallet attacks
- Changes economic behavior (limit decreases over time)

---

### Fix Option 2: Per-Slot Tracking (Comprehensive)

**Change:** Track cumulative buys per slot, enforce global limit.

**Files:** `state.rs`, `trade.rs`

**Add to Pool struct:**
```rust
pub anti_sniper_cumulative_bought_this_slot: u64,
pub anti_sniper_last_tracked_slot: u64,
```

**Update check logic:**
```rust
// Reset counter if new slot
if pool.anti_sniper_last_tracked_slot < clock_slot {
    pool.anti_sniper_cumulative_bought_this_slot = 0;
    pool.anti_sniper_last_tracked_slot = clock_slot;
}

// Check remaining quota
let remaining_quota = max_trade_amount.saturating_sub(pool.anti_sniper_cumulative_bought_this_slot);
require!(trade_amount <= remaining_quota, ErrorCode::AntiSniperActive);

// Update counter
pool.anti_sniper_cumulative_bought_this_slot += trade_amount;
```

**Effect:**
- TRUE 5% per slot limit (cumulative across ALL wallets)
- First transaction: 50M max ✅
- All subsequent transactions in same slot: share remaining quota ✅
- Next slot: quota resets to 50M ✅

**Pros:**
- Fully prevents multi-wallet attacks
- Truly enforces "5% per slot" as intended
- Clear security guarantee

**Cons:**
- Adds 16 bytes to Pool struct
- Adds ~1-2k CU per trade
- More complex implementation

---

## Recommendation

### For Mainnet Launch:

**Option A: Deploy with Fix Option 1 (Real Reserves)**
- Provides significant improvement
- Minimal code changes
- Low risk of introducing bugs
- Still allows some multi-wallet attacks (but much harder)

**Option B: Deploy with Fix Option 2 (Per-Slot Tracking)**
- Provides complete protection
- Higher complexity
- Requires thorough testing
- Adds minor costs

**Option C: Deploy without fix + Document clearly**
- Add to README: "Anti-sniper limits single transactions, not cumulative"
- Market it as "soft" protection, not hard security
- Focus on other security features (WAA, graduation continuity)
- Accept that sophisticated traders will bypass

---

## Impact Assessment

### If Deployed Without Fix:

**Fair Launch Claims:**
- ❌ Cannot claim "fair launch" (whales can front-run)
- ❌ Anti-sniper gives FALSE sense of security
- ❌ Retail traders disadvantaged vs. technical traders

**Economic Impact:**
- Sophisticated attacker: 100% acquisition at launch price
- Can manipulate price before community enters
- Potential for 100x rugpull exploitation

**Reputation Risk:**
- Community discovers vulnerability post-launch
- "Scale AMM anti-sniper doesn't work" narrative
- Loss of trust in protocol security

### If Deployed With Fix:

**Security:**
- ✅ True anti-sniper protection
- ✅ Fair launch guarantee
- ✅ Level playing field

**Marketing:**
- ✅ Can confidently claim "fairest launch on Solana"
- ✅ Demonstrates security-first approach
- ✅ Builds trust with community

---

## Action Items

### Immediate (Before Mainnet):

- [ ] **CRITICAL:** Choose fix option (1 or 2)
- [ ] Implement chosen fix
- [ ] Write comprehensive tests (7 test cases provided in main report)
- [ ] Run 72-hour devnet soak test with 100+ wallets
- [ ] Update documentation with clear anti-sniper behavior

### Testing Checklist:

- [ ] Test with 20+ simultaneous wallets
- [ ] Test with single wallet, 10+ rapid transactions
- [ ] Test exact 5% boundary (should pass)
- [ ] Test 5.01% (should fail)
- [ ] Test after slot 20 (should allow large trades)
- [ ] Test after graduation (anti-sniper disabled)
- [ ] Test sells as well as buys

### Documentation:

- [ ] Update README with anti-sniper explanation
- [ ] Add to SDK examples: "Anti-sniper active for first 20 slots"
- [ ] Create monitoring dashboard for unusual patterns
- [ ] Document limitations clearly (if not fixing)

---

## Questions for Protocol Team

1. **Do you want to fix this before mainnet?**
   - Yes → Choose Fix Option 1 or 2
   - No → Document clearly and accept risk

2. **What is your threat model?**
   - Prevent sophisticated attackers? → Need fix
   - Prevent retail FOMO? → Current design works
   - Marketing "fair launch"? → Need fix for credibility

3. **What is your timeline?**
   - < 1 week? → Use Fix Option 1 (simpler)
   - 1-2 weeks? → Can use Fix Option 2 (comprehensive)
   - > 2 weeks? → Can do both fixes + extensive testing

---

## References

**Full Report:** `/home/user/Claude/AGENT_5_ANTI_SNIPER_SECURITY_REPORT.md`

**Key Files:**
- `/programs/creator-amm-v2/src/state.rs` (lines 183-186)
- `/programs/creator-amm-v2/src/instructions/trade.rs` (lines 27-57)
- `/programs/creator-amm-v2/src/instructions/buy.rs` (lines 111-117)
- `/programs/creator-amm-v2/src/instructions/sell.rs` (lines 105-112)

**Existing Tests:**
- `/tests/CRITICAL_TESTS_IMPLEMENTED.ts` (has 5 basic anti-sniper tests)
- `/tests/critical-coverage.ts` (has 7 anti-sniper tests)
- Neither tests multi-wallet or multi-transaction scenarios ❌

---

**BOTTOM LINE:**

The anti-sniper protection is **cosmetic** in its current form. It stops single large transactions but allows unlimited cumulative acquisition through multiple wallets or transactions.

**Fix before mainnet or clearly document this limitation.**

---

*End of Summary - See full report for detailed analysis, test cases, and code examples*
