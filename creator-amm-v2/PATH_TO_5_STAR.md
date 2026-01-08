# 🎯 **PATH TO 5/5 READINESS - COMPLETE ACTION PLAN**

## **CURRENT STATUS: 3.5/5**

### **✅ COMPLETED (What Makes Us 3.5/5):**
- [x] Core bonding curve math implemented
- [x] PumpSwap-style graduation model
- [x] Critical reserve accounting bugs fixed (virtual reserves use before-fee amounts)
- [x] Vault authority validation added
- [x] Fee recipient validation added
- [x] Function signature mismatch FIXED (lib.rs now matches create_pool handler)
- [x] Custom curve DOS FIXED (validation prevents Custom selection)
- [x] CRX-only enforcement
- [x] Slippage protection required
- [x] Anti-sniper protection
- [x] Checked math everywhere

### **❌ REMAINING FOR 5/5 (Critical Blockers):**

---

## **🔴 CRITICAL FIXES NEEDED**

### **1. Oracle Implementation (HIGHEST PRIORITY)**
**Current:** Fake stub structure, zero cryptographic validation
**Risk:** Complete price manipulation, funds can be stolen

**Fix Required:**
```toml
# Add to Cargo.toml
[dependencies]
pyth-solana-receiver-sdk = "0.2.0"
```

```rust
// Replace oracle.rs with proper Pyth SDK
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, get_price_no_older_than};

pub fn get_crx_price_usd(
    price_update_account: &AccountInfo,
    feed_id: &[u8; 32],
    max_age: u64,
    max_confidence_bps: u64,
) -> Result<u64> {
    let price_update = PriceUpdateV2::try_deserialize(&mut &price_update_account.data.borrow()[..])?;

    // Cryptographically verified price
    let price = price_update.get_price_no_older_than(
        &Clock::get()?,
        max_age,
        feed_id,
    )?;

    // Validate confidence
    let confidence_bps = (price.conf as u128)
        .checked_mul(10000)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(price.price.abs() as u128)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    require!(
        confidence_bps <= max_confidence_bps,
        ErrorCode::OracleConfidenceTooLow
    );

    // Convert to 6 decimals
    let normalized_price = if price.expo >= 0 {
        (price.price as u64)
            .checked_mul(10u64.pow(price.expo as u32))
            .ok_or(ErrorCode::MathOverflow)?
    } else {
        (price.price as u64)
            .checked_div(10u64.pow((-price.expo) as u32))
            .ok_or(ErrorCode::MathOverflow)?
    };

    Ok(normalized_price)
}
```

**Impact:** Without this, protocol cannot safely launch on mainnet.

---

### **2. Graduated Phase Constant Product Fix**
**Current:** Reserve updates break x*y=k invariant after graduation
**Risk:** Pool pricing degrades over time, arbitrage losses

**Problem:**
```rust
// WRONG - Breaks invariant by extracting fees
pool.real_quote_reserves += quote_amount - fee_in_quote;
pool.real_base_reserves -= base_output;
```

**Fix Option A - Fee Stays in Pool:**
```rust
// In buy.rs and sell.rs
if matches!(pool.current_phase, CurvePhase::Graduated) {
    // Graduated: Maintain constant product (x*y=k)
    // Add full input, subtract full output (before fees)
    // Fees stay in pool, increasing k over time
    pool.real_quote_reserves = pool.real_quote_reserves
        .checked_add(quote_amount)?;
    pool.real_base_reserves = pool.real_base_reserves
        .checked_sub(base_output_before_fee)?;

    // Don't transfer fee out - it stays in pool
    // (This increases k, benefiting liquidity providers)
} else {
    // PreBonding: Use virtual reserves
    pool.virtual_quote_reserves += quote_amount;
    pool.virtual_base_reserves -= base_output_before_fee;
}
```

**Fix Option B - No Fees After Graduation:**
```rust
// Simpler: Remove fees entirely after graduation
if matches!(pool.current_phase, CurvePhase::Graduated) {
    // No fees in graduated phase - pure constant product
    let base_output = pool.calculate_output(
        quote_amount,
        quote_reserve,
        base_reserve,
        0, // No fee
    )?;

    pool.real_quote_reserves += quote_amount;
    pool.real_base_reserves -= base_output;

    // No fee transfer
}
```

