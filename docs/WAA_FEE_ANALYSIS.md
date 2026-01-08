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

### 🟢 Minor Issue #5: Constants Should Be Configurable

Hardcoded slot thresholds are fine for v1, but consider:

```rust
pub struct PoolConfig {
    // ... existing fields

    // Anti-snipe config (optional, defaults shown)
    pub snipe_t1_slots: u64,        // default: 75
    pub snipe_t2_slots: u64,        // default: 750
    pub snipe_t3_slots: u64,        // default: 4500
    pub snipe_f1_bps: u16,          // default: 1000 (10%)
    pub snipe_f2_bps: u16,          // default: 100  (1%)
    pub snipe_enabled: bool,        // default: true for meme pools
}
```

This allows:
- Different pools to have different decay rates
- Disabling the feature for non-meme pools (e.g., CRX/USDC stable pair)
- Governance-controlled parameter updates

---

## Implementation Priority

### Phase 1: MVP (Ship This)
- [x] Basic WAA tracking on buys
- [x] Piecewise linear fee decay
- [x] Fixed 50/30/20 fee routing (LP/treasury/burn)
- [x] Option B for transfer handling (untracked = current slot)
- [x] Minimum position threshold

### Phase 2: Refinements
- [ ] Configurable pool parameters
- [ ] Optimized decay curve based on data
- [ ] Token-2022 transfer hook integration
- [ ] Analytics dashboard for fee collection

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
