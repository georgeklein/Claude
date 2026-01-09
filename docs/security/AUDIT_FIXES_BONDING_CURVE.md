# Bonding Curve Audit - Proposed Fixes

**Date:** 2026-01-09
**Related:** SECURITY_AUDIT_BONDING_CURVE_MATH.md

This document provides specific code changes to address findings from the mathematical audit.

---

## 🚨 Critical Fix #1: Pool Depletion Check

**Issue:** Virtual pricing can request more tokens than pool has
**Severity:** HIGH
**Time to Fix:** 5 minutes
**Files:** `buy.rs`

### Current Code (buy.rs:129-134)

```rust
let base_output = pool.calculate_output(
    swap_amount,
    quote_reserve,
    base_reserve,
    0, // No fee here - already extracted above
)?;
```

### Proposed Fix

```rust
let base_output = pool.calculate_output(
    swap_amount,
    quote_reserve,
    base_reserve,
    0, // No fee here - already extracted above
)?;

// NEW: Validate pool has enough tokens in real reserves
// This prevents transaction failures with unclear SPL errors
require!(
    base_output <= pool.real_base_reserves,
    ErrorCode::InsufficientLiquidity
);
```

### Rationale
- Virtual reserves are constant and can calculate output exceeding available tokens
- Without this check, SPL token transfer fails with generic "insufficient balance"
- This provides clear, early error message before attempting transfer
- Cost: ~500 CU for one comparison (negligible)

---

## ⚠️ Critical Fix #2A: Continuous Virtual Reserves (Option A)

**Issue:** Virtual reserves stay constant → no price discovery
**Severity:** CRITICAL (if unintentional)
**Time to Fix:** 2-4 hours
**Files:** `trade.rs`, `state.rs`

This option makes PreBonding behave like a traditional bonding curve with continuous price discovery.

### Changes to trade.rs

**Location:** After line 149 in `update_reserves` function

```rust
pub fn update_reserves(
    pool: &mut Pool,
    direction: TradeDirection,
    input_amount: u64,
    output_amount: u64,
) -> Result<()> {
    match direction {
        TradeDirection::Buy => {
            if matches!(pool.current_phase, CurvePhase::Graduated) {
                // GRADUATED: Update real reserves only
                pool.real_quote_reserves = pool.real_quote_reserves
                    .checked_add(input_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
                pool.real_base_reserves = pool.real_base_reserves
                    .checked_sub(output_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
            } else {
                // PRE-BONDING: Update BOTH virtual and real reserves
                pool.real_quote_reserves = pool.real_quote_reserves
                    .checked_add(input_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
                pool.real_base_reserves = pool.real_base_reserves
                    .checked_sub(output_amount)
                    .ok_or(ErrorCode::MathOverflow)?;

                // NEW: Update virtual reserves to maintain k invariant
                // This provides continuous price discovery
                pool.virtual_quote_reserves = pool.virtual_quote_reserves
                    .checked_add(input_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
                pool.virtual_base_reserves = pool.virtual_base_reserves
                    .checked_sub(output_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
        },
        TradeDirection::Sell => {
            if matches!(pool.current_phase, CurvePhase::Graduated) {
                // GRADUATED: Update real reserves only
                pool.real_base_reserves = pool.real_base_reserves
                    .checked_add(input_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
                pool.real_quote_reserves = pool.real_quote_reserves
                    .checked_sub(output_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
            } else {
                // PRE-BONDING: Update BOTH virtual and real reserves
                pool.real_base_reserves = pool.real_base_reserves
                    .checked_add(input_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
                pool.real_quote_reserves = pool.real_quote_reserves
                    .checked_sub(output_amount)
                    .ok_or(ErrorCode::MathOverflow)?;

                // NEW: Update virtual reserves to maintain k invariant
                pool.virtual_base_reserves = pool.virtual_base_reserves
                    .checked_add(input_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
                pool.virtual_quote_reserves = pool.virtual_quote_reserves
                    .checked_sub(output_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
        },
    }
    Ok(())
}
```

