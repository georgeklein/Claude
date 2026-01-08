# Scale AMM - Test Failure Analysis Summary

**Report Generated:** 2026-01-08  
**Analysis Method:** Static code analysis (tests could not be run)  
**Total Tests Found:** 296 tests across 10 test files

---

## Executive Summary

I was unable to run the actual test suite due to missing Solana toolchain dependencies. Instead, I performed a comprehensive static analysis of all test files to understand:

1. What each test is testing
2. Likely failure modes based on test code
3. Categories and priorities for fixing failures

## Environment Issues Preventing Test Execution

### CRITICAL Blockers

1. **Missing Solana Toolchain**
   - `solana-keygen` command not found
   - Cannot generate valid test wallet keypair
   - Impact: `anchor test` fails immediately

2. **Missing IDL Files**
   - `target/idl/creator_amm_v_2.json` not found
   - `anchor build` fails with "no such command: build-bpf"
   - Impact: Tests cannot load program interface

3. **Build Dependencies**
   - Solana BPF toolchain not installed
   - Cargo cannot compile Solana programs
   - Impact: Cannot generate IDL from program

---

## Test Suite Overview

### Test Count by File

| File | Test Count | Status |
|------|------------|---------|
| CRITICAL_TESTS_IMPLEMENTED.ts | 43 | ✅ Implemented |
| CRITICAL_TESTS_NEEDED.ts | 33 | ❌ Unimplemented (templates) |
| advanced-coverage.ts | 65 | ✅ Implemented |
| comprehensive.ts | 18 | ✅ Implemented |
| critical-coverage.ts | 39 | ✅ Implemented |
| edge-cases-final.ts | 38 | ✅ Implemented |
| graduation-overflow-tests.ts | 20 | ✅ Implemented |
| security-tests.ts | 18 | ✅ Implemented |
| simulation-tests.ts | 2 | ✅ Implemented |
| waa-comprehensive.ts | 20 | ✅ Implemented |
| **TOTAL** | **296** | **263 implemented, 33 templates** |

### Test Categories

| Category | Count | Priority | Likely Failure Rate |
|----------|-------|----------|-------------------|
| Oracle Tests | 27 | CRITICAL | HIGH (mock data issues) |
| WAA Fee Tests | 42 | CRITICAL | HIGH (slot advancement needed) |
| Graduation Tests | 41 | CRITICAL | MEDIUM (threshold calculation) |
| Trade/Swap Tests | 42 | HIGH | MEDIUM (slippage, rounding) |
| Math/Overflow Tests | 25 | HIGH | MEDIUM (checked arithmetic) |
| Stress/Simulation Tests | 16 | MEDIUM | HIGH (timeout, compute limits) |
| Edge Case Tests | 15 | MEDIUM | MEDIUM (boundary conditions) |
| Anti-Sniper Tests | 11 | HIGH | MEDIUM (slot window logic) |
| Concurrent Tests | 5 | MEDIUM | HIGH (transaction ordering) |
| Config/Setup Tests | 3 | LOW | LOW (basic setup) |
| Other Tests | 36 | VARIES | VARIES |
| Unimplemented | 33 | N/A | 100% (expect.fail) |

---

## Detailed Failure Analysis by Category

### 1. Oracle Tests (27 tests) - CRITICAL

**Likely Failure Patterns:**

- **Mock Oracle Structure** (HIGH probability)
  - Tests create mock Pyth oracle accounts with simplified structure
  - Real Pyth oracles have specific discriminators, offsets, and data layout
  - Fix: Implement proper PythPriceFeed struct matching Pyth's actual format

- **Oracle Timestamp Issues** (HIGH probability)
  - Stale price tests need to set oracle timestamp correctly
  - May not be setting `publish_time` field in mock
  - Fix: Write oracle data with proper timestamp offset

- **Price Validation Logic** (MEDIUM probability)
  - Tests expect specific errors (InvalidCrxPrice, OraclePriceStale)
  - Program's validation logic may return different errors
  - Fix: Match error expectations to actual program behavior

**Example Failing Tests:**
- `Should reject pool creation with stale oracle price` (line 401, CRITICAL_TESTS_IMPLEMENTED.ts)
- `Should reject negative oracle prices` (line 435)
- `Should reject oracle prices outside reasonable bounds` (lines 463, 491)

**Suggested Fix Priority:** HIGH - Oracle is core to protocol, must work correctly

---

### 2. WAA Fee Tests (42 tests) - CRITICAL

**Likely Failure Patterns:**

- **Slot Advancement** (HIGH probability)
  - WAA fees depend on time (slots since entry)
  - Tests need to advance blockchain slots between trades
  - Localnet may not support `warp()` or slot advancement
  - Fix: Implement slot advancement mechanism or use relative calculations

- **Fee Calculation Precision** (MEDIUM probability)
  - Linear decay formula: `F2 + (F1-F2) * (T2-age) / (T2-T1)`
  - Integer division may round differently than test expects
  - Fix: Match test calculations to exact program implementation

