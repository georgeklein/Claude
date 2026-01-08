# Scale AMM: Curve Expansion & Innovation Roadmap

## Overview

This document outlines strategies for expanding the Scale AMM beyond basic CPMM, including:
1. Pluggable curve architecture
2. Prediction markets using CRX
3. Novel AMM mechanisms
4. Implementation priorities

---

## Part 1: Pluggable Curve Architecture

### The Vision

Create a **curve registry** where anyone can deploy new curve types that plug into the Scale AMM infrastructure. Think "Uniswap V4 hooks" but for entire curve mathematics.

```
┌─────────────────────────────────────────────────────────┐
│                    Scale AMM Core                        │
├─────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
│  │  CPMM   │  │ Stable  │  │ Bonding │  │ Custom  │    │
│  │  Curve  │  │  Swap   │  │  Curve  │  │ Curve   │    │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘    │
│       │            │            │            │          │
│       └────────────┴────────────┴────────────┘          │
│                         │                               │
│              ┌──────────▼──────────┐                   │
│              │   Curve Interface   │                   │
│              │  - get_amount_out() │                   │
│              │  - get_amount_in()  │                   │
│              │  - get_price()      │                   │
│              └─────────────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

### Curve Interface (Anchor Trait)

```rust
/// All curves must implement this interface
pub trait CurveCalculator {
    /// Calculate output amount for a given input
    fn swap_output(
        &self,
        input_amount: u64,
        input_reserve: u64,
        output_reserve: u64,
        fee_bps: u16,
    ) -> Result<SwapResult>;

    /// Calculate input needed for a desired output
    fn swap_input(
        &self,
        output_amount: u64,
        input_reserve: u64,
        output_reserve: u64,
        fee_bps: u16,
    ) -> Result<SwapResult>;

    /// Get current spot price (scaled by 1e9)
    fn get_price(
        &self,
        base_reserve: u64,
        quote_reserve: u64,
    ) -> u64;

    /// Validate curve parameters
    fn validate_params(&self) -> Result<()>;
}

pub struct SwapResult {
    pub amount: u64,
    pub fee: u64,
    pub price_impact_bps: u16,
}
```

### Built-in Curve Types

#### 1. Constant Product (CPMM)
```rust
pub struct ConstantProductCurve;

impl CurveCalculator for ConstantProductCurve {
    fn swap_output(&self, input: u64, in_reserve: u64, out_reserve: u64, fee_bps: u16) -> Result<SwapResult> {
        // x * y = k
        // (x + dx) * (y - dy) = k
        // dy = y - k / (x + dx) = y * dx / (x + dx)

        let input_with_fee = input as u128 * (10000 - fee_bps as u128) / 10000;
        let numerator = input_with_fee * out_reserve as u128;
        let denominator = in_reserve as u128 + input_with_fee;
        let output = (numerator / denominator) as u64;

        Ok(SwapResult {
            amount: output,
            fee: input - (input_with_fee as u64),
            price_impact_bps: calculate_impact(input, in_reserve),
        })
    }
}
```

#### 2. StableSwap (Curve-style)
```rust
pub struct StableSwapCurve {
    pub amplification: u64,  // A parameter (typically 10-1000)
}

impl CurveCalculator for StableSwapCurve {
    fn swap_output(&self, input: u64, in_reserve: u64, out_reserve: u64, fee_bps: u16) -> Result<SwapResult> {
        // StableSwap invariant: A*n^n * sum(x_i) + D = A*D*n^n + D^(n+1) / (n^n * prod(x_i))
        // For 2 tokens, solve iteratively using Newton's method

        let d = compute_d(self.amplification, in_reserve, out_reserve)?;
        let new_in_reserve = in_reserve + input;
        let new_out_reserve = compute_y(self.amplification, new_in_reserve, d)?;
        let output = out_reserve - new_out_reserve;

        // Apply fee
        let fee = output * fee_bps as u64 / 10000;

        Ok(SwapResult {
            amount: output - fee,
            fee,
            price_impact_bps: calculate_stable_impact(input, in_reserve, out_reserve, self.amplification),
        })
    }
}
```

#### 3. Bonding Curve (Launch Curve)
```rust
pub struct BondingCurve {
    pub curve_type: BondingCurveType,
    pub initial_price: u64,      // Starting price in CRX (scaled 1e9)
    pub final_price: u64,        // Target price for graduation
    pub total_supply: u64,       // Max tokens to sell on curve
}