### Expected Behavior After Fix

**Before:**
```
Trade 1:   100 CRX → 19,415 tokens (price: 0.00515 CRX/token)
Trade 2:   100 CRX → 19,415 tokens (price: 0.00515 CRX/token) [SAME!]
Trade 100: 100 CRX → 19,415 tokens (price: 0.00515 CRX/token) [SAME!]
```

**After:**
```
Trade 1:   100 CRX → 19,415 tokens (price: 0.00515 CRX/token)
Trade 2:   100 CRX → 19,023 tokens (price: 0.00526 CRX/token) [+2.1%]
Trade 100: 100 CRX →  8,547 tokens (price: 0.01170 CRX/token) [+127%]
```

### Graduation Behavior After Fix

**Before:**
- Virtual price at graduation: 0.005 CRX/token
- Real price at graduation: 0.032 CRX/token
- Jump: 6.4x

**After:**
- Virtual reserves === real reserves at graduation
- No price jump (smooth transition)
- virtual_quote / virtual_base === real_quote / real_base

### Pros
✅ Traditional bonding curve behavior
✅ Price discovery works correctly
✅ Early buyers rewarded with better prices
✅ No graduation price jump
✅ Matches user expectations

### Cons
❌ Changes economic model significantly
❌ Requires more testing
❌ Invalidates current economic simulations

---

## ⚠️ Critical Fix #2B: Document Current Behavior (Option B)

**Issue:** Virtual reserves stay constant → no price discovery
**Severity:** CRITICAL (if unintentional)
**Time to Fix:** 30 minutes
**Files:** Documentation only

This option accepts the current "fixed-price" model and documents it clearly.

### Required Documentation Updates

**1. CLAUDE.md - Update Project Description**

```markdown
### Core Innovation: Phased Fixed-Price Model
- Launch tokens at specific USD market caps using virtual liquidity
- **PreBonding Phase (0 → $40k):**
  - Price determined by trade SIZE only (not history)
  - Virtual reserves stay constant
  - Every 100 CRX trade gets same output
  - Real reserves accumulate in background
- **Graduated Phase ($40k+):**
  - Traditional constant product AMM (x*y=k)
  - Real reserves used for pricing
  - Price discovery through supply/demand
  - **Note:** Price jump at graduation (typically 2-10x)
```

**2. README.md - Add Economics Section**

```markdown
## Economics Model

### PreBonding Phase (Fixed-Price)
Scale AMM uses a unique "virtual reserve" model during the PreBonding phase:

- **Price is determined by trade SIZE, not cumulative trading**
- Example: Every 100 CRX trade receives the same token amount
- No early buyer advantage based on timing
- Price increases only with LARGER trades, not more trades

This is NOT a traditional bonding curve. Think of it as a "fixed-price sale"
with built-in price impact based on trade size.

### Graduation (Price Transition)
When a pool reaches $40k in accumulated CRX:
- Pricing switches from virtual reserves to real reserves
- **Price typically increases 2-10x at this transition**
- This is expected behavior, not a bug
- Front-ends should warn users when pools are near graduation
```

**3. SDK - Add Warning Comments**

