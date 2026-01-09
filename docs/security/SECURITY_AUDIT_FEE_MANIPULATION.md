# SECURITY AUDIT: Fee Manipulation Attack Vectors
## Scale AMM Protocol - Comprehensive Fee Security Analysis
**Date:** 2026-01-09
**Auditor:** Claude (Sonnet 4.5)
**Scope:** Fee calculation, extraction, and manipulation vectors

---

## EXECUTIVE SUMMARY

**CRITICAL FINDING:** Fee recipient centralization - all pool fees go to global `config.fee_recipient` instead of individual pool creators. This is either intentional (platform revenue model) or a critical implementation bug.

**Overall Assessment:**
- **3 CRITICAL** vulnerabilities
- **2 HIGH** severity issues
- **1 MEDIUM** severity issue
- **6 LOW** severity issues
- **3 INFORMATIONAL** findings

---

## CRITICAL VULNERABILITIES

### 🔴 CRITICAL-01: Fee Recipient Centralization (Potential Rug Vector)

**Severity:** CRITICAL
**Category:** Fee Recipient Validation
**Impact:** Protocol authority controls ALL fees from ALL pools

**Description:**
All trading fees are sent to `config.fee_recipient` (set during protocol initialization), NOT to individual pool creators. The `pool.creator` field is stored but never used for fee distribution.

**Evidence:**

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/buy.rs` (Lines 56-60)
```rust
/// Protocol fee recipient's quote token account
#[account(
    mut,
    constraint = fee_recipient_account.mint == pool.quote_mint @ ErrorCode::Unauthorized,
    constraint = fee_recipient_account.owner == config.fee_recipient @ ErrorCode::Unauthorized,
)]
pub fee_recipient_account: Account<'info, TokenAccount>,
```

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/initialize.rs` (Line 102)
```rust
config.fee_recipient = ctx.accounts.fee_recipient.key();
```

**Impact:**
1. **If intentional (platform model):** Creators receive ZERO trading fees - all revenue goes to platform. This must be clearly documented.
2. **If unintentional (bug):** Creators are defrauded of their expected revenue stream.
3. **Centralization risk:** Single authority controls all protocol revenue.
4. **No update mechanism:** `fee_recipient` cannot be changed after initialization (no update function exists).

**Remediation:**
1. **If platform model:** Add prominent disclosure in documentation
2. **If bug:** Implement per-pool fee recipients:
   - Add `fee_recipient` field to `Pool` struct
   - Use `pool.fee_recipient` instead of `config.fee_recipient` in buy/sell
   - Allow pool creator to set fee recipient during `create_pool`
3. **Add admin function:** Implement `update_fee_recipient` for emergencies

**Exploitation Difficulty:** N/A (design issue, not exploit)

---

### 🔴 CRITICAL-02: No Fee Recipient Update Mechanism

**Severity:** CRITICAL
**Category:** Admin Functions
**Impact:** Permanent lock if fee recipient loses keys

**Description:**
The protocol has NO function to update `config.fee_recipient` after initialization. If the fee recipient wallet is compromised or keys are lost, all future fees are permanently lost or stolen.

**Evidence:**

**File:** `/home/user/Claude/programs/creator-amm-v2/src/lib.rs`
```rust
// Available admin functions:
- update_approved_quotes  // ✓ Exists
- update_crx_price        // ✓ Exists
- update_pool_graduation  // ✓ Exists
- update_fee_recipient    // ✗ MISSING
```

**Searched for update functions:**
```bash
$ grep -r "update.*fee_recipient\|set.*fee_recipient" programs/
# No results
```

**Impact:**
1. **Key loss:** If fee recipient loses private keys, all protocol revenue is permanently lost
2. **Key compromise:** If attacker steals fee recipient keys, they control all protocol revenue forever
3. **No recovery:** Protocol authority cannot change fee recipient even in emergencies

