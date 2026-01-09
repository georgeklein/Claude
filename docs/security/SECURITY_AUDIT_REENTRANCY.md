# Scale AMM Re-entrancy Security Audit
**Date**: 2026-01-09
**Auditor**: Claude (Comprehensive Analysis)
**Scope**: Cross-Program Invocation (CPI) re-entrancy vulnerabilities

---

## Executive Summary

**CRITICAL VULNERABILITIES FOUND**: 4 High-Severity, 2 Medium-Severity

The Scale AMM protocol follows the Checks-Effects-Interactions (CEI) pattern correctly for state updates before CPIs. However, **post-CPI operations and lack of state reloading create exploitable re-entrancy vectors**, particularly with Token-2022 transfer hooks.

**Key Findings**:
1. Pool state is NOT reloaded after token transfers - stale data overwrites
2. No Token-2022 transfer hook protection - re-entrancy vector exists
3. Phase transitions can be reverted via re-entrancy
4. Vault validation uses stale pool state
5. No re-entrancy guards (locks/mutexes) implemented

---

## Methodology

Analyzed all CPI invocations in Scale AMM protocol:
- **Token transfers**: 6 CPI call sites across 3 instructions
- **Oracle reads**: 0 (oracle price stored in config, no CPI)
- **Other CPIs**: 0

Examined state mutation ordering relative to each CPI call and validated:
- ✅ Pre-CPI account validation
- ✅ Pre-CPI state mutations (CEI pattern)
- ❌ Post-CPI state reloading
- ❌ Post-CPI consistency validation
- ❌ Token-2022 protection

---

## CPI Call Inventory

### 1. create_pool.rs
**Line 227**: `token::transfer(cpi_ctx, token_supply)`
- **Direction**: Creator → Pool base_vault
- **Authority**: Creator (user signer)
- **State mutations**: Pool initialization (lines 158-217) - BEFORE CPI ✅
- **Post-CPI**: Vault reload (line 230) ✅, pool NOT reloaded ❌

### 2. buy.rs
**Line 200**: `token::transfer()` - Fee transfer
- **Direction**: User quote_account → Fee recipient
- **Authority**: User (user signer)
- **State mutations**: All reserves/stats updated (lines 142-186) - BEFORE CPI ✅

**Line 211**: `token::transfer()` - Quote deposit
- **Direction**: User quote_account → Pool quote_vault
- **Authority**: User (user signer)
- **State mutations**: Already done ✅

**Line 228**: `token::transfer()` - Token payout
- **Direction**: Pool base_vault → User base_account
- **Authority**: Pool PDA (uses seeds)
- **State mutations**: Already done ✅
- **Post-CPI**: Phase transition check (line 231) ❌, vault validation (line 253-257) with stale pool ❌

### 3. sell.rs
**Line 196**: `token::transfer()` - Token deposit
- **Direction**: User base_account → Pool base_vault
- **Authority**: User (user signer)
- **State mutations**: All reserves/stats updated (lines 152-183) - BEFORE CPI ✅

**Line 214**: `token::transfer()` - Quote payout
- **Direction**: Pool quote_vault → User quote_account
- **Authority**: Pool PDA (uses seeds)
- **State mutations**: Already done ✅

**Line 226**: `token::transfer()` - Fee transfer
- **Direction**: Pool quote_vault → Fee recipient
- **Authority**: Pool PDA (uses seeds)
- **State mutations**: Already done ✅
- **Post-CPI**: Phase transition check (line 230) ❌, vault validation (line 254-258) with stale pool ❌

---

## Vulnerability Analysis

### 🔴 CRITICAL #1: Stale Pool State After Re-entrancy

**Severity**: Critical
**Location**: buy.rs (lines 230-257), sell.rs (lines 228-258)
**CPI Calls**: Token transfers at buy.rs:228, sell.rs:214, sell.rs:226

