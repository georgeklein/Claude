# WAA (Weighted Average Anti-Dump) - Quick Reference

**Purpose:** Prevent immediate sell-offs by applying time-decaying fees on sells

---

## Constants (from constants.rs)

| Constant | Value | Time | Description |
|----------|-------|------|-------------|
| `WAA_TIER1_SLOTS` | 75 | ~30 seconds | Maximum fee threshold |
| `WAA_TIER2_SLOTS` | 750 | ~5 minutes | Minimum fee threshold |
| `WAA_TIER3_SLOTS` | 4500 | ~30 minutes | Zero fee threshold |
| `WAA_FEE_MAX` | 1000 bps | 10% | Maximum extra sell fee |
| `WAA_FEE_MIN` | 100 bps | 1% | Minimum extra sell fee |
| `WAA_DECAY_RANGE` | 900 bps | 9% | Fee decay range (max - min) |
| `WAA_TIME_RANGE_1` | 675 slots | ~4.5 min | Decay period 1 (T2 - T1) |
| `WAA_TIME_RANGE_2` | 3750 slots | ~25 min | Decay period 2 (T3 - T2) |

*Note: Slot duration ~400ms on Solana*

---

## Fee Calculation Formula

```rust
age = current_slot - avg_entry_slot

if age <= 75:
    fee = 1000 bps  // 10%

else if age <= 750:
    // Linear decay from 10% to 1%
    time_remaining = 750 - age
    fee = 100 + (900 * time_remaining / 675)

else if age <= 4500:
    // Linear decay from 1% to 0%
    time_remaining = 4500 - age
    fee = 100 * time_remaining / 3750

else:
    fee = 0 bps  // 0%
```

---

## Weighted Average Entry Slot

**Formula:**
```
new_avg = (old_amount * old_avg + new_amount * current_slot) / (old_amount + new_amount)
```

**Example:**
- Buy 1000 tokens at slot 100
- avg_entry_slot = 100
- Buy 500 more tokens at slot 200
- new_avg = (1000 * 100 + 500 * 200) / (1000 + 500) = 133.33 → 133

---

## Fee Examples

| Hold Time | Slots | Fee (%) | Fee (bps) |
|-----------|-------|---------|-----------|
| 0 seconds | 0 | 10.00% | 1000 |
| 30 seconds | 75 | 10.00% | 1000 |
| 1 minute | 150 | 8.00% | 800 |
| 2 minutes | 300 | 5.33% | 533 |
| 5 minutes | 750 | 1.00% | 100 |
| 10 minutes | 1500 | 0.67% | 67 |
| 20 minutes | 3000 | 0.40% | 40 |
| 30 minutes | 4500 | 0.00% | 0 |
| 60 minutes | 9000 | 0.00% | 0 |

---

## disable_waa Flag

**Location:** `Pool.disable_waa` (boolean field)

**When false (default):**
- WAA fees apply to all sells
- Fee decays over 30 minutes
- Prevents immediate dumps

**When true:**
- WAA fees are skipped (`extra_fee_bps = 0`)
- Only base pool fee applies
- Pure permissionless trading

**Implementation:** `sell.rs:127-132`

```rust
let extra_fee_bps = if pool.disable_waa {
    0
} else {
    user_position.calculate_extra_sell_fee_bps(clock.slot)?
};
```

---

## Position Tracking

### On Buy:
```rust
// First buy: set avg_entry_slot = current_slot
// Subsequent buys: update weighted average
new_avg = (tracked_amount * avg_entry_slot + buy_amount * current_slot)
          / (tracked_amount + buy_amount)
tracked_amount += buy_amount
```

### On Sell:
```rust
tracked_amount -= sell_amount

// If fully sold:
if tracked_amount == 0 {
    avg_entry_slot = 0  // Reset position
}
```

---

## User-Facing Explanations

### For Traders:
> **What is WAA?**
> A time-based fee that discourages immediate selling. If you sell within 30 seconds, you pay an extra 10% fee. This fee decays to 1% after 5 minutes, and 0% after 30 minutes.
>
> **Why does it exist?**
> Prevents snipers from buying at launch and immediately dumping, which would hurt other traders. Encourages holding for at least a few minutes.
>
> **How to avoid it?**
> Hold your tokens for 30 minutes before selling. After that, there's no extra fee.

### For Pool Creators:
> **Should I enable WAA?**
> - **Yes** if you want to discourage immediate dumps and encourage longer holds
> - **No** if you want pure permissionless trading with no restrictions
>
> Set `disable_waa = true` when creating the pool to skip WAA fees entirely.

---

## Common Calculations

### Calculate hold time from slots:
```
seconds = slots * 0.4
minutes = slots * 0.4 / 60
```

### Calculate fee from hold time:
```javascript
function calculateWaaFee(slots) {
    if (slots <= 75) return 1000;
    if (slots <= 750) return 100 + Math.floor(900 * (750 - slots) / 675);
    if (slots <= 4500) return Math.floor(100 * (4500 - slots) / 3750);
    return 0;
}
```

### Calculate effective sell fee:
```
effective_fee = base_pool_fee + waa_fee
total_fee_amount = sell_output * effective_fee / 10000
user_receives = sell_output - total_fee_amount
```

---

## Security Notes

✅ **Overflow Protection:** All arithmetic uses `checked_mul` and `checked_div`
✅ **Slot Manipulation Resistant:** `current_slot` comes from Solana runtime (cannot be faked)
✅ **Independent Positions:** Each user has separate position tracking per pool
✅ **No Reentrancy:** CEI pattern (Checks-Effects-Interactions) prevents attacks

---

## Testing

**Test File:** `/tests/waa-comprehensive.ts`

**Run tests:**
```bash
anchor test tests/waa-comprehensive.ts
```

**Key test categories:**
1. Boundary tests (T1, T2, T3)
2. Linear interpolation tests
3. Weighted average calculations
4. Position tracking (buy/sell)
5. Multi-user scenarios
6. Edge cases

---

## Files

| File | Purpose |
|------|---------|
| `constants.rs` | WAA constants definition |
| `state.rs` | UserPosition struct + fee calculation |
| `sell.rs` | WAA fee application in sell logic |
| `tests/waa-comprehensive.ts` | Complete test suite |

---

**Last Updated:** 2026-01-08
**Implementation Version:** v2 (Scale AMM)
