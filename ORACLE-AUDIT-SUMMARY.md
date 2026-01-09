# Oracle Security Audit - Executive Summary

**Date:** 2026-01-09
**Protocol:** Scale AMM (creator-amm-v2)
**Overall Risk:** 🔴 CRITICAL

---

## 🚨 THE CRITICAL FINDING

**The protocol does NOT use a real oracle.**

Despite storing a `crx_price_oracle` field and accepting oracle accounts during initialization, the protocol **NEVER reads from Pyth or Switchboard**. All CRX prices come from **manual updates by a trusted authority**.

This is not inherently insecure, but creates:
- Centralized price control
- Flash loan vulnerability
- Stale price risk
- Single point of failure

---

## 📊 Vulnerability Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 CRITICAL | 6 | Must fix before mainnet |
| 🟠 HIGH | 3 | Fix before mainnet |
| 🟡 MEDIUM | 2 | Fix recommended |
| ⚪ LOW | 1 | Nice to have |
| ✅ PASS | 4 | Secure |

---

## 🔴 CRITICAL VULNERABILITIES

### 1. No Oracle Integration (Architecture)
**Files:** `state.rs`, `initialize.rs`, `utils/oracle.rs`
**Problem:** Protocol advertises "Pyth or Switchboard" oracle but uses manual updates
**Fix:** Either implement Pyth SDK integration OR document trusted authority model

### 2. No Staleness Validation
**Files:** `create_pool.rs`, `buy.rs`, `sell.rs`
**Problem:** Protocol accepts prices of any age - no enforcement of `oracle_max_age_seconds`
**Attack:** Authority stops updating, attacker exploits stale prices for 2x virtual reserves
**Fix:** Add `config.validate_price_freshness(&clock)?` before every price usage

### 3. Graduation Threshold Manipulation
**Files:** `update_crx_price.rs`, `update_pool_graduation.rs`
**Problem:** Authority can update price -10% repeatedly to prevent pool graduation
**Attack:** Pool at 97.5% → 71.2% graduation after 3 price drops
**Fix:** Freeze `graduation_threshold_crx` at pool creation, never recalculate

### 4. Flash Loan Attacks
**Files:** All - architectural issue
**Problem:** Manual updates cannot respond to flash loan price manipulation
**Attack:** Flash dump CRX -50%, create pool with 2x reserves, profit on recovery
**Fix:** Implement real Pyth oracle for real-time price response