```typescript
// In ScaleAMM.ts

/**
 * Calculate expected output for a buy trade
 *
 * IMPORTANT: PreBonding pricing is "memoryless"
 * - Price depends on trade SIZE only
 * - Previous trades don't affect price
 * - This is NOT a traditional bonding curve
 *
 * Example:
 *   First 100 CRX trade:  receives 19,415 tokens
 *   100th 100 CRX trade:  receives 19,415 tokens (SAME!)
 *
 * Price only increases if you trade LARGER amounts.
 */
async estimateBuyOutput(amountIn: BN): Promise<BN> {
  // ... existing implementation
}

/**
 * Estimate price jump when pool graduates
 *
 * WARNING: Price can increase 2-10x at graduation
 * This happens when pool reaches $40k accumulated CRX
 *
 * @returns Price multiplier (e.g., 6.4 = 6.4x increase)
 */
async estimateGraduationPriceJump(): Promise<number> {
  const pool = await this.fetchPool();

  if (pool.currentPhase === 'Graduated') {
    return 1.0; // Already graduated
  }

  const virtualPrice = pool.virtualQuoteReserves.toNumber() /
                       pool.virtualBaseReserves.toNumber();
  const realPrice = pool.realQuoteReserves.toNumber() /
                    pool.realBaseReserves.toNumber();

  return realPrice / virtualPrice;
}
```

### Pros
✅ No code changes needed
✅ Fast to implement
✅ Current economic model preserved
✅ Explicit about behavior

### Cons
❌ May confuse users expecting traditional bonding curve
❌ "Bonding curve" terminology is misleading
❌ Price jump at graduation still exists
❌ MEV opportunity remains

---

## ⚡ Medium Fix #3: Graduation Warning Event

**Issue:** No warning when pool approaches graduation
**Severity:** MEDIUM
**Time to Fix:** 10 minutes
**Files:** `events.rs`, `trade.rs`

### Add New Event (events.rs)

```rust
/// Emitted when pool is approaching graduation (90%+ progress)
#[event]
pub struct GraduationApproaching {
    pub pool: Pubkey,
    pub base_mint: Pubkey,
    pub progress_percent: u8,        // 90-99
    pub current_crx: u64,
    pub threshold_crx: u64,
    pub estimated_price_jump_bps: u64,  // e.g., 640 = 6.4x = 540% increase
    pub slot: u64,
}
```

### Emit Event in trade.rs

**Location:** In `update_statistics` function after line 179

```rust
pub fn update_statistics(
    pool: &mut Pool,
    direction: TradeDirection,
    input_amount: u64,
    output_amount: u64,
    _total_fee: u64,
) -> Result<()> {
    // ... existing volume tracking ...

    // NEW: Check graduation progress and warn users
    if pool.current_phase == CurvePhase::PreBonding {
        let progress = (pool.real_quote_reserves as u128)
            .checked_mul(100)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(pool.graduation_threshold_crx as u128)
            .ok_or(ErrorCode::MathOverflow)? as u64;

        // Emit warning when 90%+ to graduation (only once per 1% progress)
        if progress >= 90 && progress < 100 {
            // Calculate estimated price jump
            let virtual_price = (pool.virtual_quote_reserves as u128)
                .checked_mul(BPS_DENOMINATOR as u128)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(pool.virtual_base_reserves as u128)
                .ok_or(ErrorCode::MathOverflow)?;

            let real_price = (pool.real_quote_reserves as u128)
                .checked_mul(BPS_DENOMINATOR as u128)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(pool.real_base_reserves as u128)
                .ok_or(ErrorCode::MathOverflow)?;

            let price_jump_bps = real_price
                .checked_mul(BPS_DENOMINATOR as u128)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(virtual_price)
                .ok_or(ErrorCode::MathOverflow)? as u64;

            emit!(GraduationApproaching {
                pool: pool.key(),
                base_mint: pool.base_mint,
                progress_percent: progress as u8,
                current_crx: pool.real_quote_reserves,
                threshold_crx: pool.graduation_threshold_crx,
                estimated_price_jump_bps: price_jump_bps,
                slot: Clock::get()?.slot,
            });
        }
    }

    Ok(())
}
```

### Front-end Integration

```typescript
// Listen for warning event
connection.onLogs(poolPubkey, (logs) => {
  if (logs.includes('GraduationApproaching')) {
    const event = parseGraduationEvent(logs);

    // Show warning to user
    showWarning(
      `⚠️ Pool at ${event.progressPercent}% to graduation! ` +
      `Price may increase ${event.estimatedPriceJump}x after graduation.`
    );
  }
});
```