**Remediation:**
```rust
// Add to lib.rs
pub fn update_fee_recipient(
    ctx: Context<UpdateFeeRecipient>,
    new_fee_recipient: Pubkey,
) -> Result<()> {
    instructions::update_fee_recipient::handler(ctx, new_fee_recipient)
}

// Create update_fee_recipient.rs
#[derive(Accounts)]
pub struct UpdateFeeRecipient<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        constraint = config.authority == authority.key() @ ErrorCode::Unauthorized
    )]
    pub config: Account<'info, Config>,

    pub authority: Signer<'info>,

    /// CHECK: New fee recipient wallet
    pub new_fee_recipient: AccountInfo<'info>,
}

pub fn handler(ctx: Context<UpdateFeeRecipient>, new_fee_recipient: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let old_recipient = config.fee_recipient;

    config.fee_recipient = new_fee_recipient;

    emit!(FeeRecipientUpdated {
        old_recipient,
        new_recipient: new_fee_recipient,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
```

**Exploitation Difficulty:** N/A (missing functionality)

---

### 🔴 CRITICAL-03: Comment/Code Mismatch - Misleading "Creator" References

**Severity:** CRITICAL (Documentation)
**Category:** Code Quality / Security Audit Trail
**Impact:** Developers/auditors may misunderstand fee flow, missing centralization issue

**Description:**
Comments in buy.rs and sell.rs claim fees go to "creator" but code sends to `config.fee_recipient`. This inconsistency suggests either:
1. Original design intended per-pool creator fees
2. Implementation was changed but comments weren't updated
3. Deliberate obfuscation

**Evidence:**

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/buy.rs` (Line 188)
```rust
// Transfer 1: Fee goes directly to creator (if any)  // ← COMMENT SAYS "CREATOR"
if fee_in_quote > 0 {
    trade::transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.user_quote_account,
        &ctx.accounts.fee_recipient_account,  // ← CODE SENDS TO FEE_RECIPIENT
        ctx.accounts.user.to_account_info(),
        fee_in_quote,
        None,
    )?;
}
```

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/sell.rs` (Line 213)
```rust
// Transfer 3: Total fee (base + WAA) in QUOTE tokens from pool to creator  // ← COMMENT SAYS "CREATOR"
if total_fee_in_quote > 0 {
    trade::transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.quote_vault,
        &ctx.accounts.fee_recipient_account,  // ← CODE SENDS TO FEE_RECIPIENT
        pool.to_account_info(),
        total_fee_in_quote,
        Some(signer),
    )?;
}
```

**Impact:**
1. **Audit confusion:** Security reviewers may miss centralization issue
2. **Trust assumption:** Comments suggest creators receive fees, but they don't
3. **Legal liability:** If creators expect fees based on comments, platform may face disputes

**Remediation:**
```rust
// Correct comments:
// Transfer 1: Fee goes to protocol fee_recipient (configured in global config)
// OR
// Transfer 1: Fee goes to pool creator's designated fee account
```

**Exploitation Difficulty:** N/A (documentation issue)

---

## HIGH SEVERITY ISSUES

### 🟠 HIGH-01: WAA Bypass via Multi-Wallet Sybil Attack

**Severity:** HIGH
**Category:** WAA Fee Bypass
**Impact:** Users can avoid anti-dump fees by splitting trades across wallets

**Description:**
Each wallet has an independent `UserPosition` PDA, allowing users to bypass WAA extra fees by distributing tokens across multiple wallets and selling from each independently.

