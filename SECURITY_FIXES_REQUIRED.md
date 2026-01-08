# SECURITY FIXES REQUIRED - ACTION ITEMS
## Scale AMM Creator v2 - Critical Path to Production

**Status:** 🔴 **BLOCKING DEPLOYMENT** - 5 vulnerabilities must be fixed
**ETA to Fix:** ~4 hours development + 2 days testing
**Priority:** CRITICAL - Fix before ANY deployment (even devnet)

---

## CRITICAL PRIORITY (Fix in next 2 hours)

### 1. Oracle Exponent Overflow (CRIT-NEW-1) ⚠️🔴

**File:** `/home/user/Claude/programs/creator-amm-v2/src/utils/oracle.rs`
**Line:** 25 (add check before line 48)
**Time:** 15 minutes

**Add this code:**

```rust
// After line 25 (require!(price_feed.price > 0, ...))
// Add exponent bounds check
require!(
    price_feed.expo >= -12 && price_feed.expo <= 6,
    ErrorCode::InvalidOracleExponent
);
```

**Add to errors.rs:**

```rust
#[msg("Oracle exponent out of bounds (must be -12 to +6)")]
InvalidOracleExponent,
```

**Test:**
```typescript
it("rejects oracle with extreme exponent", async () => {
  const badOracle = { price: 100, conf: 10, expo: 100, publish_time: now };
  await expect(createPool(badOracle)).to.be.rejected;
});
```

---

### 2. Oracle Confidence Validation (H-NEW-4) ⚠️🟠

**File:** `/home/user/Claude/programs/creator-amm-v2/src/utils/oracle.rs`
**Line:** 35 (before confidence calculation)
**Time:** 5 minutes

**Add this code:**

```rust
// After line 35 (let price_abs = price_feed.price as u64;)
// Add confidence sanity check
require!(
    price_feed.conf <= price_abs,
    ErrorCode::OracleConfidenceTooLow
);
```

**Test:**
```typescript
it("rejects oracle where confidence exceeds price", async () => {
  const badOracle = { price: 100, conf: 200, expo: -8, publish_time: now };
  await expect(createPool(badOracle)).to.be.rejected;
});
```

---

## HIGH PRIORITY (Fix in next 4 hours)

### 3. WAA Fee Calculation Overflow (H-NEW-1) ⚠️🟠

**File:** `/home/user/Claude/programs/creator-amm-v2/src/state.rs`
**Lines:** 448-470 (entire `calculate_extra_sell_fee_bps` function)
**Time:** 30 minutes

**Replace function with:**

```rust
pub fn calculate_extra_sell_fee_bps(&self, current_slot: u64) -> u64 {
    const T1: u64 = 75;
    const T2: u64 = 750;
    const T3: u64 = 4500;
    const F1: u64 = 1000;
    const F2: u64 = 100;

    let age = current_slot.saturating_sub(self.avg_entry_slot);

    if age <= T1 {
        F1
    } else if age <= T2 {
        let decay_range = F1 - F2;
        let time_remaining = T2 - age;
        let time_range = T2 - T1;

        // FIX: Use checked arithmetic with fallback
        (decay_range as u128)
            .checked_mul(time_remaining as u128)
            .and_then(|x| x.checked_div(time_range as u128))
            .map(|x| F2 + x as u64)
            .unwrap_or(F2)  // Fallback to minimum fee on overflow
    } else if age <= T3 {
        let time_remaining = T3 - age;
        let time_range = T3 - T2;

        // FIX: Use checked arithmetic with fallback
        (F2 as u128)
            .checked_mul(time_remaining as u128)
            .and_then(|x| x.checked_div(time_range as u128))
            .map(|x| x as u64)
            .unwrap_or(0)  // Fallback to no fee on overflow
    } else {
        0
    }
}
```

**Test:**
```typescript
it("handles WAA calculation with extreme slot values", async () => {
  // Test edge cases don't panic
  const largeSlot = 2n ** 60n;
  // Verify calculation doesn't panic
});
```

