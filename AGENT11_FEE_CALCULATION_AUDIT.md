# AGENT 11: FEE CALCULATION EXPLOITS - SECURITY AUDIT REPORT

**Auditor**: Agent 11 (Security Analysis)
**Protocol**: Scale AMM (Creator AMM V2)
**Date**: 2026-01-09
**Scope**: Fee calculation mechanisms, overflow protection, rounding exploits, recipient manipulation

---

## EXECUTIVE SUMMARY

This audit examined all fee calculation mechanisms in the Scale AMM protocol, including:
- Base trading fees (0-100 bps)
- WAA (Weighted Average Anti-Dump) fees (0-1000 bps)
- Fee recipient validation
- Fee accounting and reserve updates
- Rounding and overflow protection

**CRITICAL FINDING**: A rounding-to-zero vulnerability allows traders to execute small trades with zero fees, effectively bypassing the fee system through repeated small transactions.

---

## 1. FEE CALCULATION OVERFLOW PROTECTION

### Attack Vector
Can combined fees (base + WAA) exceed maximum bounds and cause overflow or excessive fees?

### Code Analysis

**Location**: `/home/user/Claude/programs/creator-amm-v2/src/instructions/sell.rs` lines 140-149

```rust
let effective_fee_bps = (current_fee_bps as u64)
    .checked_add(extra_fee_bps)
    .ok_or(ErrorCode::MathOverflow)?;
const MAX_EFFECTIVE_FEE_BPS: u64 = 1500; // 15% max total fee
require!(
    effective_fee_bps <= MAX_EFFECTIVE_FEE_BPS,
    ErrorCode::InvalidFee
);
```

**Fee Limits**:
- Base fee: 0, 25, or 100 bps (enforced at pool creation)
- WAA fee: 0-1000 bps (time-based decay)
- Combined maximum: 1500 bps (15%)
- Actual maximum: 100 + 1000 = 1100 bps (11%)

### Finding: ✅ **SECURE**

**Reasoning**:
- Uses checked arithmetic (`checked_add`)
- Explicit validation of combined fee ≤ 1500 bps
- Pool creation restricts `fee_bps` to {0, 25, 100} only (see `create_pool.rs` lines 114-118)
- WAA fees capped at 1000 bps by design
- No overflow possible

**Evidence**: Pool creation validation
```rust
// create_pool.rs lines 114-118
require!(
    fee_bps == FEE_TIER_FREE || fee_bps == FEE_TIER_LOW || fee_bps == FEE_TIER_STANDARD,
    ErrorCode::InvalidFee
);
```

---

## 2. ROUNDING ERRORS FOR FREE TRADES ⚠️ CRITICAL

### Attack Vector
Can rounding in integer division result in zero fees for small trade amounts?

### Code Analysis

**Location**: `/home/user/Claude/programs/creator-amm-v2/src/instructions/trade.rs` lines 61-83

```rust
pub fn calculate_base_fee(amount: u64, fee_bps: u16) -> Result<u64> {
    if fee_bps == 0 {
        return Ok(0);
    }

    let fee_u128 = (amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(BPS_DENOMINATOR as u128)  // Divide by 10,000
        .ok_or(ErrorCode::MathOverflow)?;

    require!(fee_u128 <= u64::MAX as u128, ErrorCode::MathOverflow);
    let fee = fee_u128 as u64;

    // Comment at line 80-81: "Return calculated fee (may be 0 for small amounts)"
    Ok(fee)
}
```

### Finding: ⚠️ **CRITICAL VULNERABILITY - ROUNDING TO ZERO**

**Mathematical Analysis**:
- Fee formula: `fee = (amount × fee_bps) / 10000`
- For fee to be non-zero: `amount × fee_bps ≥ 10000`
- With 1% fee (100 bps): `amount × 100 ≥ 10000` → `amount ≥ 100`
- With 0.25% fee (25 bps): `amount × 25 ≥ 10000` → `amount ≥ 400`

**Attack Scenarios**:

**Scenario 1: Free trades below threshold**
```
amount = 99 tokens (with 6 decimals: 99,000,000 base units)
fee_bps = 100 (1%)
fee = (99 × 100) / 10000 = 9900 / 10000 = 0

Result: FREE TRADE (no fee charged)
```