**Evidence:**

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/buy.rs` (Lines 64-70)
```rust
/// User position for WAA tracking (init_if_needed to auto-create)
#[account(
    init_if_needed,
    payer = user,
    space = UserPosition::LEN,
    seeds = [b"pos", pool.key().as_ref(), user.key().as_ref()],  // ← Per-user PDA
    bump,
)]
pub user_position: Account<'info, UserPosition>,
```

**Attack Scenario:**
1. Attacker creates 10 wallets
2. Buys 100 tokens in each wallet (1000 total)
3. Immediately sells from all wallets
4. Each wallet is charged 10% WAA fee on 100 tokens
5. **Total fee avoided:** Instead of holding 1000 tokens and paying high WAA on bulk sale, attacker pays 10x small WAA fees (loses gas, but saves on large sell penalty)

**Actual Impact:**
- For immediate sells (< 30s), WAA fee is 10% regardless of split strategy (no advantage)
- For aged positions, splitting doesn't help (each wallet tracks independently)
- **Real exploit:** Buy in Wallet A, transfer tokens to Wallet B, sell from Wallet B with no tracked entry (position doesn't exist)

**Wait - Token Transfer Check:**
Let me verify if token transfers reset WAA tracking...

**Analysis:**
Token transfers via SPL Token program do NOT update `UserPosition` accounts. So:
1. Buy 1000 tokens in Wallet A → WAA entry slot recorded
2. Transfer 1000 tokens to Wallet B → Wallet B has NO UserPosition
3. Sell from Wallet B → Requires UserPosition account to exist

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/sell.rs` (Lines 64-70)
```rust
/// User position for WAA tracking (must exist for sells)
#[account(
    mut,
    seeds = [b"pos", pool.key().as_ref(), user.key().as_ref()],
    bump = user_position.bump,
    constraint = user_position.pool == pool.key() @ ErrorCode::Unauthorized,
    constraint = user_position.user == user.key() @ ErrorCode::Unauthorized,
)]
pub user_position: Account<'info, UserPosition>,  // ← MUST EXIST (no init_if_needed)
```

**SAFE:** Sell requires existing UserPosition, so transferring tokens to a new wallet without position will fail.

**However - Bypass still possible:**
1. Buy small amount (0.01 tokens) in Wallet B → Creates UserPosition
2. Transfer 1000 tokens from Wallet A to Wallet B
3. Sell 1000.01 tokens from Wallet B
4. WAA calculated based on 0.01 token position, not 1000 tokens

**File:** `/home/user/Claude/programs/creator-amm-v2/src/state.rs` (Lines 425-436)
```rust
/// Reduce tracked amount when user sells tokens
#[inline(always)]
pub fn update_on_sell(&mut self, sell_amount: u64) -> Result<()> {
    self.tracked_amount = self.tracked_amount.saturating_sub(sell_amount);  // ← Allows selling MORE than tracked!

    // If fully sold, reset entry slot
    if self.tracked_amount == 0 {
        self.avg_entry_slot = 0;
    }

    Ok(())
}
```

**VULNERABLE:** `saturating_sub` allows selling more tokens than tracked amount!

**Impact:**
1. User can sell untracked tokens with minimal WAA fees
2. Defeats anti-dump mechanism
3. Enables flash dump attacks after token transfers

**Remediation:**
```rust
// Option 1: Prevent selling more than tracked amount
pub fn update_on_sell(&mut self, sell_amount: u64) -> Result<()> {
    require!(
        self.tracked_amount >= sell_amount,
        ErrorCode::InsufficientTrackedAmount
    );

    self.tracked_amount = self.tracked_amount
        .checked_sub(sell_amount)
        .ok_or(ErrorCode::MathOverflow)?;

    if self.tracked_amount == 0 {
        self.avg_entry_slot = 0;
    }

    Ok(())
}

// Option 2: Track ALL token movements (requires CPI hooks - complex)
// Option 3: Apply WAA to all sells regardless of tracking (simpler but less fair)
```

**Exploitation Difficulty:** Medium (requires multiple wallets and token transfers)

---

### 🟠 HIGH-02: WAA Reset via Full Sell & Rebuy

**Severity:** HIGH
**Category:** WAA Fee Bypass
**Impact:** Users can reset WAA timer by fully exiting and re-entering position

**Description:**
Users can reset their `avg_entry_slot` to current slot by selling all tokens, then immediately rebuying. This allows bypassing WAA fees on the rebought amount.

**Evidence:**

**File:** `/home/user/Claude/programs/creator-amm-v2/src/state.rs` (Lines 388-393)
```rust
pub fn update_on_buy(&mut self, buy_amount: u64, current_slot: u64) -> Result<()> {
    if self.tracked_amount == 0 {
        // First buy or position was fully closed - fast path
        self.avg_entry_slot = current_slot;  // ← RESETS TO CURRENT SLOT
        self.tracked_amount = buy_amount;
        return Ok(());
    }
    // ...
}
```