- **Weighted Average Overflow** (MEDIUM probability)
  - WAA calculation: `(old_amount * old_slot + new_amount * new_slot) / total_amount`
  - May overflow with large amounts or slot numbers
  - Fix: Verify program uses checked arithmetic or saturating operations

**Example Failing Tests:**
- `Should charge 10% extra fee for sells within T1` (line 765)
- `Should apply linear decay from T1 to T2` (line 817)
- `Should calculate WAA correctly across multiple buys` (line 722)

**Suggested Fix Priority:** CRITICAL - Anti-dump mechanism is core feature

---

### 3. Graduation Tests (41 tests) - CRITICAL

**Likely Failure Patterns:**

- **Threshold Calculation** (MEDIUM probability)
  - Graduation threshold = `(target_mcap_usd / crx_price_usd) * token_supply`
  - Depends on oracle price, may miscalculate with mock oracle
  - Fix: Verify virtual reserve calculation uses correct oracle data

- **Reserve Switching** (HIGH probability)
  - PreBonding uses virtual reserves, Graduated uses real reserves
  - Tests expect clean switch at graduation
  - May have timing issues if phase check happens after reserve calculation
  - Fix: Ensure phase state updates before next trade

- **Price Discontinuity** (MEDIUM probability)
  - Tests verify price doesn't jump at graduation
  - Formula change (virtual→real) may cause small price difference
  - Fix: Accept small tolerance or adjust real reserves to match virtual

**Example Failing Tests:**
- `Should graduate at exact threshold` (line 1476)
- `Should have no price discontinuity at graduation` (line 1516)
- `Should switch from virtual to real reserves correctly` (line 1597)

**Suggested Fix Priority:** CRITICAL - Core protocol mechanic

---

### 4. Trade/Swap Tests (42 tests) - HIGH

**Likely Failure Patterns:**

- **Slippage Protection** (MEDIUM probability)
  - Tests specify max_slippage, expect rejection if exceeded
  - Price impact calculation may round differently
  - Fix: Allow small tolerance in slippage checks

- **Reserve Invariants** (MEDIUM probability)
  - x*y=k should hold (constant product AMM)
  - After fees, k actually decreases slightly
  - Fix: Adjust assertions to account for fee impact

- **Token Account Setup** (LOW probability)
  - Associated token accounts must exist for all users
  - Fix: Use `getOrCreateAssociatedTokenAccount` in setup

**Example Failing Tests:**
- `Should execute buy with slippage protection` (line 525, comprehensive.ts)
- `Should maintain invariants over 1000 random trades` (line 1870)

**Suggested Fix Priority:** HIGH - Core trading functionality

---

### 5. Math/Overflow Tests (25 tests) - HIGH

**Likely Failure Patterns:**

- **Checked Arithmetic** (HIGH probability)
  - Tests expect `MathOverflow` error on large inputs
  - If program uses unchecked math, tests will fail (or worse, panic)
  - Fix: Ensure all arithmetic uses `checked_*` operations

- **Division by Zero** (MEDIUM probability)
  - Tests try to trigger divide-by-zero
  - May not be possible to create zero reserves in practice
  - Fix: Mock at program level or test via different code path

- **Precision Loss** (MEDIUM probability)
  - Integer division loses fractional parts
  - Tests expect specific rounding behavior
  - Fix: Match test calculations exactly to program

**Example Failing Tests:**
- `Should protect against overflow on max inputs` (line 1694)
- `Should not leak value via rounding errors` (line 1745)
- `Should protect against division by zero` (line 1735)

**Suggested Fix Priority:** HIGH - Security-critical

---

### 6. Stress/Simulation Tests (16 tests) - MEDIUM

**Likely Failure Patterns:**

- **Test Timeout** (HIGH probability)
  - 1000-trade simulations take significant time
  - May exceed Mocha's default timeout
  - Fix: Increase timeout with `.timeout(600000)` or reduce iterations

- **Compute Budget** (MEDIUM probability)
  - Solana limits compute units per transaction
  - Complex trades may hit 200k CU limit
  - Fix: Add `ComputeBudgetProgram.requestUnits()` calls

- **Cumulative Rounding Errors** (MEDIUM probability)
  - After 1000 trades, small rounding errors accumulate
  - Strict invariant checks may fail
  - Fix: Allow tolerance in final assertions

**Example Failing Tests:**
- `Should maintain invariants over 1000 random trades` (line 1870)
- `Should graduate and continue trading under stress` (line 1943)

**Suggested Fix Priority:** MEDIUM - Important but not blocking launch

---

### 7. Anti-Sniper Tests (11 tests) - HIGH

**Likely Failure Patterns:**

- **Slot Window Logic** (MEDIUM probability)
  - Window = first 20 slots after pool creation
  - Calculation: `current_slot - pool.created_at_slot`
  - May be off-by-one error
  - Fix: Verify boundary conditions (< vs <=)

- **Max Trade Size** (MEDIUM probability)
  - Max = 5% of supply during window
  - Calculation: `supply * 500 / 10000`
  - Must match program exactly
  - Fix: Use same formula in test and program

**Example Failing Tests:**
- `Should enforce max trade size during anti-sniper window` (line 1133)
- `Should allow large trades after anti-sniper window expires` (line 1204)

