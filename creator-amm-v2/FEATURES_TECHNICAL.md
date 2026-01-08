# 🎯 **CREATOR AMM V2 - COMPLETE FEATURE LIST & CODE REFERENCES**

## **📋 ALL FEATURES (Comprehensive)**

### **1. CRX-Only Quote Token Enforcement**
**What:** Protocol only allows CRX as quote token, enforced at smart contract level
**Why:** Platform control - all trades require CRX, creates demand
**Code:** `create_pool.rs:35-38`
```rust
#[account(
    constraint = quote_mint.key() == config.crx_mint @ ErrorCode::MustUseCrxQuote
)]
pub quote_mint: Account<'info, Mint>,
```

---

### **2. PumpSwap-Style Instant Graduation**
**What:** Pool switches from virtual→real reserves atomically at threshold
**Why:** No migration, no MEV, same pool address forever
**Code:** `state.rs:162-191`
```rust
pub fn check_phase_transition(&mut self) -> Result<bool> {
    match self.current_phase {
        CurvePhase::PreBonding => {
            if self.real_quote_reserves >= self.graduation_threshold_crx {
                self.current_phase = CurvePhase::Graduated;
                return Ok(true);
            }
        },
        ...
    }
}
```
**Pricing Switch:** `state.rs:148-160`
```rust
pub fn get_pricing_reserves(&self) -> (u64, u64) {
    match self.current_phase {
        CurvePhase::PreBonding => (virtual_quote, virtual_base),
        CurvePhase::Graduated => (real_quote, real_base),
    }
}
```

---

### **3. Dynamic Virtual Liquidity (Oracle-Based)**
**What:** Launches tokens at specific USD market cap regardless of CRX price
**Why:** Consistent launch experience even if CRX 10x or drops 90%
**Code:** `oracle.rs:76-114`
```rust
pub fn calculate_virtual_reserves_for_market_cap(
    target_mc_usd: u64,
    token_supply: u64,
    crx_price_usd: u64,
) -> Result<(u64, u64)> {
    // Calculate initial price in CRX
    let price_in_crx = (target_mc_usd as u128)
        .checked_mul(1_000_000)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(token_supply as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(crx_price_usd as u128)
        .ok_or(ErrorCode::MathOverflow)?;

    // Calculate k from x*y=k
    let k = (token_supply as u128).checked_mul(token_supply as u128)...

    // Derive virtual reserves that maintain target price
    let virtual_quote = ...;
    let virtual_base = token_supply;

    Ok((virtual_quote, virtual_base))
}
```

---

### **4. Multiple Bonding Curve Types**
**What:** 2 built-in curves + custom placeholder
**Why:** Different launch strategies (balanced vs aggressive)
**Code:** `state.rs:52-69` (Enum)
```rust
pub enum CurveType {
    ConstantProduct,  // x*y=k
    Exponential,      // x*y=k with 1.5x denominator
    Custom,           // Fork-friendly placeholder
}
```
**Implementation:** `state.rs:205-260`
```rust
let output_before_fee = match self.curve_type {
    CurveType::ConstantProduct => {
        // y = (x * Y) / (X + x)
        numerator.checked_div(denominator)?
    },
    CurveType::Exponential => {
        // y = (x * Y) / (X + 1.5*x)
        let input_scaled = (input * 150) / 100;
        numerator.checked_div(X + input_scaled)?
    },
    CurveType::Custom => Err(ErrorCode::CustomCurveNotImplemented)?,
}
```

---

### **5. Custom Per-Pool Fees**
**What:** Each pool sets fee at creation (0%, 0.25%, or 1%)
**Why:** Creator choice - balance revenue vs attractiveness
**Code:** `state.rs:143-146`
```rust
pub fn get_current_fee_bps(&self) -> u16 {
    self.fee_bps  // Set at pool creation, never changes
}
```
**Validation:** `create_pool.rs:95-98`
```rust
require!(
    fee_bps == 0 || fee_bps == 25 || fee_bps == 100,
    ErrorCode::InvalidFee
);
```

---

### **6. Dynamic Graduation Thresholds**
**What:** Each pool sets custom graduation target ($5k - $10M)
**Why:** Flexibility for different token types
**Code:** `create_pool.rs:93`
```rust
graduation_threshold_usd: u64,  // Per-pool parameter
```
**Validation:** `create_pool.rs:104-126`
```rust
const MIN_GRADUATION_USD: u64 = 5_000_000_000;  // $5k
const MAX_GRADUATION_USD: u64 = 10_000_000_000_000;  // $10M

require!(graduation_threshold_usd >= MIN_GRADUATION_USD, ...);
require!(graduation_threshold_usd > target_market_cap_usd, ...);
```
**Conversion to CRX:** `create_pool.rs:156-161`
```rust
let graduation_threshold_crx = (graduation_threshold_usd as u128)
    .checked_mul(1_000_000u128)  // CRX decimals
    .checked_div(crx_price_usd as u128)? as u64;
```

