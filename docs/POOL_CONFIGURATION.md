# Scale AMM: Pool Configuration Specification

## Design Philosophy

**This is permissionless DeFi.** Once deployed:
- Pools are immutable (with limited governance exceptions)
- You can't "iterate" - all options must exist from day 1
- Different pool types need different configurations
- Users/creators pick options at pool creation time

---

## Master Configuration Structure

```rust
#[account]
pub struct PoolState {
    // ═══════════════════════════════════════════════════════════════
    // IMMUTABLE (set at creation, never changes)
    // ═══════════════════════════════════════════════════════════════
    pub bump: u8,
    pub pool_id: u64,                    // Unique pool identifier
    pub token_mint: Pubkey,              // The meme/project token
    pub quote_mint: Pubkey,              // CRX (or SOL, USDC for some pools)
    pub token_vault: Pubkey,
    pub quote_vault: Pubkey,
    pub lp_mint: Pubkey,
    pub creator: Pubkey,                 // Pool creator (for analytics)
    pub created_slot: u64,

    // ═══════════════════════════════════════════════════════════════
    // CURVE CONFIGURATION (immutable - defines pool behavior)
    // ═══════════════════════════════════════════════════════════════
    pub curve_type: CurveType,
    pub curve_params: CurveParams,       // Type-specific parameters

    // ═══════════════════════════════════════════════════════════════
    // FEE CONFIGURATION
    // ═══════════════════════════════════════════════════════════════
    pub fee_config: FeeConfig,

    // ═══════════════════════════════════════════════════════════════
    // WAA ANTI-SNIPE CONFIGURATION
    // ═══════════════════════════════════════════════════════════════
    pub waa_config: WaaConfig,

    // ═══════════════════════════════════════════════════════════════
    // GOVERNANCE (limited mutability)
    // ═══════════════════════════════════════════════════════════════
    pub admin: Pubkey,                   // Can pause, update some params
    pub pending_admin: Option<Pubkey>,   // For 2-step admin transfer
    pub is_paused: bool,                 // Emergency pause
    pub pause_reason: [u8; 64],          // Optional reason string

    // ═══════════════════════════════════════════════════════════════
    // POOL STATE (dynamic, updated on every swap)
    // ═══════════════════════════════════════════════════════════════
    pub token_reserve: u64,
    pub quote_reserve: u64,
    pub lp_supply: u64,

    // ═══════════════════════════════════════════════════════════════
    // ANALYTICS (updated on swaps)
    // ═══════════════════════════════════════════════════════════════
    pub total_volume_quote: u128,        // Lifetime volume in quote token
    pub total_swaps: u64,
    pub total_fees_collected: u64,
    pub total_waa_fees_collected: u64,   // Anti-snipe fees specifically
}
```

---

## Curve Types

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq)]
pub enum CurveType {
    /// Standard x * y = k
    ConstantProduct,

    /// Curve-style low-slippage for pegged assets
    StableSwap,

    /// Bonding curve for token launches (price increases with supply)
    BondingLinear,
    BondingExponential,
    BondingSqrt,          // Pump.fun style

    /// Concentrated liquidity (requires separate TickArray accounts)
    Concentrated,

