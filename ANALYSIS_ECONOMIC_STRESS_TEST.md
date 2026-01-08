# Scale AMM - Economic Stress Test Analysis

**Date:** 2026-01-08
**Protocol Version:** Scale AMM v2
**Analysis Scope:** Extreme economic scenarios, attack vectors, and edge cases

---

## Executive Summary

### Critical Findings (Severity: HIGH)

1. **CRITICAL: Graduation Threshold USD-Peg Drift**
   - Graduation thresholds are calculated ONCE at pool creation in CRX terms
   - As CRX price changes, the USD value of graduation threshold drifts
   - A pool created at CRX=$2 with $40k threshold (20,000 CRX) will require $400k if CRX goes to $20
   - This breaks the USD-denominated economics promise of the protocol

2. **HIGH: Virtual Reserve USD-Peg Drift**
   - Virtual reserves are also calculated ONCE at creation
   - Pool market caps drift in USD terms as CRX price changes
   - A $10k launch becomes a $100k launch if CRX 10x's (or $1k if CRX drops 90%)

3. **MEDIUM: Cross-Wallet Wash Trading**
   - WAA fees only track per-wallet positions
   - Attackers can bypass WAA penalties by trading across multiple wallets
   - Creates fake volume and avoids sell penalties

4. **MEDIUM: Impossible Graduation Risk**
   - No validation that graduation threshold is achievable given CRX supply
   - Pools can be created with thresholds exceeding total CRX supply
   - Results in permanent PreBonding phase (never graduates)

### Security Strengths

- All arithmetic uses checked operations (overflow protection)
- Vault balances validated after every trade
- Oracle validation is robust (freshness, confidence, exponent bounds)
- Anti-sniper protection provides basic protection against large buys
- Slippage protection on all trades
- Mint/freeze authority validation prevents rugpulls

---

## 1. CRX Price Scenarios

### Scenario 1.1: CRX Drops 90% ($2.00 → $0.20)

**What Happens:**

**Existing Pools (created at $2):**
- Virtual reserves: UNCHANGED (static at creation values)
- Virtual quote reserves: Still 5,000 CRX (calculated at $2)
- Virtual base reserves: Still 1,000,000 tokens
- Graduation threshold: Still 20,000 CRX (calculated at $2)
- **BUT: USD value changes dramatically!**
  - Target market cap: Was $10k, now represents $1k (90% drop)
  - Graduation threshold: Was $40k, now represents $4k (90% drop)
  - **Pools graduate 90% EASIER in USD terms**

**New Pools (created at $0.20):**
- To achieve same $10k target market cap:
- Virtual quote reserves: 50,000 CRX (10x higher than at $2)
- Graduation threshold: 200,000 CRX (10x higher than at $2)
- **Requires 10x more CRX to graduate vs pools created at $2**

**Code Evidence:**
```rust
// create_pool.rs:193-197
let graduation_threshold_crx = (graduation_threshold_usd as u128)
    .checked_mul(1_000_000u128) // CRX decimals
    .ok_or(ErrorCode::MathOverflow)?
    .checked_div(crx_price_usd as u128)
    .ok_or(ErrorCode::ThresholdCalculationFailed)? as u64;

// state.rs:197 (stored statically, never recalculated)
if self.real_quote_reserves >= self.graduation_threshold_crx {
```

**Impact:**
- **Severe economic inconsistency** between pools created at different CRX prices
- Pools created during high CRX prices graduate much easier (in USD terms) when CRX drops
- Market cap drift makes launch targets meaningless
- Graduation thresholds become arbitrary

**Safeguards:**
- Oracle price bounds ($0.01 - $1000) prevent extreme values: ✅
- But within bounds, drift is unprotected: ❌

**Edge Cases:**
1. Pool created at $2, CRX drops to $0.20:
   - 20,000 CRX threshold = only $4,000 in real value
   - Graduates with 90% less capital than intended

2. Arbitrage opportunity:
   - Create pools when CRX is expensive (easier future graduation)
   - Exploit when CRX drops

**Probability:** HIGH (crypto volatility is normal)

---

### Scenario 1.2: CRX Goes 10x ($2.00 → $20.00)

**What Happens:**

**Existing Pools (created at $2):**
- Virtual reserves: UNCHANGED
- Graduation threshold: Still 20,000 CRX
- **USD value changes:**
  - Target market cap: Was $10k, now represents $100k (10x increase)
  - Graduation threshold: Was $40k, now represents $400k (10x increase)
  - **Pools graduate 10x HARDER in USD terms**

**New Pools (created at $20):**
- To achieve same $10k target market cap:
- Virtual quote reserves: 500 CRX (10x lower than at $2)
- Graduation threshold: 2,000 CRX (10x lower than at $2)
- **Requires 10x less CRX to graduate vs pools created at $2**

**Impact:**
- Pools created during low CRX prices become "stuck" when CRX moons
- Example: $40k threshold becomes $400k requirement (probably never hit)
- New pools graduate much faster than old pools
- Economic model inverts between bull/bear markets

