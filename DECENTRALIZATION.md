# Scale AMM - Decentralization & Optionality

**Two important changes for permissionless ethos**

---

## 1. Emergency Pause Concerns

### The Problem

Having a centralized "pause" button goes against blockchain's permissionless nature:
- Users lose trust ("they can shut us down anytime")
- Not truly decentralized
- Single point of failure

### Current Implementation

```rust
// In buy.rs and sell.rs:
require!(!config.is_paused, ErrorCode::ProtocolPaused);
```

Authority can call `update_config` to halt all trading instantly.

### Options

#### Option A: Remove It (Most Decentralized)
```rust
// Delete pause checks from buy.rs and sell.rs
// NO centralized control, truly permissionless
```

**Pros:**
- ✅ Fully decentralized
- ✅ Builds user trust
- ✅ Can't be censored

**Cons:**
- ❌ No emergency stop if critical bug found
- ❌ Higher risk at launch

#### Option B: Progressive Decentralization (Recommended)
Launch with pause, then remove it:

```
Week 0-4: Pause active (safety net for early bugs)
Week 4: Announce plan to revoke authority at Day 90
Week 12: Revoke pause authority → FULLY DECENTRALIZED
```

**Pros:**
- ✅ Safety net during risky launch period
- ✅ Clear path to decentralization
- ✅ Transparent timeline builds trust

**Cons:**
- ⚠️ Temporary centralization

#### Option C: Add Transparency/Constraints
Keep pause but add safeguards:
- 24-48 hour timelock (announce before pausing)
- Multisig required (3-of-5, can't be unilateral)
- Auto-unpause after 7 days
- On-chain `ProtocolPaused` event (transparent)

**Pros:**
- ✅ Emergency capability exists
- ✅ Can't be abused easily
- ✅ Transparent on-chain

**Cons:**
- ⚠️ Still centralized control

### Recommendation

**Use Option B: Progressive Decentralization**

1. **Launch with pause enabled**
   - Announce: "Emergency pause active for first 90 days"
   - Document: When/why it would be used

2. **Set timeline**
   - Day 0: Launch with pause
   - Day 30: If no issues, announce Day 90 revocation
   - Day 90: Revoke authority → pause becomes impossible

3. **Communicate clearly**
   - "We're starting with training wheels, removing them at Day 90"
   - Show past protocols that did this (Uniswap, Compound, etc.)

---

## 2. Optional WAA (Weighted Average Age)

### What Changed

WAA anti-dump fees are now **OPTIONAL per pool**:

```rust
// Pool struct now has:
pub disable_waa: bool,  // If true, skip WAA fees (pure permissionless)
```

### How It Works

**With WAA enabled (default):**
```
Sell immediately after buy: 11% total fee (1% base + 10% WAA)
Sell after 30 minutes: 1% total fee (1% base + 0% WAA)
```

**With WAA disabled:**
```
Sell immediately after buy: 1% total fee (1% base + 0% WAA)
Sell after 30 minutes: 1% total fee (1% base + 0% WAA)
Pure permissionless trading - no anti-dump protection
```

### Usage

**Create pool with WAA (default):**
```typescript
const pool = await scale.createPool({
  baseMint: tokenMint,
  supply: 1_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 40_000,
  // disableWaa: false (default)
});
// Has anti-dump protection
```

**Create pool without WAA (pure permissionless):**
```typescript
const pool = await scale.createPool({
  baseMint: tokenMint,
  supply: 1_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 40_000,
  disableWaa: true,  // ← No anti-dump fees
});
// Pure permissionless - no WAA fees ever
```

### When to Disable WAA

**Disable WAA when:**
- Community token (no creator control)
- DAO-launched (decentralization first)
- Maximum permissionless ethos
- Targeting crypto-native audience who value pure permissionless

**Keep WAA enabled when:**
- Creator wants sustainable launch
- Targeting normies (need protection from dumps)
- Want anti-sniper protection
- Premium token with creator fees

### Trade-offs

**WAA Enabled:**
- ✅ Protects early buyers from dumps
- ✅ Reduces sniping profitability
- ✅ More sustainable price action
- ❌ Less permissionless
- ❌ Crypto purists may complain

**WAA Disabled:**
- ✅ Pure permissionless trading
- ✅ No "training wheels"
- ✅ Crypto-native credibility
- ❌ Vulnerable to pump-and-dumps
- ❌ Early buyers less protected

---

## Summary

### Emergency Pause
- **Current:** Centralized kill switch exists
- **Recommended:** Launch with it, revoke at Day 90
- **Result:** Temporary safety → full decentralization

### WAA Optional
- **Current:** Always enabled
- **Now:** Optional per pool (default: enabled)
- **Result:** Creators choose their own permissionless level

Both changes move toward **progressive decentralization** while maintaining safety during risky launch period.

---

## Implementation Status

✅ **WAA Optional:** Fully implemented
- Pool struct updated
- SDK updated
- Sell logic updated

⏳ **Emergency Pause:** Still exists
- Decision needed: Keep, remove, or timeline to remove
- No code changes yet (waiting on decision)

---

## Questions to Answer

1. **Emergency pause:** Keep, remove, or progressive decentralization?
2. **Timeline:** If progressive, what's the revocation date?
3. **Communication:** How to explain to users?
4. **Default for WAA:** Keep `false` (enabled) or make creators opt-in?

**Recommendation:**
- Progressive decentralization for pause (revoke Day 90)
- WAA default `false` (enabled by default, opt-out for pure permissionless)