**Attack Scenario:**
1. User buys 1000 tokens at slot 100 → `avg_entry_slot = 100`
2. Slot 120 (20 slots later, still in T1 penalty zone)
3. User wants to sell, but would pay 10% WAA fee
4. **Instead:**
   - Sell 50 tokens → Pay 10% WAA fee on 50 tokens only
   - Remaining 950 tokens still tracked at slot 100
   - Wait 4500 slots (30 minutes)
   - Sell remaining 950 tokens → Pay 0% WAA fee
5. **Total savings:** Avoided 10% WAA on 950 tokens by waiting

**Wait, this is INTENDED BEHAVIOR - WAA is designed to penalize early exits.**

**Actual Exploit - Reset via Full Sell:**
1. Buy 1000 tokens at slot 100
2. Token price pumps 2x
3. Slot 120 (20 slots = ~8 seconds later)
4. User wants to sell ALL and rebuy to reset entry:
   - Sell 1000 tokens → Pay 10% WAA + 1% base = 11% total fee on gains
   - Immediately rebuy 1000 tokens → New `avg_entry_slot = 120`
   - Price dumps back down
   - Sell again at slot 125 → Pay 10% WAA + 1% base = 11% fee
   - **Total fees:** 22% (11% on sell, 11% on re-sell)

**Is this worth it?**
- Only if user wants to lock in profits but stay in position
- Paying 11% fee to exit, then re-entering at new price
- **Not really a bypass** - user still pays full WAA fee on first exit

**Actual Risk - Partial Reset:**
1. User accumulates 1000 tokens at various slots → `avg_entry_slot = weighted average`
2. User sells 999 tokens → Pays WAA on 999 tokens
3. User keeps 1 token → `tracked_amount = 1`, `avg_entry_slot` unchanged
4. User buys 1000 more tokens → New weighted average includes tiny 1 token position
   - `new_avg = (1 * old_avg + 1000 * current_slot) / 1001`
   - Result: `new_avg ≈ current_slot` (dominated by new purchase)
5. User can now sell 1000 tokens with fresh entry slot (minimal WAA)

**Impact:**
1. Users can game weighted average by keeping dust amounts
2. Defeats purpose of weighted average tracking
3. Not a full bypass, but reduces effectiveness

**Remediation:**
```rust
// Option 1: Minimum tracked amount threshold (prevent dust gaming)
pub fn update_on_sell(&mut self, sell_amount: u64) -> Result<()> {
    self.tracked_amount = self.tracked_amount.saturating_sub(sell_amount);

    // Reset if below dust threshold (e.g., 0.001 tokens)
    const DUST_THRESHOLD: u64 = 1_000; // 0.001 with 6 decimals
    if self.tracked_amount < DUST_THRESHOLD {
        self.avg_entry_slot = 0;
        self.tracked_amount = 0;
    }

    Ok(())
}

// Option 2: Maintain separate entry tracking per buy (complex, expensive)
// Option 3: Accept this as acceptable behavior (simplest)
```

**Exploitation Difficulty:** Low (just sell and rebuy)

---

## MEDIUM SEVERITY ISSUES

### 🟡 MEDIUM-01: Zero-Fee Pool Fee Bypass (Safe, but Low Revenue)

**Severity:** MEDIUM
**Category:** Fee Avoidance
**Impact:** Zero-fee pools generate no protocol revenue

**Description:**
Pools can be created with `fee_bps = 0` (FEE_TIER_FREE), generating zero trading fees. While this is intentional design, it allows users to avoid all trading fees.

**Evidence:**

