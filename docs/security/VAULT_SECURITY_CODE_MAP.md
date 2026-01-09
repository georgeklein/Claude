# Vault Security Code Map

**Quick reference: Where is each security feature implemented?**

---

## Vault Account Definitions

### Location: `/programs/creator-amm-v2/src/state.rs`

**Lines 99-101: Vault public keys stored in Pool**
```rust
/// Vaults
pub quote_vault: Pubkey,
pub base_vault: Pubkey,
```

**Lines 107-109: Real reserves track actual vault balances**
```rust
/// Real reserves (actual tokens in vaults)
pub real_quote_reserves: u64,
pub real_base_reserves: u64,
```

**Lines 103-105: Virtual reserves for pricing (separate from vaults)**
```rust
/// Virtual reserves (for pricing calculations)
pub virtual_quote_reserves: u64,
pub virtual_base_reserves: u64,
```

---

## Vault Initialization

### Location: `/programs/creator-amm-v2/src/instructions/create_pool.rs`

**Lines 40-65: Vault PDA Initialization**
```rust
/// Pool's quote token vault (CRX)
#[account(
    init,
    payer = creator,
    seeds = [
        b"quote_vault",
        pool.key().as_ref(),
    ],
    bump,
    token::mint = quote_mint,
    token::authority = pool,  // ← CRITICAL: Pool owns vault
)]
pub quote_vault: Account<'info, TokenAccount>,
```

**Lines 219-227: Initial Token Transfer**
```rust
// Transfer initial base tokens from creator to pool
let cpi_accounts = Transfer {
    from: ctx.accounts.creator_base_account.to_account_info(),
    to: ctx.accounts.base_vault.to_account_info(),
    authority: ctx.accounts.creator.to_account_info(),
};
let cpi_program = ctx.accounts.token_program.to_account_info();
let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
token::transfer(cpi_ctx, token_supply)?;
```

**Lines 229-234: POST-TRANSFER VALIDATION**
```rust
// Validate vault balance matches expected amount
ctx.accounts.base_vault.reload()?;
require!(
    ctx.accounts.base_vault.amount == token_supply,
    ErrorCode::ReserveVaultMismatch
);
```

**Lines 195-196: Initialize reserves to match vault**
```rust
pool.real_quote_reserves = 0; // Starts with 0 CRX
pool.real_base_reserves = token_supply; // All tokens deposited
```

---

## Buy Instruction Security

### Location: `/programs/creator-amm-v2/src/instructions/buy.rs`

**Lines 25-37: Vault Constraint Validation**
```rust
#[account(
    mut,
    constraint = quote_vault.key() == pool.quote_vault,
    constraint = quote_vault.owner == pool.key() @ ErrorCode::Unauthorized,
)]
pub quote_vault: Account<'info, TokenAccount>,

#[account(
    mut,
    constraint = base_vault.key() == pool.base_vault,
    constraint = base_vault.owner == pool.key() @ ErrorCode::Unauthorized,
)]
pub base_vault: Account<'info, TokenAccount>,
```

**Lines 146-153: State Updates (BEFORE transfers)**
```rust
// Shared reserve update logic
// CRITICAL: Only swap_amount enters vault (fee already went to creator)
// This maintains x*y=k perfectly - no degradation!
trade::update_reserves(
    pool,
    TradeDirection::Buy,
    swap_amount,  // Only swap amount enters reserves
    base_output,
)?;
```

**Lines 191-211: Token Transfers (AFTER state updates)**
```rust
// Transfer 1: Fee goes directly to creator (if any)
if fee_in_quote > 0 {
    trade::transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.user_quote_account,
        &ctx.accounts.fee_recipient_account,
        ctx.accounts.user.to_account_info(),
        fee_in_quote,
        None,
    )?;
}

// Transfer 2: Swap amount goes to pool vault (NOT full quote_amount)
trade::transfer_tokens(
    &ctx.accounts.token_program,
    &ctx.accounts.user_quote_account,
    &ctx.accounts.quote_vault,
    ctx.accounts.user.to_account_info(),
    swap_amount,
    None,
)?;
```

**Lines 213-228: Vault Withdrawal with PDA Signature**
```rust
// Transfer 3: Base tokens from pool to user
let pool_seeds = &[
    b"pool",
    pool.base_mint.as_ref(),
    &[pool.bump],
];
let signer = &[&pool_seeds[..]];

trade::transfer_tokens(
    &ctx.accounts.token_program,
    &ctx.accounts.base_vault,
    &ctx.accounts.user_base_account,
    pool.to_account_info(),
    base_output,
    Some(signer),  // ← Pool PDA signs
)?;
```