---

## 🟢 Optional Fix #4: Blended Transition (Option C)

**Issue:** Abrupt price jump at graduation
**Severity:** MEDIUM
**Time to Fix:** 8-16 hours
**Files:** `state.rs`, `trade.rs`

This provides smooth transition from virtual to real reserves.

### Modify get_pricing_reserves in state.rs

```rust
/// Get reserves to use for pricing with optional blending
#[inline]
pub fn get_pricing_reserves(&self) -> (u64, u64) {
    match self.current_phase {
        CurvePhase::PreBonding => {
            // Calculate progress to graduation (0.0 to 1.0)
            let progress = (self.real_quote_reserves as u128)
                .checked_mul(PRICE_PRECISION as u128)
                .unwrap_or(0)
                .checked_div(self.graduation_threshold_crx as u128)
                .unwrap_or(0);

            // Start blending at 50% progress, fully blended at 100%
            let blend_start = (PRICE_PRECISION / 2) as u128; // 0.5

            if progress < blend_start {
                // Below 50%: use pure virtual reserves
                (self.virtual_quote_reserves, self.virtual_base_reserves)
            } else {
                // Above 50%: blend from virtual to real
                // blend_factor: 0.0 at 50%, 1.0 at 100%
                let blend_factor = (progress - blend_start)
                    .checked_mul(PRICE_PRECISION as u128)
                    .unwrap_or(0)
                    .checked_div(blend_start)
                    .unwrap_or(0);

                let blended_quote = self.blend_reserves(
                    self.virtual_quote_reserves,
                    self.real_quote_reserves,
                    blend_factor as u64,
                )?;

                let blended_base = self.blend_reserves(
                    self.virtual_base_reserves,
                    self.real_base_reserves,
                    blend_factor as u64,
                )?;

                (blended_quote, blended_base)
            }
        },
        CurvePhase::Graduated => {
            (self.real_quote_reserves, self.real_base_reserves)
        },
    }
}

/// Blend two reserve values based on progress
#[inline]
fn blend_reserves(
    &self,
    virtual_reserve: u64,
    real_reserve: u64,
    blend_factor: u64, // 0 to PRICE_PRECISION (0% to 100%)
) -> Result<u64> {
    let virtual_part = (virtual_reserve as u128)
        .checked_mul((PRICE_PRECISION - blend_factor) as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(PRICE_PRECISION as u128)
        .ok_or(ErrorCode::MathOverflow)?;

    let real_part = (real_reserve as u128)
        .checked_mul(blend_factor as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(PRICE_PRECISION as u128)
        .ok_or(ErrorCode::MathOverflow)?;

    let blended = virtual_part
        .checked_add(real_part)
        .ok_or(ErrorCode::MathOverflow)?;

    require!(blended <= u64::MAX as u128, ErrorCode::MathOverflow);
    Ok(blended as u64)
}
```

### Expected Behavior

**Progress to Graduation:**
```
 0% -  49%: Pure virtual reserves (fixed price per trade size)
50%:        50% virtual, 50% real (blend starts)
75%:        25% virtual, 75% real
100%:       Pure real reserves (graduation, smooth transition!)
```

**Price Curve:**
```
Progress  Virtual Price  Real Price  Blended Price  Jump
  0%        0.005         0.010        0.005         1.00x
 25%        0.005         0.015        0.005         1.00x
 50%        0.005         0.020        0.0125        1.00x (blend starts)
 75%        0.005         0.025        0.020         1.60x (gradual)
100%        0.005         0.030        0.030         1.50x (smooth!)
```

### Pros
✅ Smooth price transition (no sudden jump)
✅ Reduces MEV opportunity
✅ Better user experience
✅ Combines benefits of both models

### Cons
❌ Most complex implementation
❌ More compute units (~5-10k additional)
❌ Harder to test and verify
❌ May confuse users about pricing model