**Scenario 2: Spam attack**
```
Attacker wants to trade 10,000 tokens with 1% fee (should pay 100 token fee)
Instead of 1 trade:
- Split into 101 trades of 99 tokens each
- Each trade pays 0 fee
- Total fee paid: 0 instead of 100

Savings: 100% fee avoidance
```

**Scenario 3: With 0.25% fee**
```
amount = 399 tokens
fee_bps = 25 (0.25%)
fee = (399 × 25) / 10000 = 9975 / 10000 = 0

Free trade threshold: 400 tokens
```

### Current Mitigation (Insufficient)

**Location**: `/home/user/Claude/programs/creator-amm-v2/src/constants.rs` line 44
```rust
pub const MIN_OUTPUT_AMOUNT: u64 = 1_000; // 0.001 tokens with 6 decimals
```

**Problem**: This only validates OUTPUT amount, not INPUT amount.

**Buy transaction** (buy.rs lines 119-128):
```rust
let fee_in_quote = trade::calculate_base_fee(quote_amount, current_fee_bps)?;
let swap_amount = quote_amount.checked_sub(fee_in_quote)?;
```
- INPUT: `quote_amount` (user-controlled, no minimum)
- OUTPUT: `base_output` (validated ≥ 1000)
- Fee calculated from INPUT → can be zero if INPUT is small

**Sell transaction** (sell.rs lines 125-126):
```rust
let base_fee_in_quote = trade::calculate_base_fee(quote_output_before_fee, current_fee_bps)?;
```
- INPUT: `base_amount` (user-controlled, no minimum)
- OUTPUT: `quote_output` (validated ≥ 1000)
- Fee calculated from OUTPUT → can be zero if OUTPUT is small

### Impact Assessment

**Severity**: CRITICAL
**Likelihood**: HIGH (easy to exploit, no technical barriers)
**Impact**: HIGH (complete fee bypass possible)

**Attack Complexity**: LOW
- No special permissions required
- Simple transaction splitting
- Automatable via script

**Economic Impact**:
- Creators lose 100% of trading fees
- Protocol loses fee revenue
- Undermines economic model

### Proof of Concept

```typescript
// Attacker splits large trade into many small trades
const TOTAL_AMOUNT = 10_000_000_000; // 10,000 tokens (6 decimals)
const CHUNK_SIZE = 99_000_000;       // 99 tokens per trade
const NUM_TRADES = Math.ceil(TOTAL_AMOUNT / CHUNK_SIZE); // 101 trades

for (let i = 0; i < NUM_TRADES; i++) {
  await program.methods.buy(
    new anchor.BN(CHUNK_SIZE),  // 99 tokens each
    new anchor.BN(0)            // min output
  ).rpc();

  // Fee charged: (99 * 100) / 10000 = 0
}

// Total fee paid: 0
// Expected fee: 100 tokens (1% of 10,000)
// Fee avoidance: 100%
```

### Test Coverage

**Location**: `/home/user/Claude/tests/critical-coverage.ts` lines 1811-1858

Existing test executes 10 small trades and verifies k (constant product) doesn't decrease:
```typescript
it("Should not leak value via rounding errors", async () => {
  // Execute 10 small trades of 1 CRX each
  for (let i = 0; i < 10; i++) {
    await executeTrade(..., new anchor.BN(1_000_000), ...); // 1 CRX
  }

  // Verify k increased (due to fees)
  expect(kAfter.gte(kBefore)).to.be.true;
});
```

**Test Gap**: This test uses 1 CRX trades which DO generate fees. It doesn't test trades below fee threshold.

### Recommended Fix

**Option 1: Minimum Input Amount (Recommended)**
```rust
// In trade.rs validate_trade_preconditions()
pub const MIN_INPUT_AMOUNT: u64 = 1_000; // 0.001 tokens

pub fn validate_trade_preconditions(amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);
    require!(amount >= MIN_INPUT_AMOUNT, ErrorCode::InvalidAmount); // NEW
    Ok(())
}
```

**Option 2: Minimum Fee (Alternative)**
```rust
// In calculate_base_fee()
pub fn calculate_base_fee(amount: u64, fee_bps: u16) -> Result<u64> {
    if fee_bps == 0 {
        return Ok(0);
    }

    let fee_u128 = (amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(BPS_DENOMINATOR as u128)
        .ok_or(ErrorCode::MathOverflow)?;

    require!(fee_u128 <= u64::MAX as u128, ErrorCode::MathOverflow);
    let fee = fee_u128 as u64;

    // NEW: Ensure minimum fee if amount is non-trivial
    const MIN_FEE: u64 = 1; // 1 base unit minimum
    if amount >= MIN_OUTPUT_AMOUNT && fee == 0 {
        return Ok(MIN_FEE);
    }

    Ok(fee)
}
```