**Lines 253-257: Final Vault Validation**
```rust
// CRITICAL: Always validate vault balances match reserves in production
trade::validate_vault_balances(
    pool,
    &ctx.accounts.quote_vault,
    &ctx.accounts.base_vault,
)?;
```

---

## Sell Instruction Security

### Location: `/programs/creator-amm-v2/src/instructions/sell.rs`

**Lines 25-37: Vault Constraint Validation** (same as buy)

**Lines 162-167: State Updates (BEFORE transfers)**
```rust
trade::update_reserves(
    pool,
    TradeDirection::Sell,
    base_amount,       // Full amount enters reserves
    total_quote_out,   // Total output leaves reserves
)?;
```

**Lines 189-196: User to Vault Transfer**
```rust
// Transfer 1: All base tokens from user to pool vault
trade::transfer_tokens(
    &ctx.accounts.token_program,
    &ctx.accounts.user_base_account,
    &ctx.accounts.base_vault,
    ctx.accounts.user.to_account_info(),
    base_amount,
    None,
)?;
```

**Lines 198-214: Vault to User Transfer (PDA signed)**
```rust
// Setup pool signer for outgoing transfers
let pool_seeds = &[
    b"pool",
    pool.base_mint.as_ref(),
    &[pool.bump],
];
let signer = &[&pool_seeds[..]];

// Transfer 2: Quote tokens from pool to user (after fee deduction)
trade::transfer_tokens(
    &ctx.accounts.token_program,
    &ctx.accounts.quote_vault,
    &ctx.accounts.user_quote_account,
    pool.to_account_info(),
    quote_output,
    Some(signer),
)?;
```

**Lines 217-226: Fee Transfer from Vault**
```rust
// Transfer 3: Total fee (base + WAA) in QUOTE tokens from pool to creator
if total_fee_in_quote > 0 {
    trade::transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.quote_vault,
        &ctx.accounts.fee_recipient_account,
        pool.to_account_info(),
        total_fee_in_quote,
        Some(signer),
    )?;
}
```

**Lines 254-258: Final Vault Validation** (same as buy)

---

## Shared Vault Logic

### Location: `/programs/creator-amm-v2/src/instructions/trade.rs`

**Lines 99-150: Reserve Update Logic**
```rust
pub fn update_reserves(
    pool: &mut Pool,
    direction: TradeDirection,
    input_amount: u64,
    output_amount: u64,
) -> Result<()> {
    match direction {
        TradeDirection::Buy => {
            // Buy: CRX in (input_amount), tokens out (output_amount)
            if matches!(pool.current_phase, CurvePhase::Graduated) {
                // GRADUATED: Update real reserves only
                pool.real_quote_reserves = pool.real_quote_reserves
                    .checked_add(input_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
                pool.real_base_reserves = pool.real_base_reserves
                    .checked_sub(output_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
            } else {
                // PRE-BONDING: Update real reserves only (virtual reserves stay constant)
                pool.real_quote_reserves = pool.real_quote_reserves
                    .checked_add(input_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
                pool.real_base_reserves = pool.real_base_reserves
                    .checked_sub(output_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
        },
        TradeDirection::Sell => {
            // Sell: tokens in (input_amount), CRX out (output_amount)
            if matches!(pool.current_phase, CurvePhase::Graduated) {
                // GRADUATED: Update real reserves only
                pool.real_base_reserves = pool.real_base_reserves
                    .checked_add(input_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
                pool.real_quote_reserves = pool.real_quote_reserves
                    .checked_sub(output_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
            } else {
                // PRE-BONDING: Update real reserves only (virtual reserves stay constant)
                pool.real_base_reserves = pool.real_base_reserves
                    .checked_add(input_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
                pool.real_quote_reserves = pool.real_quote_reserves
                    .checked_sub(output_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
            }
        },
    }
    Ok(())
}
```

**Lines 280-295: Vault Balance Validation**
```rust
/// Validate reserves match vault balances
pub fn validate_vault_balances(
    pool: &Pool,
    quote_vault: &Account<TokenAccount>,
    base_vault: &Account<TokenAccount>,
) -> Result<()> {
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
```

**Lines 297-329: Token Transfer Helper**
```rust
/// Helper to execute token transfer
pub fn transfer_tokens<'info>(
    token_program: &Program<'info, Token>,
    from: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    authority: AccountInfo<'info>,
    amount: u64,
    signer_seeds: Option<&[&[&[u8]]]>,
) -> Result<()> {
    let cpi_accounts = Transfer {
        from: from.to_account_info(),
        to: to.to_account_info(),
        authority,
    };

    if let Some(seeds) = signer_seeds {
        token::transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                cpi_accounts,
                seeds,
            ),
            amount,
        )?;
    } else {
        token::transfer(
            CpiContext::new(token_program.to_account_info(), cpi_accounts),
            amount,
        )?;
    }

    Ok(())
}
```