**File:** `/home/user/Claude/programs/creator-amm-v2/src/constants.rs` (Line 28)
```rust
/// Fee tier: Free (0%)
pub const FEE_TIER_FREE: u16 = 0;
```

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/create_pool.rs` (Lines 115-118)
```rust
// Validate fee is one of the allowed values
require!(
    fee_bps == FEE_TIER_FREE || fee_bps == FEE_TIER_LOW || fee_bps == FEE_TIER_STANDARD,
    ErrorCode::InvalidFee
);
```

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/trade.rs` (Lines 58-60)
```rust
if fee_bps == 0 {
    return Ok(0);  // ← Early return, no fee calculated
}
```

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/buy.rs` (Line 189)
```rust
if fee_in_quote > 0 {  // ← Zero fees skip transfer
    trade::transfer_tokens(/* ... */);
}
```

**Impact:**
1. **Revenue loss:** Zero-fee pools generate no platform revenue
2. **Race to bottom:** Users prefer zero-fee pools, pressuring all pools to use 0% fees
3. **Intended design:** This appears intentional (free tier exists), but concentrates fees in fee_recipient with no guarantee of income

**Why This Exists:**
Likely to compete with other platforms offering free trading or to bootstrap liquidity.

**Remediation:**
- **If problematic:** Remove FEE_TIER_FREE, enforce minimum 0.25% fee
- **If intentional:** Document clearly that zero-fee pools are supported
- **Compromise:** Charge platform fee (e.g., 0.1%) even on "zero-fee" pools, while creator gets 0%

**Exploitation Difficulty:** None (feature, not bug)

---

## LOW SEVERITY ISSUES

### 🟢 LOW-01: Fee Calculation Precision Loss (Dust Amounts)

**Severity:** LOW
**Category:** Fee Calculations
**Impact:** Small trades may pay 0 fees due to rounding

**Description:**
Fee calculation uses integer division, which rounds down. For very small trades, calculated fee may be 0 even with non-zero `fee_bps`.

**Evidence:**

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/trade.rs` (Lines 63-71)
```rust
let fee = (amount as u128)
    .checked_mul(fee_bps as u128)
    .ok_or(ErrorCode::MathOverflow)?
    .checked_div(BPS_DENOMINATOR as u128)  // ← Integer division, rounds down
    .ok_or(ErrorCode::MathOverflow)? as u64;

// Return calculated fee (may be 0 for small amounts)
// Respects mathematical precision - no forced minimums
Ok(fee)
```

**Example:**
- Amount: 100 (0.0001 CRX with 6 decimals)
- Fee: 1% (100 bps)
- Calculation: `(100 * 100) / 10_000 = 10_000 / 10_000 = 1`
- **Fee paid:** 1 unit (0.000001 CRX) ✓ Correct

**Example 2:**
- Amount: 50 (0.00005 CRX)
- Fee: 0.25% (25 bps)
- Calculation: `(50 * 25) / 10_000 = 1_250 / 10_000 = 0` ← Rounds to 0!
- **Fee paid:** 0 (free trade)

**Impact:**
1. **Dust trades free:** Trades below `10_000 / fee_bps` units pay 0 fees
2. **For 1% fee:** Trades below 10,000 units (0.01 tokens) are free
3. **For 0.25% fee:** Trades below 40,000 units (0.04 tokens) are free
4. **Revenue loss:** Minimal (dust trades have little value)

**Note:** Code explicitly accepts this behavior (comment: "Respects mathematical precision - no forced minimums")

**Remediation:**
```rust
// Option 1: Enforce minimum fee (1 unit)
let fee = (amount as u128)
    .checked_mul(fee_bps as u128)
    .ok_or(ErrorCode::MathOverflow)?
    .checked_div(BPS_DENOMINATOR as u128)
    .ok_or(ErrorCode::MathOverflow)? as u64;

Ok(if fee_bps > 0 && fee == 0 { 1 } else { fee })  // Minimum 1 unit fee

// Option 2: Accept current behavior (dust trades are negligible revenue)
```

**Exploitation Difficulty:** None (feature behavior)

---

### 🟢 LOW-02: WAA Fee Overflow Risk (Theoretical)

**Severity:** LOW
**Category:** WAA Calculations
**Impact:** Extra fee calculation could overflow for extreme inputs

**Description:**
WAA fee calculation uses `checked_mul` and `checked_div`, but theoretical overflow is possible for extreme slot values.

**Evidence:**

**File:** `/home/user/Claude/programs/creator-amm-v2/src/state.rs` (Lines 458-464)
```rust
let decay_component = WAA_DECAY_RANGE
    .checked_mul(time_remaining)  // ← Could overflow for extreme slot differences
    .ok_or(ErrorCode::MathOverflow)?
    .checked_div(WAA_TIME_RANGE_1)
    .ok_or(ErrorCode::MathOverflow)?;
```