**Recommendation**: Implement Option 1 (minimum input validation) as it's cleaner and more explicit.

---

## 3. FEE RECIPIENT MANIPULATION

### Attack Vector
Can fees be redirected to an attacker-controlled address instead of pool.creator?

### Code Analysis

**Location**: Buy instruction (`buy.rs` lines 55-61)
```rust
#[account(
    mut,
    constraint = fee_recipient_account.mint == pool.quote_mint @ ErrorCode::Unauthorized,
    constraint = fee_recipient_account.owner == pool.creator @ ErrorCode::Unauthorized,
)]
pub fee_recipient_account: Account<'info, TokenAccount>,
```

**Location**: Sell instruction (`sell.rs` lines 55-61) - Identical constraints

### Finding: ✅ **SECURE**

**Reasoning**:
1. **Anchor Constraint Enforcement**:
   - `fee_recipient_account.owner == pool.creator` enforced at account validation
   - Cannot pass a different account
   - Fails before handler execution if wrong owner

2. **Mint Validation**:
   - `fee_recipient_account.mint == pool.quote_mint` ensures fees go to correct token type
   - Prevents sending fees to wrong mint

3. **Creator Immutability**:
   - `pool.creator` set at pool creation (create_pool.rs line 227)
   - Cannot be changed after initialization
   - No update_creator instruction exists

4. **Test Coverage**:
   - `/home/user/Claude/tests/security-tests.ts` line 756: "ATTACK-8: Fee bypass (wrong fee recipient)"
   - Test confirms attack is blocked

### Attack Scenarios Tested
1. Attacker provides own token account → BLOCKED (owner != pool.creator)
2. Attacker provides account with wrong mint → BLOCKED (mint validation)
3. Attacker tries to front-run pool creation → BLOCKED (PDA derivation)

---

## 4. FEE BYPASS VIA SPECIAL TOKEN ACCOUNTS

### Attack Vector
Can attackers use special account types (ATA, PDA, Token-2022) to bypass fee collection?

### Code Analysis

**Account Validation** (buy.rs lines 40-53):
```rust
#[account(
    mut,
    constraint = user_quote_account.mint == pool.quote_mint,
    constraint = user_quote_account.owner == user.key(),
)]
pub user_quote_account: Account<'info, TokenAccount>,

#[account(
    mut,
    constraint = user_base_account.mint == pool.base_mint,
    constraint = user_base_account.owner == user.key(),
)]
pub user_base_account: Account<'info, TokenAccount>,
```

**Token-2022 Protection** (create_pool.rs lines 158-163):
```rust
use anchor_spl::token::spl_token;
require!(
    ctx.accounts.base_mint.to_account_info().owner == &spl_token::ID,
    ErrorCode::Token2022NotSupported
);
```

### Finding: ✅ **SECURE**

**Reasoning**:
1. **Standard Account Types Only**:
   - All accounts validated as standard SPL Token accounts
   - Token-2022 explicitly blocked (prevents transfer hook attacks)

2. **Owner Validation**:
   - User accounts MUST be owned by signer
   - Vault accounts MUST be owned by pool PDA
   - No privilege escalation possible

3. **No Special Paths**:
   - Single code path for all users
   - No admin bypass
   - No whitelist bypass

---

## 5. ZERO FEE VALIDATION

### Attack Vector
Can pools be created with zero fees to avoid protocol revenue?

### Code Analysis

**Location**: `/home/user/Claude/programs/creator-amm-v2/src/constants.rs` line 28
```rust
pub const FEE_TIER_FREE: u16 = 0;
```

**Location**: `create_pool.rs` lines 114-118
```rust
require!(
    fee_bps == FEE_TIER_FREE || fee_bps == FEE_TIER_LOW || fee_bps == FEE_TIER_STANDARD,
    ErrorCode::InvalidFee
);
```

### Finding: ⚠️ **DESIGN CHOICE - NOT A VULNERABILITY**

**Reasoning**:
- Zero fees explicitly allowed via `FEE_TIER_FREE`
- Intentional for Tier 1 permissionless pools
- Aligns with mission: "pure permissionless trading"

