# WAA-Based Decaying Extra Sell Fee - Analysis & Recommendation

## Executive Summary

**Verdict: ✅ IMPLEMENT WITH MODIFICATIONS**

The WAA (Weighted Average Entry) mechanism is a **solid anti-sniper design** that addresses real problems in meme token pools. However, there are several refinements needed for production readiness.

---

## What the Proposal Does Well

### 1. Correctly Identifies the Problem
Snipers and MEV bots extract value from meme pools by:
- Front-running launch announcements
- Buying early and dumping on retail
- Risk-free profit extraction within seconds

The 10% → 0% decay over 30 minutes creates meaningful friction for this behavior.

### 2. WAA is Clever Anti-Gaming Design
Simple "hold time" tracking can be gamed:
- Buy 1 token, wait 30 mins
- Buy 1000 tokens, sell immediately with "old" timestamp

**WAA prevents this** by weighting the entry slot by purchase size. Large late buys properly reset the average.

```
Example:
- Buy 100 tokens at slot 0
- Wait 750 slots (~5 min)
- Buy 10,000 tokens at slot 750

Simple timestamp: Entry = slot 0 (gamed!)
WAA: Entry = (100*0 + 10000*750) / 10100 = slot 742 (correct!)
```

### 3. Slot-Based Design is Correct for Solana
- No floating-point math needed
- Deterministic across validators
- ~400ms slots are granular enough for this use case
- Integer math is auditable and gas-efficient

### 4. Output-Based Fee is Clean UX
Applying the fee to CRX-out (not token-in) means:
- Users always know exactly how many tokens they're selling
- Fee calculation is transparent and predictable
- No weird partial-fill edge cases

---

## Concerns & Required Modifications

### 🔴 Critical Issue #1: Transfer-In Attack

**Problem:** Users can transfer tokens from another wallet to bypass WAA tracking.

```
Attack flow:
1. Wallet A buys 1000 tokens (avg_entry_slot = now)
2. Wallet A transfers 1000 tokens to Wallet B
3. Wallet B has NO UserPosition (or tracked_amount = 0)
4. Wallet B sells immediately with 0% extra fee
```

**Solutions (pick one):**

**Option A: Token-2022 Transfer Hook (Recommended)**
```rust
// On every transfer, update recipient's WAA
fn transfer_hook(from: Pubkey, to: Pubkey, amount: u64) {
    let from_pos = get_position(from);
    let to_pos = get_or_create_position(to);

    // Transfer inherits sender's avg_entry_slot
    to_pos.avg_entry_slot = weighted_avg(
        to_pos.tracked_amount, to_pos.avg_entry_slot,
        amount, from_pos.avg_entry_slot
    );
    to_pos.tracked_amount += amount;
    from_pos.tracked_amount -= amount;
}
```

**Option B: Untracked Balance = Slot 0**
```rust
// Any tokens beyond tracked_amount are treated as "just bought"
fn get_effective_entry(user: &UserPosition, sell_amount: u64, current_slot: u64) -> u64 {
    let wallet_balance = get_token_balance(user);
    let untracked = wallet_balance.saturating_sub(user.tracked_amount);

    if sell_amount <= user.tracked_amount {
        return user.avg_entry_slot; // All tracked, use WAA
    }

    // Blend tracked + untracked (untracked = current slot = max fee)
    let tracked_portion = user.tracked_amount;
    let untracked_portion = sell_amount - tracked_portion;

    weighted_avg(
        tracked_portion, user.avg_entry_slot,
        untracked_portion, current_slot  // Untracked = "just acquired"
    )
}
```

**Recommendation:** Option B is simpler and doesn't require Token-2022. It's conservative - transferred tokens pay full fee, which is actually desirable behavior.

---

### 🔴 Critical Issue #2: Fee Routing Not Specified

The spec mentions `treasury_bps`, `burn_bps`, `lp_rewards_bps` but doesn't define defaults.

**Recommended Default Split:**
```
treasury_bps:    3000  (30%) → Protocol revenue
burn_bps:        2000  (20%) → CRX deflation
lp_rewards_bps:  5000  (50%) → LP incentive to stay in pool
```

**Rationale:**
- LPs need compensation for providing exit liquidity to snipers
- Burn creates deflationary pressure on CRX (marketing value)
- Treasury funds development and operations

---