**Analysis:**
- `WAA_DECAY_RANGE = 900` (constant)
- `time_remaining = WAA_TIER2_SLOTS - age` (max 675 slots)
- `Max product = 900 * 675 = 607,500` (fits in u64 easily)
- **No overflow risk with current constants**

**Theoretical Risk:**
If constants are changed (e.g., increasing tier thresholds to millions of slots), overflow could occur.

**Remediation:**
```rust
// Add defensive assertion to prevent misconfiguration
const _: () = assert!(
    (WAA_DECAY_RANGE as u128) * (WAA_TIME_RANGE_1 as u128) <= u64::MAX as u128,
    "WAA constants would cause overflow"
);
```

**Exploitation Difficulty:** None (constants prevent overflow)

---

### 🟢 LOW-03: Disable WAA Flag Allows Instant Dump

**Severity:** LOW
**Category:** Pool Configuration
**Impact:** Pools with `disable_waa = true` have no anti-dump protection

**Description:**
Pool creators can set `disable_waa = true` during pool creation, completely disabling WAA anti-dump fees. This is intentional for "pure permissionless" mode but removes sniper protection.

**Evidence:**

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/sell.rs** (Lines 127-132)
```rust
// Calculate WAA-based extra sell fee (anti-sniper)
// Skip if pool has WAA disabled (pure permissionless mode)
let extra_fee_bps = if pool.disable_waa {
    0 // No WAA fees - pure permissionless trading
} else {
    let user_position = &ctx.accounts.user_position;
    user_position.calculate_extra_sell_fee_bps(clock.slot)?
};
```

**Impact:**
1. **Instant dumps allowed:** Users can buy and immediately sell with only base fee (0%, 0.25%, or 1%)
2. **Sniper paradise:** Bots can front-run with no penalty
3. **Intended design:** Documented as "pure permissionless mode"

**Why This Exists:**
Some communities prefer fully permissionless trading without anti-bot measures. This is a trade-off between freedom and protection.

**Remediation:**
- **If problematic:** Remove `disable_waa` option, enforce WAA on all pools
- **If intentional:** Clearly warn users when trading pools with WAA disabled
- **Compromise:** Allow disabling WAA only after certain threshold (e.g., post-graduation)

**Exploitation Difficulty:** None (feature, not exploit)

---

### 🟢 LOW-04: Fee Consistency Difference (Input vs Output)

**Severity:** LOW
**Category:** Fee Extraction
**Impact:** Buy and sell use different fee extraction points (no exploit, just design note)

**Description:**
Buy extracts fee from INPUT before swap calculation, while sell extracts fee from OUTPUT after swap calculation. This is mathematically sound but creates asymmetry.

**Evidence:**

**Buy Flow (fee from input):**
```rust
// buy.rs:120-125
let fee_in_quote = trade::calculate_base_fee(quote_amount, current_fee_bps)?;
let swap_amount = quote_amount.checked_sub(fee_in_quote)?;  // Fee removed BEFORE swap
let base_output = pool.calculate_output(swap_amount, ...);  // Swap on reduced amount
```

**Sell Flow (fee from output):**
```rust
// sell.rs:115-144
let quote_output_before_fee = pool.calculate_output(base_amount, ...);  // Full swap first
let base_fee_in_quote = trade::calculate_base_fee(quote_output_before_fee, current_fee_bps)?;
let quote_output = quote_output_before_fee.checked_sub(total_fee_in_quote)?;  // Fee removed AFTER
```

**Reserve Updates:**
```rust
// Buy: Only swap_amount enters reserves (quote_amount - fee)
trade::update_reserves(pool, TradeDirection::Buy, swap_amount, base_output)?;

// Sell: Full base_amount enters, full quote_output_before_fee exits
trade::update_reserves(pool, TradeDirection::Sell, base_amount, total_quote_out)?;
```