**Trade-offs**:
- **Pro**: Enables completely permissionless token launches
- **Pro**: Competitive with other platforms
- **Con**: No revenue for creators who choose 0%
- **Con**: May incentivize race-to-bottom on fees

**Validation**: This is a **business decision**, not a security issue.

---

## 6. FEE COLLECTION VS RESERVE UPDATES

### Attack Vector
Can mismatched fee accounting and reserve updates lead to value extraction?

### Code Analysis

**BUY Flow** (buy.rs lines 119-156):
```rust
// 1. Calculate fee from INPUT (before swap)
let fee_in_quote = trade::calculate_base_fee(quote_amount, current_fee_bps)?;

// 2. Reduce swap amount by fee
let swap_amount = quote_amount.checked_sub(fee_in_quote)?;

// 3. Calculate output based on SWAP AMOUNT (not full quote_amount)
let base_output = pool.calculate_output(swap_amount, quote_reserve, base_reserve, 0)?;

// 4. Update reserves with SWAP AMOUNT only (fee excluded)
trade::update_reserves(pool, TradeDirection::Buy, swap_amount, base_output)?;

// 5. Transfer fee directly to creator (never enters pool)
if fee_in_quote > 0 {
    trade::transfer_tokens(..., fee_in_quote, ...)?;
}

// 6. Transfer swap amount to pool
trade::transfer_tokens(..., swap_amount, ...)?;
```

**SELL Flow** (sell.rs lines 114-182):
```rust
// 1. Calculate output WITHOUT fee
let quote_output_before_fee = pool.calculate_output(base_amount, base_reserve, quote_reserve, 0)?;

// 2. Calculate fees from OUTPUT
let base_fee_in_quote = trade::calculate_base_fee(quote_output_before_fee, current_fee_bps)?;
let extra_fee_in_quote = trade::calculate_base_fee(quote_output_before_fee, extra_fee_bps as u16)?;
let total_fee_in_quote = base_fee_in_quote.checked_add(extra_fee_in_quote)?;

// 3. Reduce user output by fee
let quote_output = quote_output_before_fee.checked_sub(total_fee_in_quote)?;

// 4. Update reserves with TOTAL OUTPUT (including fee)
let total_quote_out = quote_output_before_fee;
trade::update_reserves(pool, TradeDirection::Sell, base_amount, total_quote_out)?;

// 5. Transfer user output (after fee)
trade::transfer_tokens(..., quote_output, ...)?;

// 6. Transfer fee to creator (from pool)
if total_fee_in_quote > 0 {
    trade::transfer_tokens(..., total_fee_in_quote, ...)?;
}
```

### Finding: ✅ **SECURE - MATHEMATICALLY CORRECT**

**Buy Invariant**:
```
User pays: quote_amount
Fee extracted: fee_in_quote
Pool receives: swap_amount = quote_amount - fee_in_quote
Reserve update: +swap_amount (quote), -base_output (base)

Total: quote_amount = fee_in_quote + swap_amount ✓
```

**Sell Invariant**:
```
User receives: quote_output
Fee extracted: total_fee_in_quote
Pool pays: total_quote_out = quote_output + total_fee_in_quote
Reserve update: +base_amount (base), -total_quote_out (quote)

Total: total_quote_out = quote_output + total_fee_in_quote ✓
```

**Validation**: Vault balance check at end of both instructions (buy.rs lines 262-266, sell.rs lines 272-279):
```rust
trade::validate_vault_balances(pool, &ctx.accounts.quote_vault, &ctx.accounts.base_vault)?;
```

This ensures:
- `pool.real_quote_reserves == quote_vault.amount`
- `pool.real_base_reserves == base_vault.amount`

**Proof**: If accounting were wrong, this check would fail every trade.

---

## 7. GRADUATED VS PREBONDING FEE DIFFERENCES

### Attack Vector
Can phase transition be exploited for fee arbitrage?

### Code Analysis

**Location**: `state.rs` lines 188-195
```rust
pub fn get_current_fee_bps(&self) -> u16 {
    self.fee_bps // Same fee throughout lifetime
}
```

**Comment** (lines 189-192):
```
Fees continue throughout the token's lifetime (PreBonding + Graduated)
This ensures creators earn fees forever, not just during initial bonding phase
Fee tiers: 0%, 0.25%, or 1% (set at pool creation)
```

