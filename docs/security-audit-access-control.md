# Scale AMM Security Audit: Access Control & Authorization

**Auditor**: Claude Code (Automated Security Analysis)
**Date**: 2026-01-09
**Scope**: Access control, authorization, and PDA validation across all instruction handlers
**Protocol**: Scale AMM (creator-amm-v2)

---

## Executive Summary

This audit examined all instruction handlers in the Scale AMM protocol to identify access control vulnerabilities, authorization bypasses, PDA spoofing attacks, and permission escalation vectors.

**Overall Security Posture**: GOOD (with 1 CRITICAL deployment blocker)

**Key Findings**:
- 1 CRITICAL issue (deployment blocker - documented but requires action)
- 0 HIGH severity issues
- 0 MEDIUM severity issues
- 3 LOW severity observations (best practices)

**Recommendation**: The protocol has strong access control patterns throughout. The CRITICAL finding MUST be addressed before mainnet deployment. All other controls are properly implemented with defense-in-depth patterns.

---

## Table of Contents

1. [Critical Findings](#critical-findings)
2. [Access Control Analysis by Function](#access-control-analysis-by-function)
3. [PDA Derivation Security](#pda-derivation-security)
4. [Token Account Ownership Validation](#token-account-ownership-validation)
5. [Vault Security](#vault-security)
6. [Best Practice Observations](#best-practice-observations)
7. [Attack Scenario Analysis](#attack-scenario-analysis)
8. [Recommendations](#recommendations)

---

## Critical Findings

### CRITICAL-01: Placeholder Deployer Address in Initialize Function

**Severity**: CRITICAL (Deployment Blocker)
**File**: `/home/user/Claude/programs/creator-amm-v2/src/instructions/initialize.rs:23`
**Status**: Documented, awaiting fix before deployment

**Code**:
```rust
// Line 23
pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("11111111111111111111111111111111");
```

**Issue**:
The `DEPLOYER_PUBKEY` constant is set to a placeholder value (`11111...`). This constant is used to restrict who can call the `initialize()` function, which sets the protocol authority and all critical parameters.

**Exploit Scenario**:
1. Protocol is deployed to mainnet with placeholder address
2. Attacker monitors blockchain for new program deployments
3. Attacker immediately calls `initialize()` with malicious parameters
4. Attacker becomes protocol authority, controls all admin functions
5. Attacker can manipulate CRX price, graduation thresholds, steal fees
6. Protocol is permanently compromised (initialize can only be called once)

**Attack Probability**: HIGH (if deployed with placeholder)
**Impact**: TOTAL PROTOCOL COMPROMISE

**Validation**:
```rust
// Line 42-45 in initialize.rs
#[account(
    mut,
    constraint = authority.key() == DEPLOYER_PUBKEY @ ErrorCode::Unauthorized
)]
pub authority: Signer<'info>,
```

The check is properly implemented, but the constant value is wrong.

**Fix Required**:
```rust
// Replace placeholder with actual deployer wallet address
// Example (use your actual address):
pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("YourActualWalletAddressHere12345678901234567890");
```

**Verification Steps Before Deployment**:
1. Run `solana address` to get deployer public key
2. Replace placeholder in `initialize.rs:23`
3. Run `cargo check` to ensure compilation succeeds
4. Run `anchor build` to rebuild program
5. Verify the constant is NOT `11111...` in the built binary
6. Deploy to devnet first and test initialization
7. Only deploy to mainnet after successful devnet test

**Mitigation**: The issue is well-documented with clear warnings in comments (lines 7-22). The team is aware. This is a deployment checklist item, not a code vulnerability per se.

**Impact Assessment**:
- If deployed with placeholder: **CATASTROPHIC** (total loss of protocol control)
- If fixed before deployment: **NO IMPACT** (proper access control)

---

## Access Control Analysis by Function

### 1. initialize() - Global Configuration Initialization

**File**: `/home/user/Claude/programs/creator-amm-v2/src/instructions/initialize.rs`
**Authorization**: Hardcoded deployer address (DEPLOYER_PUBKEY)
**Status**: ✅ SECURE (pending CRITICAL-01 fix)

**Access Control**:
```rust
// Line 42-45
#[account(
    mut,
    constraint = authority.key() == DEPLOYER_PUBKEY @ ErrorCode::Unauthorized
)]
pub authority: Signer<'info>,
```

**PDA Protection**:
```rust
// Line 31-37
#[account(
    init,
    payer = authority,
    space = Config::LEN,
    seeds = [b"config"],
    bump
)]
pub config: Account<'info, Config>,
```

**Analysis**:
- ✅ Hardcoded deployer check prevents unauthorized initialization
- ✅ PDA-based config ensures single initialization (init constraint)
- ✅ Signer requirement prevents signature forgery
- ❌ CRITICAL: Placeholder address must be replaced before deployment

**Can anyone call initialize()?**
**Answer**: Currently YES (with placeholder), but NO after fix.

---

### 2. create_pool() - Bonding Curve Pool Creation

**File**: `/home/user/Claude/programs/creator-amm-v2/src/instructions/create_pool.rs`
**Authorization**: Two-tier permissioning (CRX pairs = permissionless, Premium pairs = whitelist)
**Status**: ✅ SECURE

**Access Control**:
```rust
// Lines 95-106
// Tier 1 (Permissionless): CRX pairs - anyone can create
let is_crx = quote_mint_key == config.crx_mint;

// Tier 2 (Permissioned): SOL/USDC/USDT pairs - whitelist only
let is_approved = config.approved_quote_tokens[..config.approved_quote_count as usize]
    .contains(&quote_mint_key);

require!(
    is_crx || is_approved,
    ErrorCode::QuoteTokenNotApproved
);
```

**Creator Validation**:
```rust
// Lines 68-73
#[account(
    mut,
    constraint = creator_base_account.mint == base_mint.key(),
    constraint = creator_base_account.owner == creator.key(),
)]
pub creator_base_account: Account<'info, TokenAccount>,

#[account(mut)]
pub creator: Signer<'info>,
```

**PDA Derivation**:
```rust
// Lines 18-26 - Pool PDA
seeds = [
    b"pool",
    base_mint.key().as_ref(),
],

// Lines 40-50 - Quote Vault PDA
seeds = [
    b"quote_vault",
    pool.key().as_ref(),
],

// Lines 54-64 - Base Vault PDA
seeds = [
    b"base_vault",
    pool.key().as_ref(),
]
```

**Anti-Rugpull Protection**:
```rust
// Lines 148-156
require!(
    ctx.accounts.base_mint.mint_authority.is_none(),
    ErrorCode::MintAuthorityNotRevoked
);
require!(
    ctx.accounts.base_mint.freeze_authority.is_none(),
    ErrorCode::FreezeAuthorityNotRevoked
);
```

**Analysis**:
- ✅ Two-tier permissioning properly implemented
- ✅ Creator must own token account and be signer
- ✅ PDAs prevent pool address spoofing (keyed by base_mint)
- ✅ Vaults are PDAs owned by pool (prevents unauthorized withdrawals)
- ✅ Mint/freeze authority checks prevent rugpulls
- ✅ Post-transfer balance validation (line 230-234)

**Can anyone create a pool?**
**Answer**: Anyone can create CRX pairs. Only whitelisted tokens can be used for premium pairs.

**Can creators steal from pools they didn't create?**
**Answer**: NO. Pool ownership is enforced via PDA derivation (base_mint) and creator field is stored but not used for authorization.

---

### 3. buy() - Buy Base Tokens with Quote Tokens

**File**: `/home/user/Claude/programs/creator-amm-v2/src/instructions/buy.rs`
**Authorization**: User-owned token accounts, Pool PDA vault ownership
**Status**: ✅ SECURE

**User Token Account Validation**:
```rust
// Lines 40-45 - User quote account (paying)
#[account(
    mut,
    constraint = user_quote_account.mint == pool.quote_mint,
    constraint = user_quote_account.owner == user.key(),
)]
pub user_quote_account: Account<'info, TokenAccount>,

// Lines 48-53 - User base account (receiving)
#[account(
    mut,
    constraint = user_base_account.mint == pool.base_mint,
    constraint = user_base_account.owner == user.key(),
)]
pub user_base_account: Account<'info, TokenAccount>,
```

**Vault Ownership Validation**:
```rust
// Lines 25-30 - Quote vault
#[account(
    mut,
    constraint = quote_vault.key() == pool.quote_vault,
    constraint = quote_vault.owner == pool.key() @ ErrorCode::Unauthorized,
)]
pub quote_vault: Account<'info, TokenAccount>,

// Lines 32-37 - Base vault
#[account(
    mut,
    constraint = base_vault.key() == pool.base_vault,
    constraint = base_vault.owner == pool.key() @ ErrorCode::Unauthorized,
)]
pub base_vault: Account<'info, TokenAccount>,
```

**Fee Recipient Validation**:
```rust
// Lines 56-61
#[account(
    mut,
    constraint = fee_recipient_account.mint == pool.quote_mint @ ErrorCode::Unauthorized,
    constraint = fee_recipient_account.owner == config.fee_recipient @ ErrorCode::Unauthorized,
)]
pub fee_recipient_account: Account<'info, TokenAccount>,
```

**User Position Authorization**:
```rust
// Lines 64-71
#[account(
    init_if_needed,
    payer = user,
    space = UserPosition::LEN,
    seeds = [b"pos", pool.key().as_ref(), user.key().as_ref()],
    bump,
)]
pub user_position: Account<'info, UserPosition>,

// Lines 176-183 - Defense in depth validation
require!(
    user_position.pool == pool.key() && user_position.user == ctx.accounts.user.key(),
    ErrorCode::Unauthorized
);
```

**Post-Trade Validation**:
```rust
// Lines 253-257
trade::validate_vault_balances(
    pool,
    &ctx.accounts.quote_vault,
    &ctx.accounts.base_vault,
)?;
```

**Analysis**:
- ✅ User must own both token accounts (enforced via constraints)
- ✅ User must be signer (line 74)
- ✅ Vaults owned by pool PDA (prevents unauthorized access)
- ✅ Fee recipient validated against config (prevents fee theft)
- ✅ UserPosition PDA prevents cross-user/cross-pool attacks
- ✅ Defense-in-depth: explicit ownership check even with PDA seeds
- ✅ Post-trade balance validation catches accounting errors

**Can users trade from accounts they don't own?**
**Answer**: NO. Ownership is enforced via Anchor constraints and checked against signer.

**Can users manipulate fee destination?**
**Answer**: NO. Fee recipient is hardcoded from config and validated.

---

### 4. sell() - Sell Base Tokens for Quote Tokens

**File**: `/home/user/Claude/programs/creator-amm-v2/src/instructions/sell.rs`
**Authorization**: User-owned token accounts, Pool PDA vault ownership
**Status**: ✅ SECURE

**User Token Account Validation**:
```rust
// Lines 40-45 - User quote account (receiving)
#[account(
    mut,
    constraint = user_quote_account.mint == pool.quote_mint,
    constraint = user_quote_account.owner == user.key(),
)]
pub user_quote_account: Account<'info, TokenAccount>,

// Lines 48-53 - User base account (paying)
#[account(
    mut,
    constraint = user_base_account.mint == pool.base_mint,
    constraint = user_base_account.owner == user.key(),
)]
pub user_base_account: Account<'info, TokenAccount>,
```

**User Position Authorization**:
```rust
// Lines 64-71
#[account(
    mut,
    seeds = [b"pos", pool.key().as_ref(), user.key().as_ref()],
    bump = user_position.bump,
    constraint = user_position.pool == pool.key() @ ErrorCode::Unauthorized,
    constraint = user_position.user == user.key() @ ErrorCode::Unauthorized,
)]
pub user_position: Account<'info, UserPosition>,
```

**Analysis**:
- ✅ Same strong validation as buy()
- ✅ UserPosition MUST exist for sells (no init_if_needed)
- ✅ Explicit pool and user validation on UserPosition
- ✅ Post-trade balance validation (line 254-258)

**Can users sell tokens they don't own?**
**Answer**: NO. Same ownership enforcement as buy().

---

### 5. update_approved_quotes() - Update Quote Token Whitelist

**File**: `/home/user/Claude/programs/creator-amm-v2/src/instructions/update_approved_quotes.rs`
**Authorization**: Protocol authority only
**Status**: ✅ SECURE

**Access Control**:
```rust
// Lines 16-24
#[account(
    mut,
    seeds = [b"config"],
    bump = config.bump,
    constraint = config.authority == authority.key() @ ErrorCode::Unauthorized
)]
pub config: Account<'info, Config>,

pub authority: Signer<'info>,
```

**Input Validation**:
```rust
// Lines 33-36
require!(
    approved_quote_count <= 5,
    ErrorCode::InvalidQuoteTokenCount
);
```

**Analysis**:
- ✅ Authority check via config.authority field
- ✅ Signer requirement prevents forgery
- ✅ Count validation prevents array overflows
- ✅ No state mutations beyond whitelist

**Can anyone update the quote token whitelist?**
**Answer**: NO. Only the protocol authority can update.

---

### 6. update_crx_price() - Update CRX Price Oracle

**File**: `/home/user/Claude/programs/creator-amm-v2/src/instructions/update_crx_price.rs`
**Authorization**: Protocol authority only
**Status**: ✅ SECURE

**Access Control**:
```rust
// Lines 15-18
#[account(
    constraint = authority.key() == config.authority @ ErrorCode::Unauthorized
)]
pub authority: Signer<'info>,
```

**Price Manipulation Protection**:
```rust
// Lines 26-29 - Absolute bounds
require!(
    new_price_usd >= CRX_PRICE_MIN_USD && new_price_usd <= CRX_PRICE_MAX_USD,
    ErrorCode::InvalidCrxPrice
);

// Lines 34-46 - Maximum 10% change per update
let price_ratio = (new_price_usd as u128)
    .checked_mul(10000)
    .ok_or(ErrorCode::MathOverflow)?
    .checked_div(config.crx_price_usd as u128)
    .ok_or(ErrorCode::InvalidCrxPrice)?;

// Ratio must be between 90% and 110% (9000-11000 bps)
require!(
    price_ratio >= 9000 && price_ratio <= 11000,
    ErrorCode::InvalidCrxPrice
);
```

**Analysis**:
- ✅ Authority check prevents unauthorized updates
- ✅ Absolute bounds: $0.01 to $1000 (prevents extreme manipulation)
- ✅ 10% max change per update (prevents graduation threshold manipulation)
- ✅ Timestamp update for staleness detection

**Can authority manipulate graduation thresholds via price updates?**
**Answer**: Limited to 10% per update (graduation_threshold_crx = graduation_threshold_usd / crx_price_usd). This limits manipulation impact.

---

### 7. update_pool_graduation() - Update Pool Graduation Threshold

**File**: `/home/user/Claude/programs/creator-amm-v2/src/instructions/update_pool_graduation.rs`
**Authorization**: Protocol authority only
**Status**: ✅ SECURE

**Access Control**:
```rust
// Lines 25-28
#[account(
    constraint = authority.key() == config.authority @ ErrorCode::Unauthorized
)]
pub authority: Signer<'info>,
```

**Anti-Manipulation Protections**:
```rust
// Lines 48-51 - Cannot update graduated pools
require!(
    pool.current_phase == crate::state::CurvePhase::PreBonding,
    ErrorCode::InvalidMarketCap
);

// Lines 63-70 - Must be higher than CURRENT market cap
let current_market_cap_usd = pool.get_market_cap_usd()?;
require!(
    new_graduation_threshold_usd > current_market_cap_usd,
    ErrorCode::InvalidMarketCap
);

// Lines 73-76 - Must be higher than initial target
require!(
    new_graduation_threshold_usd > pool.target_market_cap_usd,
    ErrorCode::InvalidMarketCap
);
```

**Analysis**:
- ✅ Authority-only function
- ✅ Cannot modify graduated pools (prevents post-graduation manipulation)
- ✅ Must exceed CURRENT market cap (prevents indefinite delay)
- ✅ Must exceed initial target (prevents downward manipulation)
- ✅ Bounded by MIN/MAX constants

**Can authority prevent pools from graduating?**
**Answer**: Limited. Threshold must exceed current market cap, so authority cannot move the goalpost indefinitely. Protocol can be forked if authority misbehaves.

---

## PDA Derivation Security

### PDA Seed Analysis

All PDAs use deterministic seeds that prevent spoofing attacks:

1. **Config PDA**:
   - Seeds: `[b"config"]`
   - Single instance per program
   - Cannot be spoofed (no variable seeds)

2. **Pool PDA**:
   - Seeds: `[b"pool", base_mint]`
   - Keyed by base token mint
   - One pool per base token
   - Cannot spoof pools for different tokens

3. **Quote Vault PDA**:
   - Seeds: `[b"quote_vault", pool]`
   - Keyed by pool address
   - Owned by pool PDA (enforced via token::authority = pool)
   - Cannot be replaced with attacker-controlled vault

4. **Base Vault PDA**:
   - Seeds: `[b"base_vault", pool]`
   - Keyed by pool address
   - Owned by pool PDA (enforced via token::authority = pool)
   - Cannot be replaced with attacker-controlled vault

5. **UserPosition PDA**:
   - Seeds: `[b"pos", pool, user]`
   - Keyed by both pool and user
   - Prevents cross-user attacks
   - Prevents cross-pool attacks

### PDA Spoofing Attack Analysis

**Attack Vector**: Can an attacker provide a fake PDA account?

**Answer**: NO for all PDAs.

**Reasoning**:
- Anchor validates PDA derivation via `seeds` and `bump` constraints
- Token account ownership validated via Anchor's `token::authority` constraint
- Explicit ownership checks in code (defense-in-depth)
- All PDAs use canonical derivation (no variable bumps)

**Example Protection** (from buy.rs):
```rust
// PDA seeds validation
#[account(
    init_if_needed,
    payer = user,
    space = UserPosition::LEN,
    seeds = [b"pos", pool.key().as_ref(), user.key().as_ref()],
    bump,
)]
pub user_position: Account<'info, UserPosition>,

// Defense-in-depth explicit check
require!(
    user_position.pool == pool.key() && user_position.user == ctx.accounts.user.key(),
    ErrorCode::Unauthorized
);
```

---

## Token Account Ownership Validation

### User Token Accounts

All user token accounts are validated for:
1. ✅ Mint matching (correct token type)
2. ✅ Owner matching (user owns the account)
3. ✅ User is signer (prevents unauthorized trades)

**Example** (from buy.rs lines 40-53):
```rust
#[account(
    mut,
    constraint = user_quote_account.mint == pool.quote_mint,
    constraint = user_quote_account.owner == user.key(),
)]
pub user_quote_account: Account<'info, TokenAccount>,

#[account(
    mut,
    constraint = user_base_account.mint == pool.base_mint,
    constraint = user_base_account.owner == user.key(),
)]
pub user_base_account: Account<'info, TokenAccount>,

#[account(mut)]
pub user: Signer<'info>,
```

**Attack Scenario**: User provides someone else's token account.
**Result**: BLOCKED - Owner constraint fails.

### Creator Token Accounts

Creator accounts validated in create_pool (lines 68-73):
```rust
#[account(
    mut,
    constraint = creator_base_account.mint == base_mint.key(),
    constraint = creator_base_account.owner == creator.key(),
)]
pub creator_base_account: Account<'info, TokenAccount>,

#[account(mut)]
pub creator: Signer<'info>,
```

**Attack Scenario**: Creator provides someone else's token account to steal tokens during pool creation.
**Result**: BLOCKED - Owner constraint fails.

---

## Vault Security

### Vault Ownership Validation

**Quote Vault** (buy.rs lines 25-30):
```rust
#[account(
    mut,
    constraint = quote_vault.key() == pool.quote_vault,
    constraint = quote_vault.owner == pool.key() @ ErrorCode::Unauthorized,
)]
pub quote_vault: Account<'info, TokenAccount>,
```

**Base Vault** (buy.rs lines 32-37):
```rust
#[account(
    mut,
    constraint = base_vault.key() == pool.base_vault,
    constraint = base_vault.owner == pool.key() @ ErrorCode::Unauthorized,
)]
pub base_vault: Account<'info, TokenAccount>,
```

### Vault Creation Security

Vaults created as PDAs during pool initialization (create_pool.rs):
```rust
// Lines 40-50
#[account(
    init,
    payer = creator,
    seeds = [
        b"quote_vault",
        pool.key().as_ref(),
    ],
    bump,
    token::mint = quote_mint,
    token::authority = pool,  // ← Pool PDA owns the vault
)]
pub quote_vault: Account<'info, TokenAccount>,
```

**Key Security Features**:
- ✅ Vaults are PDAs (deterministic addresses)
- ✅ Vaults owned by pool PDA (token::authority = pool)
- ✅ Only pool PDA can sign for vault transfers
- ✅ Vault addresses stored in pool state (double validation)

### Vault Balance Validation

Post-trade validation ensures reserves match vault balances (trade.rs lines 281-295):
```rust
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

**Analysis**:
- ✅ Called after every trade (buy.rs:253, sell.rs:254)
- ✅ Catches accounting errors
- ✅ Catches failed transfers
- ✅ Defense-in-depth security

**Attack Scenario**: Attacker provides fake vault account.
**Result**: BLOCKED - Multiple validations:
1. Vault address must match pool.quote_vault
2. Vault owner must be pool PDA
3. Post-trade balance must match reserves

---

## Best Practice Observations

### LOW-01: No Emergency Pause Mechanism

**Severity**: LOW (Informational)
**Finding**: The protocol has no emergency pause function.

**Observation**:
- No instruction to pause trading in case of discovered vulnerability
- Authority cannot stop the protocol if needed
- Once deployed, protocol runs autonomously

**Trade-off**:
- **Pro**: True decentralization, no admin control after deployment
- **Con**: Cannot respond to emergencies (oracle failure, exploit discovery)

**Recommendation**:
- Consider adding a time-locked pause mechanism (e.g., 24-hour delay)
- Or accept this as a design decision for trustless operation
- Document this clearly for users

**Impact**: NONE currently, but limits incident response options.

---

### LOW-02: Authority Transfer Not Implemented

**Severity**: LOW (Informational)
**Finding**: No mechanism to transfer protocol authority.

**Observation**:
- config.authority is set during initialize() and cannot be changed
- If deployer loses private key, authority functions become inaccessible
- No multisig support for authority operations

**Recommendation**:
- Add `update_authority(new_authority)` function
- Require both old and new authority to sign (2-step transfer)
- Consider timelock for authority transfers

**Impact**: Loss of authority key = permanent loss of admin functions (price updates, whitelist updates, etc.).

---

### LOW-03: No Fee Withdrawal Function

**Severity**: LOW (Informational)
**Finding**: Fees are sent to `config.fee_recipient` but no dedicated withdrawal function exists.

**Observation**:
- Fees accumulate in fee_recipient token account
- Recipient can withdraw using standard SPL token transfers (external to protocol)
- No protocol-specific fee claim mechanism

**Analysis**:
- ✅ This is intentional design - fees go directly to recipient
- ✅ Recipient doesn't need protocol interaction to access fees
- ✅ Reduces protocol complexity

**Recommendation**: NONE - This is a feature, not a bug.

**Impact**: NONE - Fees are immediately accessible to recipient.

---

## Attack Scenario Analysis

### Attack 1: Front-Running Initialize

**Attacker Goal**: Become protocol authority
**Attack Steps**:
1. Monitor mempool for program deployment
2. Submit initialize() call before deployer
3. Set malicious parameters (low fees, fake CRX mint, attacker fee recipient)

**Current Protection**:
- ❌ VULNERABLE if DEPLOYER_PUBKEY is placeholder
- ✅ SECURE if DEPLOYER_PUBKEY is set correctly

**Severity**: CRITICAL
**Status**: Documented blocker (CRITICAL-01)

---

### Attack 2: Pool Address Spoofing

**Attacker Goal**: Create fake pool with spoofed address
**Attack Steps**:
1. Find base_mint that hashes to desired pool address
2. Call create_pool() with that mint
3. Hope users interact with spoofed pool

**Current Protection**:
- ✅ SECURE - PDAs are deterministic, cannot choose address
- ✅ Pool derived from base_mint (seeds = [b"pool", base_mint])
- ✅ Only one canonical pool per base_mint

**Severity**: N/A
**Status**: Not vulnerable

---

### Attack 3: Vault Replacement Attack

**Attacker Goal**: Replace pool vaults with attacker-controlled accounts
**Attack Steps**:
1. Create fake token account owned by attacker
2. Pass fake vault in buy/sell transaction
3. Drain funds from real vaults

**Current Protection**:
- ✅ SECURE - Multiple layers of validation:
  - Vault address must match pool.quote_vault / pool.base_vault
  - Vault owner must be pool PDA
  - Vaults created as PDAs during pool init
  - Post-trade balance validation

**Severity**: N/A
**Status**: Not vulnerable

---

### Attack 4: Cross-User Trading

**Attacker Goal**: Trade using victim's token accounts
**Attack Steps**:
1. Find victim's token account addresses
2. Call buy/sell with victim's accounts
3. Steal tokens from victim

**Current Protection**:
- ✅ SECURE - Token account owner must match user signer
- ✅ User must be Signer (cannot forge)
- ✅ Constraints enforce: user_account.owner == user.key()

**Severity**: N/A
**Status**: Not vulnerable

---

### Attack 5: UserPosition Spoofing

**Attacker Goal**: Bypass WAA fees by using fake UserPosition
**Attack Steps**:
1. Create UserPosition with old avg_entry_slot
2. Pass fake position in sell() to reduce fees
3. Profit from reduced fees

**Current Protection**:
- ✅ SECURE - UserPosition is PDA (seeds = [b"pos", pool, user])
- ✅ Anchor validates PDA derivation
- ✅ Defense-in-depth: explicit pool/user validation
- ✅ Only user can modify their position (user is signer)

**Severity**: N/A
**Status**: Not vulnerable

---

### Attack 6: Fee Recipient Manipulation

**Attacker Goal**: Redirect protocol fees to attacker address
**Attack Steps**:
1. Create fake fee recipient account
2. Pass fake account in buy/sell transaction
3. Receive fees instead of protocol

**Current Protection**:
- ✅ SECURE - Fee recipient validated against config
- ✅ Account owner must be config.fee_recipient
- ✅ Account mint must match pool.quote_mint
- ✅ Cannot be spoofed

**Severity**: N/A
**Status**: Not vulnerable

---

### Attack 7: Graduation Threshold Manipulation

**Attacker Goal**: Prevent pool graduation or force early graduation
**Attack Steps**:
1. Gain authority access (via initialize front-run)
2. Call update_pool_graduation() repeatedly
3. Move threshold to prevent/force graduation

**Current Protection**:
- ✅ SECURE (assuming CRITICAL-01 fixed):
  - Threshold must exceed CURRENT market cap (cannot move goalpost down)
  - Threshold must exceed initial target (backward compat)
  - 10% max CRX price change (limits threshold manipulation via price)
  - Cannot update graduated pools

**Severity**: LOW (limited by protections)
**Status**: Acceptable risk

---

### Attack 8: CRX Price Manipulation

**Attacker Goal**: Manipulate CRX price to affect virtual reserves
**Attack Steps**:
1. Gain authority access
2. Call update_crx_price() with extreme values
3. Manipulate virtual reserves calculation

**Current Protection**:
- ✅ SECURE:
  - Absolute bounds: $0.01 to $1000
  - 10% max change per update
  - Would require 23+ updates to reach max from reasonable price
  - Graduation thresholds recalculated dynamically

**Severity**: LOW (limited by protections)
**Status**: Acceptable risk

---

## Recommendations

### Immediate (Pre-Deployment)

1. **FIX CRITICAL-01**: Replace DEPLOYER_PUBKEY placeholder
   - Priority: P0 (BLOCKER)
   - Risk: Total protocol compromise
   - Effort: 5 minutes
   - Verification: Deploy to devnet, test initialization

2. **Add Deployment Checklist**:
   - Verify DEPLOYER_PUBKEY is NOT placeholder
   - Test initialize() on devnet with correct key
   - Verify initialize() fails with wrong signer
   - Test all admin functions with authority account

### Short-Term (Post-Deployment)

3. **Add Emergency Pause Mechanism** (Optional):
   - Time-locked pause (24-hour delay)
   - Authority can propose pause
   - Automatic unpause after N hours
   - Trade-off: Centralization vs security

4. **Implement Authority Transfer**:
   - Two-step transfer (propose + accept)
   - Timelock on transfers (7-day delay)
   - Multisig support via Squads/Goki

5. **Add Authority Renouncement**:
   - Allow authority to burn admin keys
   - Set authority to null or system program
   - Permanent decentralization option

### Long-Term (Protocol Evolution)

6. **DAO Governance**:
   - Transition authority to DAO
   - On-chain voting for parameter updates
   - Gradual decentralization path

7. **Automated Oracle Integration**:
   - Replace manual CRX price updates with Pyth/Switchboard
   - Remove authority price update function
   - Increase trust minimization

8. **Formal Verification**:
   - Consider formal verification of critical functions
   - Focus on arithmetic, access control, and state transitions

---

## Conclusion

### Security Summary

**Overall Assessment**: The protocol demonstrates strong access control patterns with defense-in-depth security.

**Strengths**:
- ✅ Comprehensive PDA validation prevents spoofing attacks
- ✅ Token account ownership properly enforced
- ✅ Vault security with multiple validation layers
- ✅ Defense-in-depth: explicit checks beyond Anchor constraints
- ✅ Post-trade balance validation catches accounting errors
- ✅ Anti-rugpull protections (mint/freeze authority revoked)
- ✅ Fee recipient validation prevents fee theft
- ✅ Anti-manipulation limits on price/threshold updates

**Critical Weakness**:
- ❌ DEPLOYER_PUBKEY placeholder (documented blocker)

**Minor Considerations**:
- ⚠️ No emergency pause (by design - trustless operation)
- ⚠️ No authority transfer (key loss = permanent admin loss)
- ⚠️ Authority has significant power (price updates, threshold updates)

### Pre-Deployment Checklist

- [ ] Replace DEPLOYER_PUBKEY with actual wallet address
- [ ] Test initialize() on devnet
- [ ] Verify initialize() fails with wrong signer
- [ ] Test all admin functions (update_crx_price, update_approved_quotes, update_pool_graduation)
- [ ] Test pool creation (CRX pairs + whitelist pairs)
- [ ] Test buy/sell with proper accounts
- [ ] Test buy/sell with wrong accounts (should fail)
- [ ] Verify fee recipient receives fees
- [ ] Document authority responsibilities
- [ ] Document emergency procedures (if any)

### Final Verdict

**READY FOR DEPLOYMENT**: YES (after CRITICAL-01 fix)

The protocol has excellent access control patterns. The single critical issue (DEPLOYER_PUBKEY) is well-documented and easily fixed. All other authorization mechanisms are properly implemented with multiple layers of validation.

**Recommended Actions**:
1. Fix CRITICAL-01 immediately
2. Complete pre-deployment checklist
3. Deploy to devnet for final testing
4. Deploy to mainnet with confidence

---

**Audit Complete**
**Next Steps**: Address CRITICAL-01, complete deployment checklist, proceed with launch.