**Analysis:**
This is **mathematically equivalent** and maintains `x * y = k` invariant:
- **Buy:** Δx = (input - fee), Δy = -output
- **Sell:** Δx = -output_before_fee, Δy = input

**No arbitrage opportunity** - both methods maintain reserve integrity.

**Impact:**
1. **No security risk:** Both methods preserve invariants
2. **Code clarity:** Asymmetry could confuse auditors
3. **Gas difference:** Minimal (same number of operations)

**Recommendation:**
- Document WHY different extraction points were chosen
- Consider standardizing to one method for consistency
- Current implementation is SAFE

**Exploitation Difficulty:** None (no exploit exists)

---

### 🟢 LOW-05: Missing Minimum Fee Enforcement

**Severity:** LOW
**Category:** Fee Validation
**Impact:** Very small fees may round to zero

**Description:**
Trade validation has `MIN_OUTPUT_AMOUNT = 1_000` (0.001 tokens) but no `MIN_FEE_AMOUNT`, allowing dust fees.

**Evidence:**

**File:** `/home/user/Claude/programs/creator-amm-v2/src/constants.rs** (Lines 43-44)
```rust
/// Minimum output amount to prevent dust trades (0.001 tokens with 6 decimals)
pub const MIN_OUTPUT_AMOUNT: u64 = 1_000;
// No MIN_FEE_AMOUNT constant
```

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/trade.rs** (Line 70)
```rust
// Return calculated fee (may be 0 for small amounts)
// Respects mathematical precision - no forced minimums
Ok(fee)
```

**Impact:**
Same as LOW-01 - dust trades may pay 0 fees due to rounding.

**Remediation:**
```rust
pub const MIN_FEE_AMOUNT: u64 = 1; // Always charge at least 1 unit if fee > 0

// In calculate_base_fee:
let fee = (amount as u128)
    .checked_mul(fee_bps as u128)?
    .checked_div(BPS_DENOMINATOR as u128)? as u64;

Ok(if fee_bps > 0 && fee == 0 { MIN_FEE_AMOUNT } else { fee })
```

**Exploitation Difficulty:** None

---

### 🟢 LOW-06: No Fee Cap Validation

**Severity:** LOW
**Category:** Fee Validation
**Impact:** Pools are limited to pre-defined tiers (0%, 0.25%, 1%), preventing excessive fees

**Description:**
While `MAX_FEE_BPS = 10_000` (100%) is defined, pools can only use approved tiers. However, WAA extra fees are uncapped.

**Evidence:**

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/create_pool.rs** (Lines 115-118)
```rust
require!(
    fee_bps == FEE_TIER_FREE || fee_bps == FEE_TIER_LOW || fee_bps == FEE_TIER_STANDARD,
    ErrorCode::InvalidFee
);
// Enforces only 0%, 0.25%, or 1% - SAFE
```

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/sell.rs** (Lines 230-232)
```rust
let effective_fee_bps = current_fee_bps
    .checked_add(extra_fee_bps as u16)  // ← Could exceed 100% theoretically
    .ok_or(ErrorCode::MathOverflow)?;
```

**Analysis:**
- Base fee: Max 1% (100 bps)
- WAA extra fee: Max 10% (1000 bps)
- **Total max:** 11% (1100 bps)
- **Capped by constants:** WAA_FEE_MAX = 1000 prevents extreme values

**Impact:**
1. **Safe with current constants:** Max 11% total fee
2. **If constants change:** Could charge >100% (user receives nothing)
3. **Overflow protection:** `checked_add` prevents overflow

**Recommendation:**
```rust
// Add sanity check in sell.rs
let effective_fee_bps = current_fee_bps
    .checked_add(extra_fee_bps as u16)
    .ok_or(ErrorCode::MathOverflow)?;