**Safeguards:**
- Oracle price bounds prevent CRX > $1000: ✅
- But 500x range ($0.01 - $1000) allows massive drift: ❌

**Edge Cases:**
1. "Zombie pools" - created when CRX was cheap, now impossible to graduate
2. Liquidity fragmentation - old pools stuck in PreBonding, new pools graduating quickly

**Probability:** MEDIUM (CRX could 10x in bull market)

---

### Scenario 1.3: CRX Volatility (50% Swings in 1 Hour)

**What Happens:**

**Oracle Protections:**
- Freshness check: Max 60 seconds old
- Confidence check: Max 1% deviation
- Exponent bounds: -12 to +6
- Price must be positive, confidence < price

**Code Evidence:**
```rust
// oracle.rs:44-52
let price_age = clock.unix_timestamp
    .checked_sub(price_feed.publish_time)
    .ok_or(ErrorCode::OraclePriceStale)?;

require!(price_age <= max_age_seconds, ErrorCode::OraclePriceStale);

// oracle.rs:64-73
let confidence_bps = (price_feed.conf as u128)
    .checked_mul(10000)
    .ok_or(ErrorCode::MathOverflow)?
    .checked_div(price_abs as u128)
    .ok_or(ErrorCode::MathOverflow)? as u64;

require!(confidence_bps <= max_confidence_bps, ErrorCode::OracleConfidenceTooLow);
```

**During High Volatility:**
1. **Pool Creation:**
   - Might FAIL if oracle confidence > 1%
   - Protects against using unreliable prices ✅
   - But blocks pool creation during volatility ❌

2. **Trading:**
   - Oracle is NOT checked during buy/sell
   - Trades continue unaffected ✅
   - Existing pools use static virtual reserves

3. **Different Launch Prices:**
   - Pool A created at peak: CRX = $3 (50% up)
   - Pool B created 30 min later: CRX = $1.50 (50% down)
   - **Pools have 2x different economics for same USD targets**

**Impact:**
- Pool creation might be blocked during volatility spikes
- Pools created minutes apart have drastically different graduation thresholds
- Creates unfair competitive dynamics between pools

**Safeguards:**
- Oracle validation prevents using bad prices: ✅
- But doesn't prevent price drift between pools: ❌

**Edge Cases:**
1. Flash crash + recovery: Pools created during crash are "ultra easy" to graduate
2. Volatility arbitrage: Time pool creation for favorable CRX price

**Probability:** HIGH (crypto volatility is frequent)

---

## 2. Volume Scenarios

### Scenario 2.1: 1000 Pools Launch Simultaneously

**What Happens:**

**Oracle Reads:**
- All pools read from same Pyth oracle account
- Oracle reads are read-only (no write conflicts) ✅
- **BUT**: If oracle updates during batch, some pools get different prices ❌
  - First 100 pools: CRX = $2.00
  - Oracle updates
  - Next 900 pools: CRX = $2.05 (2.5% difference)
  - **2.5% difference in graduation thresholds across same batch**

**Compute Units:**
- Pool creation: ~100k CU per transaction
- 1000 pools = 1000 transactions (no batching)
- Solana can handle this throughput ✅

**Account Space:**
- Each pool: Pool (160 bytes) + 2 vaults (165 bytes each) = 490 bytes
- 1000 pools = 490 KB
- No storage issues ✅

**Impact:**
- Operationally feasible
- Minor oracle price drift across batch
- No protocol risks

**Safeguards:**
- Independent pool accounts (no conflicts): ✅

**Edge Cases:**
1. Oracle update mid-batch creates price inconsistency
2. RPC rate limiting might affect clients (not protocol)

**Probability:** MEDIUM (meme coin season could trigger mass launches)

---

### Scenario 2.2: Single Pool Gets $100M Volume in 1 Hour

**What Happens:**

**Reserve Overflow Check:**
- u64::MAX = 18,446,744,073,709,551,615
- With 6 decimals = 18,446,744,073 tokens max (~18 billion)
- $100M at $2/CRX = 50M CRX = 50,000,000,000,000 (50 trillion with 6 decimals)
- **SAFE**: Well within u64 range ✅

**Arithmetic Safety:**
- All operations use `checked_mul`, `checked_add`, etc.
- Overflow would return `MathOverflow` error ✅
- Trade would fail gracefully, not corrupt state ✅

**Code Evidence:**
```rust
// state.rs:231-237
let numerator = (input_amount as u128)
    .checked_mul(output_reserve as u128)
    .ok_or(ErrorCode::MathOverflow)?;

let denominator = (input_reserve as u128)
    .checked_add(input_amount as u128)
    .ok_or(ErrorCode::MathOverflow)?;
```

**Graduation:**
- High volume pool would graduate almost immediately
- Real reserves would quickly exceed threshold ✅
- Transitions to Graduated phase normally

**Impact:**
- No security risks
- Math is sound
- System handles high volume

**Safeguards:**
- Checked arithmetic: ✅
- u64 range sufficient: ✅

**Edge Cases:**
1. Gas fees from extreme transaction count (user problem, not protocol)
2. Oracle might not keep up with market cap tracking (cosmetic only)

