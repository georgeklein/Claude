# AGENT 11: FEE CALCULATION AUDIT - EXECUTIVE SUMMARY

**Date**: 2026-01-09
**Auditor**: Agent 11 (Security Analysis Team)
**Protocol**: Scale AMM (Creator AMM V2)

---

## 🔴 CRITICAL FINDING: ROUNDING-TO-ZERO FEE EXPLOIT

### Vulnerability Summary
Integer division in fee calculation allows traders to execute trades with **ZERO fees** by exploiting rounding behavior. Attackers can split large trades into many small transactions to avoid 100% of trading fees.

### Mathematical Root Cause
```rust
// File: trade.rs, line 70-74
let fee_u128 = (amount as u128)
    .checked_mul(fee_bps as u128)
    .ok_or(ErrorCode::MathOverflow)?
    .checked_div(BPS_DENOMINATOR as u128)  // ← Division by 10,000
    .ok_or(ErrorCode::MathOverflow)?;
```

When `(amount × fee_bps) < 10,000`, the result rounds to **0**.

### Exploit Scenarios

| Fee Tier | Fee BPS | Free Trade Threshold | Attack Example |
|----------|---------|---------------------|----------------|
| Standard (1%) | 100 | < 100 tokens | Trade 99 tokens → Pay 0 fee |
| Low (0.25%) | 25 | < 400 tokens | Trade 399 tokens → Pay 0 fee |
| Free (0%) | 0 | All trades | Intentional design |

### Attack Example: Trade Splitting

**Objective**: Trade 10,000 CRX with 1% fee (should pay 100 CRX)

**Normal Method**:
- 1 trade of 10,000 CRX
- Fee: (10,000 × 100) / 10,000 = 100 CRX
- Cost: 100 CRX fee ✓

**Exploit Method**:
- Split into 101 trades of 99 CRX each
- Fee per trade: (99 × 100) / 10,000 = 0.99 → **0 CRX**
- Total fees: 101 × 0 = **0 CRX**
- **Savings: 100% fee avoidance**

### Impact Assessment

| Factor | Rating | Justification |
|--------|--------|---------------|
| **Severity** | CRITICAL | Complete bypass of fee mechanism |
| **Likelihood** | HIGH | Easy to exploit, no special permissions needed |
| **Complexity** | LOW | Simple transaction splitting, easily automated |
| **Economic Impact** | HIGH | Undermines entire economic model |
| **Mainnet Risk** | BLOCKER | Cannot deploy with this vulnerability |

### Proof of Concept
Full exploit demonstration available in:
- `/home/user/Claude/tests/fee-rounding-exploit-tests.ts`
- Test: "EXPLOIT: Trade splitting allows 100% fee avoidance"

---

## ✅ SECURE FINDINGS

### 1. Fee Overflow Protection: EXCELLENT
- ✅ Checked arithmetic throughout
- ✅ Combined fee cap enforced (1500 bps max)
- ✅ Pool creation restricts fee tiers to {0, 25, 100}
- ✅ No overflow possible

### 2. Fee Recipient Security: EXCELLENT
- ✅ Anchor constraints enforce `fee_recipient = pool.creator`
- ✅ Cannot redirect fees to attacker account
- ✅ Mint validation prevents wrong token type
- ✅ Test coverage confirms security

### 3. Fee Accounting Integrity: EXCELLENT
- ✅ Buy: Fee extracted "off the cuff" before swap
- ✅ Sell: Fee extracted from output after calculation
- ✅ Vault balance validation confirms correctness
- ✅ Different approaches but both mathematically sound

### 4. Phase Consistency: EXCELLENT
- ✅ Base fee constant across PreBonding and Graduated phases
- ✅ No arbitrage opportunity during phase transition
- ✅ WAA fees apply consistently

### 5. Account Validation: EXCELLENT
- ✅ Token-2022 blocked (prevents re-entrancy attacks)
- ✅ Standard SPL Token validation
- ✅ No special bypass mechanisms

---

## ⚠️ DESIGN CHOICES (NOT VULNERABILITIES)

### 1. Zero-Fee Pools Allowed
- Intentional for Tier 1 permissionless pools
- Fee tier `FEE_TIER_FREE = 0` explicitly supported
- Trade-off: Permissionlessness vs revenue

### 2. WAA Bypass Flag
- `disable_waa` flag can disable anti-dump fees
- Set at pool creation (immutable)
- Trade-off: Flexibility vs protection

---

## 🔧 RECOMMENDED FIX

### Priority 1: CRITICAL (Required Before Mainnet)

**Add Minimum Input Validation**