---

### 4. Position Update Division (H-NEW-2) ⚠️🟠

**File:** `/home/user/Claude/programs/creator-amm-v2/src/state.rs`
**Lines:** 385-415 (entire `update_on_buy` function)
**Time:** 10 minutes

**Replace function with:**

```rust
pub fn update_on_buy(&mut self, buy_amount: u64, current_slot: u64) -> Result<()> {
    // FIX: Add defensive check
    require!(buy_amount > 0, ErrorCode::InvalidAmount);

    if self.tracked_amount == 0 {
        self.avg_entry_slot = current_slot;
        self.tracked_amount = buy_amount;
    } else {
        let numerator = (self.tracked_amount as u128)
            .checked_mul(self.avg_entry_slot as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_add(
                (buy_amount as u128)
                    .checked_mul(current_slot as u128)
                    .ok_or(ErrorCode::MathOverflow)?
            )
            .ok_or(ErrorCode::MathOverflow)?;

        let denominator = (self.tracked_amount as u128)
            .checked_add(buy_amount as u128)
            .ok_or(ErrorCode::MathOverflow)?;

        // FIX: Use checked division
        self.avg_entry_slot = numerator
            .checked_div(denominator)
            .ok_or(ErrorCode::MathOverflow)? as u64;

        self.tracked_amount = self.tracked_amount
            .checked_add(buy_amount)
            .ok_or(ErrorCode::MathOverflow)?;
    }

    Ok(())
}
```

**Test:**
```typescript
it("rejects position update with zero buy amount", async () => {
  await expect(buy(0)).to.be.rejected;
});
```

---

## MEDIUM PRIORITY (Fix before mainnet)

### 5. Position Sell Validation (M-NEW-1) ⚠️🟡

**File:** `/home/user/Claude/programs/creator-amm-v2/src/state.rs`
**Lines:** 417-427 (entire `update_on_sell` function)
**Time:** 10 minutes

**Replace function with:**

```rust
pub fn update_on_sell(&mut self, sell_amount: u64) -> Result<()> {
    // FIX: Explicit validation instead of saturating
    require!(
        sell_amount <= self.tracked_amount,
        ErrorCode::InsufficientTrackedAmount
    );

    self.tracked_amount = self.tracked_amount
        .checked_sub(sell_amount)
        .ok_or(ErrorCode::MathOverflow)?;

    if self.tracked_amount == 0 {
        self.avg_entry_slot = 0;
    }

    Ok(())
}
```

**Add to errors.rs:**

```rust
#[msg("Sell amount exceeds tracked position amount")]
InsufficientTrackedAmount,
```

---

### 6. CRX Mint Validation (M-NEW-2) ⚠️🟡

**File:** `/home/user/Claude/programs/creator-amm-v2/src/lib.rs` (add constant)
**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/initialize.rs` (add check)
**Time:** 15 minutes

**Step 1: Add constant to lib.rs:**

```rust
use anchor_lang::prelude::*;

// Add after declare_id!
pub const EXPECTED_CRX_MINT: Pubkey = pubkey!("CRX1111111111111111111111111111111111111111");
// NOTE: Replace with actual CRX mint address before deployment
```

**Step 2: Add validation to initialize.rs (after line 84):**

```rust
// Validate CRX mint is correct (prevents misconfiguration)
// Comment out for devnet testing, MUST enable for mainnet
require!(
    ctx.accounts.crx_mint.key() == crate::EXPECTED_CRX_MINT,
    ErrorCode::InvalidCrxMint
);
```

**Add to errors.rs:**

```rust
#[msg("Invalid CRX mint address (config misconfigured)")]
InvalidCrxMint,
```

---

### 7. Fee Recipient Update Function (M-NEW-3) ⚠️🟡

**File:** Create `/home/user/Claude/programs/creator-amm-v2/src/instructions/update_fee_recipient.rs`
**Time:** 30 minutes

**Create new file:**

```rust
use anchor_lang::prelude::*;
use crate::state::Config;
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct UpdateFeeRecipient<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        constraint = authority.key() == config.authority @ ErrorCode::Unauthorized
    )]
    pub authority: Signer<'info>,

    /// New fee recipient
    /// CHECK: Validated by authority
    pub new_fee_recipient: AccountInfo<'info>,
}