pub enum BondingCurveType {
    Linear,       // price = m * supply + b
    Exponential,  // price = a * e^(k * supply)
    Sigmoid,      // price = L / (1 + e^(-k*(supply-mid)))
    SquareRoot,   // price = a * sqrt(supply) + b (Pump.fun style)
}

impl CurveCalculator for BondingCurve {
    fn swap_output(&self, crx_in: u64, token_sold: u64, _: u64, fee_bps: u16) -> Result<SwapResult> {
        // For bonding curves, we integrate under the price curve
        // tokens_out = integral from token_sold to token_sold + delta

        let tokens_out = match self.curve_type {
            BondingCurveType::Linear => {
                // P = m*S + b, integral = m*S^2/2 + b*S
                // Solve for delta given CRX input
                solve_linear_integral(crx_in, token_sold, self.initial_price, self.final_price, self.total_supply)
            },
            BondingCurveType::SquareRoot => {
                // P = a * sqrt(S), integral = (2/3)*a*S^(3/2)
                solve_sqrt_integral(crx_in, token_sold, self.initial_price, self.total_supply)
            },
            // ... other curve types
        }?;

        let fee = tokens_out * fee_bps as u64 / 10000;
        Ok(SwapResult { amount: tokens_out - fee, fee, price_impact_bps: 0 })
    }
}
```

#### 4. Concentrated Liquidity (CLMM)
```rust
pub struct ConcentratedLiquidityCurve {
    pub tick_spacing: u16,        // e.g., 1, 10, 60
    pub current_tick: i32,        // Current price tick
    pub current_sqrt_price: u128, // sqrt(price) * 2^64
}

// This requires additional state: TickArray accounts
// Each position is bounded by [tick_lower, tick_upper]
// Swap iterates through ticks, consuming liquidity in each range
```

---

## Part 2: Prediction Markets with CRX

### Why Prediction Markets?

1. **Massive untapped market** - Polymarket did $1B+ volume in 2024
2. **CRX utility** - All markets settle in CRX, creating demand
3. **Differentiation** - No major Solana prediction market AMM exists
4. **Meme synergy** - Prediction markets on meme coin outcomes ("Will BONK hit $0.01?")

### Architecture Options

#### Option A: LMSR-Based (Recommended for v1)

```
┌─────────────────────────────────────────────────────────┐
│                  Prediction Market                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│   Market: "Will SOL reach $500 by Dec 2025?"            │
│                                                          │
│   ┌─────────────┐         ┌─────────────┐               │
│   │    YES      │         │     NO      │               │
│   │   Token     │◄───────►│   Token     │               │
│   │             │   LMSR  │             │               │
│   └─────────────┘  Curve  └─────────────┘               │
│                                                          │
│   Resolution: Oracle / UMA / Governance                  │
│   Settlement: Winner redeems for 1 CRX per token        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**LMSR Implementation:**

```rust
pub struct LMSRMarket {
    pub b: u64,                    // Liquidity parameter (higher = more liquid, higher subsidy)
    pub outcomes: Vec<Outcome>,    // e.g., [YES, NO] or [A, B, C, D]
    pub resolution_time: i64,      // Unix timestamp
    pub oracle: Pubkey,            // Resolution authority
    pub collateral_mint: Pubkey,   // CRX
    pub total_shares: Vec<u64>,    // Shares outstanding per outcome
    pub resolved: bool,
    pub winning_outcome: Option<u8>,
}

impl LMSRMarket {
    /// Cost to buy `amount` shares of outcome `i`
    /// C(q) = b * ln(sum(e^(q_i/b)))
    /// cost = C(q + delta) - C(q)
    pub fn cost_to_buy(&self, outcome: u8, amount: u64) -> u64 {
        let c_before = self.cost_function();

        let mut new_shares = self.total_shares.clone();
        new_shares[outcome as usize] += amount;

        let c_after = self.cost_function_with(&new_shares);

        (c_after - c_before) as u64
    }

    /// Current probability of outcome i
    /// P(i) = e^(q_i/b) / sum(e^(q_j/b))
    pub fn probability(&self, outcome: u8) -> u64 {
        // Returns probability scaled by 1e9
        let exp_sum: f64 = self.total_shares.iter()
            .map(|&q| ((q as f64) / (self.b as f64)).exp())
            .sum();

        let exp_i = ((self.total_shares[outcome as usize] as f64) / (self.b as f64)).exp();

        ((exp_i / exp_sum) * 1_000_000_000.0) as u64
    }
}
```