### 🟡 Moderate Issue #3: Decay Curve Shape

The linear piecewise decay is fine, but consider:

**Current (Linear):**
```
10% ──────────┐
              │
              └──── 1% ─────────┐
                                └──── 0%
0          75slots         750        4500
```

**Alternative (Exponential-ish with more granularity):**
```rust
// Smoother curve, harder to game timing
if age <= 75 {
    extra = 1000; // 10% flat for first 30s
} else if age <= 375 {  // 30s - 2.5min
    extra = 1000 - (age - 75) * 3; // 10% → 1% (faster initial decay)
} else if age <= 4500 {  // 2.5min - 30min
    extra = 100 - (age - 375) * 100 / 4125; // 1% → 0%
} else {
    extra = 0;
}
```

**Recommendation:** Start with linear (simpler to audit), optimize curve shape in v2 based on real trading data.

---

### 🟡 Moderate Issue #4: Dust Attack Prevention

**Problem:** Attackers could create millions of UserPosition PDAs with dust amounts to grief storage/rent.

**Solution:** Minimum position threshold
```rust
const MIN_TRACKED_AMOUNT: u64 = 1_000_000; // 0.001 tokens (6 decimals)

fn update_position(pos: &mut UserPosition, amount: u64, slot: u64) {
    if pos.tracked_amount == 0 && amount < MIN_TRACKED_AMOUNT {
        return; // Don't create PDA for dust
    }
    // ... normal WAA update
}
```

---

### 🟢 Critical: Full Configuration System Required

**This is permissionless DeFi - we can't iterate post-launch.** All options must be baked in from day 1.

See **[POOL_CONFIGURATION.md](./POOL_CONFIGURATION.md)** for the complete specification.