    /// LMSR for prediction markets
    LMSR,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct CurveParams {
    // StableSwap
    pub amplification: u64,              // A parameter (1-10000), 0 = not used

    // Bonding curves
    pub initial_price: u64,              // Starting price (scaled 1e9)
    pub final_price: u64,                // Target graduation price
    pub bonding_supply: u64,             // Tokens sold before graduation
    pub graduation_threshold: u64,       // Quote tokens needed to graduate

    // Concentrated liquidity
    pub tick_spacing: u16,               // 1, 10, 60, etc.
    pub default_fee_tier: u8,            // 0=0.01%, 1=0.05%, 2=0.3%, 3=1%

    // LMSR
    pub lmsr_b: u64,                     // Liquidity depth parameter

    // Reserved for future curve types
    pub _reserved: [u64; 8],
}
```

---

## Fee Configuration

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct FeeConfig {
    // ═══════════════════════════════════════════════════════════════
    // BASE FEES (applied to all swaps)
    // ═══════════════════════════════════════════════════════════════

    /// Base swap fee in basis points (e.g., 30 = 0.30%)
    /// Range: 0 - 10000 (0% - 100%)
    pub base_fee_bps: u16,

    /// Protocol's cut of base fees (goes to treasury)
    /// e.g., 1667 = 16.67% of fees → protocol, rest → LPs
    pub protocol_fee_bps: u16,

    // ═══════════════════════════════════════════════════════════════
    // DYNAMIC FEES (optional modifiers)
    // ═══════════════════════════════════════════════════════════════

    /// Enable/disable dynamic fee adjustments
    pub dynamic_fees_enabled: bool,

    /// Max fee multiplier during high volatility (100 = 1x, 200 = 2x, etc.)
    pub max_fee_multiplier: u16,

    /// Volatility threshold to start increasing fees (TWAP divergence bps)
    pub volatility_threshold_bps: u16,

    // ═══════════════════════════════════════════════════════════════
    // WAA FEE ROUTING (where anti-snipe fees go)
    // ═══════════════════════════════════════════════════════════════

    /// % of WAA fees to LP rewards vault
    pub waa_lp_bps: u16,                 // e.g., 5000 = 50%

    /// % of WAA fees to treasury
    pub waa_treasury_bps: u16,           // e.g., 3000 = 30%

    /// % of WAA fees to burn
    pub waa_burn_bps: u16,               // e.g., 2000 = 20%
    // Must sum to 10000

    // ═══════════════════════════════════════════════════════════════
    // SPECIAL FEES
    // ═══════════════════════════════════════════════════════════════

    /// Fee for adding liquidity (usually 0)
    pub add_liquidity_fee_bps: u16,

    /// Fee for removing liquidity (anti-rug, usually 0 or small)
    pub remove_liquidity_fee_bps: u16,

    /// Creator royalty on all trades (paid to pool creator)
    pub creator_fee_bps: u16,            // e.g., 100 = 1%

    pub _reserved: [u16; 4],
}
```

---

## WAA Anti-Snipe Configuration

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct WaaConfig {
    // ═══════════════════════════════════════════════════════════════
    // MASTER SWITCH
    // ═══════════════════════════════════════════════════════════════

    /// Enable/disable WAA anti-snipe for this pool
    pub enabled: bool,

    /// Apply WAA only to sells (true) or both buys and sells (false)
    pub sell_only: bool,

    // ═══════════════════════════════════════════════════════════════
    // DECAY CURVE PARAMETERS
    // ═══════════════════════════════════════════════════════════════

    /// Decay curve type
    pub decay_type: DecayType,

    /// Time thresholds (in slots, ~400ms each)
    pub t1_slots: u64,                   // End of max fee period (e.g., 75 = ~30s)
    pub t2_slots: u64,                   // Mid decay point (e.g., 750 = ~5m)
    pub t3_slots: u64,                   // Fee reaches zero (e.g., 4500 = ~30m)

    /// Fee levels (in basis points)
    pub f1_bps: u16,                     // Max fee (e.g., 1000 = 10%)
    pub f2_bps: u16,                     // Mid fee (e.g., 100 = 1%)
    pub f3_bps: u16,                     // Min fee (usually 0)

    // ═══════════════════════════════════════════════════════════════
    // ADVANCED OPTIONS
    // ═══════════════════════════════════════════════════════════════

    /// Minimum buy amount to track (prevents dust attacks)
    pub min_tracked_amount: u64,         // e.g., 1_000_000 (0.001 tokens @ 9 decimals)

    /// How to handle untracked tokens (transferred in from other wallets)
    pub untracked_policy: UntrackedPolicy,

    /// Grace period after pool creation where WAA is disabled
    /// Allows initial liquidity adds without penalty
    pub grace_period_slots: u64,         // e.g., 150 = ~1 minute

    /// Whitelist for addresses exempt from WAA (e.g., known aggregators)
    /// Stored separately in WhitelistAccount PDA
    pub whitelist_enabled: bool,

    pub _reserved: [u64; 4],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq)]
pub enum DecayType {
    /// Fee stays at f1 until t1, then linear decay to f2 at t2, then to f3 at t3
    PiecewiseLinear,

    /// Exponential decay: fee = f1 * e^(-k * age)
    Exponential,

    /// Step function: f1 until t1, f2 until t2, f3 until t3, then 0
    StepFunction,

    /// Instant: f1 until t3, then 0 (simple hold timer)
    Cliff,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq)]
pub enum UntrackedPolicy {
    /// Untracked tokens treated as "just bought" (pay max fee) - RECOMMENDED
    TreatAsNew,

    /// Untracked tokens treated as "old" (pay no fee) - NOT RECOMMENDED
    TreatAsOld,