require!(
    effective_fee_bps <= MAX_FEE_BPS,  // Ensure total fee ≤ 100%
    ErrorCode::InvalidFee
);
```

**Exploitation Difficulty:** None (constants prevent excessive fees)

---

## INFORMATIONAL FINDINGS

### ℹ️ INFO-01: Fee Extraction Methods Differ (No Impact)

**Category:** Code Style
**Finding:** Buy and sell extract fees at different points (input vs output), but both are mathematically sound.
**Recommendation:** Document design choice in code comments.

---

### ℹ️ INFO-02: WAA Tier Calculations Use Saturating Math

**Category:** Security Positive
**Finding:** WAA fee calculations use `saturating_sub`, `saturating_add`, and `saturating_mul` to prevent underflow/overflow.
**Assessment:** SAFE - proper defensive programming.

---

### ℹ️ INFO-03: Vault Balance Validation Always Runs

**Category:** Security Positive
**Finding:** Every trade ends with `validate_vault_balances()` check.
**Assessment:** Excellent defense-in-depth (~6k CU cost is worth it).

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/buy.rs** (Lines 247-254)
```rust
// CRITICAL: Always validate vault balances match reserves in production
// This catches any token transfer failures or accounting mismatches
// Cost: ~6k CU, but essential for security (defense in depth)
trade::validate_vault_balances(
    pool,
    &ctx.accounts.quote_vault,
    &ctx.accounts.base_vault,
)?;
```

---

## SUMMARY OF ATTACK VECTORS

| Vector | Severity | Exploitable? | Remediation Needed? |
|--------|----------|--------------|---------------------|
| Fee recipient centralization | CRITICAL | N/A (design) | Yes - Document or redesign |
| No fee recipient update | CRITICAL | N/A (missing) | Yes - Add update function |
| Comment/code mismatch | CRITICAL | No | Yes - Fix comments |
| WAA bypass (multi-wallet) | HIGH | Yes | Yes - Prevent over-selling |
| WAA reset (sell all + rebuy) | HIGH | Yes | Maybe - Accept or threshold |
| Zero-fee pools | MEDIUM | No | Optional - Design choice |
| Fee precision loss | LOW | No | Optional - Enforce minimum |
| WAA overflow (theoretical) | LOW | No | Optional - Add assertion |
| Disable WAA flag | LOW | No | No - Intentional feature |
| Fee extraction asymmetry | LOW | No | No - Both methods safe |
| Missing min fee | LOW | No | Optional - Same as precision loss |
| No fee cap validation | LOW | No | Optional - Constants prevent issue |

---

## CRITICAL RECOMMENDATIONS

### Immediate Actions (Before Mainnet):

1. **CRITICAL-01 & 02:** Implement `update_fee_recipient` admin function
   ```rust
   pub fn update_fee_recipient(
       ctx: Context<UpdateFeeRecipient>,
       new_fee_recipient: Pubkey,
   ) -> Result<()>
   ```

2. **CRITICAL-03:** Fix misleading comments in buy.rs and sell.rs
   ```rust
   // OLD: Fee goes directly to creator (if any)
   // NEW: Fee goes to protocol fee_recipient (config.fee_recipient)
   ```

3. **HIGH-01:** Prevent over-selling tracked amount
   ```rust
   pub fn update_on_sell(&mut self, sell_amount: u64) -> Result<()> {
       require!(
           self.tracked_amount >= sell_amount,
           ErrorCode::InsufficientTrackedAmount
       );
       // ...
   }
   ```

4. **Documentation:** Clarify fee recipient model in README:
   - Are fees centralized (platform model)?
   - Or should creators receive fees (implementation bug)?

---

## CONCLUSION

The fee mechanism has **solid mathematical foundations** with proper overflow protection and vault validation. However, **CRITICAL centralization issues** exist:

1. **All fees go to single global recipient** (not pool creators)
2. **No mechanism to update fee recipient** (permanent lock-in)
3. **Misleading comments suggest creator fees** (but code sends to platform)

**If intentional (platform model):**
- Disclose prominently to pool creators
- Add fee recipient update function for emergencies
- Fix misleading comments

**If unintentional (bug):**
- Redesign to allow per-pool fee recipients
- Implement creator-controlled fee accounts
- Consider fee split (platform % + creator %)

**WAA bypasses exist** but require user action (transferring tokens, full exit/reentry). These can be mitigated with additional checks.

**Overall Security Grade:** B- (would be A- if fee recipient centralization is documented as intentional)

---

**End of Audit Report**