Key requirements:
1. **WAA on/off switch** per pool (some pools don't need it)
2. **Configurable decay curve** (thresholds, fees, shape)
3. **Multiple decay types** (linear, exponential, step, cliff)
4. **Untracked token policy** (how to handle transfers)
5. **Whitelist support** (exempt aggregators, known contracts)
6. **Grace period** (initial LP adds without penalty)
7. **Pool presets** (MemeToken, StablePair, FairLaunch, etc.)

```rust
pub struct WaaConfig {
    pub enabled: bool,              // ← THE ON/OFF SWITCH
    pub sell_only: bool,
    pub decay_type: DecayType,
    pub t1_slots: u64,              // 75 (~30s)
    pub t2_slots: u64,              // 750 (~5m)
    pub t3_slots: u64,              // 4500 (~30m)
    pub f1_bps: u16,                // 10%
    pub f2_bps: u16,                // 1%
    pub f3_bps: u16,                // 0%
    pub min_tracked_amount: u64,
    pub untracked_policy: UntrackedPolicy,
    pub grace_period_slots: u64,
    pub whitelist_enabled: bool,
}

pub enum DecayType {
    PiecewiseLinear,  // Current design
    Exponential,      // Smoother decay
    StepFunction,     // Discrete steps
    Cliff,            // Binary: max fee until T3, then 0
}
```

Pool creators pick their config at creation. Once live, WAA can only be **disabled** (never re-enabled) to prevent rug scenarios.

---

## Implementation Priority

### Ship This (All Required for v1 - No Iteration Possible)
- [ ] Full `WaaConfig` struct with all options
- [ ] On/off switch (`enabled: bool`)
- [ ] All decay types (Linear, Exponential, Step, Cliff)
- [ ] Untracked token policies (TreatAsNew, TreatAsOld, Blend, Block)
- [ ] Pool presets (MemeToken, StablePair, FairLaunch, Custom)
- [ ] Whitelist PDA for exempt addresses
- [ ] Grace period support
- [ ] Fee routing configuration
- [ ] Minimum tracked amount threshold
- [ ] Admin controls (pause, disable WAA, manage whitelist)

### Future Additions (Requires New Program Version)
- [ ] Token-2022 transfer hook integration
- [ ] Additional decay curve types
- [ ] Dynamic fee integration with WAA
- [ ] Cross-pool WAA tracking

---

## 🔴 Integration with Existing AMM (creator-amm-v2)

### Critical Design Conflicts

#### 1. Graduated Phase = Zero Fees (MUST RESPECT)

The existing AMM has a hard rule: **no fees after graduation**.

```rust
// creator-amm-v2/src/state.rs:165-170
pub fn get_current_fee_bps(&self) -> u16 {
    match self.current_phase {
        CurvePhase::PreBonding => self.fee_bps,
        CurvePhase::Graduated => 0,  // NO FEES after graduation!
    }
}
```

**WAA MUST only apply in `PreBonding` phase.** After graduation, pools become pure x*y=k AMMs with zero fees.

```rust
// CORRECT implementation
fn calculate_waa_fee(pool: &Pool, user_pos: &UserPosition, slot: u64) -> u16 {
    // WAA disabled after graduation
    if matches!(pool.current_phase, CurvePhase::Graduated) {
        return 0;
    }

    // WAA disabled if not enabled for this pool
    if !pool.waa_config.enabled {
        return 0;
    }

    // Normal WAA calculation...
    calculate_decay_fee(user_pos.avg_entry_slot, slot, &pool.waa_config)
}
```

#### 2. Existing Anti-Sniper Conflict

Current AMM already has anti-sniper protection:
```rust
// Config fields:
pub anti_sniper_window_slots: u64,   // ~20 slots (8 seconds)
pub anti_sniper_max_trade_bps: u16,  // 5% of supply max
```

**Integration rules:**
| Time Period | Existing Anti-Sniper | WAA Fee |
|-------------|---------------------|---------|
| 0-8 seconds | Trade size limit ✅ | 10% ✅ |
| 8s - 30 min | None | Decaying ✅ |
| 30+ min | None | 0% |

Both mechanisms can coexist - they protect different attack vectors.

#### 3. Pool State Size - Use Separate PDA

Adding WAA config to `Pool` struct would break existing pools (287 → 370+ bytes).

**Solution: Separate WaaPoolConfig PDA**

```rust
#[account]
pub struct WaaPoolConfig {
    pub bump: u8,
    pub pool: Pubkey,              // Parent pool

    // Config (immutable after creation)
    pub enabled: bool,
    pub decay_type: DecayType,
    pub t1_slots: u64,
    pub t2_slots: u64,
    pub t3_slots: u64,
    pub f1_bps: u16,
    pub f2_bps: u16,
    pub f3_bps: u16,
    pub min_tracked_amount: u64,
    pub untracked_policy: UntrackedPolicy,
    pub grace_period_slots: u64,

    // Fee routing
    pub treasury_bps: u16,
    pub burn_bps: u16,
    pub lp_rewards_bps: u16,

    // Mutable by admin
    pub whitelist_enabled: bool,
    pub paused: bool,
}

// Seeds: ["waa_config", pool.key()]
// Size: ~120 bytes
// Rent: ~0.001 SOL
```

This approach:
- ✅ No breaking changes to existing Pool struct
- ✅ Optional per-pool (not all pools need WAA)
- ✅ Can be added to existing pools retroactively
- ✅ Separate rent cost (pool creator pays)

---

## 🔴 Security Fixes Required

### Fix 1: Fee Application Order

**Problem:** WAA fee must not compound with base fee.

```rust
// ❌ WRONG - Compounds fees
let output_after_base = apply_base_fee(gross_output, base_fee_bps);
let output_after_waa = apply_waa_fee(output_after_base, waa_fee_bps);
// User pays: base_fee + waa_fee + (base_fee * waa_fee)
```

```rust
// ✅ CORRECT - Additive fees
let base_fee_amount = gross_output * base_fee_bps / 10000;
let waa_fee_amount = gross_output * waa_fee_bps / 10000;
let total_fee = base_fee_amount + waa_fee_amount;
let output = gross_output - total_fee;
// User pays exactly: base_fee + waa_fee
```

### Fix 2: Reserve Validation Timing

**Problem:** Current code validates reserves match vaults AFTER fee extraction:

```rust
// creator-amm-v2/src/instructions/sell.rs:324-331
require!(
    pool.real_quote_reserves == ctx.accounts.quote_vault.amount,
    ErrorCode::ReserveVaultMismatch
);
```

If WAA fees route to treasury/burn, vault balance won't match reserves.

**Solution:** Route WAA fees from user's received output, not from vault:

```rust
// Step 1: Calculate outputs
let quote_output_gross = pool.calculate_output(...);
let base_fee = quote_output_gross * base_fee_bps / 10000;
let quote_output_after_base = quote_output_gross - base_fee;

// Step 2: WAA fee calculated on post-base-fee output
let waa_fee = quote_output_after_base * waa_fee_bps / 10000;
let quote_output_final = quote_output_after_base - waa_fee;

// Step 3: Transfer from vault to user (output + waa_fee to be split)
token::transfer(vault → user, quote_output_after_base);

// Step 4: User's WAA fee gets split (separate instruction or CPI)
// This way vault balance stays consistent with reserves
```

**Alternative (simpler):** Route all WAA fees to a separate WAA fee vault, not touching main pool vault.

### Fix 3: Prevent WAA Config Manipulation

**Problem:** Admin could manipulate WAA config to extract user funds.

**Solution:** Immutable config with limited admin controls:

```rust
// IMMUTABLE after pool creation:
- decay_type, t1/t2/t3_slots, f1/f2/f3_bps
- min_tracked_amount, untracked_policy
- treasury_bps, burn_bps, lp_rewards_bps

// MUTABLE by admin (safety controls only):
- enabled: Can DISABLE only (bool can go true→false, never false→true)
- paused: Emergency pause (can toggle)
- whitelist: Add/remove addresses

// Enforced in instruction:
pub fn update_waa_config(ctx: Context<UpdateWaaConfig>, new_enabled: bool) -> Result<()> {
    let config = &mut ctx.accounts.waa_config;

    // Can only disable, never re-enable
    if config.enabled && !new_enabled {
        config.enabled = false;
        msg!("WAA disabled for pool");
    } else if !config.enabled && new_enabled {
        return Err(ErrorCode::CannotReenableWaa.into());
    }

    Ok(())
}
```

### Fix 4: Whitelist Bypass Prevention

**Problem:** Whitelisted addresses could be used to bypass WAA for non-whitelisted users.

```
Attack:
1. Whitelisted aggregator buys tokens (no WAA tracking)
2. Aggregator sells to user off-chain
3. User sells through aggregator (no WAA fee)
```

**Solution:** Track at user level, not transaction level:

```rust
// UserPosition is always per end-user wallet, never per aggregator
// Aggregator instructions must pass through user's WAA check

pub fn sell_via_aggregator(
    ctx: Context<SellViaAggregator>,
    amount: u64,
    min_out: u64,
) -> Result<()> {
    // Even if aggregator is whitelisted, check USER's position
    let user_position = &ctx.accounts.user_position;
    let waa_fee = calculate_waa_fee(user_position, ...);

    // Aggregator whitelist only exempts the aggregator's own holdings
    // Not holdings being sold on behalf of users
}
```

### Fix 5: Overflow Protection in WAA Calculation

```rust
pub fn calculate_waa(
    old_amount: u64,
    old_slot: u64,
    new_amount: u64,
    new_slot: u64,
) -> Result<u64> {
    // Use u128 to prevent overflow
    let numerator = (old_amount as u128)
        .checked_mul(old_slot as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_add(
            (new_amount as u128)
                .checked_mul(new_slot as u128)
                .ok_or(ErrorCode::MathOverflow)?
        )
        .ok_or(ErrorCode::MathOverflow)?;

    let denominator = (old_amount as u128)
        .checked_add(new_amount as u128)
        .ok_or(ErrorCode::MathOverflow)?;

    // Safe to cast back - result is always <= max(old_slot, new_slot)
    Ok((numerator / denominator) as u64)
}
```

---

## Gas/Compute Analysis

**Additional compute per swap:**

| Operation | Compute Units |
|-----------|---------------|
| Read UserPosition PDA | ~200 CU |
| WAA calculation (u128 math) | ~100 CU |
| Write UserPosition PDA | ~200 CU |
| Fee routing (3 transfers) | ~600 CU |
| **Total overhead** | **~1,100 CU** |

This is negligible (<1% of Solana's 1.4M CU limit). ✅

---

## Conclusion

**Implement it.** The WAA mechanism is:
- Mathematically sound
- Gas-efficient on Solana
- Effective against the target attack vector
- Not burdensome to legitimate traders (30 min is reasonable)

Just make sure to:
1. Handle transferred-in tokens (Option B recommended)
2. Define fee routing splits
3. Add minimum position threshold
4. Make parameters configurable for different pool types

The design shows good understanding of Solana constraints and meme coin market dynamics.