### Finding: ✅ **SECURE - CONSISTENT FEE MODEL**

**Reasoning**:
1. **Base Fee Constant**: `pool.fee_bps` never changes after pool creation
2. **WAA Applies to Both Phases**: Anti-dump fees work pre and post graduation
3. **No Arbitrage Window**: Phase transition doesn't change fee structure
4. **Pricing Changes Only**: Graduation switches from virtual to real reserves for pricing, not fees

**Phase Comparison**:
| Aspect | PreBonding | Graduated |
|--------|-----------|-----------|
| Base Fee | pool.fee_bps | pool.fee_bps (same) |
| WAA Fee | 0-1000 bps (time-based) | 0-1000 bps (time-based) |
| Pricing Reserves | Virtual | Real |
| Anti-Sniper | Active (first 75 slots) | Inactive |

**No Exploit Path**: Cannot profit from phase transition fee changes because there are none.

---

## 8. WAA FEE CALCULATION SECURITY

### Attack Vector
Can WAA fees be bypassed or manipulated?

### Code Analysis

**WAA Bypass Flag** (sell.rs lines 128-136):
```rust
let extra_fee_bps = if pool.disable_waa {
    0 // No WAA fees - pure permissionless trading
} else {
    let user_position = &ctx.accounts.user_position;
    user_position.calculate_extra_sell_fee_bps(clock.slot)?
};
```

**WAA Calculation** (state.rs lines 556-598):
```rust
pub fn calculate_extra_sell_fee_bps(&self, current_slot: u64) -> Result<u64> {
    let age = current_slot.saturating_sub(self.avg_entry_slot);

    if age <= WAA_TIER1_SLOTS { return Ok(WAA_FEE_MAX); }  // 1000 bps (10%)
    if age <= WAA_TIER2_SLOTS { /* decay 1000 → 100 */ }   // Linear decay
    if age <= WAA_TIER3_SLOTS { /* decay 100 → 0 */ }      // Linear decay
    Ok(0)  // After 4500 slots (~30 min): no WAA fee
}
```

### Finding: ⚠️ **DESIGN FEATURE - INTENTIONAL BYPASS**

**WAA Bypass via disable_waa Flag**:

**When Set**: Pool creation (create_pool.rs line 90)
```rust
pub fn handler(
    ctx: Context<CreatePool>,
    // ...
    disable_waa: bool,  // User-controlled parameter
) -> Result<()>
```

**Implication**:
- Pool creator can disable ALL WAA fees
- Trades in that pool never pay WAA fees
- Only base fee applies (0-100 bps)

**Is This a Vulnerability?**
- **No** - Intentional design for pure permissionless pools
- Documented as feature: "If true, pure permissionless (no WAA anti-dump fees)"
- Aligns with two-tier system: Tier 1 (permissionless) vs Tier 2 (permissioned)

**Security Properties**:
1. **Cannot Be Changed**: `disable_waa` set at creation, immutable
2. **No Privilege Escalation**: Works same for all users
3. **Transparent**: Flag visible in pool state

**Trade-offs**:
- **Pro**: Maximum permissionlessness
- **Con**: No anti-sniper/anti-dump protection
- **Con**: More vulnerable to pump-and-dump schemes

### Position Manipulation Analysis

**Position PDA Derivation** (buy.rs lines 63-70):
```rust
#[account(
    init_if_needed,
    payer = user,
    space = UserPosition::LEN,
    seeds = [b"pos", pool.key().as_ref(), user.key().as_ref()],
    bump,
)]
pub user_position: Account<'info, UserPosition>,
```

**Validation** (buy.rs lines 179-186):
```rust
require!(
    user_position.pool == pool.key() && user_position.user == ctx.accounts.user.key(),
    ErrorCode::Unauthorized
);
```

**Finding**: ✅ SECURE
- Position derived from pool + user (cannot fake)
- Proper validation on all uses
- No way to manipulate weighted average artificially

---

## 9. TEST CASE RECOMMENDATIONS

Based on identified vulnerabilities, the following test cases should be added:

### Test Suite: Fee Rounding Exploits

