# Vault Security Quick Reference

**For developers modifying vault-touching code**

---

## ⚠️ CRITICAL: If you touch ANY of these files, run this checklist

### Files that handle vaults:
- `/programs/creator-amm-v2/src/instructions/create_pool.rs`
- `/programs/creator-amm-v2/src/instructions/buy.rs`
- `/programs/creator-amm-v2/src/instructions/sell.rs`
- `/programs/creator-amm-v2/src/instructions/trade.rs`
- `/programs/creator-amm-v2/src/state.rs`

---

## Security Checklist

### ✅ 1. Vault Account Validation

**Location:** buy.rs, sell.rs

**Required constraints:**
```rust
#[account(
    mut,
    constraint = quote_vault.key() == pool.quote_vault,
    constraint = quote_vault.owner == pool.key() @ ErrorCode::Unauthorized,
)]
pub quote_vault: Account<'info, TokenAccount>,
```

**Why:** Prevents attacker from substituting their own vault

**Test:** Try passing fake vault - should fail with `Unauthorized`

---

### ✅ 2. CEI Pattern (Checks-Effects-Interactions)

**Location:** All trade instructions

**Required order:**
```rust
// 1. CHECKS
validate_trade_preconditions(amount)?;
check_anti_sniper_protection(...)?;
validate_slippage(output, min_output)?;

// 2. EFFECTS (State Updates)
trade::update_reserves(pool, ...)?;
trade::update_statistics(pool, ...)?;
user_position.update_on_buy(...)?;

// 3. INTERACTIONS (Token Transfers)
trade::transfer_tokens(...)?;
trade::transfer_tokens(...)?;

// 4. VALIDATION
trade::validate_vault_balances(...)?;
```

**Why:** Prevents re-entrancy attacks

**Test:** All state mutations before first CPI call

---

### ✅ 3. Checked Arithmetic on Reserves

**Location:** state.rs, trade.rs

**Required:**
```rust
pool.real_quote_reserves = pool.real_quote_reserves
    .checked_add(input_amount)
    .ok_or(ErrorCode::MathOverflow)?;

pool.real_base_reserves = pool.real_base_reserves
    .checked_sub(output_amount)
    .ok_or(ErrorCode::MathOverflow)?;
```

**Why:** Prevents integer overflow/underflow

**Test:** Try max values - should fail with `MathOverflow`

---

### ✅ 4. Post-Transfer Vault Validation

**Location:** buy.rs:253-257, sell.rs:254-258

**Required:**
```rust
trade::validate_vault_balances(
    pool,
    &ctx.accounts.quote_vault,
    &ctx.accounts.base_vault,
)?;
```

**Why:** Catches any accounting errors

**Test:** Manually corrupt reserves in test - should fail with `ReserveVaultMismatch`

---

### ✅ 5. Vault Reload After Transfers

**Location:** create_pool.rs:230

**Required:**
```rust
// After CPI transfer
ctx.accounts.base_vault.reload()?;

// Then validate
require!(
    ctx.accounts.base_vault.amount == token_supply,
    ErrorCode::ReserveVaultMismatch
);
```

**Why:** Gets fresh account data after CPI

**Test:** Remove reload - test should fail

---

### ✅ 6. Proper PDA Signer Seeds

**Location:** buy.rs:214-219, sell.rs:199-204

**Required:**
```rust
let pool_seeds = &[
    b"pool",
    pool.base_mint.as_ref(),
    &[pool.bump],  // ← Must match pool derivation
];
let signer = &[&pool_seeds[..]];

trade::transfer_tokens(
    &ctx.accounts.token_program,
    &ctx.accounts.base_vault,
    &ctx.accounts.user_base_account,
    pool.to_account_info(),
    amount,
    Some(signer),  // ← Pass signer for PDA-signed transfers
)?;
```

**Why:** Allows pool PDA to sign for vault withdrawals

**Test:** Wrong seeds should fail with signature verification error

---

### ✅ 7. Vault Initialization Security

**Location:** create_pool.rs:40-65

**Required:**
```rust
#[account(
    init,  // ← Must not exist
    payer = creator,
    seeds = [b"quote_vault", pool.key().as_ref()],
    bump,
    token::mint = quote_mint,
    token::authority = pool,  // ← Authority must be pool PDA
)]
pub quote_vault: Account<'info, TokenAccount>,
```

**Why:** Prevents PDA collision attacks

**Test:** Try initializing twice - should fail

---

## Common Mistakes to Avoid

### ❌ NEVER do this:
```rust
// Bad: Updating state after transfer
trade::transfer_tokens(...)?;
pool.real_quote_reserves += amount; // ← State update after CPI!
```

