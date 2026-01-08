# Scale AMM - What It Does

## Overview
**Bonding curve AMM powering $CRX on Solana with dynamic USD-denominated pricing.**

---

## Supported Tokens

### Quote Tokens (What You Trade With)
- **CRX** - Primary quote token (always allowed, permissionless)
- **Whitelisted tokens** - SOL, USDC, USDT, or custom (permissioned, admin-controlled)
  - Maximum 5 whitelisted tokens total
  - CRX pairs = Tier 1 (anyone can create)
  - Whitelist pairs = Tier 2 (requires approval)

### Base Tokens (What Gets Launched)
- **Any SPL token** with:
  - Mint authority revoked (prevents rugpull)
  - Freeze authority revoked (prevents freeze attacks)
  - Fixed supply deposited at launch

---

## How It Works

### Pool Lifecycle

**1. Pool Creation**
- Creator deposits entire token supply
- Sets target market cap in USD (e.g., launch at $10k)
- Sets graduation threshold in USD (e.g., graduate at $40k)
- Virtual liquidity calculated from oracle CRX/USD price
- Pool starts in PreBonding phase

**2. PreBonding Phase (Virtual Liquidity)**
- Price determined by virtual reserves (calculated from USD target)
- Real CRX accumulates in vault as people buy
- Anti-sniper protection active (size + time limits)
- Higher trading fee (default 1%)
- No real liquidity exists yet

**3. Graduation (When Threshold Met)**
- Happens when real CRX accumulated ≥ graduation threshold
- Virtual reserves freeze
- Real reserves (accumulated CRX + remaining tokens) become AMM liquidity
- Phase changes to Graduated
- One-time event, cannot reverse

**4. Graduated Phase (Real Liquidity)**
- Pure constant product AMM (x × y = k)
- Trading continues forever with real reserves
- Lower fee (default 1%)
- Anti-sniper disabled
- Functions like Uniswap v2

---

## Bonding Curves

### ConstantProduct (Default)
- Formula: `x × y = k`
- Balanced price growth
- Industry standard (Uniswap-style)
- Reaches graduation in ~N trades

### Exponential (Faster Growth)
- Formula: `y = (x × Y) / (X + 1.5×x)`
- Steeper curve, faster price increase
- Reaches graduation ~33% faster than ConstantProduct
- Better for hype/momentum tokens

### Custom (Placeholder)
- Not implemented
- Returns error if selected
- Reserved for future curve types

---

## Fees

### Trading Fees
- **PreBonding phase**: 1% (100 bps) - default, configurable
- **Graduated phase**: 1% (100 bps) - default, configurable
- Paid in quote token (CRX)
- Goes to protocol fee_recipient wallet

### Pool Creation Fees
- **Creator fee**: 0%, 0.25%, or 1% (creator choice)
  - 0% = no creator earnings
  - 0.25% = small creator cut
  - 1% = maximum creator earnings
- Creator fees paid in CRX
- Deducted from each trade

### WAA Sell Fee (Anti-Sniper)
- **Additional fee** on sells during anti-sniper window
- Penalty = `base_bps × (1 - time_factor)` using saturating arithmetic
- Time-decays over anti-sniper window (default 100 slots = ~40 seconds)
- Only applies during PreBonding phase
- Discourages quick flip attacks

---

## Anti-Sniper Protection

**Active During**: PreBonding phase only (first 100 slots after creation)

**Limits**:
- **Max trade size**: 5% of total supply per transaction (configurable)
- **WAA penalty**: Time-based sell fee (decays over window)

**Why**: Prevents whales from buying entire supply at launch and immediately dumping

---

## Price Discovery

### Virtual Reserves Calculation
1. Oracle provides CRX/USD price (Pyth price feed)
2. Target market cap in USD ÷ token supply = price per token in USD
3. Convert USD price to CRX price using oracle
4. Calculate virtual reserves: `virtual_quote = price × supply`
5. Virtual reserves used for trades until graduation