    /// Blend untracked with tracked using current slot as entry
    BlendWithCurrent,

    /// Block sells of untracked tokens entirely (strict mode)
    BlockUntracked,
}
```

---

## Pool Presets (Factory Templates)

Pool creators can use presets or fully customize:

```rust
pub enum PoolPreset {
    /// Meme token launch pool
    /// - CPMM curve
    /// - WAA enabled (10% → 1% → 0% over 30m)
    /// - 0.3% base fee
    /// - 1% creator fee
    MemeToken,

    /// Stable pair (e.g., USDC/USDT equivalent)
    /// - StableSwap curve (A=100)
    /// - WAA disabled
    /// - 0.04% base fee
    /// - No creator fee
    StablePair,

    /// Blue chip token
    /// - CPMM curve
    /// - WAA disabled
    /// - 0.3% base fee
    /// - No creator fee
    BlueChip,

    /// Fair launch bonding curve
    /// - Sqrt bonding curve
    /// - WAA enabled (aggressive: 15% → 0% over 1h)
    /// - 1% base fee
    /// - 2% creator fee
    FairLaunch,

    /// Prediction market
    /// - LMSR curve
    /// - WAA disabled
    /// - 0.1% base fee
    PredictionMarket,

    /// Fully custom configuration
    Custom,
}

impl PoolPreset {
    pub fn to_configs(&self) -> (CurveType, CurveParams, FeeConfig, WaaConfig) {
        match self {
            PoolPreset::MemeToken => (
                CurveType::ConstantProduct,
                CurveParams::default(),
                FeeConfig {
                    base_fee_bps: 30,
                    protocol_fee_bps: 1667,
                    creator_fee_bps: 100,
                    waa_lp_bps: 5000,
                    waa_treasury_bps: 3000,
                    waa_burn_bps: 2000,
                    ..Default::default()
                },
                WaaConfig {
                    enabled: true,
                    sell_only: true,
                    decay_type: DecayType::PiecewiseLinear,
                    t1_slots: 75,      // 30 seconds
                    t2_slots: 750,     // 5 minutes
                    t3_slots: 4500,    // 30 minutes
                    f1_bps: 1000,      // 10%
                    f2_bps: 100,       // 1%
                    f3_bps: 0,
                    min_tracked_amount: 1_000_000,
                    untracked_policy: UntrackedPolicy::TreatAsNew,
                    grace_period_slots: 0,
                    whitelist_enabled: false,
                    ..Default::default()
                },
            ),

            PoolPreset::StablePair => (
                CurveType::StableSwap,
                CurveParams {
                    amplification: 100,
                    ..Default::default()
                },
                FeeConfig {
                    base_fee_bps: 4,   // 0.04%
                    protocol_fee_bps: 5000, // 50% to protocol
                    creator_fee_bps: 0,
                    ..Default::default()
                },
                WaaConfig {
                    enabled: false,    // No WAA for stable pairs
                    ..Default::default()
                },
            ),

            PoolPreset::FairLaunch => (
                CurveType::BondingSqrt,
                CurveParams {
                    initial_price: 1_000_000,     // 0.001 CRX
                    final_price: 100_000_000,     // 0.1 CRX (100x)
                    bonding_supply: 800_000_000_000_000, // 800M tokens
                    graduation_threshold: 69_000_000_000, // 69K CRX to graduate
                    ..Default::default()
                },
                FeeConfig {
                    base_fee_bps: 100, // 1%
                    creator_fee_bps: 200, // 2%
                    ..Default::default()
                },
                WaaConfig {
                    enabled: true,
                    sell_only: true,
                    decay_type: DecayType::PiecewiseLinear,
                    t1_slots: 150,     // 1 minute
                    t2_slots: 2250,    // 15 minutes
                    t3_slots: 9000,    // 1 hour
                    f1_bps: 1500,      // 15%
                    f2_bps: 200,       // 2%
                    f3_bps: 0,
                    untracked_policy: UntrackedPolicy::TreatAsNew,
                    ..Default::default()
                },
            ),

            // ... other presets
        }
    }
}
```

---

## What CAN Be Changed Post-Creation (Governance)

| Parameter | Mutable? | By Whom | Constraints |
|-----------|----------|---------|-------------|
| `is_paused` | ✅ | Admin | Can pause/unpause |
| `admin` | ✅ | Admin | 2-step transfer |
| `protocol_fee_bps` | ✅ | Protocol DAO | Max 50% of fees |
| `waa_config.enabled` | ⚠️ | Admin | Can only DISABLE, never re-enable |
| `waa_config.whitelist` | ✅ | Admin | Add/remove addresses |
| `curve_type` | ❌ | - | Immutable |
| `curve_params` | ❌ | - | Immutable |
| `base_fee_bps` | ❌ | - | Immutable |
| `creator_fee_bps` | ❌ | - | Immutable |
| Token mints | ❌ | - | Immutable |

**Key principle:** Anything that could be used to rug users is immutable. Only safety features (pause, whitelist) and protocol revenue can be changed.

---

## WAA On/Off Switch: Implementation

```rust
// In swap_sell instruction