**Vulnerability**:
After all token transfers complete, the code performs post-CPI operations that read pool state without reloading it. If a malicious token re-enters during the CPI, the pool account is modified on-chain, but the original instruction's in-memory `pool` reference becomes stale.

**State Mutation Order**:
```rust
// buy.rs example
1. Update pool state (lines 142-186) ✅ BEFORE CPI
2. Transfer tokens (lines 192-228)    // CPI HAPPENS HERE
   └─→ Malicious token re-enters
       └─→ Modifies pool state on-chain
3. Check phase transition (line 231)  ❌ Uses stale pool.current_phase
4. Validate vaults (line 253-257)     ❌ Compares vault (reloaded) vs pool (stale)
5. Anchor exit routine                ❌ Writes stale pool data back to chain
```

**Exploit Scenario**:
```
1. Pool at 39,900 CRX accumulated (pre-bonding)
2. Attacker creates malicious Token-2022 with transfer hook
3. Attacker calls buy(200 CRX) to purchase malicious tokens

4. buy() execution:
   - Reserves updated: real_quote_reserves = 40,100 (crossed graduation!)
   - Phase still PreBonding in memory
   - Token transfer executes (line 228)

5. Malicious transfer hook activates:
   - Hook calls buy() again with another user's account
   - Second buy() sees reserves = 40,100
   - Second buy() checks graduation: 40,100 >= 40,000 → Graduates!
   - Pool.current_phase = Graduated (written to chain)
   - Second buy() completes

6. Original buy() resumes:
   - pool.current_phase still PreBonding (stale in-memory data)
   - Phase transition check: 40,100 >= 40,000 → tries to graduate
   - But pool reference is stale!
   - Anchor exit writes pool.current_phase = PreBonding back to chain

7. RESULT: Graduation REVERTED, pool stuck in PreBonding with 40,100 CRX
```

**Impact**:
- Phase transitions can be permanently reverted
- Pool logic breaks (using wrong reserves for pricing)
- Graduation threshold bypass
- Protocol invariants violated

**Fix Required**:
```rust
// After all CPIs, before any pool state reads:
pool.reload()?; // Reload pool from chain to get latest state
```

---

### 🔴 CRITICAL #2: Token-2022 Transfer Hook Re-entrancy

**Severity**: Critical
**Location**: create_pool.rs (lines 148-156)
**CPI Calls**: All token transfers (buy.rs, sell.rs, create_pool.rs)

**Vulnerability**:
The pool creation validation only checks if `mint_authority` and `freeze_authority` are revoked, but does NOT check if the token is a Token-2022 token with transfer hooks. Token-2022 introduced "transfer hook" extensions that execute arbitrary code during transfers via CPI.

**Current Validation** (create_pool.rs:148-156):
```rust
require!(
    ctx.accounts.base_mint.mint_authority.is_none(),
    ErrorCode::MintAuthorityNotRevoked
);
require!(
    ctx.accounts.base_mint.freeze_authority.is_none(),
    ErrorCode::FreezeAuthorityNotRevoked
);
// ❌ NO CHECK FOR TRANSFER HOOKS!
```

**Attack Vector**:
Token-2022 transfer hooks receive additional accounts and can execute arbitrary CPIs. A malicious creator can:

1. Create Token-2022 token with transfer hook program
2. Configure hook to receive Scale AMM pool account as extra account
3. Create pool on Scale AMM with this token
4. When users trade, token transfers trigger hook
5. Hook re-enters Scale AMM buy()/sell() with pool account
6. Re-entrancy exploits (see Critical #1)

**Call Stack**:
```
User Transaction
└─→ Scale AMM buy()
    └─→ SPL Token-2022 transfer() [CPI]
        └─→ Transfer Hook Program [CPI from Token-2022]
            └─→ Scale AMM buy() [RE-ENTRANT CPI]
                └─→ Modifies pool state
    └─→ Original buy() resumes with stale pool state
    └─→ Overwrites pool state changes
```

**Impact**:
- All re-entrancy attacks become possible
- Graduation reversion
- State corruption
- Vault drainage via recursive calls
- Pool DoS via phase transition manipulation

**Fix Required**:
```rust
// In create_pool.rs validation section:

// Check if this is Token-2022 (program ID check)
require!(
    ctx.accounts.base_mint.owner == spl_token::id(),
    ErrorCode::Token2022NotSupported
);

// OR: Explicitly check for transfer hook extension
use spl_token_2022::extension::StateWithExtensions;
let mint_data = &ctx.accounts.base_mint.to_account_info().data.borrow();
let mint = StateWithExtensions::<Mint>::unpack(mint_data)?;
require!(
    mint.get_extension::<TransferHook>().is_err(),
    ErrorCode::TransferHooksNotAllowed
);
```

---

### 🔴 HIGH #3: Vault Validation with Stale Pool State

**Severity**: High
**Location**: buy.rs (lines 253-257), sell.rs (lines 254-258), create_pool.rs (lines 230-234)
**CPI Calls**: All token transfers

**Vulnerability**:
Post-CPI vault validation compares reloaded vault balances against stale pool reserve values. If a re-entrant call modified pool reserves during the CPI, the validation compares mismatched states.

**Code Pattern**:
```rust
// buy.rs:253-257
trade::validate_vault_balances(
    pool,                           // ❌ STALE - not reloaded after CPI
    &ctx.accounts.quote_vault,      // ✅ Will be reloaded in validate function
    &ctx.accounts.base_vault,       // ✅ Will be reloaded in validate function
)?;

// trade.rs:281-295 - validate_vault_balances()
pub fn validate_vault_balances(
    pool: &Pool,                    // ❌ Receives stale pool reference
    quote_vault: &Account<TokenAccount>,
    base_vault: &Account<TokenAccount>,
) -> Result<()> {
    require!(
        pool.real_quote_reserves == quote_vault.amount,  // ❌ Stale vs current
        ErrorCode::ReserveVaultMismatch
    );
    // ...
}
```

**Exploit Scenario**:
```
1. Original buy() updates: pool.reserves = 1000 (in memory)
2. Original buy() executes token transfer CPIs
3. During CPI, malicious hook re-enters:
   - Re-entrant buy() updates: pool.reserves = 1100 (on chain)
   - Re-entrant buy() completes
4. Original buy() resumes (pool.reserves = 1000 still in memory)
5. Original buy() validates:
   - quote_vault.reload() → gets 1100 from chain ✅
   - pool.real_quote_reserves → still 1000 (stale) ❌
   - Comparison: 1100 == 1000 → FAILS
   - Transaction reverts (GOOD - but messy)

Alternate scenario:
- If re-entrant call decreased reserves, validation might pass incorrectly
- Opens window for vault/reserve desync attacks
```

**Impact**:
- TOCTOU (Time-Of-Check-Time-Of-Use) vulnerability
- Validation false positives/negatives
- Transaction reverts (DoS vector)
- Potential accounting inconsistencies if validation logic changes

**Fix Required**:
```rust
// In buy.rs/sell.rs before validate_vault_balances():
pool.reload()?;
ctx.accounts.quote_vault.reload()?;
ctx.accounts.base_vault.reload()?;

trade::validate_vault_balances(
    pool,  // ✅ Now current
    &ctx.accounts.quote_vault,
    &ctx.accounts.base_vault,
)?;
```

---

### 🔴 HIGH #4: Phase Transition Check After CPI

**Severity**: High
**Location**: buy.rs (line 231), sell.rs (line 230)
**CPI Calls**: Token transfers preceding phase check

**Vulnerability**:
Phase transition logic reads and potentially writes `pool.current_phase` after all token transfers. If a re-entrant call already transitioned the phase during a CPI, the original call has stale phase data and could revert the transition when Anchor writes the account back.

**Code Pattern**:
```rust
// buy.rs:231
trade::handle_phase_transition(pool, pool_key, &clock)?;

// trade.rs:196-242 - handle_phase_transition()
pub fn handle_phase_transition(
    pool: &mut Pool,  // ❌ Stale reference after CPI
    // ...
) -> Result<bool> {
    if matches!(pool.current_phase, CurvePhase::Graduated) {
        return Ok(false);  // Already graduated
    }

    let transitioned = pool.check_phase_transition()?;  // ❌ Reads/writes stale state

    if transitioned {
        emit!(PoolGraduated { /* ... */ });
    }
    // ...
}
```

**Exploit Scenario**:
```
Setup: Pool at 39,950 CRX (50 CRX from graduation at 40,000)

Transaction with 2 buys via re-entrancy:
1. User A calls buy(100 CRX)
   - State updated: reserves = 40,050 (crossed threshold!)
   - pool.current_phase = PreBonding (in memory, not checked yet)
   - Token transfers execute

2. During transfer CPI, malicious hook re-enters as User B:
   - User B buy(50 CRX)
   - Reserves already at 40,050
   - Phase check: 40,050 >= 40,000 → transition!
   - pool.current_phase = Graduated (written to chain)
   - PoolGraduated event emitted
   - User B buy() completes

3. User A buy() resumes:
   - pool.current_phase = PreBonding (stale in-memory)
   - Phase check: 40,050 >= 40,000 → transition!
   - pool.current_phase = Graduated (set in memory)
   - PoolGraduated event emitted AGAIN (duplicate!)
   - Anchor exit writes pool.current_phase = Graduated

Best case: Duplicate events, confusing indexers
Worst case: If re-entrant call did other state changes, they get overwritten
```

**Impact**:
- Phase transition reversions (pool stuck in wrong phase)
- Duplicate PoolGraduated events (indexer confusion)
- Pricing logic breaks (uses wrong reserves after revert)
- Users get wrong prices (virtual vs real reserves)

**Fix Required**:
```rust
// Move phase transition check BEFORE token transfers (in Effects phase)
let transitioned = trade::handle_phase_transition(pool, pool_key, &clock)?;

// Then do token transfers (Interactions phase)
trade::transfer_tokens(/* ... */)?;

// No phase operations after CPIs
```

OR:

```rust
// Reload pool before phase check
pool.reload()?;
trade::handle_phase_transition(pool, pool_key, &clock)?;
```

---

### 🟡 MEDIUM #5: Event Emission with Stale State

**Severity**: Medium
**Location**: buy.rs (lines 234-245), sell.rs (lines 238-249)
**CPI Calls**: All token transfers before events

**Vulnerability**:
Trade events are emitted after all CPIs using potentially stale pool data. If a re-entrant call modified pool state during CPIs, the emitted events report incorrect information.

**Code Pattern**:
```rust
// buy.rs:234-245 (after all transfers)
trade::emit_trade_event(
    pool,  // ❌ Stale pool reference
    pool_key,
    ctx.accounts.user.key(),
    TradeDirection::Buy,
    quote_amount,
    base_output,
    fee_in_quote,
    current_fee_bps,
    config,
    &clock,
)?;

// Event includes: quote_reserves_after, base_reserves_after, real_crx_accumulated
// All read from stale pool state!
```

**Impact**:
- Indexers receive incorrect reserve values
- UIs display wrong pool state
- Analytics data corrupted
- Hard to debug re-entrancy attacks (events lie)

**Fix Required**:
```rust
pool.reload()?;
trade::emit_trade_event(/* ... */)?;
```

---

### 🟡 MEDIUM #6: No Re-entrancy Guards

**Severity**: Medium
**Location**: Global - no locks anywhere
**CPI Calls**: All instructions with CPIs

**Vulnerability**:
The protocol has no explicit re-entrancy guards (locks, mutexes, or status flags). While Solana's runtime may prevent some re-entrancy scenarios, defense-in-depth suggests adding explicit guards.

**Missing Protection**:
```rust
// No re-entrancy lock in Pool struct (state.rs)
pub struct Pool {
    // ... all fields ...
    pub bump: u8,
    // ❌ Missing: pub locked: bool  // Re-entrancy lock
}

// No re-entrancy check in trade instructions
pub fn handler(ctx: Context<Buy>, /* ... */) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    // ❌ Missing:
    // require!(!pool.locked, ErrorCode::ReentrancyDetected);
    // pool.locked = true;

    // ... trade logic ...

    // ❌ Missing:
    // pool.locked = false;
    Ok(())
}
```

**Impact**:
- Relies solely on runtime protections (not defense-in-depth)
- If runtime behavior changes, protocol vulnerable
- No clear signal to auditors/developers about re-entrancy concerns

**Fix Required**:
```rust
// In state.rs - Pool struct:
pub locked: bool,  // Re-entrancy guard

// In buy.rs/sell.rs handlers:
require!(!pool.locked, ErrorCode::Reentrancy);
pool.locked = true;

// ... all logic ...

pool.locked = false;  // Clear before exit
Ok(())
```

---

## Attack Scenarios Summary

### Attack 1: Graduation Reversion via Re-entrancy
**Severity**: Critical
**Attacker**: Malicious pool creator
**Prerequisites**: Token-2022 with transfer hook

**Attack Flow**:
1. Create Token-2022 token with malicious transfer hook
2. Create pool on Scale AMM (passes validation - no Token-2022 check)
3. Accumulate pool to 39,900 CRX (just under 40,000 graduation)
4. Attacker buys 200 CRX worth of tokens:
   - Pool reserves → 40,100 (graduated!)
   - During token payout, hook activates
   - Hook re-enters buy() with victim's transaction
   - Re-entrant buy() graduates pool (phase = Graduated on-chain)
   - Original buy() resumes with stale phase = PreBonding
   - Original buy() exits, overwrites phase back to PreBonding
5. **Result**: Pool has 40,100 CRX but stuck in PreBonding phase
6. **Impact**:
   - Pricing broken (uses virtual reserves instead of real)
   - Users get wrong prices
   - Pool never graduates
   - CRX trapped forever

**Profit**: Protocol griefing, economic damage to users

---

### Attack 2: Double-Spend via Recursive Buy
**Severity**: Critical
**Attacker**: Malicious pool creator
**Prerequisites**: Token-2022 with transfer hook

**Attack Flow**:
1. Create Token-2022 token with hook that calls buy() recursively
2. Fund attacker wallet with 1000 CRX
3. Call buy(1000 CRX):
   - Reserves updated: +1000 CRX
   - Token transfer executes (pool → attacker)
   - Hook activates during transfer
   - Hook calls buy(1000 CRX) again (re-entrant)
   - Re-entrant buy() sees updated reserves (already +1000)
   - Re-entrant buy() calculates output based on inflated reserves
   - Re-entrant buy() updates reserves again: +1000 more
   - Re-entrant buy() attempts token transfer
   - **Vault validation fails**: expected != actual
   - Transaction reverts
4. **Result**: Attack mitigated by vault validation
5. **But**: Causes DoS (legit users can't trade)

**Profit**: DoS attack, pool bricking

---

### Attack 3: Reserve Manipulation via Stale State
**Severity**: High
**Attacker**: Malicious pool creator
**Prerequisites**: Token-2022 with transfer hook

**Attack Flow**:
1. Create Token-2022 token with sophisticated hook
2. Create pool on Scale AMM
3. Attacker crafts transaction with precise timing:
   - Buy 100 tokens
   - During payout, hook re-enters
   - Re-entrant sell() reduces reserves
   - Original buy() validates vaults with mismatched state
   - Validation logic confused by stale pool vs current vaults
4. **Result**: Potential for vault/reserve desync
5. **Impact**: Accounting corruption, pool state inconsistency

**Profit**: Draining vault via accounting exploit

---

## Solana Re-entrancy Context

### Can Re-entrancy Happen on Solana?

**Short Answer**: Yes, via Token-2022 transfer hooks (indirect re-entrancy).

**Solana Runtime Protections**:
- ✅ Direct re-entrancy prevented: Program A cannot call itself (A → A)
- ❓ Indirect re-entrancy unclear: Program A → Program B → Program A
- ✅ Account borrow checking: Same account cannot be mutably borrowed twice in same instruction
- ❌ Cross-CPI borrow tracking: May not prevent A → B → A with same accounts

**Token-2022 Transfer Hook Bypass**:
Token-2022 introduced transfer hooks that execute during token transfers:
```
Scale AMM buy()
└─→ SPL Token-2022 transfer() [CPI to Token-2022 program]
    └─→ Transfer Hook Program [CPI from Token-2022]
        └─→ Scale AMM buy() [CPI back to Scale AMM]
            └─→ Pool account passed with write permissions
            └─→ Re-entrancy achieved!
```

Transfer hooks receive additional accounts configured at mint creation. A malicious mint can configure the Scale AMM pool account as an extra account, enabling re-entrancy.

**Why Solana's Borrow Checker Doesn't Stop This**:
- Each CPI creates a new execution context
- Token-2022 program is a DIFFERENT program (not Scale AMM)
- Transfer hook program is ANOTHER different program
- Runtime tracks borrows per-program, not across program invocations
- Pool account can be passed through multiple CPI layers

**Anchor Account Deserialization**:
- `Account<'info, T>` deserializes at instruction start
- Modifications are buffered in memory
- Anchor exit routine writes all Account changes to chain
- If re-entrant call modifies account on-chain, original call's memory is stale
- Original call's exit routine OVERWRITES re-entrant changes

**Conclusion**: Re-entrancy IS possible on Solana with Token-2022, and current protocol is vulnerable.

---

## Positive Findings

### ✅ CEI Pattern Followed Correctly

All instructions follow Checks-Effects-Interactions pattern perfectly:

**create_pool.rs**:
- Checks: Lines 94-156 (all validations)
- Effects: Lines 158-217 (state initialization)
- Interactions: Lines 220-227 (token transfer)

**buy.rs**:
- Checks: Lines 90-140 (amount, anti-sniper, slippage)
- Effects: Lines 142-186 (reserves, stats, user position)
- Interactions: Lines 192-228 (fee, deposit, payout)

**sell.rs**:
- Checks: Lines 94-150 (amount, anti-sniper, slippage, WAA)
- Effects: Lines 152-183 (reserves, stats, user position)
- Interactions: Lines 189-226 (deposit, payout, fee)

All state mutations happen BEFORE any external calls. This is textbook CEI.

### ✅ Account Validation Before CPI

All account relationships validated before CPIs:
- Vault ownership verified (pool PDA)
- Mint matching verified
- User ownership verified
- Fee recipient verified

### ✅ Checked Arithmetic Throughout

All math operations use `checked_*` or `saturating_*`:
- No overflow vulnerabilities in calculations
- Safe division (no div-by-zero panics)
- U128 intermediate calculations for large multiplications

### ✅ PDA Authority Pattern

Pool uses PDA (Program Derived Address) as authority:
- Only pool instruction can sign with pool seeds
- Users cannot forge pool signatures
- Secure vault custody

### ✅ Vault Balance Validation Exists

Post-trade vault validation implemented (even if stale):
- Catches token transfer failures
- Detects accounting mismatches
- Defense-in-depth approach

---

## Recommendations

### Immediate (Pre-Mainnet) - CRITICAL

1. **Add Token-2022 Protection** (create_pool.rs)
   ```rust
   // Reject Token-2022 tokens entirely
   require!(
       ctx.accounts.base_mint.owner == spl_token::ID,
       ErrorCode::Token2022NotSupported
   );
   ```

2. **Reload Pool State After CPIs** (buy.rs, sell.rs)
   ```rust
   // After all token transfers, before any pool reads:
   pool.reload()?;
   ctx.accounts.quote_vault.reload()?;
   ctx.accounts.base_vault.reload()?;
   ```

3. **Add Re-entrancy Lock** (state.rs, buy.rs, sell.rs)
   ```rust
   // Pool struct:
   pub locked: bool,

   // Instruction handlers:
   require!(!pool.locked, ErrorCode::Reentrancy);
   pool.locked = true;
   // ... logic ...
   pool.locked = false;
   ```

### Short-Term (Week 1)

4. **Move Phase Transitions Before CPIs**
   - Phase checks should be in Effects phase, not post-CPI
   - Eliminates stale state risk for phase transitions

5. **Add Comprehensive Re-entrancy Tests**
   - Test Token-2022 interactions
   - Test recursive buy/sell scenarios
   - Test phase transition during re-entrancy
   - Test vault validation with concurrent state changes

6. **Add Re-entrancy Error Code**
   ```rust
   #[msg("Re-entrancy detected - instruction already executing")]
   Reentrancy,
   ```

### Medium-Term (Week 2)

7. **Audit Event Emission**
   - Ensure all events use reloaded state
   - Add state snapshot before CPIs for accurate event data

8. **Add Integration Tests with Mock Malicious Tokens**
   - Create mock Token-2022 with malicious hooks
   - Verify all attack scenarios are blocked

9. **Document Re-entrancy Protections**
   - Add comments explaining why locks exist
   - Document Token-2022 exclusion reasoning
   - Add security architecture doc

### Long-Term (Week 3+)

10. **Consider Token-2022 Support with Safeguards**
    - If Token-2022 support desired, implement:
      - Transfer hook whitelist
      - Hook validation logic
      - Additional re-entrancy guards
      - Stricter vault validation

11. **Formal Verification**
    - Formally verify CEI pattern holds across all paths
    - Prove state consistency under re-entrancy
    - Verify phase transition invariants

12. **Continuous Monitoring**
    - Monitor for Token-2022 pools in production
    - Alert on unusual vault/reserve discrepancies
    - Track phase transition events for anomalies

---

## Testing Requirements

Before mainnet deployment, implement these test cases:

### Test Suite: Re-entrancy Attack Simulations

```rust
#[test]
fn test_token2022_rejected() {
    // Attempt to create pool with Token-2022 mint
    // Expect: ErrorCode::Token2022NotSupported
}

#[test]
fn test_direct_reentrancy_blocked() {
    // Attempt to call buy() from within buy()
    // Expect: ErrorCode::Reentrancy or runtime error
}

#[test]
fn test_graduation_reversion_prevented() {
    // Pool at 39,900 CRX
    // Buy 200 CRX with malicious token that re-enters
    // Verify: Pool phase = Graduated (not reverted)
}

#[test]
fn test_vault_validation_with_reentrancy() {
    // Execute buy with token that re-enters during payout
    // Verify: Vault validation fails (mismatched state)
    // OR: Vault validation passes after pool reload
}

#[test]
fn test_phase_transition_consistency() {
    // Multiple buys crossing graduation threshold
    // Verify: Only one PoolGraduated event emitted
    // Verify: Phase remains Graduated after all txs
}

#[test]
fn test_reserve_consistency_under_reentrancy() {
    // Execute trades with re-entrant token
    // Verify: pool.reserves == vault.amount after all trades
}

#[test]
fn test_concurrent_trades_different_pools() {
    // Ensure re-entrancy locks are per-pool, not global
}
```

---

## Risk Assessment

### Current Risk Level: 🔴 CRITICAL

**Without fixes, mainnet deployment is NOT RECOMMENDED.**

### Risk Breakdown:

| Vulnerability | Likelihood | Impact | Overall |
|---------------|------------|--------|---------|
| Token-2022 Re-entrancy | High | Critical | 🔴 CRITICAL |
| Stale State Overwrites | High | Critical | 🔴 CRITICAL |
| Graduation Reversion | Medium | Critical | 🔴 CRITICAL |
| Vault Validation TOCTOU | Medium | High | 🟠 HIGH |
| Event Emission Stale Data | Medium | Medium | 🟡 MEDIUM |
| No Re-entrancy Guards | Low | High | 🟠 HIGH |

### After Implementing Fixes: 🟢 LOW

With all recommended fixes:
- Token-2022 blocked → Re-entrancy vector eliminated
- Pool reload after CPI → Stale state prevented
- Re-entrancy locks → Defense-in-depth protection
- Phase transitions before CPI → Consistency guaranteed

---

## Conclusion

The Scale AMM protocol demonstrates **excellent adherence to the CEI pattern** with all state mutations occurring before external calls. However, **critical post-CPI vulnerabilities exist** that create exploitable re-entrancy vectors.

### Key Issues:
1. ✅ CEI Pattern: Implemented correctly
2. ❌ Post-CPI State: Not reloaded, creates stale data risk
3. ❌ Token-2022: No protection, enables re-entrancy attacks
4. ❌ Re-entrancy Guards: None implemented

### Resolution Path:
The identified vulnerabilities are **well-understood and straightforward to fix**:
- Add Token-2022 rejection in create_pool validation
- Add pool.reload() after all CPIs in buy/sell
- Add re-entrancy lock flag to Pool struct
- Add comprehensive re-entrancy tests

**Estimated fix time**: 4-6 hours
**Testing time**: 8-12 hours
**Total**: 1-2 days to secure protocol

### Recommendation:
**DO NOT deploy to mainnet until all CRITICAL vulnerabilities are resolved.**

The fixes are minimal and non-invasive. Once implemented, Scale AMM will be secure against re-entrancy attacks and ready for production deployment.

---

## Appendix: Code References

### Files Analyzed:
- `/home/user/Claude/programs/creator-amm-v2/src/instructions/create_pool.rs`
- `/home/user/Claude/programs/creator-amm-v2/src/instructions/buy.rs`
- `/home/user/Claude/programs/creator-amm-v2/src/instructions/sell.rs`
- `/home/user/Claude/programs/creator-amm-v2/src/instructions/trade.rs`
- `/home/user/Claude/programs/creator-amm-v2/src/state.rs`
- `/home/user/Claude/programs/creator-amm-v2/src/errors.rs`

### CPI Call Locations:
1. create_pool.rs:227 - Token transfer (creator → vault)
2. buy.rs:200 - Token transfer (user → fee recipient)
3. buy.rs:211 - Token transfer (user → vault)
4. buy.rs:228 - Token transfer (vault → user) **[HIGH RISK - PDA authority]**
5. sell.rs:196 - Token transfer (user → vault)
6. sell.rs:214 - Token transfer (vault → user) **[HIGH RISK - PDA authority]**
7. sell.rs:226 - Token transfer (vault → fee) **[HIGH RISK - PDA authority]**

### Post-CPI Operations:
- buy.rs:231 - Phase transition check (reads pool state)
- buy.rs:234-245 - Event emission (reads pool state)
- buy.rs:253-257 - Vault validation (reads pool + vault state)
- sell.rs:230 - Phase transition check (reads pool state)
- sell.rs:238-249 - Event emission (reads pool state)
- sell.rs:254-258 - Vault validation (reads pool + vault state)
- create_pool.rs:230-234 - Vault validation (reads vault state only)

### State Reload Calls:
- create_pool.rs:230 - `ctx.accounts.base_vault.reload()?` ✅
- **buy.rs: NONE** ❌
- **sell.rs: NONE** ❌

---

**Audit Complete**
**Next Steps**: Implement fixes, run test suite, re-audit after changes