**Recommended:** Option B (simpler, mathematically clean)

---

### **3. Vault Balance Validation**
**Current:** No validation that reserves match actual vault balances
**Risk:** Desync allows pricing manipulation

**Fix:**
```rust
// Add to buy.rs and sell.rs after all transfers
fn validate_reserves(
    pool: &Pool,
    quote_vault: &Account<TokenAccount>,
    base_vault: &Account<TokenAccount>,
) -> Result<()> {
    quote_vault.reload()?;
    base_vault.reload()?;

    require!(
        pool.real_quote_reserves == quote_vault.amount,
        ErrorCode::ReserveVaultMismatch
    );
    require!(
        pool.real_base_reserves == base_vault.amount,
        ErrorCode::ReserveVaultMismatch
    );

    Ok(())
}

// Call after reserve updates
validate_reserves(&pool, &ctx.accounts.quote_vault, &ctx.accounts.base_vault)?;
```

---

## **🟠 HIGH SEVERITY FIXES**

### **4. Tighten Oracle Price Bounds**
```rust
// create_pool.rs
const MIN_CRX_PRICE: u64 = 100_000;      // $0.10
const MAX_CRX_PRICE: u64 = 100_000_000;  // $100.00

require!(
    crx_price_usd >= MIN_CRX_PRICE && crx_price_usd <= MAX_CRX_PRICE,
    ErrorCode::InvalidCrxPrice
);
```

### **5. Fix Anti-Sniper Consistency**
```rust
// Both buy.rs and sell.rs should use same reserve source
let max_trade_amount = (pool.virtual_base_reserves as u128)  // Always virtual in PreBonding
    .checked_mul(config.anti_sniper_max_trade_bps as u128)?
    .checked_div(10000)? as u64;
```

### **6. Add Minimum Output**
```rust
const MIN_OUTPUT_AMOUNT: u64 = 1000; // 0.001 tokens

require!(base_output >= MIN_OUTPUT_AMOUNT, ErrorCode::OutputTooSmall);
```

### **7. Fix Fee Precision**
```rust
// Add precision buffer
let fee_in_quote = std::cmp::max(
    (fee_amount as u128)
        .checked_mul(quote_reserve as u128)?
        .checked_div(base_reserve as u128)? as u64,
    1  // Minimum 1 lamport fee
);
```

### **8. Validate Mint Authority Revoked**
```rust
// In create_pool.rs
require!(
    ctx.accounts.base_mint.mint_authority.is_none(),
    ErrorCode::MintAuthorityNotRevoked
);
require!(
    ctx.accounts.base_mint.freeze_authority.is_none(),
    ErrorCode::FreezeAuthorityNotRevoked
);
```

---

## **📊 REQUIRED ADDITIONS FOR 5/5**

### **9. Event Emissions**
```rust
#[event]
pub struct PoolCreated {
    pub pool: Pubkey,
    pub base_mint: Pubkey,
    pub creator: Pubkey,
    pub target_market_cap_usd: u64,
    pub graduation_threshold_crx: u64,
    pub curve_type: CurveType,
    pub fee_bps: u16,
}

#[event]
pub struct TradeExecuted {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub is_buy: bool,
    pub input_amount: u64,
    pub output_amount: u64,
    pub fee_amount: u64,
    pub new_price: u64,
}

#[event]
pub struct PoolGraduated {
    pub pool: Pubkey,
    pub final_virtual_reserves: (u64, u64),
    pub real_reserves: (u64, u64),
    pub graduation_price: u64,
}

// Emit in handlers:
emit!(PoolCreated { ... });
emit!(TradeExecuted { ... });
emit!(PoolGraduated { ... });
```

### **10. Comprehensive Tests**
```rust
// tests/creator_amm_v2.ts
describe("creator-amm-v2", () => {
  // Setup tests
  it("Initializes protocol", async () => { ... });
  it("Creates pool with constant product curve", async () => { ... });
  it("Creates pool with exponential curve", async () => { ... });

  // Trading tests
  it("Buys tokens in PreBonding phase", async () => { ... });
  it("Sells tokens in PreBonding phase", async () => { ... });
  it("Enforces slippage protection", async () => { ... });
  it("Triggers anti-sniper protection", async () => { ... });

  // Graduation tests
  it("Graduates pool at threshold", async () => { ... });
  it("Continues trading after graduation", async () => { ... });
  it("Maintains constant product after graduation", async () => { ... });

  // Security tests
  it("Rejects non-CRX quote tokens", async () => { ... });
  it("Validates oracle prices", async () => { ... });
  it("Prevents custom curve DOS", async () => { ... });
  it("Validates vault authorities", async () => { ... });

  // Edge case tests
  it("Handles graduation on exact threshold", async () => { ... });
  it("Rejects trades with 0 amounts", async () => { ... });
  it("Handles maximum values without overflow", async () => { ... });
});
```