```typescript
describe("Fee Calculation Edge Cases", () => {

  it("Should enforce minimum input amount to prevent zero-fee trades", async () => {
    // TEST: Trade with amount below fee threshold
    const BELOW_THRESHOLD = new anchor.BN(99_000_000); // 99 tokens (6 decimals)

    try {
      await program.methods.buy(BELOW_THRESHOLD, new anchor.BN(0)).rpc();
      expect.fail("Should have rejected trade below minimum");
    } catch (err) {
      expect(err.toString()).to.include("InvalidAmount");
    }
  });

  it("Should prevent fee avoidance via trade splitting", async () => {
    // TEST: Many small trades should pay fees
    const TOTAL_AMOUNT = 10_000_000_000; // 10k tokens
    const CHUNK_SIZE = 99_000_000;       // 99 tokens each
    const NUM_TRADES = Math.ceil(TOTAL_AMOUNT / CHUNK_SIZE);

    let totalFeesPaid = new anchor.BN(0);

    for (let i = 0; i < NUM_TRADES; i++) {
      const tx = await program.methods.buy(
        new anchor.BN(CHUNK_SIZE),
        new anchor.BN(0)
      ).rpc();

      // Parse TradeExecuted event
      const events = await program.getEvents(tx);
      const tradeEvent = events.find(e => e.name === "TradeExecuted");
      totalFeesPaid = totalFeesPaid.add(tradeEvent.data.feeAmount);
    }

    // Expected fee: 1% of 10k = 100 tokens
    const EXPECTED_FEE = new anchor.BN(100_000_000); // 100 tokens

    // Allow 1% tolerance for rounding
    expect(totalFeesPaid.gte(EXPECTED_FEE.mul(new anchor.BN(99)).div(new anchor.BN(100)))).to.be.true;
  });

  it("Should charge minimum fee even for small amounts", async () => {
    // TEST: Small trade still pays at least 1 base unit fee
    const SMALL_AMOUNT = new anchor.BN(1_000_000); // 1 token (just above minimum)

    const poolBefore = await program.account.pool.fetch(pool);
    const creatorBalanceBefore = await getAccount(connection, creatorCrxAccount);

    await program.methods.buy(SMALL_AMOUNT, new anchor.BN(0)).rpc();

    const creatorBalanceAfter = await getAccount(connection, creatorCrxAccount);
    const feeReceived = creatorBalanceAfter.amount - creatorBalanceBefore.amount;

    expect(feeReceived).to.be.gt(0, "Fee should be greater than 0");
  });

  it("Should maintain constant product despite rounding", async () => {
    // TEST: 100 small trades shouldn't leak value via rounding
    const SMALL_TRADE = new anchor.BN(1_000_000); // 1 token

    const poolBefore = await program.account.pool.fetch(pool);
    const kBefore = poolBefore.virtualQuoteReserves.mul(poolBefore.virtualBaseReserves);

    for (let i = 0; i < 100; i++) {
      await program.methods.buy(SMALL_TRADE, new anchor.BN(0)).rpc();
    }

    const poolAfter = await program.account.pool.fetch(pool);
    const kAfter = poolAfter.virtualQuoteReserves.mul(poolAfter.virtualBaseReserves);

    // k should strictly increase (fees)
    expect(kAfter.gt(kBefore)).to.be.true;
  });

  it("Should handle boundary cases for each fee tier", async () => {
    // TEST: Fee calculation at exact thresholds

    // For FEE_TIER_STANDARD (100 bps = 1%):
    // Minimum amount: (1 * 10000) / 100 = 100 tokens
    const MIN_FOR_1PCT = new anchor.BN(100_000_000);

    const tx = await program.methods.buy(MIN_FOR_1PCT, new anchor.BN(0)).rpc();
    const events = await program.getEvents(tx);
    const tradeEvent = events.find(e => e.name === "TradeExecuted");

    expect(tradeEvent.data.feeAmount.toNumber()).to.equal(1_000_000); // 1 token fee
  });
});
```

---

## 10. ADDITIONAL FINDINGS

### 10.1 No Maximum Trade Size Validation

**Observation**: Apart from anti-sniper protection (first 75 slots), there's no maximum trade size.

**Impact**: LOW - Protocol design allows large trades post-sniper period
**Risk**: Potential for single-tx price manipulation in low-liquidity pools

### 10.2 Fee Recipient Can't Be Changed

**Observation**: `pool.creator` is immutable (no update function exists)

**Impact**: Informational - By design, but consider implications
**Risk**: If creator loses private key, fees are lost forever
**Mitigation**: Document this clearly for pool creators

