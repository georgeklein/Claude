# Compute Unit Optimization Plan

**Current:** ~200,000 CU per pool creation
**Target:** <100,000 CU per pool creation
**Savings Goal:** 50%+ reduction

---

## Current State Analysis

Based on code review, current CU usage breakdown (estimated):

| Component | CU Cost | Optimization Potential |
|-----------|---------|------------------------|
| Account deserialization | ~15,000 | Low (10%) |
| Oracle validation | ~5,000 | Medium (30%) |
| Reserve calculations (2x) | ~8,000 | High (50%) |
| Anti-sniper checks | ~3,000 | Medium (30%) |
| WAA calculations | ~4,000 | Low (20%) |
| Event emissions | ~12,000 | High (40%) |
| Vault balance validation | ~6,000 | High (80%) |
| CPI calls (3x token transfers) | ~45,000 | None |
| Account rent/creation | ~20,000 | Low (via account size) |
| Other (constraints, etc.) | ~82,000 | Medium (20%) |
| **TOTAL** | **~200,000** | |

---

## Optimization Strategy

### Phase 1: Remove Redundant Calculations (Target: -15k CU)

1. **Eliminate duplicate output calculation** (-5k CU)
   - Currently: Calculate output twice (estimate for anti-sniper + actual)
   - Optimize: Single calculation, reuse for both checks
   - Location: `buy.rs:100` and `buy.rs:129`

2. **Remove vault balance validation in production** (-6k CU)
   - Currently: Validates vault == reserves after every trade
   - Optimize: Make conditional (debug mode only) or remove entirely
   - Location: `buy.rs:241`, `sell.rs:248`
   - Security note: Already protected by Solana runtime + mathematical invariants

3. **Optimize phase transition check** (-2k CU)
   - Currently: Checks graduation threshold on every trade
   - Optimize: Early return if already graduated
   - Location: `trade.rs:210`

4. **Remove unused return values** (-2k CU)
   - Currently: Functions return values that are ignored
   - Optimize: Remove unused calculations/returns
   - Location: `trade.rs:220` (unused `_transitioned`)

### Phase 2: Reduce Event Data (Target: -8k CU)

5. **Minimize TradeExecuted event** (-5k CU)
   - Currently: 15 fields including computed values
   - Remove: `market_cap_usd`, `market_cap_crx`, `trader`, `pool`
   - Keep: Essential data only (amounts, fees, phase)
   - Indexers can compute market cap off-chain from reserves

6. **Minimize PoolCreated event** (-2k CU)
   - Currently: 12 fields
   - Remove: `initial_market_cap_usd`, `initial_market_cap_crx`, `price`
   - Keep: Only PDA seeds + thresholds

7. **Remove PhaseTransition event** (-1k CU)
   - Currently: Duplicate of PoolGraduated
   - Optimize: Emit only PoolGraduated (same information)

### Phase 3: Optimize Data Structures (Target: -8k CU)

8. **Reduce Pool account size** (-4k CU)
   - Currently: 307 bytes with stats fields
   - Remove: `total_base_volume`, `unique_traders`, `total_fees_collected`
   - New size: 250 bytes
   - Rationale: Stats can be derived from events by indexers

9. **Pack boolean flags** (-1k CU)
   - Currently: `disable_waa` is separate field
   - Optimize: Pack into `current_phase` enum variant
   - Example: `PreBonding { waa_enabled: bool }`

10. **Use smaller integer types where possible** (-3k CU)
    - Currently: Many u64s for small values
    - Optimize: Use u32 for timestamps, u16 for bps
    - Impact: Reduced deserialization cost

### Phase 4: Constraint Optimization (Target: -10k CU)

11. **Move constraints to handler** (-6k CU)
    - Currently: Many `#[account(constraint = ...)]` macros
    - Optimize: Move non-critical checks to handler
    - Example: Vault ownership already implied by PDA

12. **Remove redundant owner checks** (-4k CU)
    - Currently: Check `quote_vault.owner == pool.key()`
    - Optimize: PDA derivation already guarantees this
    - Safe removal for PDA-owned accounts

### Phase 5: Algorithm Optimization (Target: -9k CU)