### **11. Emergency Pause**
```rust
// Add to Config
pub is_paused: bool,

// Add to buy.rs and sell.rs
require!(!config.is_paused, ErrorCode::ProtocolPaused);

// Add update_config instruction
pub fn update_config(
    ctx: Context<UpdateConfig>,
    is_paused: bool,
) -> Result<()> {
    require!(
        ctx.accounts.config.authority == ctx.accounts.authority.key(),
        ErrorCode::Unauthorized
    );
    ctx.accounts.config.is_paused = is_paused;
    Ok(())
}
```

---

## **📋 COMPLETE READINESS MATRIX**

| Category | Current | Needed for 5/5 | Status |
|----------|---------|----------------|--------|
| **Core Functionality** | ✅ 95% | 100% | Fix graduated phase |
| **Security** | ⚠️ 60% | 100% | Oracle + validation |
| **Testing** | ❌ 0% | 100% | Add full test suite |
| **Events** | ❌ 0% | 100% | Add emissions |
| **Documentation** | ✅ 90% | 100% | Update for fixes |
| **Deployment** | ⚠️ 70% | 100% | Scripts + validation |

---

## **🚀 IMPLEMENTATION TIMELINE**

### **Phase 1: Critical Fixes (2-3 days)**
- [ ] Implement proper Pyth oracle integration
- [ ] Fix graduated phase constant product
- [ ] Add vault balance validation
- [ ] Add mint authority validation
- [ ] Tighten oracle price bounds

### **Phase 2: High Priority (1-2 days)**
- [ ] Fix anti-sniper consistency
- [ ] Add minimum output validation
- [ ] Fix fee precision loss
- [ ] Add emergency pause mechanism

### **Phase 3: Quality & Testing (3-4 days)**
- [ ] Implement event emissions
- [ ] Write comprehensive test suite
- [ ] Add deployment scripts
- [ ] Update documentation

### **Phase 4: Audit & Launch (4-6 weeks)**
- [ ] Internal testing on devnet (1 week)
- [ ] Professional security audits (4-6 weeks)
- [ ] Bug bounty program (2+ weeks)
- [ ] Mainnet deployment

---

## **💰 ESTIMATED COSTS TO 5/5**

| Item | Cost | Notes |
|------|------|-------|
| Development time | $0 | In-house |
| Security audits (2 firms) | $60k-$120k | Required |
| Bug bounty program | $50k-$100k | Recommended |
| Devnet testing | $0 | Free |
| Mainnet deployment | ~$5 SOL | Minimal |
| **Total** | **$110k-$220k** | Professional launch |

---

## **🎯 WHAT 5/5 MEANS**

✅ **All critical vulnerabilities fixed**
✅ **Real Pyth oracle with cryptographic validation**
✅ **Constant product invariant maintained**
✅ **Comprehensive test coverage (>90%)**
✅ **Event emissions for indexing**
✅ **Emergency controls (pause)**
✅ **Professional security audit passed**
✅ **Deployment scripts tested**
✅ **Documentation complete**
✅ **Bug bounty program active**

---

## **📝 NEXT IMMEDIATE ACTIONS**

1. **Priority 1:** Integrate Pyth SDK for oracle (blocks everything)
2. **Priority 2:** Fix graduated phase math (breaks pools)
3. **Priority 3:** Add validation (prevents exploits)
4. **Priority 4:** Write tests (catches bugs)
5. **Priority 5:** Get professional audit (required for mainnet)

---

**Current Assessment:** Protocol has solid foundation but needs 2-3 weeks of focused development + 4-6 weeks of auditing to reach production readiness.

**Recommended Path:** Fix critical issues (1-2 weeks) → Devnet testing (1 week) → Professional audits (4-6 weeks) → Mainnet launch