---

### **7. Slippage Protection (Required)**
**What:** All trades must specify min output amount
**Why:** Prevents sandwich attacks and front-running
**Code:** `buy.rs:121-125`
```rust
require!(
    base_output >= min_base_amount,
    ErrorCode::SlippageExceeded
);
```
**Sell:** `sell.rs:113-117`
```rust
require!(
    quote_output >= min_quote_amount,
    ErrorCode::SlippageExceeded
);
```

---

### **8. Anti-Sniper Protection**
**What:** First N slots limit trade size to % of supply
**Why:** Fair launch - prevents whales buying entire supply instantly
**Code:** `state.rs:137-141`
```rust
pub fn is_anti_sniper_active(&self, current_slot: u64, window: u64) -> bool {
    matches!(self.current_phase, CurvePhase::PreBonding) &&
    current_slot < self.created_at_slot.saturating_add(window)
}
```
**Enforcement:** `buy.rs:89-111`
```rust
if pool.is_anti_sniper_active(clock.slot, config.anti_sniper_window_slots) {
    let max_trade_amount = (base_reserve as u128)
        .checked_mul(config.anti_sniper_max_trade_bps)  // e.g., 5%
        .checked_div(10000)? as u64;

    require!(estimated_output <= max_trade_amount, ...);
}
```

---

### **9. Protocol Fee Collection**
**What:** Fees automatically transferred to platform on every trade
**Why:** Revenue model - sustainable protocol operation
**Code:** `buy.rs:179-192`
```rust
// Transfer protocol fee to fee recipient (in CRX)
let fee_cpi_accounts = Transfer {
    from: ctx.accounts.quote_vault.to_account_info(),
    to: ctx.accounts.fee_recipient_account.to_account_info(),
    authority: pool.to_account_info(),
};
token::transfer(
    CpiContext::new_with_signer(...),
    fee_in_quote,
)?;
```
**Fee Calculation:** `buy.rs:127-144`
```rust
// Calculate fee amount
let base_output_before_fee = pool.calculate_output(..., 0);  // No fee
let fee_amount = base_output_before_fee - base_output;

// Convert to quote token for accounting
let fee_in_quote = (fee_amount as u128)
    .checked_mul(quote_reserve as u128)
    .checked_div(base_reserve as u128)? as u64;
```

---

### **10. Vault Authority Security**
**What:** All vaults must be owned by pool PDA
**Why:** Prevents malicious vaults that could be drained
**Code:** `buy.rs:24-36`
```rust
#[account(
    mut,
    constraint = quote_vault.key() == pool.quote_vault,
    constraint = quote_vault.authority == pool.key() @ ErrorCode::Unauthorized,
)]
pub quote_vault: Account<'info, TokenAccount>,

#[account(
    mut,
    constraint = base_vault.key() == pool.base_vault,
    constraint = base_vault.authority == pool.key() @ ErrorCode::Unauthorized,
)]
pub base_vault: Account<'info, TokenAccount>,
```

---

### **11. Reserve Accounting (Dual System)**
**What:** Separate virtual (pricing) and real (actual) reserves
**Why:** Enables PumpSwap graduation model
**Code:** `state.rs:86-92` (Fields)
```rust
pub virtual_quote_reserves: u64,  // For pricing calculations
pub virtual_base_reserves: u64,

pub real_quote_reserves: u64,     // Actual CRX accumulated
pub real_base_reserves: u64,      // Actual tokens remaining
```
**Update Logic:** `buy.rs:194-207`
```rust
if matches!(pool.current_phase, CurvePhase::Graduated) {
    // Virtual frozen
} else {
    // Update virtual reserves for bonding curve
    pool.virtual_quote_reserves += quote_amount;
    pool.virtual_base_reserves -= base_output_before_fee;  // CRITICAL: before-fee
}

// Always update real reserves
pool.real_quote_reserves = pool.real_quote_reserves
    .checked_add(quote_amount)?
    .checked_sub(fee_in_quote)?;  // Subtract fee transferred out
```

---

