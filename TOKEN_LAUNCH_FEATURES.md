# Token Launch Features

**What you can configure when launching a token on Scale AMM**

---

## Pool Configuration

### ✅ Market Cap Settings
- **Initial Market Cap (USD)** - Launch at any USD value
  - Examples: $1k, $5k, $10k, $50k, $100k+
  - No minimum or maximum

- **Graduation Threshold (USD)** - When pool converts to permanent AMM
  - Must be higher than initial market cap
  - Examples: $40k, $85k, $500k, $1M+
  - Ratio typically 4x-10x initial cap

### ✅ Supply Options
- **Total Supply to Bond** - How many tokens to put in the curve
  - Can bond entire supply: 100%, 1M, 1B tokens
  - Can bond partial supply: Keep rest for team/treasury/marketing
  - No minimum (except must be > 0)

### ✅ Fee Structure
Choose creator fee tier:
- **0 bps (0%)** - Maximum growth, no creator fees
- **25 bps (0.25%)** - Competitive, modest revenue
- **100 bps (1%)** - Premium, higher revenue

Protocol fee is always 1% (in addition to creator fee).

### ✅ Curve Type
- **ConstantProduct** - x×y=k formula (default, recommended)
- **Exponential** - Exponential price curve (advanced)

---

## Phase Behavior

### Pre-Bonding Phase (Virtual Liquidity)
**Automatic features:**
- Virtual reserves (oracle-calculated, $0 upfront)
- Anti-sniper protection active:
  - WAA penalties: Up to 10% extra sell fee in first 100 slots (~60 seconds)
  - Size limits: Max 5% of supply per trade
- Accumulates real $CRX from trades
- Oracle adjusts reserves based on $CRX price

### Graduated Phase (Permanent AMM)
**Automatic transition when TVL hits graduation threshold:**
- Same pool address (seamless transition)
- Virtual reserves → Real reserves (accumulated $CRX)
- Anti-sniper disabled
- Constant product formula (x×y=k)
- $CRX locked forever (deflationary)
- Continues trading indefinitely

---

## What You CANNOT Configure

### Fixed Protocol Settings
- **Quote token:** Always $CRX (cannot use SOL, USDC, etc. directly)
- **Protocol fee:** Always 1% (hardcoded)
- **Anti-sniper window:** Always 100 slots (~60 seconds)
- **Anti-sniper size limit:** Always 5% of supply
- **WAA penalty:** Always up to 10% on early sells
- **Pool address:** Deterministic PDA (cannot choose custom address)

### Immutable After Creation
Once pool is created, you **cannot change:**
- Initial market cap
- Graduation threshold
- Creator fee tier
- Curve type
- Total supply bonded

**Why:** Permissionless blockchain - no admin updates possible after launch.

---

## Launch Checklist

When creating a pool, you must specify:

```typescript
await scale.createPool({
  baseMint: PublicKey,           // ✅ Your token mint address
  supply: number,                 // ✅ Total tokens to bond (e.g., 1_000_000)
  initialMarketCapUsd: number,    // ✅ Launch market cap in USD (e.g., 10_000)
  graduationThresholdUsd: number, // ✅ Graduation target in USD (e.g., 85_000)
  creatorFeeBps: 0 | 25 | 100,    // ✅ Creator fee: 0%, 0.25%, or 1%
  curveType?: 'ConstantProduct' | 'Exponential', // Optional, defaults to ConstantProduct
});
```

---

## Examples

### Standard Launch
```typescript
// Launch at $10k, graduate at $85k, no creator fee
{
  supply: 1_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 85_000,
  creatorFeeBps: 0,
}
```

### Premium Launch
```typescript
// Launch at $50k, graduate at $500k, 1% creator fee
{
  supply: 10_000_000,
  initialMarketCapUsd: 50_000,
  graduationThresholdUsd: 500_000,
  creatorFeeBps: 100,
}
```

### Partial Supply Launch
```typescript
// Bond 50% of supply, keep 50% for team
// Total supply: 1M tokens, bond: 500k
{
  supply: 500_000,              // Only bond 500k
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 85_000,
  creatorFeeBps: 0,
}
// Team keeps remaining 500k tokens in wallet
```

---

## Seamless Transition

**Pre-Bonding → Graduated uses same pool address:**

```
Pool Address: ABC123...xyz (never changes)

Before Graduation:
  Phase: PreBonding
  Reserves: Virtual (oracle-calculated)
  Anti-sniper: Active

After Graduation:
  Phase: Graduated
  Reserves: Real (accumulated $CRX locked)
  Anti-sniper: Disabled

Same Address: ABC123...xyz ✅
```

Users continue trading at the same address. No migration needed. Like Pump.fun.

---

## What the AMM Actually Supports

**Currently Implemented & Tested:**
- ✅ Virtual liquidity (oracle-based)
- ✅ Dual-phase system (PreBonding → Graduated)
- ✅ Same address transition (seamless)
- ✅ Anti-sniper protection (WAA + size limits)
- ✅ Multiple pools (thousands can exist simultaneously)
- ✅ ConstantProduct curve (x×y=k)
- ✅ Creator fees (0%, 0.25%, 1%)
- ✅ Oracle integration (Pyth CRX price feeds)
- ✅ Emergency pause (protocol-wide)
- ✅ 179 tests, 98% coverage

**Not Yet Implemented:**
- ❌ Exponential curve (defined but not implemented)
- ❌ Custom curve types (placeholder only)
- ❌ Concentrated liquidity post-graduation
- ❌ LP rewards/farming
- ❌ Multi-oracle support

**Permissionless = No Updates After Launch:**
Once on mainnet, the protocol is **immutable**. Cannot add features or change behavior.

---

## Recommended Settings for Creator Platform

**For most launches:**
```typescript
{
  supply: 1_000_000,              // 1M tokens
  initialMarketCapUsd: 10_000,    // $10k launch
  graduationThresholdUsd: 85_000, // $85k graduation (8.5x)
  creatorFeeBps: 0,               // 0% creator fee (maximum growth)
  curveType: 'ConstantProduct',   // Default
}
```

**Why these numbers:**
- $10k initial = accessible for most projects
- $85k graduation = proven threshold (Pump.fun uses $69k)
- 8.5x ratio = balanced (not too easy, not impossible)
- 0% fee = maximize adoption, protocol earns 1% anyway