**Probability:** LOW (but possible for viral tokens)

---

### Scenario 2.3: No Trading for 7 Days

**What Happens:**

**Oracle Staleness:**
- Oracle checked ONLY at pool creation
- NOT checked during trading
- **7-day stale oracle has ZERO impact on trading** ✅

**Code Evidence:**
```rust
// buy.rs: No oracle reads (only uses pool.get_pricing_reserves())
// sell.rs: No oracle reads (only uses pool.get_pricing_reserves())
// Only create_pool.rs reads oracle (line 172)
```

**Pool State:**
- Virtual reserves: STATIC (don't decay)
- Real reserves: STATIC (no decay mechanism)
- Anti-sniper window: Based on SLOTS not time
  - 20 slots = ~8 seconds of blockchain time
  - Paused blockchain = paused anti-sniper window ✅

**Impact:**
- Zero effect on protocol
- Pools remain functional indefinitely
- No decay mechanisms

**Safeguards:**
- No time-based decay: ✅
- Static reserves model: ✅

**Edge Cases:**
1. Extremely long pause could cause slot number overflow (but u64 max = 584 billion years)

**Probability:** LOW (but good resilience property)

---

### Scenario 2.4: Flash Crash (Price Drops 50% in 1 Second)

**What Happens:**

**Existing Pools:**
- Virtual reserves: UNCHANGED
- Trading: CONTINUES NORMALLY
- Graduation thresholds: UNCHANGED (in CRX terms)
- **USD value of thresholds drops 50% instantly** ❌

**New Pools:**
- Created at crashed price
- Get favorable (low) CRX graduation thresholds
- **Launch at 50% easier graduation vs pre-crash pools**

**Oracle Response:**
- Pyth updates within seconds
- Confidence interval might spike (>1%)
- Pool creation might be BLOCKED during high confidence ✅

**Code Evidence:**
```rust
// oracle.rs:70-73
require!(
    confidence_bps <= max_confidence_bps,
    ErrorCode::OracleConfidenceTooLow
);
```

**Impact:**
- Existing pools unaffected operationally
- But graduation thresholds become 50% easier (in USD)
- New pools get massive economic advantage
- Market cap drift affects all pools

**Safeguards:**
- Oracle confidence check prevents bad prices: ✅
- But doesn't prevent USD drift: ❌

**Edge Cases:**
1. Pool created RIGHT before crash vs RIGHT after: 2x economic difference
2. "Lucky" pool creators get ultra-low thresholds

**Probability:** MEDIUM (flash crashes happen in crypto)

---

## 3. Attack Scenarios

### Scenario 3.1: Sniper Bot with $1M Capital

**Attack Vector:**
Attacker wants to buy large position at launch and immediately dump for profit.

**Defense Mechanisms:**

**1. Anti-Sniper Size Limit:**
```rust
// trade.rs:36-45
let max_trade_amount = (base_reserve as u128)
    .checked_mul(config.anti_sniper_max_trade_bps as u128) // Default: 500 = 5%
    .ok_or(ErrorCode::MathOverflow)?
    .checked_div(10000)
    .ok_or(ErrorCode::MathOverflow)? as u64;

require!(trade_amount <= max_trade_amount, ErrorCode::AntiSniperActive);
```

- **Active:** First ~20 slots (~8 seconds)
- **Limit:** 5% of supply per transaction
- **Effectiveness:** Moderate
  - $1M capital ÷ 5% limit = need 20 transactions
  - Attacker can bypass with multiple wallets ❌

**2. WAA Sell Fees:**
```rust
// state.rs:441-487
pub fn calculate_extra_sell_fee_bps(&self, current_slot: u64) -> Result<u64> {
    const T1: u64 = 75;       // ~30 seconds
    const T2: u64 = 750;      // ~5 minutes
    const T3: u64 = 4500;     // ~30 minutes
    const F1: u64 = 1000;     // 10.00%
    const F2: u64 = 100;      // 1.00%

    // Piecewise linear decay
    if age <= T1 { return Ok(F1); }        // 0-30s: 10% fee
    if age <= T2 { return Ok(F2 + decay); } // 30s-5m: 10% → 1%
    if age <= T3 { return Ok(F2 * decay); } // 5m-30m: 1% → 0%
    Ok(0) // 30m+: no fee
}
```

- **Active:** 30 minutes after buy
- **Penalty:** 10% → 0% decay
- **Effectiveness:** Moderate
  - Sniper must hold 30 minutes ✅
  - OR take 10% penalty ✅
  - OR use multiple wallets ❌

**Bypass Strategy:**
1. Use 20 wallets, each buys 5% (max allowed)
2. Wait 30 minutes (or eat 10% fee if profitable)
3. Sell from all wallets
4. **Total cost:** Gas fees + 10% WAA + 1% trade fees = ~11-12% overhead
5. **Profitable if:** Price pumps >12% during holding period

**Impact:**
- Sniping is EXPENSIVE but not impossible
- Small/medium snipers deterred ✅
- Large snipers (>$100k) can bypass with wallets ❌

**Safeguards:**
- Anti-sniper size limit: Partial protection ✅
- WAA fees: Moderate protection ✅
- No cross-wallet tracking: Vulnerability ❌

**Recommended Fix:**
- Add global pool-wide anti-sniper limit (e.g., max 10% of supply in first 5 minutes total)
- Or increase WAA decay time to 2-4 hours

**Probability:** HIGH (sniper bots are common)

---

### Scenario 3.2: Coordinated Pump-and-Dump

**Attack Vector:**
Group of attackers coordinate to pump price, attract retail, then dump.

**Attack Flow:**
1. **Phase 1: Accumulation**
   - 10 wallets each buy 5% during anti-sniper window
   - Total: 50% of supply acquired
   - Cost: Normal fees + gas

2. **Phase 2: Pump**
   - Create hype on social media
   - Small coordinated buys to push price up
   - Retail FOMO in
   - Price pumps 10x

3. **Phase 3: Dump**
   - All 10 wallets sell slowly over 30 minutes
   - Avoid WAA fees by waiting
   - Exit with 10x profit (minus fees)

**Defense Mechanisms:**

**During Accumulation:**
- Anti-sniper limit: Each wallet limited to 5% ✅
- But 10 wallets = 50% total bypass ❌

**During Dump:**
- WAA fees: 10% → 0% over 30 minutes
- Attackers wait 30 minutes = ZERO penalty ❌

**Code Gap:**
```rust
// state.rs:354 - UserPosition is per-wallet
pub struct UserPosition {
    pub pool: Pubkey,
    pub user: Pubkey,  // ← No cross-wallet tracking
    pub avg_entry_slot: u64,
    pub tracked_amount: u64,
    pub bump: u8,
}
```

**Impact:**
- **SEVERE:** No protection against coordinated multi-wallet attacks
- WAA fees only track individual wallets
- Anti-sniper limits are per-transaction, not global
- Group can acquire majority supply and dump risk-free

**Safeguards:**
- Per-wallet fees: Insufficient ❌
- No global limits: Missing ❌
- No velocity checks: Missing ❌

**Recommended Fixes:**
1. Add global pool anti-sniper: "Max 30% of supply can be bought in first 10 minutes total"
2. Add sell velocity limit: "Max 10% of supply can be sold in any 5-minute window"
3. Extend WAA decay to 4-12 hours (make pump-and-dump less profitable)

**Probability:** HIGH (common attack in meme coins)

---

### Scenario 3.3: Wash Trading to Game WAA Fees

**Attack Vector:**
Attacker creates fake volume by trading between own wallets to:
1. Bypass WAA fees (new wallet has no position)
2. Create appearance of liquidity
3. Game future mechanisms that reward volume

**Attack Flow:**
1. Wallet A buys 100,000 tokens
2. Price increases due to bonding curve
3. Instead of selling from Wallet A (WAA fees apply):
   - Buy from Wallet B at current price
   - Sell from Wallet A
   - Net effect: Volume but no real trades
4. **Wallet B has no position = no WAA fees** ❌

**Code Evidence:**
```rust
// sell.rs:127
let extra_fee_bps = user_position.calculate_extra_sell_fee_bps(clock.slot)?;
```

- WAA fees calculated from `user_position.avg_entry_slot`
- Wallet B (never bought) has `avg_entry_slot = 0`
- **Zero WAA fees for Wallet B selling tokens it bought from Wallet A**

**Impact:**
- WAA fees can be completely bypassed
- False volume created
- If protocol adds volume-based rewards later, this is exploitable

**Safeguards:**
- Per-wallet position tracking: Insufficient ❌
- No transfer tracking: Missing ❌

**Cost to Attacker:**
- 2x trade fees (buy + sell) = 2-4%
- Slippage on both trades
- Gas fees
- **Profitable if:** Bypass saves >4% in WAA fees (possible for quick flips)

**Recommended Fixes:**
1. Track token transfers (mark tokens as "time-locked" for 30 min after buy)
2. Apply WAA fees to ALL sells based on pool-wide average entry age
3. Add transfer cooldown period

**Probability:** MEDIUM (requires sophistication but is profitable)

---

### Scenario 3.4: Front-Running Graduation

**Attack Vector:**
Attacker monitors mempool for trade that would trigger graduation, front-runs it.

**Analysis:**

**Graduation Trigger:**
```rust
// state.rs:194-204
pub fn check_phase_transition(&mut self) -> Result<bool> {
    match self.current_phase {
        CurvePhase::PreBonding => {
            if self.real_quote_reserves >= self.graduation_threshold_crx {
                msg!("Pool graduated!");
                self.current_phase = CurvePhase::Graduated;
                return Ok(true);
            }
        },
        // ...
    }
    Ok(false)
}
```

**Graduation Benefits:**
- Pricing switches from virtual to real reserves
- Anti-sniper disabled
- Fees unchanged (1% before and after)
- **No special rewards or advantages** ✅

**Why Front-Running Doesn't Matter:**
1. No tokens minted at graduation
2. No fee structure change
3. No liquidity unlocked
4. Price continuity maintained (real reserves start where virtual left off)

**Code Evidence:**
```rust
// state.rs:179-190
pub fn get_pricing_reserves(&self) -> (u64, u64) {
    match self.current_phase {
        CurvePhase::PreBonding => {
            (self.virtual_quote_reserves, self.virtual_base_reserves)
        },
        CurvePhase::Graduated => {
            (self.real_quote_reserves, self.real_base_reserves)
        },
    }
}
```

- Virtual and real reserves converge at graduation
- No price discontinuity
- No arbitrage opportunity

**Impact:**
- **ZERO RISK:** No incentive to front-run graduation
- Protocol design is sound here ✅

**Safeguards:**
- No graduation rewards: ✅
- Smooth transition: ✅

**Probability:** ZERO (no attack vector exists)

---

### Scenario 3.5: Oracle Manipulation Attempts

**Attack Vector:**
Attacker tries to manipulate oracle to:
1. Create pools with favorable thresholds
2. Cause pool creation to fail
3. Exploit price calculation errors

**Defense Mechanisms:**

**1. Price Bounds:**
```rust
// create_pool.rs:179-182
require!(
    crx_price_usd >= 10_000 && crx_price_usd <= 1_000_000_000,
    ErrorCode::InvalidCrxPrice
);
```
- Min: $0.01 (10,000 with 6 decimals)
- Max: $1,000 (1,000,000,000 with 6 decimals)
- **Range:** 100,000x (too wide?) ⚠️

**2. Freshness Check:**
```rust
// oracle.rs:44-52
let price_age = clock.unix_timestamp
    .checked_sub(price_feed.publish_time)
    .ok_or(ErrorCode::OraclePriceStale)?;

require!(price_age <= max_age_seconds, ErrorCode::OraclePriceStale);
```
- Max age: 60 seconds (default)
- Prevents using old prices ✅

**3. Confidence Check:**
```rust
// oracle.rs:64-73
let confidence_bps = (price_feed.conf as u128)
    .checked_mul(10000)
    .ok_or(ErrorCode::MathOverflow)?
    .checked_div(price_abs as u128)
    .ok_or(ErrorCode::MathOverflow)? as u64;

require!(confidence_bps <= max_confidence_bps, ErrorCode::OracleConfidenceTooLow);
```
- Max confidence: 1% (100 bps default)
- Rejects uncertain prices ✅

**4. Exponent Bounds:**
```rust
// oracle.rs:78-81
require!(
    price_feed.expo >= -12 && price_feed.expo <= 6,
    ErrorCode::InvalidOracleExponent
);
```
- Range: -12 to +6
- Prevents overflow attacks ✅

**5. Sanity Checks:**
```rust
// oracle.rs:41
require!(price_feed.price > 0, ErrorCode::InvalidCrxPrice);

// oracle.rs:59-62
require!(
    price_feed.conf <= price_abs,
    ErrorCode::InvalidOracleConfidence
);
```
- No negative prices ✅
- Confidence can't exceed price ✅

**Attack Scenarios:**

**A. Submit Fake Oracle Price:**
- Requires compromising Pyth oracle account
- **Difficulty:** Effectively impossible (Pyth security model)
- **Impact if successful:** Massive (but requires Pyth compromise)

**B. Time Pool Creation to Favorable Price:**
- Wait for temporary price spike/drop
- Create pool during favorable window
- **Difficulty:** Easy (just timing)
- **Impact:** Moderate (±50% threshold difference possible)
- **This is NOT oracle manipulation, just timing arbitrage** ✅

**C. Cause Creation Failure with High Confidence:**
- Wait for volatility spike (confidence >1%)
- Submit competing pool creations to waste gas
- **Difficulty:** Easy during volatility
- **Impact:** Low (just griefing, no economic gain)

**Overall Assessment:**
- Oracle manipulation: VERY HARD (requires Pyth compromise) ✅
- Oracle timing arbitrage: POSSIBLE but not harmful ⚠️
- Oracle DoS: POSSIBLE but not profitable ⚠️

**Safeguards:**
- Multiple validation layers: ✅
- Pyth security model: ✅
- Price bounds: Partial (range too wide) ⚠️

**Recommended Fixes:**
1. Tighten price bounds: $0.10 - $100 (1000x range instead of 100,000x)
2. Add rate limiting: "Max 1 pool per CRX price change >5%"

**Probability:** LOW (Pyth manipulation), MEDIUM (timing arbitrage)

---

## 4. CRX Supply Scenarios

### Scenario 4.1: All CRX Locked in Graduated Pools

**Situation:**
- 1000 pools graduate
- Each pool has 20,000 CRX locked
- Total locked: 20,000,000 CRX
- Circulating supply: 0 CRX

**What Happens:**

**Pool Creation:**
- Oracle still provides CRX price ✅
- New pools can be created ✅
- Virtual reserves calculated normally ✅
- **No CRX supply checks** ⚠️

**Trading:**
- Existing graduated pools: Continue trading ✅
- New pools in PreBonding: **CANNOT GRADUATE** ❌
  - Need CRX to accumulate for graduation
  - But no CRX available to buy
  - Stuck in PreBonding forever

**Economic Impact:**
- CRX price would skyrocket (scarcity)
- High CRX price = LOW graduation thresholds (in CRX terms)
- But still no CRX to buy = deadlock

**Code Gap:**
```rust
// create_pool.rs - No check for:
// - CRX circulating supply
// - Whether graduation is achievable
// - CRX liquidity availability
```

**Impact:**
- **SEVERE:** Protocol can become non-functional
- New pools created but never graduate
- Creator tokens permanently locked
- Loss of capital for creators

**Safeguards:**
- No supply checks: Missing ❌
- No graduation achievability validation: Missing ❌

**Recommended Fixes:**
1. Add CRX supply oracle
2. Validate: `graduation_threshold_crx < total_CRX_supply * 0.1` (max 10% of supply)
3. Warning in UI: "This pool may never graduate due to high CRX requirements"

**Probability:** MEDIUM (possible in mature protocol state)

---

### Scenario 4.2: 90% of CRX Supply Locked

**Situation:**
- 90% locked in graduated pools
- 10% circulating

**What Happens:**

**CRX Price:**
- Extreme scarcity drives price up 10-100x
- Oracle reports new high price
- New pools created with LOW CRX thresholds

**Example Math:**
- Before: CRX = $2, $40k threshold = 20,000 CRX
- After 100x: CRX = $200, $40k threshold = 200 CRX
- **New pools need 100x LESS CRX to graduate** ✅

**Graduation Feasibility:**
- Circulating CRX: 10% of supply
- Threshold: 200 CRX (0.0001% of supply)
- **EASILY achievable** ✅

**Economic Model:**
- High CRX price = cheaper graduation (in CRX terms)
- Self-balancing mechanism ✅
- Protocol continues functioning ✅

**Impact:**
- Minimal issues
- Protocol adapts naturally via price
- Deflationary CRX is BY DESIGN ✅

**Safeguards:**
- Price-based threshold calculation: ✅
- Self-balancing: ✅

**Probability:** HIGH (intended endgame state)

---

### Scenario 4.3: Insufficient CRX to Meet Graduation Threshold

**Situation:**
- Pool created with 20,000 CRX graduation threshold
- Only 10,000 CRX in existence (impossible scenario but illustrative)
- OR: Pool created when CRX = $20, threshold = 2,000 CRX
- CRX drops to $2, threshold still 2,000 CRX but only 1,000 CRX liquid

**What Happens:**

**Pool State:**
```rust
// state.rs:197
if self.real_quote_reserves >= self.graduation_threshold_crx {
```
- Condition NEVER met
- Pool stays in PreBonding FOREVER ❌

**Creator Impact:**
- Tokens locked in pool vault
- Cannot withdraw (no withdrawal mechanism)
- Capital permanently stuck ❌

**Trader Impact:**
- Can still trade on virtual reserves ✅
- But never transitions to real reserves
- Missing "graduated" status

**Code Evidence:**
```rust
// No validation in create_pool.rs that threshold is achievable
// No escape hatch for impossible graduation
// No refund mechanism for creators
```

**Real-World Scenario:**
1. Bull market: CRX = $20
2. Creator launches pool: $40k threshold = 2,000 CRX (seems achievable)
3. Bear market: CRX drops to $0.20 (99% drop)
4. Threshold now = 2,000 CRX × $0.20 = $400 USD equivalent
5. **Pool graduates ultra-easily** (good for pool, bad for graduation consistency)

**Reverse Scenario:**
1. Bear market: CRX = $0.20
2. Creator launches pool: $40k threshold = 200,000 CRX
3. Bull market: CRX goes to $20 (100x)
4. Threshold now = 200,000 CRX × $20 = $4,000,000 USD equivalent
5. **Pool never graduates** (bad for creator, bad for traders)

**Impact:**
- **HIGH SEVERITY:** Creators can lose capital
- No escape mechanism
- No validation prevents this
- Price volatility makes this LIKELY

**Safeguards:**
- No achievability checks: Missing ❌
- No creator refund: Missing ❌
- No adaptive thresholds: Missing ❌

**Recommended Fixes:**
1. Add maximum threshold: "Max 1% of current CRX total supply"
2. Add creator escape hatch: "Can close pool if <10% to graduation after 30 days"
3. **CRITICAL FIX:** Make graduation threshold DYNAMIC (recalculate with current CRX price)
   - This fixes the USD-peg drift bug entirely

**Probability:** MEDIUM to HIGH (given CRX volatility)

---

## 5. Summary Tables

### Critical Issues Priority

| # | Issue | Severity | Likelihood | Impact | Status |
|---|-------|----------|------------|--------|--------|
| 1 | Graduation Threshold USD Drift | CRITICAL | HIGH | Pool economics break with CRX price changes | OPEN |
| 2 | Virtual Reserve USD Drift | HIGH | HIGH | Market cap targets become meaningless | OPEN |
| 3 | Impossible Graduation | HIGH | MEDIUM | Creator capital permanently locked | OPEN |
| 4 | Cross-Wallet Sniping | MEDIUM | HIGH | Large snipers bypass anti-sniper | OPEN |
| 5 | Multi-Wallet Pump-and-Dump | MEDIUM | HIGH | Coordinated attacks bypass WAA fees | OPEN |
| 6 | Wash Trading | MEDIUM | MEDIUM | WAA fees bypassable via transfers | OPEN |
| 7 | Oracle Timing Arbitrage | LOW | MEDIUM | Favorable pool creation timing | OPEN |

---

### Scenario Summary Matrix

| Scenario | What Breaks? | Safeguards Exist? | Additional Protections Needed? |
|----------|--------------|-------------------|--------------------------------|
| **CRX 90% Drop** | USD-peg of thresholds | ❌ None | ✅ Dynamic threshold recalculation |
| **CRX 10x** | USD-peg of thresholds | ❌ None | ✅ Dynamic threshold recalculation |
| **CRX Volatility** | Pool creation during spikes | ✅ Confidence check | ✅ Tighter price bounds |
| **1000 Pools** | Minor oracle drift | ✅ Independent accounts | ⚠️ Consider batch creation |
| **$100M Volume** | Nothing | ✅ Checked math + u64 range | ✅ Already secure |
| **7 Days No Trading** | Nothing | ✅ Static reserve model | ✅ Already secure |
| **Flash Crash** | USD-peg of thresholds | ⚠️ Partial (confidence check) | ✅ Dynamic thresholds |
| **$1M Sniper** | Multi-wallet bypass | ⚠️ Partial (per-wallet limits) | ✅ Global pool limits |
| **Pump-and-Dump** | Multi-wallet coordination | ❌ None | ✅ Global velocity limits |
| **Wash Trading** | WAA fee bypass | ❌ None | ✅ Transfer tracking |
| **Front-Run Graduation** | Nothing | ✅ No graduation rewards | ✅ Already secure |
| **Oracle Manipulation** | Requires Pyth compromise | ✅ Multiple validations | ✅ Tighter bounds |
| **All CRX Locked** | New pools can't graduate | ❌ None | ✅ Supply checks |
| **90% CRX Locked** | Nothing (self-balancing) | ✅ Price-based thresholds | ✅ Already secure |
| **Impossible Graduation** | Creator capital locked | ❌ None | ✅ Achievability checks |

---

## 6. Recommended Fixes (Priority Order)

### Priority 1: CRITICAL (Block Mainnet)

1. **Fix Graduation Threshold USD Drift**
   - **Problem:** Thresholds calculated once, USD value drifts with CRX price
   - **Solution:** Recalculate threshold dynamically on each trade
   ```rust
   // In state.rs check_phase_transition():
   let current_crx_price = get_crx_price_usd(...)?;
   let dynamic_threshold_crx = (graduation_threshold_usd as u128)
       .checked_mul(1_000_000)
       .checked_div(current_crx_price as u128)? as u64;

   if self.real_quote_reserves >= dynamic_threshold_crx {
       // Graduate
   }
   ```
   - **Files:** `state.rs`, requires oracle access in buy/sell

2. **Fix Virtual Reserve USD Drift**
   - **Problem:** Virtual reserves calculated once, market cap drifts
   - **Solution:** Recalculate virtual reserves on each trade
   ```rust
   // In state.rs get_pricing_reserves():
   if self.current_phase == CurvePhase::PreBonding {
       let current_crx_price = get_crx_price_usd(...)?;
       let (vq, vb) = calculate_virtual_reserves_for_market_cap(
           self.target_market_cap_usd,
           self.token_total_supply,
           current_crx_price
       )?;
       return (vq, vb);
   }
   ```
   - **Files:** `state.rs`, `buy.rs`, `sell.rs`

3. **Add Graduation Achievability Check**
   - **Problem:** Pools can have impossible graduation thresholds
   - **Solution:** Validate at creation
   ```rust
   // In create_pool.rs after threshold calculation:
   let crx_total_supply = get_crx_supply_from_mint(&config.crx_mint)?;
   require!(
       graduation_threshold_crx < crx_total_supply / 10, // Max 10% of supply
       ErrorCode::ThresholdTooHigh
   );
   ```
   - **Files:** `create_pool.rs`, `errors.rs`

---

### Priority 2: HIGH (Fix Before Launch)

4. **Add Global Anti-Sniper Limits**
   - **Problem:** Multi-wallet sniping bypasses per-transaction limits
   - **Solution:** Track total buys in anti-sniper window
   ```rust
   // Add to Pool struct:
   pub total_bought_during_anti_sniper: u64,

   // In trade.rs check_anti_sniper_protection():
   let global_bought = pool.total_bought_during_anti_sniper;
   let max_global = base_reserve / 3; // Max 33% total in window
   require!(global_bought + trade_amount <= max_global, ...);
   ```
   - **Files:** `state.rs`, `trade.rs`

5. **Add Sell Velocity Limits**
   - **Problem:** Coordinated dumps bypass WAA by waiting 30 min
   - **Solution:** Limit sell rate globally
   ```rust
   // Add to Pool struct:
   pub sell_velocity_tracker: [u64; 6], // Last 6 time windows
   pub last_velocity_update_slot: u64,

   // Check: Max 20% of supply sold per 10 minutes
   ```
   - **Files:** `state.rs`, `sell.rs`

6. **Extend WAA Decay Time**
   - **Problem:** 30 minutes is too short for pump-and-dump deterrence
   - **Solution:** Extend to 4-12 hours
   ```rust
   // In state.rs calculate_extra_sell_fee_bps():
   const T3: u64 = 36000; // ~4 hours (was 4500 = 30 min)
   ```
   - **Files:** `state.rs`

---

### Priority 3: MEDIUM (Post-Launch Improvements)

7. **Add Transfer Tracking for WAA**
   - **Problem:** Wash trading bypasses WAA via token transfers
   - **Solution:** Mark tokens with time-locks
   - **Note:** Complex, requires token wrapper or metadata

8. **Tighten Oracle Price Bounds**
   - **Current:** $0.01 - $1,000 (100,000x range)
   - **Recommended:** $0.10 - $100 (1,000x range)
   - **Files:** `create_pool.rs`

9. **Add Creator Escape Hatch**
   - **Problem:** Creators stuck if pool can't graduate
   - **Solution:** Allow close after 30 days if <10% to graduation
   - **Files:** New instruction `close_pool.rs`

---

## 7. Testing Recommendations

### Critical Test Cases to Add

1. **CRX Price Change Impact:**
   ```
   - Create pool at CRX=$2, threshold=20,000 CRX ($40k)
   - Mock CRX price change to $20
   - Verify graduation still happens at $40k USD (not $400k)
   - EXPECT: Dynamic recalculation keeps USD value stable
   ```

2. **Multi-Wallet Sniping:**
   ```
   - Create pool
   - Buy from 10 different wallets (5% each)
   - Verify: Total >33% in anti-sniper window FAILS
   - EXPECT: Global limit enforced
   ```

3. **Impossible Graduation:**
   ```
   - Try creating pool with threshold >10% of CRX supply
   - EXPECT: Creation FAILS with ThresholdTooHigh
   ```

4. **Wash Trading:**
   ```
   - Wallet A buys tokens
   - Transfer to Wallet B
   - Wallet B sells
   - EXPECT: WAA fees still apply based on original buy time
   ```

5. **Coordinated Dump:**
   ```
   - 10 wallets each buy 5%
   - Wait 30 minutes
   - All 10 try to sell simultaneously
   - EXPECT: Velocity limit prevents >20% sell in 10 min
   ```

---

## 8. Operational Recommendations

### Before Mainnet Deploy

1. **Update `DEPLOYER_PUBKEY`** in `initialize.rs:23` (CRITICAL)
2. Run 72-hour devnet soak test with:
   - CRX price volatility (+50%, -50% every hour)
   - Multi-wallet sniper bots
   - Pump-and-dump simulations
   - 1000+ pool creation stress test
3. Implement Priority 1 fixes (USD-peg drift)
4. Get external security audit of oracle integration
5. Prepare emergency pause procedure

### Post-Launch Monitoring

1. **Alert on:**
   - CRX price changes >20% in 1 hour
   - Graduation threshold USD drift >25%
   - Multiple wallets buying same pool in quick succession
   - Sell velocity spikes (>10% supply in 5 minutes)
   - Pools created with thresholds >5% of CRX supply

2. **Dashboard Metrics:**
   - Average time to graduation (track USD vs slot-based)
   - Number of pools stuck in PreBonding >7 days
   - WAA fee bypass rate (track cross-wallet transfers)
   - Anti-sniper trigger rate

3. **Emergency Procedures:**
   - Pause mechanism tested weekly
   - Multi-sig authority setup
   - Oracle failure contingency

---

## 9. Conclusion

### System Resilience: MODERATE to HIGH

**Strengths:**
- Math is sound (checked arithmetic everywhere)
- Vault validation prevents accounting errors
- Oracle integration is robust
- Basic anti-sniper protection exists
- No front-running vulnerabilities

**Critical Weaknesses:**
- **USD-peg drift is SEVERE** - graduation economics break with CRX volatility
- Multi-wallet attack vectors bypass most protections
- No global rate limiting or velocity controls
- Creator capital can be permanently locked

**Verdict:**
Protocol is **NOT MAINNET READY** until Priority 1 fixes (USD-peg drift) are implemented. With those fixes, security is acceptable for initial launch, but Priority 2 fixes should follow quickly.

**Estimated Risk Levels:**
- **With Priority 1 fixes:** MEDIUM risk (acceptable for launch)
- **With Priority 1 + 2 fixes:** LOW risk (good for growth phase)
- **Current state (no fixes):** HIGH risk (DO NOT DEPLOY)

---

**Analysis completed:** 2026-01-08
**Reviewed files:** state.rs, oracle.rs, buy.rs, sell.rs, trade.rs, create_pool.rs, initialize.rs, errors.rs
**Next steps:** Implement Priority 1 fixes before mainnet consideration