```rust
// File: programs/creator-amm-v2/src/constants.rs
pub const MIN_INPUT_AMOUNT: u64 = 1_000; // 0.001 tokens (6 decimals)

// File: programs/creator-amm-v2/src/instructions/trade.rs
pub fn validate_trade_preconditions(amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);
    require!(amount >= MIN_INPUT_AMOUNT, ErrorCode::InvalidAmount); // NEW
    Ok(())
}
```

**Why This Works**:
- For 1% fee: 1000 × 100 / 10000 = 10 (non-zero) ✓
- For 0.25% fee: 1000 × 25 / 10000 = 2 (non-zero) ✓
- Prevents all rounding-to-zero exploits
- Minimal impact on legitimate users (0.001 token minimum is reasonable)

**Implementation Time**: 2-4 hours (code + tests)

### Alternative Fix (Not Recommended)

**Enforce Minimum Fee**:
```rust
const MIN_FEE: u64 = 1;
if amount >= MIN_OUTPUT_AMOUNT && fee == 0 {
    return Ok(MIN_FEE);
}
```

**Why Not Recommended**:
- More complex logic
- Harder to reason about
- Doesn't prevent dust trades at economic level

---

## 📊 COMPLETE VULNERABILITY TABLE

| # | Attack Vector | Status | Severity | Notes |
|---|--------------|--------|----------|-------|
| 1 | **Rounding to Zero** | ⚠️ VULNERABLE | **CRITICAL** | **FIX REQUIRED** |
| 2 | Fee Overflow | ✅ SECURE | - | Checked arithmetic |
| 3 | Recipient Manipulation | ✅ SECURE | - | Anchor constraints |
| 4 | Special Account Bypass | ✅ SECURE | - | Token-2022 blocked |
| 5 | Zero Fee Pools | ⚠️ DESIGN | - | Intentional feature |
| 6 | Accounting Mismatch | ✅ SECURE | - | Vault validation |
| 7 | Phase Arbitrage | ✅ SECURE | - | Consistent fees |
| 8 | WAA Bypass | ⚠️ DESIGN | - | Intentional flag |
| 9 | Position Manipulation | ✅ SECURE | - | PDA derivation |

---

## 🎯 MAINNET READINESS: BLOCKED

### Blocker Issues
1. ❌ **Critical rounding vulnerability must be fixed**

### Action Items
1. Implement minimum input validation (Priority 1)
2. Add comprehensive fee edge case tests
3. Re-audit after fix implementation
4. Document zero-fee and WAA bypass trade-offs

### Timeline Estimate
- Fix implementation: 2-4 hours
- Test development: 2-3 hours
- Re-audit: 1-2 hours
- **Total**: 1 day

---

## 📁 DELIVERABLES

All audit materials located in `/home/user/Claude/`:

1. **AGENT11_FEE_CALCULATION_AUDIT.md** (33KB)
   - Complete technical analysis
   - All 9 attack vectors examined
   - Mathematical proofs
   - Fix recommendations

2. **tests/fee-rounding-exploit-tests.ts** (22KB)
   - Proof-of-concept exploits
   - Threshold analysis
   - Post-fix validation tests

3. **AGENT11_EXECUTIVE_SUMMARY.md** (This file)
   - Quick reference for stakeholders
   - Key findings and recommendations

---

## 🔍 ANSWER TO ORIGINAL QUESTIONS

### 1. Can fees exceed maximum bounds?
**NO** - Secure. Combined fees capped at 1500 bps with proper validation.

### 2. Any rounding exploits for free trades?
**YES** - **CRITICAL VULNERABILITY**. Small trades pay zero fees due to integer division rounding.

### 3. Is fee recipient always pool.creator?
**YES** - Secure. Anchor constraints enforce this strictly.

### 4. Fee bypass methods found?
**YES** - **CRITICAL**: Trade splitting exploit allows 100% fee avoidance.
- Intentional bypasses: Zero-fee pools, WAA disable flag (by design)

### 5. Test cases for fee edge cases?
**DELIVERED** - Comprehensive test suite with 10+ test cases covering:
- Rounding exploits (current vulnerability)
- Trade splitting attacks
- Fee tier thresholds
- Post-fix validation

---

## 🚨 IMMEDIATE ACTION REQUIRED

**STOP**: Do not deploy to mainnet with current code
**FIX**: Implement minimum input validation (2-4 hours)
**TEST**: Run exploit tests to verify fix
**RE-AUDIT**: Confirm vulnerability patched

**Risk if deployed unfixed**: Creators will receive ZERO fees from sophisticated traders who split transactions. Economic model will fail.

---

**Report Compiled**: 2026-01-09
**Status**: CRITICAL FIX REQUIRED
**Next Review**: After fix implementation