pub fn swap_sell(ctx: Context<SwapSell>, token_in: u64, min_quote_out: u64) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let clock = Clock::get()?;

    // Execute base swap (same regardless of WAA)
    let quote_out_gross = pool.curve.calculate_swap_output(
        token_in,
        pool.token_reserve,
        pool.quote_reserve,
        pool.fee_config.base_fee_bps,
    )?;

    // ═══════════════════════════════════════════════════════════════
    // WAA CHECK - Skip entirely if disabled
    // ═══════════════════════════════════════════════════════════════
    let extra_fee = if pool.waa_config.enabled {
        // Check grace period
        let pool_age = clock.slot.saturating_sub(pool.created_slot);
        if pool_age < pool.waa_config.grace_period_slots {
            0 // Still in grace period
        } else {
            // Check whitelist
            if pool.waa_config.whitelist_enabled && is_whitelisted(&ctx.accounts.user.key()) {
                0 // Whitelisted address
            } else {
                // Calculate WAA fee
                calculate_waa_fee(
                    &pool.waa_config,
                    &ctx.accounts.user_position,
                    clock.slot,
                    token_in,
                    ctx.accounts.user_token_account.amount,
                )?
            }
        }
    } else {
        0 // WAA disabled for this pool
    };

    // Apply extra fee
    let extra_fee_amount = quote_out_gross * extra_fee as u64 / 10000;
    let quote_out_net = quote_out_gross - extra_fee_amount;

    require!(quote_out_net >= min_quote_out, ErrorCode::SlippageExceeded);

    // Transfer and route fees...

    Ok(())
}
```

---

## Account Size Estimation

```
PoolState size:
- Fixed fields: ~200 bytes
- CurveParams: ~120 bytes
- FeeConfig: ~40 bytes
- WaaConfig: ~80 bytes
- Reserved: ~64 bytes
- Total: ~504 bytes

Rent: ~0.0035 SOL per pool (one-time, reclaimable)
```

---

## Summary: All Configuration Options

| Category | Option | Range | Default (Meme) |
|----------|--------|-------|----------------|
| **Curve** | Type | CPMM/Stable/Bonding/CLMM/LMSR | CPMM |
| | Amplification (Stable) | 1-10000 | 100 |
| | Initial Price (Bonding) | 1-u64::MAX | 0.001 CRX |
| | Tick Spacing (CLMM) | 1/10/60/200 | 60 |
| **Fees** | Base Fee | 0-10000 bps | 30 (0.3%) |
| | Protocol Cut | 0-5000 bps | 1667 (16.67%) |
| | Creator Fee | 0-1000 bps | 100 (1%) |
| | Dynamic Fees | on/off | off |
| **WAA** | Enabled | on/off | **on** |
| | Sell Only | on/off | on |
| | Decay Type | Linear/Exp/Step/Cliff | Linear |
| | T1 (max fee ends) | 0-u64 slots | 75 (~30s) |
| | T2 (mid decay) | 0-u64 slots | 750 (~5m) |
| | T3 (zero fee) | 0-u64 slots | 4500 (~30m) |
| | F1 (max fee) | 0-5000 bps | 1000 (10%) |
| | F2 (mid fee) | 0-2000 bps | 100 (1%) |
| | Min Tracked | 0-u64 | 1M (0.001) |
| | Untracked Policy | New/Old/Blend/Block | TreatAsNew |
| | Grace Period | 0-u64 slots | 0 |
| | Whitelist | on/off | off |
| **WAA Routing** | LP % | 0-10000 | 5000 (50%) |
| | Treasury % | 0-10000 | 3000 (30%) |
| | Burn % | 0-10000 | 2000 (20%) |

This gives you **complete flexibility at pool creation** while maintaining safety guarantees once live.
