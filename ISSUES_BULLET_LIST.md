# Complete Issues List - Creator AMM v2

**Generated: 2026-01-08**
**Source: 5-Agent Review + Security Audits**

---

## CRITICAL - BLOCKERS (Cannot deploy without fixing)

- [x] **CRIT-1: Division by zero in oracle** - ✅ FIXED: Added `require!(price_feed.price > 0)` check. Location: `oracle.rs:25`

- [x] **CRIT-2: Negative price overflow** - ✅ FIXED: Same check prevents negative prices. Location: `oracle.rs:25`

- [x] **CRIT-3: Oracle exponent overflow** - ✅ FIXED: Added exponent range validation [-38, 38]. Location: `oracle.rs:27-34`

- [x] **CRIT-4: get_spot_price() always uses virtual reserves** - ✅ ALREADY FIXED: Uses `get_pricing_reserves()`. Location: `state.rs:309`

---

## HIGH - SHOULD FIX (Significant bugs)

- [x] **HIGH-1: Anti-sniper uses hardcoded virtual reserves in sell** - ✅ ALREADY FIXED: Uses `get_pricing_reserves()`. Location: `sell.rs:89`

- [ ] **HIGH-2: CRX price never refreshed** - `last_crx_price_usd` set once at creation, USD market cap becomes increasingly wrong. Location: `state.rs:122-124` *(Design decision - documented)*

- [x] **HIGH-3: No liquidity check before transfer** - ✅ FIXED: Added `require!(output <= real_reserves)` checks. Location: `sell.rs:128-134`, `buy.rs:137-143`

- [x] **HIGH-4: Misleading graduation log** - ✅ FIXED: Now shows "Trading fees removed: X bps → 0 bps". Location: `state.rs:201`

- [ ] **HIGH-5: Config existence not explicitly validated** - Anchor handles it, but explicit check is clearer. Location: `create_pool.rs:8-13` *(Low priority - Anchor validates)*

---

## MEDIUM - CONSIDER FIXING (Improvements)

- [x] **MED-1: Zero-amount fee transfers waste gas** - ✅ FIXED: Added `if fee > 0` check before CPI. Location: `buy.rs:203-217`, `sell.rs:183-197`

- [ ] **MED-2: Unused Config fields waste rent** - `pre_bonding_fee_bps`, `post_bonding_fee_bps`, `pre_bonding_threshold_usd`, `graduation_threshold_usd` never used. Location: `state.rs:16-22` *(Technical debt - requires migration)*

- [x] **MED-3: No pool pause mechanism** - ✅ FIXED: Added `is_paused` field and `PoolPaused` error. Location: `state.rs:127`, `buy.rs:78-79`, `sell.rs:78-79`

- [ ] **MED-4: No max trade size after anti-sniper** - Flash loan / MEV attacks possible after window. Design decision. Location: `buy.rs:92-113` *(Permissionless by design)*

- [ ] **MED-5: Hardcoded 6-decimal assumption** - `MIN_OUTPUT_AMOUNT: u64 = 1000` assumes 6 decimals. Location: `buy.rs:130` *(Document as requirement)*

- [ ] **MED-6: Phase transition timing not documented** - Transition happens after reserve updates, could surprise users. Location: `buy.rs:252` *(Correct behavior - document it)*

---

## LOW - NICE TO HAVE (Non-blocking)

- [ ] **LOW-1: Floating point in log messages** - Could differ from integer calculations. Display only. Multiple locations.

- [x] **LOW-2: No Anchor events emitted** - ✅ ALREADY FIXED: Events exist (TradeExecuted, PoolCreated, PoolGraduated, PhaseTransition).

- [ ] **LOW-3: unique_traders field never incremented** - Wasted 8 bytes. Location: `state.rs:117`

- [ ] **LOW-4: No upgrade authority pattern** - Can't fix bugs without full migration. Design decision.

---

## CODE QUALITY - MAINTAINABILITY

- [ ] **QUALITY-1: Inconsistent reserve update patterns** - Buy and sell use different formulations for same logic. `buy.rs` vs `sell.rs`

