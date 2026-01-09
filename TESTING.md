# Scale AMM - Testing Guide

**Status:** 263/263 unit tests passing
**Launch Target:** Feb 2026
**Test Implementation:** `/tests/platform-integration-tests.ts` + `/tests/load-test-scenarios.js`

---

## Quick Test Commands

```bash
anchor test                           # All unit tests (263 tests)
npm run test:integration             # Integration tests
k6 run tests/load-test-scenarios.js # Load tests
```

---

## Critical Tests Before Launch (59 P0 Tests)

### Token Creation (10 tests)
- Standard pool creation with all fee tiers (0%, 0.25%, 1%)
- Invalid inputs rejected (duplicate ticker, bad images, invalid fees)
- Fee sponsorship works ($0 user cost)
- Error handling (oracle down, RPC timeout, network failure)
- Mint/freeze authority must be revoked

### Trading - Buy (8 tests)
- Standard buy with SOL → CRX → TOKEN two-hop routing
- Slippage protection enforced
- Anti-sniper active first 20 slots (max 5% of supply)
- Anti-sniper disabled after window
- Sequential buys increase price correctly

### Trading - Sell (8 tests)
- Standard sell flow
- WAA anti-dump fees:
  - < 30 seconds: +10% extra fee
  - 30s - 5min: Linear decay 10% → 1%
  - 5min - 30min: Linear decay 1% → 0%
  - > 30min: No extra fee
- Partial sell updates position, full sell resets

### Graduation (6 tests)
- Triggers at exact $40k threshold (default)
- No price discontinuity at graduation
- Concurrent trades handle graduation correctly
- Trading continues normally post-graduation
- Anti-sniper disabled after graduation

### Fee Sponsorship (5 tests)
- Platform sponsors all pool creation fees ($1.24/pool)
- Batch creation handles 100 pools/hour
- Sustained 1000 pools/day stress test
- Sponsor wallet monitoring and alerts
- Cost estimation accurate

### Security (12 tests)
- All arithmetic uses `checked_*` operations
- No `unwrap()` or `panic!()` in production code
- Oracle validation (staleness, confidence, bounds)
- Slippage protection on buy/sell
- Math overflow protection on max inputs
- Rugpull prevention (mint/freeze authority checks)

---

## Performance Targets

| Operation | Target | Unacceptable |
|-----------|--------|--------------|
| Pool creation | < 5s | > 5s |
| Trade execution | < 3s | > 3s |
| Page load | < 2s | > 2s |
| Concurrent users | 1000 | < 500 |
| Throughput | 1000 trades/min | < 500 |

---

## Load Test Scenarios

**Ramp-up:** 10 → 1000 users over 30 minutes
- Success: System stable, P95 < 5s, error rate < 1%

**Sustained:** 500 concurrent users for 4 hours
- Success: No memory leaks, no degradation, 0 downtime

**Spike:** 100 → 1000 → 100 users instantly
- Success: Graceful handling, auto-recovery < 1 minute

**Stress:** 1000 pools/hour for 24 hours
- Success: Sponsor wallet balance tracking accurate, no failures

---

## Launch Checklist (Go/No-Go)

### MUST PASS ✅
- [ ] All 59 P0 tests passing (100%)
- [ ] Pool creation < 5s (P95)
- [ ] Trade execution < 3s (P95)
- [ ] System stable at 1000 concurrent users
- [ ] 72-hour devnet soak test (10,000+ transactions, 0 issues)
- [ ] Sponsor wallet monitoring active
- [ ] Error tracking enabled (Sentry/Datadog)
- [ ] Backup RPC endpoints configured
- [ ] Rollback plan documented

### BLOCKERS ⚠️
- [ ] **CRITICAL:** Update `DEPLOYER_PUBKEY` in `/programs/creator-amm-v2/src/instructions/initialize.rs:23`
- [ ] Fund sponsor wallet with 100+ SOL
- [ ] Deploy to mainnet

---

## Known Risks

### High Risk
1. **Fee Sponsorship at Scale**
   - Risk: Sponsor wallet drained unexpectedly
   - Mitigation: Monitor balance every 5min, auto-refill at 20 SOL

2. **Oracle Failures**
   - Risk: Oracle offline or stale data
   - Mitigation: Validate freshness (<60s), confidence (<1%), bounds ($0.01-$1000)

3. **RPC Rate Limiting**
   - Risk: Throttling at high volume
   - Mitigation: Dedicated RPC, request queuing, exponential backoff

### Medium Risk
4. **Concurrent Graduation**
   - Risk: Multiple users trigger graduation simultaneously
   - Status: ✅ Validated in unit tests (Solana account locking serializes)

5. **Mobile Performance**
   - Risk: Slow on older devices
   - Mitigation: Test on 5+ devices, optimize bundle size

---

## Rollback Plan

**Triggers:** Critical security bug, >10% tx failure rate, sponsor wallet issues
**Process:** Pause new pools (15min) → Deploy fix to testnet → Validate → Deploy to mainnet → Resume
**Time:** < 1 hour

---

## Test Execution Timeline

**Week 1 (Jan 10-17):** Execute all 59 P0 tests
**Week 2 (Jan 17-24):** Security + edge cases (40 P1 tests)
**Week 3 (Jan 24-31):** Load tests (4 scenarios)
**Week 4 (Jan 31 - Feb 7):** Final smoke tests, Go/No-Go decision

**Launch:** Feb 7, 2026

---

**See full test cases:** Run `npm run test:integration` or check `/tests/platform-integration-tests.ts`