### Real Reserves (Post-Graduation)
- `real_quote_reserves` = accumulated CRX from all buys
- `real_base_reserves` = remaining tokens not sold
- Price = `real_quote_reserves ÷ real_base_reserves`
- Standard AMM pricing (x × y = k)

---

## Oracle Integration

**Oracle Type**: Pyth price feeds (CRX/USD)

**Requirements**:
- Price must be fresh (<60 seconds old, configurable)
- Confidence interval ≤1% (configurable)
- Price must be positive (no zero/negative)
- Exponent must be in safe range (-12 to +6)
- Confidence cannot exceed price (data validation)

**Used For**:
- Calculating virtual reserves at pool creation
- Converting USD market cap targets to CRX amounts
- Dynamic pricing adjustments

---

## User Positions

### Tracking
- Each user gets a `UserPosition` account per pool
- Tracks: tokens held, average entry price, total buys/sells, PnL

### No Withdrawal/Claims Needed
- Tokens sent directly to user wallet on buy
- CRX sent directly to user wallet on sell
- No "claim" mechanism - instant settlement

---

## Emergency Controls

**Pause Mechanism**:
- Protocol-wide pause flag (`is_paused`)
- When true: all buy/sell transactions fail
- Only authority can toggle
- Used for emergencies (exploits, critical bugs)

**Security Features**:
- All arithmetic is checked (no overflows)
- Vault balances validated after every trade
- Slippage protection on all trades
- Oracle staleness checks
- Mint/freeze authority validation

---

## Events (For Indexers)

1. **ConfigInitialized** - Protocol setup
2. **PoolCreated** - New pool launched
3. **TradeExecuted** - Every buy/sell trade
4. **PhaseTransition** - PreBonding → Graduated
5. **PoolGraduated** - Graduation milestone

---

## What Users Can Do

### Pool Creators
- ✅ Create pools with any SPL token
- ✅ Set custom market cap targets
- ✅ Set custom graduation thresholds
- ✅ Choose bonding curve type
- ✅ Set creator fee (0%, 0.25%, or 1%)
- ❌ Cannot withdraw liquidity after creation
- ❌ Cannot change parameters after creation

### Traders
- ✅ Buy tokens with CRX (or whitelisted quote tokens)
- ✅ Sell tokens back to pool for CRX
- ✅ Trade in both PreBonding and Graduated phases
- ✅ Query pool info (price, reserves, phase, etc.)
- ✅ Set slippage tolerance
- ✅ Get price estimates before trading

### Protocol Admin
- ✅ Update fee parameters
- ✅ Update oracle settings
- ✅ Add/remove whitelisted quote tokens (max 5)
- ✅ Pause/unpause protocol
- ❌ Cannot withdraw pool liquidity
- ❌ Cannot modify existing pools

---

## Economic Model

**SOL → CRX → Token (Two-Hop Swaps)**

1. User wants to buy TOKEN with SOL
2. User first swaps SOL → CRX on CRX/SOL pool (external)
3. User then swaps CRX → TOKEN on bonding curve pool
4. Selling reverses: TOKEN → CRX → SOL

**Why Two Hops?**
- All volume flows through CRX/SOL pool
- Protocol earns 1% fees from CRX/SOL trades (in CRX)
- Creators earn custom % from TOKEN/CRX trades (in CRX)
- CRX becomes deflationary (trapped in graduated pools)

---

## Key Constraints

1. **One-way creation**: Pools cannot be deleted or liquidity withdrawn
2. **No LP tokens**: Creators don't get LP tokens (all-or-nothing deposit)
3. **Fixed curve type**: Cannot change curve after creation
4. **Graduation is permanent**: Cannot revert to PreBonding
5. **CRX-denominated**: All fees and accounting in CRX
6. **Supply must be fixed**: Mint authority must be revoked

---

## Summary: 3 Sentences

1. **Create**: Launch tokens at specific USD market caps using oracle-based virtual liquidity
2. **Trade**: Buy/sell tokens on bonding curve until graduation threshold met
3. **Graduate**: Pool becomes permanent constant-product AMM with real liquidity

---

**That's it. No complex mechanisms, no hidden features, no surprises.**