---

## Error Handling

### Location: `/programs/creator-amm-v2/src/errors.rs`

**Line 47-48: Vault Mismatch Error**
```rust
#[msg("Pool reserves do not match vault balances - potential accounting error")]
ReserveVaultMismatch,
```

**Line 27: Unauthorized Access**
```rust
#[msg("Unauthorized access")]
Unauthorized,
```

**Line 14-15: Math Overflow**
```rust
#[msg("Math overflow occurred")]
MathOverflow,
```

---

## Security Validation Flow

### Every Buy/Sell Transaction Follows This Flow:

```
1. Anchor validates account constraints
   ├─ vault.key() == pool.vault ✓
   └─ vault.owner == pool.key() ✓

2. Handler validates input
   ├─ amount > 0 ✓
   ├─ Anti-sniper check ✓
   └─ Slippage protection ✓

3. Calculate outputs
   ├─ Use checked arithmetic ✓
   └─ Use u128 intermediate precision ✓

4. UPDATE STATE (Effects)
   ├─ update_reserves() with checked_add/sub ✓
   └─ update_statistics() ✓

5. EXECUTE TRANSFERS (Interactions)
   ├─ Fee transfer (if any) ✓
   ├─ User → Vault deposit ✓
   └─ Vault → User withdrawal (PDA signed) ✓

6. VALIDATE FINAL STATE
   └─ validate_vault_balances() ✓
      ├─ real_quote_reserves == quote_vault.amount
      └─ real_base_reserves == base_vault.amount

7. Emit events
   └─ TradeExecuted event ✓
```

---

## Key Security Invariants

### Always True (or transaction fails):

1. **Vault Ownership**
   ```
   quote_vault.owner == pool.key()
   base_vault.owner == pool.key()
   ```

2. **Reserve Balance Match**
   ```
   pool.real_quote_reserves == quote_vault.amount
   pool.real_base_reserves == base_vault.amount
   ```

3. **Checked Arithmetic**
   ```
   All +, -, *, / operations use checked_* variants
   Overflows cause transaction to fail
   ```

4. **CEI Pattern**
   ```
   State updates always complete before first CPI call
   Prevents re-entrancy
   ```

5. **PDA Authority**
   ```
   Only pool PDA can sign for vault withdrawals
   Pool PDA seeds = [b"pool", base_mint, bump]
   ```

6. **No Direct Withdrawal**
   ```
   No instruction allows direct vault access
   All withdrawals are proportional swaps
   ```

---

## Files Without Vault Access

These instructions **DO NOT** touch vaults (safe to modify without vault security review):

- `initialize.rs` - Only initializes Config
- `update_crx_price.rs` - Only updates config.crx_price_usd
- `update_pool_graduation.rs` - Only updates pool.graduation_threshold_crx
- `update_approved_quotes.rs` - Only updates config.approved_quote_tokens

---

## Critical Code Patterns

### Pattern 1: Vault Transfer with Validation
```rust
// Transfer tokens
token::transfer(cpi_ctx, amount)?;

// Reload account data
ctx.accounts.vault.reload()?;

// Validate balance
require!(
    ctx.accounts.vault.amount == expected_amount,
    ErrorCode::ReserveVaultMismatch
);
```

### Pattern 2: Reserve Update with Checked Math
```rust
pool.real_quote_reserves = pool.real_quote_reserves
    .checked_add(input_amount)
    .ok_or(ErrorCode::MathOverflow)?;
```

### Pattern 3: PDA-Signed Transfer
```rust
let pool_seeds = &[
    b"pool",
    pool.base_mint.as_ref(),
    &[pool.bump],
];
let signer = &[&pool_seeds[..]];

trade::transfer_tokens(
    token_program,
    from_vault,
    to_user,
    pool_authority,
    amount,
    Some(signer),
)?;
```

### Pattern 4: Vault Constraints
```rust
#[account(
    mut,
    constraint = vault.key() == pool.vault,
    constraint = vault.owner == pool.key() @ ErrorCode::Unauthorized,
)]
pub vault: Account<'info, TokenAccount>,
```

---

## Testing Locations

All vault security tests should be in:
- `/tests/` (integration tests)
- `/programs/creator-amm-v2/tests/` (unit tests)

Required test coverage:
- ✅ Fake vault attack blocked
- ✅ Balance mismatch detected
- ✅ Overflow protection works
- ✅ Re-entrancy prevented
- ✅ Unauthorized access blocked

---

**End of Code Map**

For detailed security analysis, see:
- Full audit: `SECURITY_AUDIT_VAULT.md`
- Summary: `VAULT_SECURITY_SUMMARY.md`
- Checklist: `VAULT_SECURITY_CHECKLIST.md`