**Suggested Fix Priority:** HIGH - Launch protection mechanism

---

### 8. Concurrent/Race Tests (5 tests) - MEDIUM

**Likely Failure Patterns:**

- **Transaction Ordering** (HIGH probability)
  - `Promise.all()` submits transactions in parallel
  - May not execute in expected order
  - Fix: Use transaction confirmation and check final state

- **Account Locking Failures** (MEDIUM probability)
  - Solana serializes writes to same account
  - Some parallel transactions may fail with "Account in use"
  - Fix: Expect and handle some failures as normal

**Example Failing Tests:**
- `Should handle simultaneous buys without reserve corruption` (line 1295)
- `Should handle graduation race condition safely` (line 1379)

**Suggested Fix Priority:** MEDIUM - Important for production but complex to test

---

### 9. Edge Case Tests (15 tests) - MEDIUM

**Likely Failure Patterns:**

- **Boundary Conditions** (MEDIUM probability)
  - Off-by-one errors at exact thresholds
  - >= vs >, <= vs < logic
  - Fix: Verify program logic matches test expectations

- **Zero Values** (MEDIUM probability)
  - Zero amount trades should be rejected
  - Program may panic instead of returning error
  - Fix: Add early validation for zero amounts

**Suggested Fix Priority:** MEDIUM - Edge cases but important for robustness

---

### 10. Unimplemented Tests (33 tests) - N/A

**Status:** These are template tests in `CRITICAL_TESTS_NEEDED.ts`

All tests use `expect.fail("NOT IMPLEMENTED")` as placeholder.

**Categories:**
- Oracle edge cases: 5 tests
- WAA sell fees: 7 tests
- Anti-sniper protection: 5 tests
- Concurrent trading: 4 tests
- Graduation edge cases: 5 tests
- Math overflow: 6 tests
- Stress simulations: 2 tests

**Suggested Fix Priority:** MEDIUM-LOW - Some overlap with implemented tests, but adds coverage

---

## Recommended Action Plan

### Phase 1: Environment Setup (Day 1)

1. **Install Solana Toolchain**
   ```bash
   sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
   export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
   ```

2. **Build Program and Generate IDL**
   ```bash
   anchor build
   ```

3. **Run Tests to Get Actual Failures**
   ```bash
   anchor test 2>&1 | tee test-output-real.log
   ```

### Phase 2: Fix High-Priority Failures (Days 2-5)

**Priority Order:**

1. **Oracle Tests** (Est: 1 day)
   - Implement proper Pyth oracle mock
   - Verify price validation logic
   - Expected: 15-20 tests will pass after fix

2. **WAA Fee Tests** (Est: 1-2 days)
   - Implement slot advancement or adjust calculations
   - Fix precision/rounding issues
   - Expected: 25-30 tests will pass after fix

3. **Graduation Tests** (Est: 1 day)
   - Verify threshold calculations
   - Fix reserve switching logic
   - Expected: 20-25 tests will pass after fix

4. **Trade/Math Tests** (Est: 1 day)
   - Fix slippage tolerance
   - Verify checked arithmetic
   - Expected: 30-35 tests will pass after fix

### Phase 3: Medium-Priority Fixes (Days 6-8)

1. **Anti-Sniper Tests** (Est: 0.5 day)
2. **Edge Case Tests** (Est: 0.5 day)
3. **Stress Tests** (Est: 1 day - increase timeouts, reduce iterations)

### Phase 4: Implement Missing Tests (Days 9-14)

Implement the 33 unimplemented tests in `CRITICAL_TESTS_NEEDED.ts`

---

## Success Metrics

**Target Before Mainnet:**
- ✅ 100% of implemented tests passing (263/263)
- ✅ All critical tests from NEEDED.ts implemented (33 more tests)
- ✅ No outstanding security issues
- ✅ 72-hour devnet soak test successful

**Current Status:**
- ❌ 0% tests can run (environment issues)
- ⚠️ 263 tests implemented but untested
- ❌ 33 critical tests not implemented

---

## Files Generated

1. **TEST_FAILURE_ANALYSIS.json** (119KB, 2675 lines)
   - Detailed analysis of all 296 tests
   - Categorized by type with failure causes
   - Suggested fixes for each test

2. **TEST_ANALYSIS_SUMMARY.md** (this file)
   - Executive summary
   - Action plan
   - Priority recommendations

3. **test-output.log**
   - Contains environment setup errors
   - Shows blockers preventing test execution

---

## Next Steps

1. **Immediate:** Install Solana toolchain and build program
2. **Day 1:** Run actual tests and capture real failures
3. **Days 2-5:** Fix high-priority test failures
4. **Days 6-8:** Fix medium-priority failures
5. **Days 9-14:** Implement missing critical tests
6. **Days 15-21:** Devnet soak test and mainnet prep

---

**Analysis Complete:** 2026-01-08 23:17 UTC  
**Files Written:**
- `/home/user/Claude/TEST_FAILURE_ANALYSIS.json`
- `/home/user/Claude/TEST_ANALYSIS_SUMMARY.md`
- `/home/user/Claude/test-output.log`