13. **Cache oracle price** (-3k CU)
    - Currently: Fetches oracle on every pool creation
    - Optimize: Could cache in Config (if price doesn't change often)
    - Trade-off: Slight staleness vs huge CU savings

14. **Optimize division operations** (-2k CU)
    - Currently: Multiple division operations in fee calculations
    - Optimize: Combine operations, use shift for powers of 2

15. **Simplify WAA formula** (-4k CU)
    - Currently: Uses u128 multiplication and division
    - Optimize: Approximate with u64 ops where overflow impossible
    - Check: Ensure overflow still protected

---

## Implementation Priority

### High Priority (Do First)
- [x] Remove duplicate output calculation (5k CU)
- [ ] Remove vault balance validation (6k CU)
- [ ] Minimize TradeExecuted event (5k CU)
- [ ] Reduce Pool account size (4k CU)

**Quick wins:** 20k CU reduction

### Medium Priority
- [ ] Remove PhaseTransition event (1k CU)
- [ ] Move constraints to handler (6k CU)
- [ ] Optimize phase transition check (2k CU)
- [ ] Remove redundant owner checks (4k CU)

**Additional savings:** 13k CU

### Low Priority (If Still Needed)
- [ ] Simplify WAA formula (4k CU)
- [ ] Optimize division operations (2k CU)
- [ ] Pack boolean flags (1k CU)

**Final optimizations:** 7k CU

---

## Target Achievement

| Phase | CU Savings | Cumulative | % of Goal |
|-------|------------|------------|-----------|
| Baseline | 0 | 200,000 | 0% |
| Phase 1 | -15,000 | 185,000 | 15% |
| Phase 2 | -8,000 | 177,000 | 23% |
| Phase 3 | -8,000 | 169,000 | 31% |
| Phase 4 | -10,000 | 159,000 | 41% |
| Phase 5 | -9,000 | 150,000 | 50% |
| **TOTAL** | **-50,000** | **150,000** | **50%** |

**Result:** 150k CU (25% under target of <200k, but not quite <100k)

---

## Aggressive Optimization (To Reach <100k)

If 50% reduction insufficient, additional measures:

16. **Remove anti-sniper checks** (-3k CU)
    - Trade-off: Security vs cost
    - Alternative: Make optional per pool

17. **Remove WAA fee system entirely** (-6k CU)
    - Trade-off: Anti-bot protection vs cost
    - Alternative: Make opt-in

18. **Simplify events to minimum** (-10k CU)
    - Emit only: pool, user, amounts
    - Remove all computed fields

19. **Use smaller account types** (-8k CU)
    - Use raw AccountInfo instead of Account<>
    - Manual deserialization (unsafe)

**Aggressive total:** -27k additional CU → **123k final**

Still above <100k target. To reach <100k:

20. **Combine buy/sell into single instruction** (-15k CU)
    - Unified trade handler
    - Direction as parameter
    - Reduced code duplication

21. **Batch CPI calls** (-10k CU)
    - Combine fee + swap transfers
    - Requires custom token program interaction

**With all optimizations:** ~98k CU ✅

---

## Risk Assessment

### Low Risk (Safe to implement)
- Remove duplicate calculations ✅
- Minimize event data ✅
- Reduce account sizes ✅
- Remove debug validations ✅

### Medium Risk (Test thoroughly)
- Simplify WAA formula
- Move constraints to handler
- Pack data structures

### High Risk (Requires audit)
- Remove anti-sniper checks
- Remove WAA system
- Use raw AccountInfo
- Batch CPI calls

---

## Implementation Order

**Week 1: Safe Optimizations**
1. Remove duplicate output calculation
2. Make vault validation conditional (#[cfg(debug)])
3. Minimize event fields
4. Remove unused return values

**Week 2: Data Structure Optimization**
5. Reduce Pool account size
6. Remove PhaseTransition event
7. Move constraints to handler

**Week 3: Algorithm Optimization (If Needed)**
8. Optimize WAA calculations
9. Simplify division operations
10. Early return optimizations

**Week 4: Aggressive Optimization (If Required)**
11. Combine buy/sell instructions
12. Remove optional features
13. Final profiling and tuning

---

## Measurement Plan

**Before optimization:**
```bash
anchor test --skip-build > baseline_cu.log
grep "consumed" baseline_cu.log
```

**After each phase:**
```bash
anchor test --skip-build > phase${N}_cu.log
diff baseline_cu.log phase${N}_cu.log
```

**Target metrics:**
- Pool creation: <100k CU
- Buy trade: <80k CU
- Sell trade: <80k CU
- Average: <90k CU

---

## Next Steps

1. ✅ Document current state (this file)
2. [ ] Implement Phase 1 optimizations
3. [ ] Measure CU reduction
4. [ ] Iterate until target reached
5. [ ] Audit optimized code
6. [ ] Deploy to devnet for testing

---

**Last Updated:** 2026-01-08
**Status:** Planning complete, ready for implementation
**Priority:** HIGH (required for mainnet cost optimization)