### ✅ ALWAYS do this:
```rust
// Good: Update state before transfer
pool.real_quote_reserves = pool.real_quote_reserves
    .checked_add(amount)
    .ok_or(ErrorCode::MathOverflow)?;
trade::transfer_tokens(...)?;
```

---

### ❌ NEVER do this:
```rust
// Bad: Unchecked arithmetic
pool.real_quote_reserves += amount; // ← Can overflow!
```

### ✅ ALWAYS do this:
```rust
// Good: Checked arithmetic
pool.real_quote_reserves = pool.real_quote_reserves
    .checked_add(amount)
    .ok_or(ErrorCode::MathOverflow)?;
```

---

### ❌ NEVER do this:
```rust
// Bad: No post-transfer validation
trade::transfer_tokens(...)?;
Ok(()) // ← Missing validation!
```

### ✅ ALWAYS do this:
```rust
// Good: Validate after transfers
trade::transfer_tokens(...)?;
trade::validate_vault_balances(pool, quote_vault, base_vault)?;
Ok(())
```

---

### ❌ NEVER do this:
```rust
// Bad: No vault ownership check
#[account(mut)]
pub quote_vault: Account<'info, TokenAccount>,
```

### ✅ ALWAYS do this:
```rust
// Good: Validate ownership
#[account(
    mut,
    constraint = quote_vault.key() == pool.quote_vault,
    constraint = quote_vault.owner == pool.key() @ ErrorCode::Unauthorized,
)]
pub quote_vault: Account<'info, TokenAccount>,
```

---

## Testing Vault Security

### Required Test Cases

#### 1. Test fake vault attack
```rust
#[test]
fn test_fake_vault_attack() {
    // Create malicious vault
    let fake_vault = create_token_account(&attacker);

    // Try to call buy with fake vault
    let result = buy(
        pool,
        fake_vault,  // ← Attacker's vault
        user,
        amount,
    );

    // Should fail
    assert_eq!(result.unwrap_err(), ErrorCode::Unauthorized);
}
```

#### 2. Test balance validation
```rust
#[test]
fn test_vault_balance_mismatch() {
    // Manually corrupt reserves
    pool.real_quote_reserves = 1_000_000;
    // But vault actually has 500_000

    // Try to sell
    let result = sell(pool, user, amount);

    // Should fail at validation
    assert_eq!(result.unwrap_err(), ErrorCode::ReserveVaultMismatch);
}
```

#### 3. Test integer overflow
```rust
#[test]
fn test_reserve_overflow() {
    // Set reserves near max
    pool.real_quote_reserves = u64::MAX - 100;

    // Try to buy with large amount
    let result = buy(pool, user, u64::MAX);

    // Should fail at checked_add
    assert_eq!(result.unwrap_err(), ErrorCode::MathOverflow);
}
```

#### 4. Test unauthorized withdrawal
```rust
#[test]
fn test_direct_vault_withdrawal() {
    // Try to transfer from vault without pool signature
    let result = token::transfer(
        CpiContext::new(token_program, Transfer {
            from: quote_vault,
            to: attacker_account,
            authority: attacker, // ← Not pool PDA
        }),
        amount,
    );

    // Should fail - wrong authority
    assert!(result.is_err());
}
```

---

## Code Review Checklist

When reviewing PR that touches vaults:

- [ ] All reserve updates use `checked_*` operations
- [ ] CEI pattern maintained (state before transfers)
- [ ] Post-transfer validation present
- [ ] Vault constraints include ownership check
- [ ] PDA signer seeds match pool derivation
- [ ] No new withdrawal paths added
- [ ] Test coverage for new code paths
- [ ] No direct vault account access (always through pool)

---

## Emergency Response

### If you discover a vault vulnerability:

1. **DO NOT** commit the fix publicly (exploiters watch GitHub)
2. **DO** pause the protocol if emergency pause exists
3. **DO** notify the team privately
4. **DO** prepare a fix and test thoroughly
5. **DO** deploy fix and security advisory simultaneously

### How to tell if it's a real vulnerability:

**Real vulnerability:** Allows unauthorized vault drainage
**Not a vulnerability:** Centralization risk, UX issue, or pricing concern

Examples:
- ✅ Real: Can call buy() with fake vault → drain funds
- ❌ Not real: Authority can update CRX price → user confusion

---

## References

- Full audit: `/home/user/Claude/SECURITY_AUDIT_VAULT.md`
- Summary: `/home/user/Claude/VAULT_SECURITY_SUMMARY.md`
- Anchor security: https://www.anchor-lang.com/docs/security
- Solana security best practices: https://solana.com/developers/guides/advanced/security-intro

---

**Last Updated:** 2026-01-09
**Maintained By:** Security team