### 5. No Confidence Validation
**Files:** `state.rs:36` (stores but doesn't use)
**Problem:** `oracle_max_confidence_bps` is stored but NEVER validated
**Attack:** Accept prices with 25% uncertainty during volatility
**Fix:** Only applicable if real oracle implemented

### 6. Fake Oracle Accounts Accepted
**Files:** `initialize.rs:52-54`
**Problem:** Any pubkey accepted as "oracle" with zero validation
**Attack:** Social engineering, false advertising of decentralization
**Fix:** Validate oracle is real Pyth account OR remove misleading field

---

## 🟠 HIGH SEVERITY

### 7. No Exponent Validation
- Not applicable (no oracle integration)
- Critical if oracle added: must validate `price.expo >= -12 && <= 6`

### 8. No Oracle Downtime Handling
- If authority stops updating, protocol halts
- No emergency pause, no fallback, no TWAP
- Fix: Add emergency pause mechanism + multi-sig

### 9. Price Update Spam
- Authority can update every block
- Creates artificial volatility
- Fix: Require 5-minute minimum between updates

---

## 🟡 MEDIUM SEVERITY

### 10. Trust Model Not Documented
- Users believe oracle is decentralized
- Actually fully centralized authority
- Fix: Document trust assumptions clearly

### 11. No Circuit Breaker
- 10% max change allows repeated manipulation
- No automatic pause during extreme volatility
- Fix: Auto-pause if >10% change in single update

---

## ✅ SECURITY PASSES

1. **Price Bounds Validation** - $0.01 to $1,000 range enforced
2. **Checked Arithmetic** - All calculations use `checked_*` operations
3. **Graduation Math** - Threshold calculation properly validated
4. **Price Update Tracking** - Update slots tracked correctly

---

## 🎯 REQUIRED FIXES FOR MAINNET

### Minimum Viable Security (Option A - Manual Oracle)

```rust
// 1. Add staleness check (5 lines)
config.validate_price_freshness(&clock)?;

// 2. Freeze graduation threshold (2 lines)
pool.graduation_threshold_crx_frozen = graduation_threshold_crx;
// Use frozen value forever

// 3. Add emergency pause (1 line check)
require!(!config.emergency_pause, ErrorCode::ProtocolPaused);

// 4. Rate limit updates (3 lines)
require!(
    time_since_update >= MIN_PRICE_UPDATE_INTERVAL,
    ErrorCode::PriceUpdateTooFrequent
);
```

**Time:** 2-3 days
**Risk:** Accepts flash loan vulnerability, authority trust
**Acceptable for:** Beta launch with <$1M TVL cap

---

### Production-Ready (Option B - Real Oracle)

```rust
// Integrate Pyth SDK
use pyth_sdk_solana::load_price_feed_from_account_info;

pub fn get_crx_price_from_pyth(
    pyth_account: &AccountInfo,
    clock: &Clock,
    config: &Config,
) -> Result<u64> {
    let price_feed = load_price_feed_from_account_info(pyth_account)?;
    let price = price_feed.get_current_price()?;

    // Validate staleness
    require!(clock.unix_timestamp - price.publish_time <= config.oracle_max_age_seconds);

    // Validate confidence
    let confidence_bps = (price.conf * 10000) / price.price.abs();
    require!(confidence_bps <= config.oracle_max_confidence_bps);

    // Validate exponent
    require!(price.expo >= -12 && price.expo <= 6);

    // Convert to 6 decimals and return
}
```

**Time:** 7-10 days
**Risk:** Minimal, production-ready
**Acceptable for:** Full mainnet launch, unlimited TVL

---

## 📋 Implementation Checklist

### Phase 1: Immediate (Before Any Deployment)
- [ ] Add `validate_price_freshness()` to Config
- [ ] Call staleness check in `create_pool`, `buy`, `sell`, `update_pool_graduation`
- [ ] Add `OraclePriceTooStale` error code
- [ ] Test with stale price scenarios

### Phase 2: Critical Fixes (Before Mainnet)
- [ ] Add `graduation_threshold_crx_frozen` to Pool struct
- [ ] Set frozen threshold in `create_pool`
- [ ] Use frozen threshold in `check_phase_transition`
- [ ] Remove or restrict `update_pool_graduation` instruction

### Phase 3: Emergency Controls (Before Mainnet)
- [ ] Add `emergency_pause` bool to Config
- [ ] Create `emergency_pause()` instruction
- [ ] Add pause check to `buy` and `sell`
- [ ] Document emergency procedures

### Phase 4: Rate Limiting (Before Mainnet)
- [ ] Add `MIN_PRICE_UPDATE_INTERVAL` constant (300 seconds)
- [ ] Check interval in `update_crx_price`
- [ ] Add `PriceUpdateTooFrequent` error
- [ ] Test update spam scenarios

### Phase 5: Documentation (Before Mainnet)
- [ ] Document centralized oracle model in README
- [ ] Add trust assumptions to CLAUDE.md
- [ ] Update WHAT_IT_DOES.md with oracle limitations
- [ ] Add migration plan to V2 with Pyth

### Phase 6: Oracle Integration (V2)
- [ ] Add `pyth-sdk-solana` dependency
- [ ] Implement `get_crx_price_from_pyth()`
- [ ] Validate Pyth account in `initialize`
- [ ] Replace manual updates with oracle reads
- [ ] Add confidence/staleness/exponent validation
- [ ] Test with real Pyth devnet feeds

---

## 🎯 Recommended Path

### For Devnet/Testnet NOW
✅ Deploy as-is with current manual oracle
- Low stakes, good for testing
- Document limitations clearly
- Plan fixes for mainnet

### For Limited Mainnet Beta (Next Week)
✅ Implement Phase 1-4 fixes
- Add staleness validation
- Freeze graduation thresholds
- Add emergency pause
- Rate limit updates
- Cap TVL at $1M
- Whitelist only trusted creators

### For Full Mainnet (3-4 Weeks)
✅ Implement Phase 6 (Pyth Integration)
- Full oracle implementation
- Remove manual updates
- No TVL cap needed
- Production-ready security

---

## 💡 Key Insights

1. **Not Broken, Just Centralized**
   - Current implementation works correctly
   - Just requires trusting authority
   - Acceptable for beta, not for production

2. **Flash Loans Are Unfixable Without Oracle**
   - Manual updates = minutes of delay
   - Flash loans = single transaction
   - Only real-time oracle can defend

3. **Staleness Is The Easiest Fix**
   - 5 lines of code
   - Prevents worst exploits
   - Must do before mainnet

4. **Frozen Thresholds Prevent Manipulation**
   - Authority can't game graduation
   - Set once at pool creation
   - Simple, effective protection

5. **Emergency Pause Is Essential**
   - Single point of failure (authority key)
   - Must have kill switch
   - Protects users during outages

---

## 📞 Next Steps

1. **Review this audit** with team
2. **Decide on deployment path:**
   - Option A (manual) for beta?
   - Option B (Pyth) for mainnet?
3. **Implement required fixes** based on choice
4. **Test thoroughly** with attack scenarios
5. **Document trust model** for users
6. **Re-audit** after fixes implemented

---

## 📄 Full Technical Details

See `security-audit-oracle.md` for:
- Complete code examples for all fixes
- Detailed attack scenarios with numbers
- Line-by-line vulnerability analysis
- Full Pyth integration code
- Test cases for each vulnerability

---

**Questions?** Review the full audit document or ask for clarification on specific findings.

**Audit Status:** ✅ Complete - Awaiting implementation of fixes
