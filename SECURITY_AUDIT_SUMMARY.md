# Re-entrancy Audit Summary - Quick Reference

**Date**: 2026-01-09
**Status**: 🔴 CRITICAL VULNERABILITIES FOUND
**Mainnet Ready**: ❌ NO - Fixes required

---

## Critical Findings (4)

### 1. Stale Pool State After CPI ⚠️
**Files**: buy.rs:230-257, sell.rs:228-258
**Issue**: Pool not reloaded after token transfers, stale data overwrites on-chain changes
**Fix**: Add `pool.reload()?` after all CPIs

### 2. Token-2022 Re-entrancy Vector ⚠️
**File**: create_pool.rs:148-156
**Issue**: No check for Token-2022 transfer hooks, enables re-entrancy
**Fix**: Reject Token-2022 tokens in validation

### 3. Phase Transition Reversion ⚠️
**Files**: buy.rs:231, sell.rs:230
**Issue**: Phase checks after CPIs use stale state, can revert graduation
**Fix**: Move phase checks before CPIs OR reload pool first

### 4. Vault Validation TOCTOU ⚠️
**Files**: buy.rs:253-257, sell.rs:254-258
**Issue**: Vaults reloaded but pool not, comparing stale vs current
**Fix**: Reload pool before validation

---

## Attack Scenario: Graduation Reversion

```
1. Pool at 39,900 CRX (PreBonding, threshold = 40,000)
2. Attacker creates Token-2022 with malicious transfer hook
3. Attacker buys 200 CRX worth of tokens:

   buy() execution:
   ├─ Reserves updated: 40,100 CRX (GRADUATED!)
   ├─ Phase still PreBonding in memory
   ├─ Token transfer executes (line 228)
   │  └─ Hook activates, re-enters buy()
   │     └─ Second buy() sees 40,100 CRX
   │        └─ Graduates pool (phase = Graduated on-chain)
   ├─ Original buy() resumes
   ├─ pool.current_phase still PreBonding (STALE!)
   └─ Anchor exit writes PreBonding back (REVERTED!)

Result: Pool stuck in PreBonding with 40,100 CRX
Impact: Pricing broken, pool never graduates, CRX trapped
```

---

## Immediate Fixes Required

### 1. Reject Token-2022 (create_pool.rs)
```rust
// Add after line 156:
require!(
    ctx.accounts.base_mint.owner == spl_token::ID,
    ErrorCode::Token2022NotSupported
);
```

### 2. Reload Pool After CPIs (buy.rs & sell.rs)
```rust
// Add after all transfers, before validation (buy.rs:252, sell.rs:253):
pool.reload()?;
ctx.accounts.quote_vault.reload()?;
ctx.accounts.base_vault.reload()?;
```

### 3. Add Re-entrancy Lock (state.rs + buy.rs + sell.rs)
```rust
// In Pool struct (state.rs):
pub locked: bool,

// In buy.rs handler (after line 88):
require!(!pool.locked, ErrorCode::Reentrancy);
pool.locked = true;

// Before Ok(()) (line 259):
pool.locked = false;

// Repeat for sell.rs
```

### 4. Add Error Code (errors.rs)
```rust
#[msg("Re-entrancy detected")]
Reentrancy,

#[msg("Token-2022 not supported (transfer hooks risk)")]
Token2022NotSupported,
```

---

## Positive Findings ✅

- CEI pattern followed perfectly (state before CPI)
- All arithmetic checked (no overflows)
- Account validation before CPIs
- Vault balance validation exists
- PDA authority pattern secure

---

## Test Requirements

Must pass before mainnet:
- [ ] Token-2022 rejection test
- [ ] Re-entrancy lock test
- [ ] Graduation reversion prevention test
- [ ] Vault validation with re-entrancy test
- [ ] Concurrent trade tests

---

## Timeline

**Fix Implementation**: 4-6 hours
**Testing**: 8-12 hours
**Total**: 1-2 days

---

## Risk Assessment

**Current**: 🔴 CRITICAL (do not deploy)
**After fixes**: 🟢 LOW (ready for mainnet)

---

## Next Steps

1. Implement 4 immediate fixes above
2. Run test suite (create if not exists)
3. Re-audit after fixes
4. Deploy to devnet for 72hr soak test
5. Deploy to mainnet

---

**Contact**: Review full audit in `SECURITY_AUDIT_REENTRANCY.md`
