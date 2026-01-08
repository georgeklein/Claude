# Scale AMM: Implementation Priorities

## TL;DR Recommendations

### WAA Anti-Snipe Proposal
**✅ IMPLEMENT IT** - The design is sound with minor modifications needed:

| Aspect | Verdict | Notes |
|--------|---------|-------|
| Core mechanism | ✅ Good | WAA prevents timestamp gaming |
| Slot-based timing | ✅ Good | Deterministic, gas-efficient |
| Decay curve (10%→1%→0%) | ✅ Good | Aggressive enough to deter, not punitive |
| Transfer handling | ⚠️ Needs work | Add "untracked = current slot" rule |
| Fee routing | ⚠️ Needs defaults | Recommend 50% LP / 30% treasury / 20% burn |

### Curve Expansion Strategy
**Phased approach recommended:**

```
NOW          → CPMM + WAA anti-snipe (differentiate on memes)
Month 3      → Bonding curves (compete with Pump.fun)
Month 6      → Prediction markets (unique CRX utility)
Month 9+     → CLMM, StableSwap, advanced features
```

### Prediction Markets
**✅ STRONG OPPORTUNITY** - No major Solana prediction market AMM exists

| Approach | Complexity | Recommendation |
|----------|------------|----------------|
| LMSR | Low | ✅ Start here - always liquid, simple |
| CPMM-based | Medium | Phase 2 for high-volume markets |
| Exotic (perps, options) | High | Future consideration |

---

## Immediate Action Items

### 1. Initialize the Project Structure
```bash
# Create Anchor project
anchor init scale_amm --javascript
cd scale_amm

# Project structure
programs/scale_amm/src/
├── lib.rs                 # Main entry point
├── state/
│   ├── mod.rs
│   ├── pool.rs           # PoolState
│   └── position.rs       # UserPosition (for WAA)
├── instructions/
│   ├── mod.rs
│   ├── initialize_pool.rs
│   ├── swap_buy.rs       # CRX → Token
│   ├── swap_sell.rs      # Token → CRX (with WAA fee)
│   ├── add_liquidity.rs
│   └── remove_liquidity.rs
├── curves/
│   ├── mod.rs
│   ├── curve_trait.rs    # CurveCalculator trait
│   ├── constant_product.rs
│   └── bonding.rs        # Future
└── utils/
    ├── mod.rs
    ├── math.rs           # u128 safe math
    └── waa.rs            # WAA calculation
```

### 2. Core Data Structures

```rust
// programs/scale_amm/src/state/pool.rs

#[account]
pub struct PoolState {
    pub bump: u8,
    pub token_mint: Pubkey,
    pub crx_mint: Pubkey,
    pub token_vault: Pubkey,
    pub crx_vault: Pubkey,
    pub lp_mint: Pubkey,

    // Reserves
    pub token_reserve: u64,
    pub crx_reserve: u64,

    // Fees
    pub base_fee_bps: u16,
    pub treasury_fee_bps: u16,  // Of extra snipe fee
    pub burn_fee_bps: u16,
    pub lp_rewards_fee_bps: u16,

    // WAA Anti-snipe config
    pub snipe_enabled: bool,
    pub snipe_t1_slots: u64,    // 75 (~30s)
    pub snipe_t2_slots: u64,    // 750 (~5m)
    pub snipe_t3_slots: u64,    // 4500 (~30m)
    pub snipe_f1_bps: u16,      // 1000 (10%)
    pub snipe_f2_bps: u16,      // 100 (1%)

    // Stats
    pub total_volume_crx: u128,
    pub total_fees_collected: u64,

    // Admin
    pub authority: Pubkey,
    pub is_paused: bool,
}

// programs/scale_amm/src/state/position.rs

#[account]
pub struct UserPosition {
    pub bump: u8,
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub avg_entry_slot: u64,
    pub tracked_amount: u64,
}
```

### 3. WAA Implementation