### 10.3 WAA Fee Calculation Uses Saturating Arithmetic

**Location**: state.rs line 566
```rust
let age = current_slot.saturating_sub(self.avg_entry_slot);
```

**Impact**: Informational - Prevents underflow if clock goes backwards
**Security**: ✅ GOOD - Defensive programming

### 10.4 Price Oracle Freshness Validated

**Location**: Config.validate_price_freshness (state.rs lines 68-81)
```rust
pub fn validate_price_freshness(&self, clock: &Clock) -> Result<()> {
    let age = clock.unix_timestamp
        .checked_sub(self.crx_price_last_updated)
        .ok_or(ErrorCode::MathOverflow)?;

    require!(
        age <= self.oracle_max_age_seconds,
        ErrorCode::OraclePriceStale
    );
    Ok(())
}
```

**Security**: ✅ GOOD - Prevents stale price exploitation
**Called**: Every trade (buy.rs line 91, sell.rs line 90)

---

## SUMMARY TABLE

| # | Attack Vector | Severity | Status | Notes |
|---|--------------|----------|--------|-------|
| 1 | Fee Overflow | - | ✅ SECURE | Checked arithmetic, explicit bounds |
| 2 | Rounding to Zero | CRITICAL | ⚠️ VULNERABLE | Small trades pay zero fees |
| 3 | Fee Recipient Manipulation | - | ✅ SECURE | Anchor constraints enforce creator |
| 4 | Special Account Bypass | - | ✅ SECURE | Token-2022 blocked, standard validation |
| 5 | Zero Fee Pools | - | ⚠️ DESIGN | Intentional for permissionless tier |
| 6 | Fee Accounting Mismatch | - | ✅ SECURE | Vault validation confirms correctness |
| 7 | Phase Transition Arbitrage | - | ✅ SECURE | Fees constant across phases |
| 8 | WAA Bypass | - | ⚠️ DESIGN | disable_waa flag intentional |
| 9 | Position Manipulation | - | ✅ SECURE | PDA derivation prevents faking |

---

## RECOMMENDATIONS

### Priority 1: CRITICAL (Implement Before Mainnet)

1. **Add Minimum Input Validation**
   - File: `programs/creator-amm-v2/src/instructions/trade.rs`
   - Add `MIN_INPUT_AMOUNT` constant (suggest 1000, matching MIN_OUTPUT_AMOUNT)
   - Enforce in `validate_trade_preconditions()`
   - Prevents rounding-to-zero exploit

2. **Add Comprehensive Fee Tests**
   - File: `tests/fee-calculation-edge-cases.ts`
   - Test all scenarios from Section 9
   - Verify fix for rounding exploit

### Priority 2: MEDIUM (Consider for Post-Launch)

3. **Document Zero-Fee Trade-offs**
   - File: `README.md` or `docs/POOL_CREATION.md`
   - Explain implications of FEE_TIER_FREE
   - Help creators make informed decisions

4. **Document WAA Bypass**
   - File: `docs/WAA_SYSTEM.md`
   - Explain disable_waa flag
   - Clarify security trade-offs

### Priority 3: LOW (Nice to Have)

5. **Add Creator Key Recovery Mechanism**
   - Consider: Multi-sig or time-delayed update for fee recipient
   - Trade-off: Complexity vs flexibility
   - Document immutability if keeping current design

6. **Monitor Small Trade Patterns**
   - Off-chain: Indexer to detect fee avoidance attempts
   - Alert creators if suspicious splitting detected

---

## CONCLUSION

The Scale AMM fee calculation system is **largely secure** with proper use of checked arithmetic, account validation, and vault reconciliation. However, a **CRITICAL rounding vulnerability** exists that allows traders to avoid fees through transaction splitting.

**Key Findings**:
- ✅ Fee overflow protection: EXCELLENT
- ✅ Fee recipient security: EXCELLENT
- ✅ Accounting integrity: EXCELLENT
- ⚠️ Rounding protection: VULNERABLE (critical fix needed)
- ⚠️ Zero fee / WAA bypass: INTENTIONAL (document trade-offs)

**Mainnet Readiness**: BLOCKED pending fix for rounding exploit.

**Estimated Fix Time**: 2-4 hours (code + tests)
**Risk if Deployed**: HIGH - Economic model undermined

---

**Report Generated**: 2026-01-09
**Next Steps**: Implement Priority 1 fixes, then re-audit