- [ ] **QUALITY-2: Magic numbers without constants** - `1_000_000`, `1_000_000_000`, `10000`, `150/100` scattered throughout.

- [ ] **QUALITY-3: Commented-out Custom curve code** - Either implement or move to docs. `state.rs:269-283`

---

## WAA INTEGRATION NOTES (From previous session)

- [ ] **WAA-1: Separate PDA approach required** - Cannot modify Pool struct (breaks existing pools). Need WaaPoolConfig and UserPosition PDAs.

- [ ] **WAA-2: Must respect Graduated 0% fee** - WAA only applies in PreBonding phase.

- [ ] **WAA-3: Reserve validation conflict** - WAA fee routing from vault breaks reserve==vault check. Route from user output or separate vault.

- [ ] **WAA-4: On/off switch required** - Permissionless DeFi can't iterate; need enabled:bool per pool.

- [ ] **WAA-5: Coexistence with existing anti-sniper** - Both mechanisms work together (size limit + time decay).

---

## SECURITY STRENGTHS (What's good)

- [x] **Checked math everywhere** - All arithmetic uses checked_ operations
- [x] **No floating point in state** - Only integers in calculations
- [x] **Slippage protection required** - min_base_amount / min_quote_amount mandatory
- [x] **PDA security** - Proper seeds and bump seeds
- [x] **CRX enforcement** - Protocol-level constraint cannot be bypassed
- [x] **Vault validation** - Authority checks on vaults (was missing, now added)
- [x] **Reserve integrity** - Validates reserves match vault balances after each trade
- [x] **No admin backdoors** - No emergency withdraw functions

---

## FALSE POSITIVES (Not bugs)

- [x] **Re-entrancy via CPI** - Safe: Anchor validates token_program is SPL Token
- [x] **Division by zero in calculate_output** - Safe: Line 226 checks reserves > 0
- [x] **Integer overflow in exponential curve** - Safe: u64::MAX * 150 fits in u128
- [x] **Pool bump seed handling** - Safe: Anchor's init finds correct bump
- [x] **Config account existence** - Safe: Anchor validates existence + discriminator
- [x] **Vault balance mismatch** - Safe: Lines 277-287 validate after every trade

---

## TESTS NEEDED

### Critical Path Tests:
- [ ] `test_oracle_zero_price()`
- [ ] `test_oracle_negative_price()`
- [ ] `test_oracle_extreme_exponent()`
- [ ] `test_spot_price_after_graduation()`
- [ ] `test_market_cap_after_graduation()`
- [ ] `test_anti_sniper_in_graduated_phase()`
- [ ] `test_sell_insufficient_liquidity_prebonding()`

### Security Tests:
- [ ] `test_vault_authority_mismatch()`
- [ ] `test_fee_recipient_wrong_mint()`
- [ ] `test_malicious_oracle()`
- [ ] `test_flash_loan_attack()`
- [ ] `test_sandwich_attack()`

---

## FIX PRIORITY ORDER

### Phase 1: Critical (1-2 days)
1. Oracle validation (CRIT-1, 2, 3)
2. get_spot_price() fix (CRIT-4)
3. Anti-sniper reserve fix (HIGH-1)
4. Liquidity check (HIGH-3)

### Phase 2: High Priority (2-3 days)
5. Log message fix (HIGH-4)
6. Config validation (HIGH-5)
7. Skip zero transfers (MED-1)
8. Oracle refresh option (HIGH-2)

### Phase 3: Improvements (1-2 days)
9. Remove unused fields (MED-2)
10. Add events (LOW-2)
11. Add pause mechanism (MED-3)
12. Decimal validation (MED-5)

### Phase 4: Testing (2-3 weeks)
13. Comprehensive test suite
14. Fuzz testing
15. Economic exploit testing
16. Professional audit

---

## SUMMARY COUNTS

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 4 | Must fix |
| High | 5 | Should fix |
| Medium | 6 | Consider |
| Low | 4 | Nice to have |
| Quality | 3 | Maintainability |
| WAA Notes | 5 | For integration |
| Tests Needed | 12+ | Critical path |

**Total actionable items: 22+**
**Estimated fix time: 5-7 days**
**Estimated test time: 2-3 weeks**