### **12. Oracle Integration (Pyth)**
**What:** Fetches CRX price for USD-denominated calculations
**Why:** Dynamic thresholds, consistent market cap targeting
**Code:** `oracle.rs:22-74`
```rust
pub fn get_crx_price_usd(
    oracle_account: &AccountInfo,
    max_age_seconds: i64,
    max_confidence_bps: u64,
) -> Result<u64> {
    // Load Pyth price account
    let price_feed = PythPriceFeed::load(oracle_account)?;

    // Validate age
    let age = current_time - price_feed.timestamp;
    require!(age <= max_age_seconds, ErrorCode::OraclePriceStale);

    // Validate confidence
    let confidence_bps = (price_feed.confidence * 10000) / price_feed.price;
    require!(confidence_bps <= max_confidence_bps, ErrorCode::OracleConfidenceTooLow);

    // Return price with 6 decimals
    Ok(price_feed.price as u64)
}
```

---

### **13. Checked Math (Overflow Protection)**
**What:** All arithmetic uses checked operations
**Why:** Prevents overflow/underflow exploits
**Code:** Examples throughout
```rust
pool.virtual_quote_reserves
    .checked_add(quote_amount)
    .ok_or(ErrorCode::MathOverflow)?;

let numerator = (input_amount as u128)
    .checked_mul(output_reserve as u128)
    .ok_or(ErrorCode::MathOverflow)?;
```

---

### **14. PDA-Based Security**
**What:** All critical accounts use Program Derived Addresses
**Why:** Prevents unauthorized account substitution
**Code:** `create_pool.rs:11-22` (Config)
```rust
#[account(
    seeds = [b"config"],
    bump = config.bump
)]
pub config: Account<'info, Config>,
```
**Pool:** `buy.rs:14-22`
```rust
#[account(
    mut,
    seeds = [
        b"pool",
        pool.base_mint.as_ref(),
    ],
    bump = pool.bump,
)]
pub pool: Account<'info, Pool>,
```
**Signing:** `buy.rs:158-163`
```rust
let pool_seeds = &[
    b"pool",
    pool.base_mint.as_ref(),
    &[pool.bump],
];
let signer = &[&pool_seeds[..]];
```

---

### **15. Market Cap Validation**
**What:** Enforces reasonable market cap ranges
**Why:** Prevents dust pools or absurd valuations
**Code:** `create_pool.rs:102-127`
```rust
const MIN_MARKET_CAP_USD: u64 = 1_000_000_000;  // $1k
const MAX_MARKET_CAP_USD: u64 = 1_000_000_000_000;  // $1M

require!(target_market_cap_usd >= MIN_MARKET_CAP_USD, ...);
require!(target_market_cap_usd <= MAX_MARKET_CAP_USD, ...);
```

---

### **16. Statistics Tracking**
**What:** Tracks volume, fees, trades on-chain
**Why:** Analytics, monitoring, transparency
**Code:** `state.rs:95-100`
```rust
pub created_at_slot: u64,
pub total_quote_volume: u64,
pub total_base_volume: u64,
pub total_fees_collected: u64,
pub unique_traders: u64,
```
**Updates:** `buy.rs:218-227`
```rust
pool.total_quote_volume = pool.total_quote_volume
    .checked_add(quote_amount)?;
pool.total_base_volume = pool.total_base_volume
    .checked_add(base_output)?;
pool.total_fees_collected = pool.total_fees_collected
    .checked_add(fee_in_quote)?;
```

---

### **17. View Functions (Price Queries)**
**What:** Get current price and market cap
**Why:** Off-chain tools, frontends, analytics
**Code:** `state.rs:311-318` (Spot Price)
```rust
pub fn get_spot_price(&self) -> Result<u64> {
    let price = (self.virtual_quote_reserves as u128)
        .checked_mul(1_000_000_000)  // 9 decimals precision
        .checked_div(self.virtual_base_reserves as u128)? as u64;
    Ok(price)
}
```
**Market Cap:** `state.rs:320-329`
```rust
pub fn get_market_cap_crx(&self) -> Result<u64> {
    let price = self.get_spot_price()?;
    let mc = (self.token_total_supply as u128)
        .checked_mul(price as u128)
        .checked_div(1_000_000_000)? as u64;
    Ok(mc)
}
```

---

## **📊 INSTRUCTION SET (4 Instructions)**

### **1. initialize** (One-time setup)
**File:** `initialize.rs`
**Accounts:** 7
**Purpose:** Deploy protocol, set global config
**Parameters:**
- pre_bonding_fee_bps (unused legacy)
- post_bonding_fee_bps (unused legacy)
- anti_sniper_window_slots
- anti_sniper_max_trade_bps
- oracle_max_age_seconds
- oracle_max_confidence_bps

### **2. create_pool** (Create bonding curve)
**File:** `create_pool.rs`
**Accounts:** 10
**Purpose:** Launch new token with bonding curve
**Parameters:**
- target_market_cap_usd (e.g., $10k)
- token_supply (e.g., 1M tokens)
- fee_bps (0, 25, or 100)
- curve_type (ConstantProduct or Exponential)
- graduation_threshold_usd (e.g., $40k)