---

## 📋 Recommended Implementation Order

### Phase 1: Immediate (Before Mainnet)
1. ✅ **Add pool depletion check** (Fix #1) - 5 minutes
2. ✅ **Choose virtual reserve model** (Fix #2A or #2B) - 30 min to 4 hours
3. ✅ **Add graduation warning event** (Fix #3) - 10 minutes

**Total Time:** 45 minutes (Option B) or 4-5 hours (Option A)

### Phase 2: Post-Launch Week 1
4. Update SDK with helper functions
5. Update documentation thoroughly
6. Add UI warnings for graduation

### Phase 3: Future (Optional)
7. Consider blended transition (Option C) for V3

---

## 🧪 Testing Checklist

After implementing fixes, test:

**Pool Depletion Check:**
- [ ] Buy with amount that would exceed pool supply
- [ ] Verify receives `InsufficientLiquidity` error (not SPL error)
- [ ] Verify transaction reverts before state changes

**Virtual Reserve Update (if Option A):**
- [ ] Verify price increases with each buy
- [ ] Verify early buyers get better prices
- [ ] Verify graduation has no price jump
- [ ] Test round-trip buy-sell (should lose ~2% fees only)

**Graduation Warning (if Fix #3):**
- [ ] Trade pool to 89% graduation (no event)
- [ ] Trade pool to 90% graduation (event emitted)
- [ ] Verify event contains correct price jump estimate
- [ ] Test event parsing in SDK

**Integration:**
- [ ] Devnet deployment with fixes
- [ ] 100+ trades across graduation threshold
- [ ] Monitor for unexpected behavior
- [ ] Verify all events emit correctly

---

## 📊 Impact Analysis

### Compute Unit Impact

| Fix | Additional CU | Acceptable? |
|-----|---------------|-------------|
| #1: Pool depletion check | ~500 | ✅ Yes (negligible) |
| #2A: Update virtual reserves | ~2,000 | ✅ Yes (worth it) |
| #2B: Documentation only | 0 | ✅ Yes (free) |
| #3: Graduation warning | ~3,000 | ✅ Yes (rare event) |
| #4: Blended transition | ~8,000 | ⚠️ Maybe (significant) |

Current buy instruction: ~100,000 CU
After fixes: ~105,000 CU (Option A + #1 + #3)
Still well under 200,000 CU limit ✅

### User Experience Impact

**Before Fixes:**
- ❌ Unclear error when pool depleted
- ❌ Confusing "bonding curve" that doesn't bond
- ❌ Surprise 6x price jump at graduation
- ❌ No warning before graduation

**After Fixes (Option A + #1 + #3):**
- ✅ Clear error messages
- ✅ Traditional bonding curve behavior
- ✅ Smooth graduation transition
- ✅ Warnings before major price changes

**After Fixes (Option B + #1 + #3):**
- ✅ Clear error messages
- ✅ Documented fixed-price model
- ✅ Known price jump (warned in advance)
- ✅ Warnings before major price changes

---

## 🎯 Final Recommendation

**For Fastest Launch (Minimal Changes):**
Implement Fix #1 + Fix #2B + Fix #3
- Time: 45 minutes
- No economic model changes
- Clear documentation of behavior
- Acceptable user experience

**For Best Economics (Traditional Bonding Curve):**
Implement Fix #1 + Fix #2A + Fix #3
- Time: 4-5 hours
- Better matches "bonding curve" branding
- Rewards early buyers
- Smooth graduation

**Both approaches are valid.** The choice depends on:
- Time constraints (45 min vs 5 hours)
- Desired economic model (fixed-price vs bonding)
- User expectations (documented quirks vs traditional behavior)

---

**Files Ready for Implementation:**
- Option A: Edit `trade.rs`, `buy.rs`
- Option B: Edit `buy.rs`, update docs
- Both: Add event to `events.rs`

All fixes use checked arithmetic and maintain security standards.