**Advantages:**
- Always liquid (no LPs needed)
- Prices always sum to 100%
- Well-studied, proven mechanism
- Simple to implement

**Disadvantages:**
- Requires subsidy (b parameter = max loss for market maker)
- Spread is implicit, not explicit fees

#### Option B: CPMM Prediction Markets

Use standard AMM pools where:
- YES token + NO token always redeemable for 1 CRX
- Arbitrageurs keep prices summing to ~1

```rust
pub struct CPMMPredictionMarket {
    pub yes_pool: Pubkey,          // YES/CRX pool
    pub no_pool: Pubkey,           // NO/CRX pool
    pub resolution_time: i64,
    pub oracle: Pubkey,
}

// Arbitrage mechanism:
// If P(YES) + P(NO) < 1: Buy both, instant profit
// If P(YES) + P(NO) > 1: Mint YES+NO, sell both
```

**Advantages:**
- Uses existing AMM infrastructure
- LPs earn fees
- More capital efficient

**Disadvantages:**
- LPs face adverse selection (informed traders profit at LP expense)
- Need deep liquidity to avoid manipulation
- More complex UX

### Recommended: Hybrid Approach

```
Phase 1: LMSR for binary markets
- Simple YES/NO markets
- Subsidized by protocol (marketing cost)
- Build user base and volume

Phase 2: CPMM for high-volume markets
- Migrate popular markets to CPMM
- LPs can provide liquidity
- Better capital efficiency

Phase 3: Exotic markets
- Multi-outcome (elections, sports)
- Scalar markets (price predictions)
- Conditional markets (if X then Y)
```

### Market Types to Launch

| Category | Example Markets | Settlement |
|----------|-----------------|------------|
| **Crypto** | "SOL > $500 by Dec 2025" | Pyth oracle |
| **Meme Coins** | "BONK market cap > DOGE" | On-chain data |
| **Protocol** | "Scale AMM TVL > $100M" | On-chain query |
| **Sports** | "Lakers win NBA Finals" | UMA optimistic oracle |
| **Politics** | "Trump wins 2028" | Multi-sig committee |
| **Meta** | "This market resolves YES" | 50/50 random |

### Resolution Mechanisms

```rust
pub enum ResolutionMechanism {
    /// Pyth/Switchboard price feed
    OraclePrice {
        oracle: Pubkey,
        threshold: u64,
        comparison: Comparison, // >, <, ==
    },

    /// On-chain account data (TVL, supply, etc.)
    OnChainData {
        account: Pubkey,
        offset: usize,
        threshold: u64,
    },

    /// UMA optimistic oracle (dispute period)
    Optimistic {
        proposer_bond: u64,
        dispute_period: i64,
        escalation_manager: Pubkey,
    },

    /// Multi-sig governance vote
    Governance {
        threshold: u8,
        signers: Vec<Pubkey>,
    },
}
```

---

## Part 3: Other Innovative AMM Ideas

### 1. Dynamic Fee Curves

Instead of flat fees, adjust based on market conditions:

```rust
pub struct DynamicFeeCalculator {
    pub base_fee_bps: u16,         // e.g., 30 bps
    pub volatility_multiplier: u16, // 0-200 (0% - 200% of base)
    pub imbalance_multiplier: u16,  // 0-200
}

impl DynamicFeeCalculator {
    pub fn calculate_fee(&self, pool: &PoolState, trade_direction: Direction) -> u16 {
        let vol_fee = self.volatility_fee(pool);
        let imb_fee = self.imbalance_fee(pool, trade_direction);

        self.base_fee_bps + vol_fee + imb_fee
    }

    fn volatility_fee(&self, pool: &PoolState) -> u16 {
        // Higher fee when TWAP diverges from spot price
        let twap = pool.twap_price;
        let spot = pool.current_price;
        let divergence = abs_diff(twap, spot) * 10000 / twap;

        (divergence as u16).min(self.base_fee_bps * self.volatility_multiplier / 100)
    }

    fn imbalance_fee(&self, pool: &PoolState, direction: Direction) -> u16 {
        // Higher fee for trades that increase imbalance
        let ratio = pool.token_reserve * 100 / pool.crx_reserve;

        match direction {
            Direction::BuyCRX if ratio > 110 => self.base_fee_bps / 2, // Discount for rebalancing
            Direction::SellCRX if ratio > 110 => self.base_fee_bps,    // Penalty for imbalancing
            Direction::BuyCRX if ratio < 90 => self.base_fee_bps,
            Direction::SellCRX if ratio < 90 => self.base_fee_bps / 2,
            _ => 0,
        }
    }
}
```

