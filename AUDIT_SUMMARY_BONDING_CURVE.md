# Bonding Curve Mathematical Audit - Quick Summary

**Date:** 2026-01-09
**Status:** ⚠️ DESIGN REVIEW REQUIRED

---

## 🎯 Quick Verdict

**Core AMM Math:** ✅ EXCELLENT (Graduated phase)
**Virtual Reserve System:** 🚨 NEEDS REVIEW (PreBonding phase)

The constant product formula is perfectly implemented for the Graduated phase. However, the PreBonding virtual reserve system creates unexpected behavior that may or may not be intentional.

---

## 🚨 Critical Findings (MUST ADDRESS)

### 1. Virtual Reserves Stay Constant → No Price Discovery

**What:** In PreBonding phase, pricing reserves never update
**Result:** Every 100 CRX trade gets identical output, regardless of previous trading
**Impact:** No bonding curve price discovery - contradicts traditional bonding curve model

```
Trade 1:   100 CRX → 19,415 tokens
Trade 100: 100 CRX → 19,415 tokens (SAME!)
```

**Question for Team:** Is this intentional "fixed-price sale" model or a bug?

### 2. Massive Price Jump at Graduation

**What:** Switching from virtual to real reserves creates 2x-10x price discontinuity
**Result:** Last buyer before graduation gets 6x better price than first buyer after
**Impact:** MEV opportunity, user confusion, unfair pricing

```
Price before graduation: 0.005 CRX/token (using virtual reserves)
Price after graduation:  0.032 CRX/token (using real reserves)
JUMP: 6.4x increase!
```

**Risk:** MEV bots can monitor graduation threshold and time trades for profit

---

## ⚠️ High Priority Findings

### 3. Pool Token Depletion Risk

**What:** Virtual pricing can request more tokens than pool has
**Result:** Transaction fails with generic SPL error instead of clear message
**Fix:** Add explicit check before transfer

**Code Fix Required:**
```rust
// In buy.rs after line 134
require!(
    base_output <= pool.real_base_reserves,
    ErrorCode::InsufficientLiquidity
);
```

---

## ✅ Excellent Implementations (NO CHANGES NEEDED)

1. **Constant Product Formula:** Perfect implementation of `x * y = k`
2. **Fee Extraction:** Correctly done outside reserves (no liquidity degradation)
3. **Overflow Protection:** All arithmetic uses checked operations + u128
4. **Slippage Protection:** User-defined, prevents sandwich attacks
5. **Vault Validation:** Defense-in-depth balance checks after every trade

---

## 📊 Test Results

| Component | Grade | Notes |
|-----------|-------|-------|
| Constant Product Math | A+ | Flawless implementation |
| Overflow Safety | A+ | All checked arithmetic |
| Fee Calculation | A | Correctly extracted outside reserves |
| Graduated Phase AMM | A | Production ready |
| PreBonding Virtual Reserves | D | Needs design review |
| Graduation Transition | D | Price discontinuity issue |

---

## 🔧 Required Actions Before Mainnet

### Immediate (Critical Path)

**1. Design Decision on Virtual Reserves**

Choose ONE:

**Option A: Update Virtual Reserves During Trading (Continuous Pricing)**
- Pros: Smooth price curve, traditional bonding curve behavior
- Cons: More complex, changes current model
- Implementation: 50 lines of code in `state.rs` and `trade.rs`

**Option B: Accept Fixed-Price Model (Document Current Behavior)**
- Pros: Simple, already implemented
- Cons: Not a true bonding curve, confusing to users expecting price discovery
- Implementation: Documentation only, add warnings

**Option C: Blended Transition (Hybrid Approach)**
- Pros: Smooth graduation, maintains some price discovery
- Cons: Most complex
- Implementation: 100 lines of code, new blending formula

**Recommendation:** Option B for speed (document it), Option A for better economics

**2. Add Pool Depletion Check (5 minutes)**

```rust
// Location: buy.rs after line 134
require!(
    base_output <= pool.real_base_reserves,
    ErrorCode::InsufficientLiquidity
);
```

**3. Add Graduation Warning Event (10 minutes)**

```rust
// Location: trade.rs in update_statistics
if pool.current_phase == CurvePhase::PreBonding {
    let progress = (pool.real_quote_reserves * 100) / pool.graduation_threshold_crx;
    if progress >= 90 && progress < 100 {
        emit!(GraduationApproaching {
            pool: pool_key,
            progress_percent: progress as u8,
        });
    }
}
```

### Short-term (Post-Launch)

**4. SDK Helper Functions**
- `estimateGraduationPriceJump()` - Warn users of potential price change
- `getPreBondingPriceModel()` - Explain pricing works differently pre-graduation

**5. Documentation**
- Explain virtual vs real reserve pricing
- Document price jump at graduation
- Clarify this is "phased fixed-price" not traditional bonding curve

---

## 💡 Key Insights

### What's Working Perfectly:

1. **Math is Sound:** The constant product formula is textbook-perfect
2. **Security is Tight:** Overflow protection, slippage checks, vault validation all excellent
3. **Fee Design is Smart:** Extracting fees outside reserves prevents liquidity degradation

### What Needs Attention:

1. **Virtual Reserves Create Unexpected Behavior:**
   - No price discovery in PreBonding
   - Price resets after each trade
   - Doesn't match traditional bonding curve expectations

2. **Graduation is Abrupt:**
   - Price can jump 6x instantly
   - Creates MEV opportunity
   - Confusing for users

3. **Edge Cases Need Guards:**
   - Pool can run out of tokens with generic error
   - Need explicit checks for better UX

---

## 🎓 Mathematical Properties Verified

✅ **Formula Correctness:** `y = (x * Y) / (X + x)` - Perfect
✅ **k Invariant:** `(X + x)(Y - y) = XY` - Maintained in Graduated
✅ **Fee Math:** Extracted correctly, no degradation
✅ **Overflow Safety:** u128 intermediate, checked ops
✅ **Rounding Direction:** Favors protocol (correct)
✅ **Price Impact:** Path-independent (correct for constant product)

⚠️ **k Invariant:** NOT maintained in PreBonding (virtual k ≠ real k)
⚠️ **Price Discovery:** Broken in PreBonding (intended or bug?)
⚠️ **Smooth Transition:** Price discontinuity at graduation

---

## 📁 Files Analyzed

**Core Trading Logic:**
- ✅ `/home/user/Claude/programs/creator-amm-v2/src/instructions/buy.rs` (261 lines)
- ✅ `/home/user/Claude/programs/creator-amm-v2/src/instructions/sell.rs` (262 lines)
- ✅ `/home/user/Claude/programs/creator-amm-v2/src/instructions/trade.rs` (330 lines)

**Math & State:**
- ✅ `/home/user/Claude/programs/creator-amm-v2/src/state.rs` (487 lines)
- ✅ `/home/user/Claude/programs/creator-amm-v2/src/utils/oracle.rs` (51 lines)
- ✅ `/home/user/Claude/programs/creator-amm-v2/src/constants.rs` (116 lines)

**Total:** ~1,500 lines of core math logic audited

---

## 🚀 Next Steps

### For Development Team:

1. **Decision Required:** Virtual reserve behavior - intentional or fix?
2. **Quick Win:** Add pool depletion check (5 min fix)
3. **Risk Mitigation:** Add graduation warning event (10 min fix)

### For Product Team:

1. **Messaging:** How to explain "fixed-price" PreBonding model to users?
2. **UI/UX:** Show graduation price estimate and warnings
3. **Docs:** Update all references from "bonding curve" to "phased pricing"

### For Security:

1. **Monitor:** Track pools approaching graduation for MEV activity
2. **Consider:** Anti-sandwich protection across graduation boundary
3. **Test:** Devnet soak test with graduation scenarios

---

## 📞 Recommendations by Urgency

### 🔴 MUST FIX (Before Mainnet)
1. Add pool depletion check
2. Decide on virtual reserve model (accept or change)
3. Document price jump at graduation

### 🟡 SHOULD ADD (Week 1 Post-Launch)
4. Graduation warning event
5. SDK price estimate helpers
6. Updated documentation

### 🟢 NICE TO HAVE (Future Version)
7. Blended transition model
8. More sophisticated anti-MEV
9. Dynamic graduation thresholds

---

## 📊 Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| MEV at graduation | HIGH | MEDIUM | Add warnings, document behavior |
| Pool depletion | MEDIUM | LOW | Add explicit check (easy fix) |
| User confusion | HIGH | HIGH | Clear documentation, UI warnings |
| Math exploits | LOW | LOW | Formula is correct |
| Overflow attacks | LOW | VERY LOW | All arithmetic checked |

---

## ✅ Final Checklist

**Before Mainnet Deploy:**
- [ ] Design decision on virtual reserves made
- [ ] Pool depletion check added
- [ ] Graduation warning implemented OR documented as known behavior
- [ ] SDK updated with helper functions
- [ ] Documentation explains pricing model clearly
- [ ] UI shows graduation warnings
- [ ] Devnet testing includes graduation scenarios

**Core Math Verification:**
- [x] Constant product formula correct
- [x] Overflow protection comprehensive
- [x] Fee extraction proper
- [x] Slippage protection working
- [x] Vault validation defensive

---

**Bottom Line:**

The AMM math is **excellent** for Graduated phase (production ready). The PreBonding virtual reserve system needs a **design decision**: accept the "memoryless" pricing model and document it, or update to provide traditional bonding curve price discovery.

Either choice is valid, but the current behavior should not go to production without explicit acknowledgment of the trade-offs.

**Estimated Time to Fix:** 2-4 hours (Option B) or 8-16 hours (Option A)
**Risk Level if Unfixed:** MEDIUM (not a security exploit, but user confusion + MEV opportunity)

---

**Full Report:** See `SECURITY_AUDIT_BONDING_CURVE_MATH.md` for detailed analysis
