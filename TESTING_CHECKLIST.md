# Testing Checklist - Creator AMM v2

**Quick Reference for Test Implementation Progress**

---

## 🔴 CRITICAL PRIORITY (Week 1)

### Oracle Edge Cases (8 tests)
- [ ] Stale oracle price rejection (>60s old)
- [ ] Negative oracle price rejection (i64 < 0)
- [ ] Oracle price out of bounds (<$0.01 or >$1000)
- [ ] Oracle confidence too wide (>100 bps)
- [ ] Wrong oracle account rejection
- [ ] Oracle price at creation stored correctly
- [ ] Oracle update during trades
- [ ] Multiple pools with same oracle

**File:** `tests/oracle-edge-cases.ts`

---

### WAA Sell Fees (10 tests)
- [ ] WAA calculation on multiple buys
- [ ] 10% fee for sells <30s (T1=75 slots)
- [ ] Linear decay 10%→1% (T1-T2)
- [ ] Linear decay 1%→0% (T2-T3)
- [ ] 0% fee for holds >30min (T3=4500 slots)
- [ ] Partial sell reduces tracked_amount
- [ ] Full sell resets WAA to 0
- [ ] WAA fee boundaries (T1, T2, T3 exact)
- [ ] Buy after full sell (fresh WAA)
- [ ] WAA across pool graduation

**File:** `tests/waa-sell-fees.ts`

---

### Anti-Sniper Protection (7 tests)
- [ ] Anti-sniper enforces max 5% during window
- [ ] Anti-sniper applies to buys
- [ ] Anti-sniper applies to sells
- [ ] Anti-sniper deactivates after window (20 slots)
- [ ] Anti-sniper only in PreBonding phase
- [ ] Anti-sniper disabled after graduation
- [ ] Max trade size calculation correct

**File:** `tests/anti-sniper.ts`

---

### Concurrent Trading (5 tests)
- [ ] Simultaneous buys (no double-counting)
- [ ] Buy + sell in same slot
- [ ] Graduation race condition (two buys near threshold)
- [ ] Account locking prevents corruption
- [ ] Multiple users trading same pool

**File:** `tests/concurrent-trading.ts`

**CRITICAL: 30 tests total**

---

## 🟠 HIGH PRIORITY (Week 2)

### Graduation Edge Cases (10 tests)
- [ ] Graduation at exact threshold
- [ ] Graduation 1 lamport over threshold
- [ ] No price discontinuity at graduation
- [ ] Reserve switch (virtual→real) seamless
- [ ] Fee structure unchanged after graduation
- [ ] Graduation on sell (rare edge case)
- [ ] Multiple trades crossing graduation
- [ ] Virtual reserves frozen after graduation
- [ ] Real reserves used for pricing post-grad
- [ ] Graduation event emitted correctly

**File:** `tests/graduation-edge-cases.ts`

---

### Math Edge Cases (10 tests)
- [ ] Max input overflow (u64::MAX)
- [ ] Min output enforcement (<1000 lamports)
- [ ] Division by zero protection
- [ ] Precision loss in small trades
- [ ] Very large trade (99% of supply)
- [ ] Exponential curve overflow protection
- [ ] ConstantProduct curve extreme inputs
- [ ] Fee calculation overflow
- [ ] Virtual reserve calculation overflow
- [ ] Market cap calculation overflow

**File:** `tests/math-edge-cases.ts`

**HIGH: 20 tests (50 cumulative)**

---

## 🟡 MEDIUM PRIORITY (Week 3)

### Multi-Pool Scenarios (5 tests)
- [ ] Multiple pools by same creator
- [ ] Independent pool reserves
- [ ] Independent pool phases
- [ ] Fee recipient receives from all pools
- [ ] Same base token, different pools

**File:** `tests/multi-pool.ts`

---

### User Position Edge Cases (8 tests)
- [ ] Position init_if_needed on first buy
- [ ] Position tracking across multiple buys
- [ ] Sell reduces tracked_amount
- [ ] Full sell resets position
- [ ] Cannot sell without position
- [ ] Position PDA bump stored
- [ ] Position constraints enforced
- [ ] Position across pool graduation

**File:** `tests/user-position.ts`

---

### Approved Quotes (Tier 2) (7 tests)
- [ ] Whitelist update by authority
- [ ] Unauthorized whitelist update fails
- [ ] Pool creation with approved quote (SOL)
- [ ] Pool creation with non-approved quote fails
- [ ] CRX always allowed (Tier 1)
- [ ] approved_quote_count validation (0-5)
- [ ] Quote token validation in create_pool

**File:** `tests/approved-quotes.ts`

---

### Curve Comparison (5 tests)
- [ ] ConstantProduct vs Exponential graduation speed
- [ ] Price curve shape differences
- [ ] Fee impact on ConstantProduct
- [ ] Fee impact on Exponential
- [ ] Both curves maintain x*y≈k

**File:** `tests/curve-comparison.ts`

**MEDIUM: 25 tests (75 cumulative)**

---

## 🎯 ATTACK SCENARIOS (Week 4)