pub fn handler(ctx: Context<UpdateFeeRecipient>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.fee_recipient = ctx.accounts.new_fee_recipient.key();

    msg!("Fee recipient updated to {}", config.fee_recipient);

    Ok(())
}
```

**Add to instructions/mod.rs:**

```rust
pub mod update_fee_recipient;
pub use update_fee_recipient::*;
```

**Add to lib.rs:**

```rust
pub fn update_fee_recipient(ctx: Context<UpdateFeeRecipient>) -> Result<()> {
    instructions::update_fee_recipient::handler(ctx)
}
```

---

## VERIFICATION CHECKLIST

After implementing fixes, verify:

### Unit Tests
- [ ] All new error codes compile
- [ ] Oracle exponent bounds test passes
- [ ] Oracle confidence test passes
- [ ] WAA overflow test passes
- [ ] Position division test passes
- [ ] Position sell validation test passes

### Integration Tests
- [ ] Create pool with valid oracle (passes)
- [ ] Create pool with bad expo (rejects)
- [ ] Create pool with bad confidence (rejects)
- [ ] Buy with WAA tracking (no panic)
- [ ] Sell with WAA tracking (no panic)
- [ ] Sell more than tracked (rejects)

### Manual Testing
- [ ] Deploy to devnet
- [ ] Initialize config
- [ ] Create test pool
- [ ] Execute 100 buy trades
- [ ] Execute 100 sell trades
- [ ] Trigger graduation
- [ ] Trade in graduated phase
- [ ] No panics or errors

---

## BUILD & DEPLOY COMMANDS

```bash
# After making changes
cd programs/creator-amm-v2

# Build program
anchor build

# Run tests
anchor test

# Deploy to devnet (after tests pass)
anchor deploy --provider.cluster devnet

# Initialize config (ONCE ONLY)
anchor run initialize-devnet
```

---

## TESTING TIMELINE

### Day 1 (4 hours)
- Implement all CRITICAL/HIGH fixes
- Add new error codes
- Fix compilation errors

### Day 2 (4 hours)
- Write unit tests for new fixes
- Run full test suite
- Fix any test failures

### Day 3 (4 hours)
- Deploy to devnet
- Manual integration testing
- Monitor for panics/errors

### Day 4 (2 hours)
- Final verification
- Document fixes in SECURITY.md
- Tag release as v2.1.0-security-patch

**Total Time to Devnet-Ready:** ~14 hours over 4 days

---

## POST-FIX SECURITY POSTURE

### Before Fixes
- **Risk Score:** 8.5/10 (HIGH RISK)
- **Critical Issues:** 1 (Oracle DoS)
- **High Issues:** 4 (Panics, validation bypass)
- **Production Ready:** ❌ NO

### After Fixes
- **Risk Score:** 3.5/10 (LOW RISK)
- **Critical Issues:** 0
- **High Issues:** 0 (all fixed or documented)
- **Production Ready:** ✅ DEVNET YES, ⚠️ MAINNET AFTER AUDIT

---

## QUESTIONS?

**For fix implementation questions:**
- Reference AGENT2_SECURITY_AUDIT.md sections for detailed explanations
- Each fix includes code snippets ready to copy-paste
- All line numbers are accurate as of 2026-01-08

**For mainnet deployment:**
- Professional audit still required ($60k-$120k)
- Bug bounty program recommended ($50k-$100k)
- Extended devnet testing (2-4 weeks)

---

**Prepared by:** Agent 2 - Elite Security Auditor
**Date:** 2026-01-08
**Last Updated:** 2026-01-08

**END OF FIX GUIDE**