```rust
// programs/scale_amm/src/utils/waa.rs

pub fn update_waa(
    position: &mut UserPosition,
    buy_amount: u64,
    current_slot: u64,
) {
    if position.tracked_amount == 0 {
        position.avg_entry_slot = current_slot;
        position.tracked_amount = buy_amount;
    } else {
        // WAA = (old_amount * old_slot + new_amount * new_slot) / (old_amount + new_amount)
        let numerator = (position.tracked_amount as u128)
            .checked_mul(position.avg_entry_slot as u128)
            .unwrap()
            .checked_add(
                (buy_amount as u128).checked_mul(current_slot as u128).unwrap()
            )
            .unwrap();

        let denominator = (position.tracked_amount as u128)
            .checked_add(buy_amount as u128)
            .unwrap();

        position.avg_entry_slot = (numerator / denominator) as u64;
        position.tracked_amount = position.tracked_amount.checked_add(buy_amount).unwrap();
    }
}

pub fn calculate_extra_fee(
    pool: &PoolState,
    position: &UserPosition,
    current_slot: u64,
    sell_amount: u64,
    wallet_balance: u64,
) -> u16 {
    // Handle untracked tokens (transferred in) - treat as "just bought"
    let untracked = wallet_balance.saturating_sub(position.tracked_amount);

    let effective_entry_slot = if sell_amount <= position.tracked_amount {
        position.avg_entry_slot
    } else {
        // Blend tracked + untracked
        let tracked_portion = position.tracked_amount;
        let untracked_portion = sell_amount.saturating_sub(tracked_portion);

        let numerator = (tracked_portion as u128 * position.avg_entry_slot as u128)
            + (untracked_portion as u128 * current_slot as u128);
        let denominator = sell_amount as u128;

        (numerator / denominator) as u64
    };

    let age = current_slot.saturating_sub(effective_entry_slot);

    // Piecewise linear decay
    if age <= pool.snipe_t1_slots {
        pool.snipe_f1_bps // 10%
    } else if age <= pool.snipe_t2_slots {
        // Linear interpolation: F1 → F2
        let range = pool.snipe_t2_slots - pool.snipe_t1_slots;
        let progress = age - pool.snipe_t1_slots;
        let fee_range = pool.snipe_f1_bps - pool.snipe_f2_bps;

        pool.snipe_f2_bps + ((fee_range as u64 * (range - progress) / range) as u16)
    } else if age <= pool.snipe_t3_slots {
        // Linear interpolation: F2 → 0
        let range = pool.snipe_t3_slots - pool.snipe_t2_slots;
        let progress = age - pool.snipe_t2_slots;

        ((pool.snipe_f2_bps as u64 * (range - progress) / range) as u16)
    } else {
        0
    }
}
```

---

## Innovation Priorities (Ranked)

### Tier 1: Ship Now (High Impact, Lower Effort)

| Feature | Why | Effort |
|---------|-----|--------|
| **WAA Anti-Snipe** | Immediate differentiator for meme pools | 2 weeks |
| **Bonding Curves** | Compete with Pump.fun | 3 weeks |
| **Dynamic Fees** | LP protection, marketing story | 1 week |

### Tier 2: Build Next (High Impact, Medium Effort)

| Feature | Why | Effort |
|---------|-----|--------|
| **LMSR Prediction Markets** | Unique CRX utility, no competition | 4-6 weeks |
| **Time-Weighted LP Rewards** | Retain liquidity, reduce mercenary capital | 2 weeks |
| **Limit Orders** | User-requested, improves UX | 3 weeks |

### Tier 3: Future Roadmap (High Effort)

| Feature | Why | Effort |
|---------|-----|--------|
| **Concentrated Liquidity** | Capital efficiency, compete with Orca | 8-12 weeks |
| **StableSwap** | CRX/USDC pair optimization | 3-4 weeks |
| **Perpetual Futures** | Massive market, complex | 12-16 weeks |

---

## Prediction Market Quick-Start

### MVP Market Structure

```rust
#[account]
pub struct BinaryMarket {
    pub bump: u8,
    pub id: u64,                    // Market ID
    pub question: [u8; 256],        // UTF-8 question text
    pub creator: Pubkey,
    pub collateral_mint: Pubkey,    // CRX

    // LMSR parameters
    pub b: u64,                     // Liquidity parameter
    pub yes_shares: u64,
    pub no_shares: u64,

    // Resolution
    pub resolution_time: i64,
    pub resolution_source: ResolutionSource,
    pub resolved: bool,
    pub outcome: Option<bool>,      // true = YES, false = NO

    // Funds
    pub collateral_vault: Pubkey,
    pub total_collateral: u64,
}

pub enum ResolutionSource {
    Oracle { feed: Pubkey, threshold: u64, comparison: Comparison },
    Governance { authority: Pubkey },
    Optimistic { proposer: Pubkey, dispute_period: i64 },
}
```

### Example Markets to Launch

1. **"SOL > $300 by March 2026"** - Oracle resolution via Pyth
2. **"Scale AMM TVL > $10M by June 2026"** - On-chain data
3. **"BONK flips SHIB market cap"** - On-chain comparison
4. **"Next Solana NFT to 100K sales is [X]"** - Governance resolution

---

## Next Steps

1. **Today**: Review these docs, confirm priorities
2. **This Week**: Initialize Anchor project, implement PoolState
3. **Week 2**: Implement CPMM swap with WAA tracking
4. **Week 3-4**: Test, refine, add LP functionality
5. **Month 2**: Bonding curves + graduation mechanism
6. **Month 3**: LMSR prediction markets MVP

---

## Files Created

```
/home/user/Claude/docs/
├── WAA_FEE_ANALYSIS.md              # Detailed analysis of the anti-snipe proposal
├── CURVE_EXPANSION_AND_INNOVATION.md # Full curve types + prediction market guide
└── IMPLEMENTATION_PRIORITIES.md      # This file - action items and priorities
```