### Attack Simulations (10 tests)
- [ ] Sandwich attack (front-run + back-run)
- [ ] Slippage protection defeats sandwich
- [ ] Oracle manipulation (stale price)
- [ ] Oracle manipulation (fake oracle)
- [ ] Sniper bot (large buy at launch)
- [ ] WAA fee prevents quick flip
- [ ] MEV bot extraction attempts
- [ ] Flash loan simulation (if applicable)
- [ ] Vault draining attempts
- [ ] Reentrancy attempts (Solana context)

**File:** `tests/attack-scenarios.ts`

---

## 🔄 SIMULATIONS & FUZZING

### Stress Tests (3 long-running)
- [ ] 1000 random trades (maintain invariants)
- [ ] Stress test to graduation (random buys)
- [ ] Post-graduation trading (100 random trades)

**File:** `tests/stress-simulation.ts`

---

### Property-Based Testing
- [ ] Fuzzing: Random inputs (1M+ iterations)
- [ ] Invariant: x*y≈k always maintained
- [ ] Invariant: Reserves = Vault balances
- [ ] Invariant: No negative reserves
- [ ] Invariant: Total supply constant

**File:** `tests/fuzzing.ts`

---

## 📊 ADDITIONAL VALIDATION

### Code Not Tested Yet
- [ ] Freeze authority revocation check
- [ ] Reserve-vault mismatch detection
- [ ] Last price update tracking
- [ ] AntiSniperTriggered event emission
- [ ] Event emission verification (all events)
- [ ] PDA bump storage and usage

---

### Integration Tests
- [ ] Real Pyth oracle on devnet
- [ ] Real wallet interactions
- [ ] Compute unit profiling
- [ ] Transaction size limits
- [ ] Account size limits (Pool::LEN, UserPosition::LEN)

---

### Documentation Tests
- [ ] All error codes reachable
- [ ] All events emitted in correct scenarios
- [ ] Example code in comments works
- [ ] README examples functional

---

## 📈 PROGRESS TRACKING

### Test Count Summary
```
✅ Current Tests:     39
🔴 Critical Tests:    30 (Week 1)
🟠 High-Priority:     20 (Week 2)
🟡 Medium-Priority:   25 (Week 3)
🎯 Attack Scenarios:  10 (Week 4)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TOTAL TARGET:     124 tests
```

### Coverage Goals
```
Current Coverage:  ~35%
Target Coverage:   ~75%

Critical Paths:    60% → 95%
Edge Cases:        20% → 80%
Attack Scenarios:   0% → 50%
```

---

## ✅ EXIT CRITERIA

### Week 1 Complete When:
- [ ] All 30 critical tests passing
- [ ] No blockers discovered
- [ ] Code review complete

### Week 2 Complete When:
- [ ] All 50 tests passing (cumulative)
- [ ] Math edge cases verified
- [ ] Graduation edge cases verified

### Week 3 Complete When:
- [ ] All 75 tests passing
- [ ] Feature completeness verified
- [ ] Test coverage >70%

### Week 4 Complete When:
- [ ] All 85 tests passing
- [ ] Fuzzing clean (1M+ iterations)
- [ ] No new issues found

### Mainnet Ready When:
- [ ] All 85+ tests passing
- [ ] External audit complete
- [ ] All critical/high findings resolved
- [ ] Team consensus achieved
- [ ] Documentation complete

---

## 🚨 RED FLAGS

Stop and escalate if you see:
- ❌ Any critical test consistently failing
- ❌ Fuzzing finds reproducible crash
- ❌ Audit finds critical vulnerability
- ❌ Math overflow not caught by checks
- ❌ Reserve-vault mismatch occurs
- ❌ x*y=k invariant broken
- ❌ Negative reserves possible
- ❌ Timeline slips >1 week

---

## 📝 NOTES

### Testing Tips
1. Use localnet for fast iteration
2. Advance slots with warp() for WAA tests
3. Mock oracle for edge case testing
4. Use parallel transactions for concurrent tests
5. Verify events with listeners
6. Profile compute units for complex paths

### Common Pitfalls
- Oracle mocking doesn't match real Pyth behavior
- Slot advancement may not work on devnet
- Concurrent tests are flaky (use retries)
- Fuzzing is slow (run overnight)
- Need to handle program errors gracefully

---

## 🎯 CURRENT FOCUS

**THIS WEEK:** 🔴 Critical Security Tests (Week 1)

**Next Up:**
1. Oracle edge cases (2-3 days)
2. WAA sell fees (3-4 days)
3. Anti-sniper (2 days)
4. Concurrent trading (3-4 days)

**Assigned To:** _________________

**Due Date:** _________________

**Status:** ⬜ Not Started | 🟡 In Progress | ✅ Complete

---

## 📞 CONTACT

- Questions on oracle tests: See TESTING_REPORT.md Section 2.1
- Questions on WAA tests: See TESTING_REPORT.md Section 2.2
- Code examples: See CRITICAL_TESTS_NEEDED.ts
- Timeline questions: See TESTING_ACTION_PLAN.md

---

**Last Updated:** 2026-01-08
**Next Review:** Weekly standup
**Owner:** Agent 6 (Testing & Simulation Expert)