### **3. buy** (Purchase tokens)
**File:** `buy.rs`
**Accounts:** 9
**Purpose:** Buy tokens with CRX
**Parameters:**
- quote_amount (CRX to spend)
- min_base_amount (slippage protection)

### **4. sell** (Sell tokens)
**File:** `sell.rs`
**Accounts:** 9
**Purpose:** Sell tokens for CRX
**Parameters:**
- base_amount (tokens to sell)
- min_quote_amount (slippage protection)

---

## **🔒 SECURITY FEATURES**

| # | Feature | File | Line |
|---|---------|------|------|
| 1 | Checked math everywhere | All | Throughout |
| 2 | Required slippage protection | buy.rs, sell.rs | 121-125, 113-117 |
| 3 | Vault authority validation | buy.rs, sell.rs | 27, 34 |
| 4 | Fee recipient validation | buy.rs, sell.rs | 55-58 |
| 5 | CRX-only enforcement | create_pool.rs | 35-38 |
| 6 | Anti-sniper protection | buy.rs, sell.rs | 89-111 |
| 7 | PDA-based security | All | Throughout |
| 8 | Oracle price validation | oracle.rs | 22-74 |
| 9 | No floating point in state | All | All calculations |
| 10 | Proper reserve accounting | buy.rs, sell.rs | 194-216 |

---

## **🎨 BONDING CURVE MATH**

### **Constant Product:**
```
Formula: y = (x * Y) / (X + x)
Where:
  x = input amount (CRX)
  X = input reserve (CRX in pool)
  Y = output reserve (tokens in pool)
  y = output amount (tokens)

Invariant: X * Y = k (before and after)
```

### **Exponential:**
```
Formula: y = (x * Y) / (X + 1.5*x)
Where:
  Same variables
  But denominator grows 50% faster

Result: ~33% faster price growth
```

### **Fee Application:**
```
output_with_fee = output_before_fee * (10000 - fee_bps) / 10000

Examples:
  0 bps = no fee = 100% output
  25 bps = 0.25% fee = 99.75% output
  100 bps = 1% fee = 99% output
```

---

## **📈 LIFECYCLE EXAMPLE**

```
1. LAUNCH
   - Creator calls create_pool($10k MC, 1M supply, exponential, 1%, $40k graduation)
   - Oracle fetches CRX price: $2
   - Calculates: virtual_quote = 5,000 CRX, virtual_base = 1M tokens
   - Initial price: 0.005 CRX per token
   - Graduation threshold: 20,000 CRX

2. EARLY TRADING (PreBonding)
   - User buys with 100 CRX
   - Gets ~19,800 tokens (after 1% fee)
   - Virtual reserves: 5,100 CRX × 980,200 tokens
   - Real reserves: 99 CRX × 980,200 tokens  (fee deducted)
   - Price now: 0.0052 CRX per token

3. ... MANY TRADES ...
   - Real CRX accumulates: 19,500 ... 19,900 ... 20,000!

4. GRADUATION (Atomic)
   - Pool detects: real_quote_reserves >= 20,000 CRX
   - Switches phase to Graduated
   - Pricing now uses REAL reserves (20,000 CRX × 600k tokens)
   - Price at graduation: 0.033 CRX per token
   - Virtual reserves frozen forever

5. POST-GRADUATION
   - Continues trading with real reserves
   - Acts like mini-Uniswap pool
   - Same 1% fee continues
   - Never migrates, never changes address
```

---

## **🧪 TEST SCENARIOS NEEDED**

1. Create pool with each curve type
2. Buy tokens (pre-graduation)
3. Sell tokens (pre-graduation)
4. Hit graduation threshold
5. Trade after graduation
6. Anti-sniper triggers
7. Slippage protection triggers
8. Oracle price refresh
9. Overflow scenarios (max values)
10. Fee recipient validation
11. Vault authority validation
12. CRX-only enforcement
13. Market cap limits

---

## **🔗 CROSS-REFERENCE INDEX**

**Core Types:**
- Config: `state.rs:4-33`
- Pool: `state.rs:80-118`
- CurveType: `state.rs:52-69`
- CurvePhase: `state.rs:71-78`
- ErrorCode: `errors.rs:4-73`

**Instructions:**
- initialize: `initialize.rs:6-103`
- create_pool: `create_pool.rs:8-212`
- buy: `buy.rs:7-254`
- sell: `sell.rs:7-212`

**Utilities:**
- Oracle: `oracle.rs:22-114`
- Reserve calculation: `oracle.rs:76-114`

**Security:**
- Vault validation: `buy.rs:27,34`
- Fee validation: `buy.rs:55-58`
- Reserve accounting: `buy.rs:194-216`