### 2. Time-Weighted Liquidity Rewards

Reward LPs who stay longer, penalize mercenary capital:

```rust
pub struct LPPosition {
    pub liquidity: u64,
    pub entry_slot: u64,
    pub accumulated_time_weight: u128,
}

impl LPPosition {
    /// Boost factor based on time in pool
    /// 1x at 0 days, 2x at 30 days, 3x at 90 days, max 4x at 180+ days
    pub fn time_boost(&self, current_slot: u64) -> u64 {
        let slots_held = current_slot - self.entry_slot;
        let days_held = slots_held / (24 * 60 * 60 * 1000 / 400); // ~216,000 slots/day

        match days_held {
            0..=29 => 100 + days_held * 100 / 30,        // 1x → 2x
            30..=89 => 200 + (days_held - 30) * 100 / 60, // 2x → 3x
            90..=179 => 300 + (days_held - 90) * 100 / 90, // 3x → 4x
            _ => 400, // Max 4x
        }
    }
}
```

### 3. Limit Orders via AMM

Implement on-chain limit orders that execute when price crosses threshold:

```rust
pub struct LimitOrder {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub side: Side,            // Buy or Sell
    pub trigger_price: u64,    // Price at which to execute (scaled 1e9)
    pub amount_in: u64,        // Amount to swap
    pub min_amount_out: u64,   // Slippage protection
    pub expiry_slot: u64,      // Order expires after this slot
}

// Keeper network (or anyone) can execute orders when price condition met
pub fn execute_limit_order(order: &LimitOrder, pool: &PoolState) -> Result<()> {
    let current_price = pool.get_price();

    let should_execute = match order.side {
        Side::Buy => current_price <= order.trigger_price,
        Side::Sell => current_price >= order.trigger_price,
    };

    require!(should_execute, ErrorCode::PriceNotTriggered);

    // Execute swap...
}
```

### 4. MEV-Resistant Batch Auctions

Instead of instant execution, batch trades and execute at uniform clearing price:

```rust
pub struct BatchAuction {
    pub pool: Pubkey,
    pub batch_duration_slots: u64,  // e.g., 10 slots = 4 seconds
    pub current_batch_start: u64,
    pub buy_orders: Vec<BatchOrder>,
    pub sell_orders: Vec<BatchOrder>,
}

pub struct BatchOrder {
    pub user: Pubkey,
    pub amount: u64,
    pub max_price: u64,  // For buys: max price to pay
    pub min_price: u64,  // For sells: min price to receive
}

impl BatchAuction {
    /// Find clearing price where buy volume = sell volume
    pub fn settle(&mut self, pool: &mut PoolState) -> Result<()> {
        // Sort buy orders descending by max_price
        // Sort sell orders ascending by min_price
        // Find intersection point
        // Execute all qualifying orders at uniform price

        let clearing_price = find_clearing_price(&self.buy_orders, &self.sell_orders)?;

        for order in &self.buy_orders {
            if order.max_price >= clearing_price {
                // Execute at clearing_price
            }
        }

        for order in &self.sell_orders {
            if order.min_price <= clearing_price {
                // Execute at clearing_price
            }
        }

        Ok(())
    }
}
```

### 5. Perpetual Futures AMM

Create perpetual futures markets using CRX as collateral:

```rust
pub struct PerpMarket {
    pub base_token: Pubkey,        // e.g., SOL
    pub quote_token: Pubkey,       // CRX
    pub index_oracle: Pubkey,      // Pyth SOL/USD feed
    pub funding_rate_bps: i16,     // Current funding rate (can be negative)
    pub open_interest_long: u64,
    pub open_interest_short: u64,
    pub max_leverage: u8,          // e.g., 10x
}

pub struct Position {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub side: Side,
    pub size: u64,                 // Position size in base token
    pub collateral: u64,           // CRX collateral
    pub entry_price: u64,
    pub accumulated_funding: i64,
}

// vAMM for price discovery
// Funding rate pushes perp price toward spot
// Liquidations when margin ratio < maintenance margin
```

---

## Part 4: Implementation Roadmap

### Phase 1: Foundation (Months 1-3)

```
Week 1-4: Core AMM
├── CPMM curve implementation
├── Pool creation / management
├── Basic swap functionality
├── CRX integration
└── Fee collection system

Week 5-8: WAA Anti-Snipe
├── UserPosition PDA structure
├── WAA calculation on buys
├── Decay fee on sells
├── Transfer handling (untracked = current slot)
└── Fee routing (LP/treasury/burn)

Week 9-12: LP Features
├── Add/remove liquidity
├── LP token minting
├── Fee accrual to LPs
├── Position tracking
└── Basic UI
```

### Phase 2: Curve Expansion (Months 4-6)

```
Week 13-16: Curve Interface
├── Define CurveCalculator trait
├── Refactor CPMM to use trait
├── Add StableSwap curve
├── Pool factory with curve selection
└── Curve parameter validation

Week 17-20: Bonding Curves
├── Linear bonding curve
├── Square root curve (Pump.fun style)
├── Graduation mechanism (curve → CPMM)
├── Fair launch infrastructure
└── Creator tools

Week 21-24: Advanced Features
├── Dynamic fee calculator
├── Time-weighted LP rewards
├── TWAP oracle integration
└── Limit order system
```

### Phase 3: Prediction Markets (Months 7-9)

```
Week 25-28: LMSR Markets
├── Binary market creation
├── LMSR cost function
├── Share purchase/sale
├── Probability display
└── Basic resolution

Week 29-32: Resolution System
├── Oracle integration (Pyth)
├── On-chain data resolution
├── Optimistic oracle (UMA-style)
├── Dispute mechanism
└── Payout distribution

Week 33-36: Market Expansion
├── Multi-outcome markets
├── Market categories/discovery
├── Creator incentives
├── Analytics dashboard
└── Mobile-friendly UI
```

### Phase 4: Advanced Products (Months 10-12)

```
Week 37-40: Concentrated Liquidity
├── Tick-based positions
├── Range orders
├── Position management
└── Fee tier system

Week 41-44: Perpetuals (Experimental)
├── vAMM design
├── Margin system
├── Funding rate mechanism
└── Liquidation engine

Week 45-48: Polish & Audit
├── Security audit
├── Bug bounty program
├── Performance optimization
├── Documentation
└── Mainnet launch
```

---

## Cost & Resource Estimates

| Phase | Duration | Dev Cost | Audit Cost | Total |
|-------|----------|----------|------------|-------|
| Foundation | 3 months | $80k-120k | - | $80k-120k |
| Curve Expansion | 3 months | $60k-100k | $50k | $110k-150k |
| Prediction Markets | 3 months | $80k-120k | $75k | $155k-195k |
| Advanced Products | 3 months | $100k-150k | $100k | $200k-250k |
| **Total** | **12 months** | **$320k-490k** | **$225k** | **$545k-715k** |

---

## Quick Wins (Can Implement Now)

1. **WAA Anti-Snipe** - Immediate differentiator for meme pools
2. **Bonding Curve Launches** - Compete with Pump.fun
3. **Dynamic Fees** - LP protection without complexity
4. **Binary Prediction Markets** - Novel product, high engagement

## High-Risk/High-Reward

1. **Perpetual Futures** - Huge market but complex + regulatory risk
2. **Options AMM** - Very complex math, limited Solana precedent
3. **Cross-chain AMM** - Wormhole integration, bridge risk

---

## Conclusion

The Scale AMM has a clear path to differentiation:

1. **Start with WAA anti-snipe** - Ships fast, solves real problem
2. **Add bonding curves** - Capture meme launch market
3. **Build prediction markets** - Unique product, CRX utility
4. **Expand curves over time** - StableSwap, CLMM as needed

The pluggable curve architecture ensures you're not locked into any single mechanism and can iterate based on market feedback.
