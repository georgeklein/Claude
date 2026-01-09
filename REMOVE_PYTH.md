# Remove Pyth Oracle Dependency

**Goal:** Simplify protocol by removing oracle complexity
**Status:** Ready to implement
**Impact:** Removes 1 account from CreatePool, fixes segfault issue

---

## Why Remove Pyth?

1. **Complexity** - Oracle integration adds account loading, validation, price parsing
2. **Segfault issue** - Current error is oracle account deserialization
3. **Not needed early** - Can use fixed/manual price, update to oracle later
4. **Simpler onboarding** - No need to create/manage oracle accounts

---

## Current Usage

Oracle is ONLY used for one thing: Get CRX price to calculate virtual reserves.

**Current flow:**
```rust
// create_pool.rs:168
let crx_price_usd = get_crx_price_usd(
    &ctx.accounts.crx_price_oracle,  // Load oracle account
    config.oracle_max_age_seconds,
    config.oracle_max_confidence_bps,
)?;

// Then use price for virtual reserves:
let (virtual_quote, virtual_base) = calculate_virtual_reserves_for_market_cap(
    target_market_cap_usd,
    token_supply,
    crx_price_usd,  // ← Only reason we need oracle
)?;
```

---

## Proposed Solution: Manual Price Updates

**Replace oracle with simple u64 in Config:**

```rust
pub struct Config {
    pub authority: Pubkey,
    pub fee_recipient: Pubkey,

    // Remove this:
    // pub crx_price_oracle: Pubkey,

    // Add this:
    pub crx_price_usd: u64,  // e.g., 2_000_000 = $2.00 (6 decimals)
    pub crx_price_last_updated: i64,  // Unix timestamp

    pub crx_mint: Pubkey,
    // ... rest stays same
}
```

**Authority can update price periodically:**
```rust
pub fn update_crx_price(ctx: Context<UpdateCrxPrice>, new_price: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.crx_price_usd = new_price;
    config.crx_price_last_updated = Clock::get()?.unix_timestamp;
    Ok(())
}
```

---

## Code Changes Required

### 1. Update Config Struct

**File:** `programs/creator-amm-v2/src/state.rs`

```rust
#[account]
pub struct Config {
    pub authority: Pubkey,
    pub fee_recipient: Pubkey,

    // REMOVE:
    // pub crx_price_oracle: Pubkey,

    // ADD:
    pub crx_price_usd: u64,              // Current CRX price (6 decimals)
    pub crx_price_last_updated: i64,     // Timestamp of last update

    pub crx_mint: Pubkey,

    pub pre_bonding_fee_bps: u16,
    pub pre_bonding_threshold_usd: u64,
    pub post_bonding_fee_bps: u16,
    pub graduation_threshold_usd: u64,

    pub anti_sniper_window_slots: u64,
    pub anti_sniper_max_trade_bps: u16,

    // REMOVE (oracle-specific):
    // pub oracle_max_age_seconds: i64,
    // pub oracle_max_confidence_bps: u64,

    // ADD (price staleness check):
    pub price_max_age_seconds: i64,      // e.g., 86400 = 24 hours

    pub approved_quote_tokens: [Pubkey; 5],
    pub approved_quote_count: u8,
    pub bump: u8,
}

impl Config {
    pub const LEN: usize = 8 +      // discriminator
        32 +                         // authority
        32 +                         // fee_recipient
        8 +                          // crx_price_usd (NEW)
        8 +                          // crx_price_last_updated (NEW)
        32 +                         // crx_mint
        2 +                          // pre_bonding_fee_bps
        8 +                          // pre_bonding_threshold_usd
        2 +                          // post_bonding_fee_bps
        8 +                          // graduation_threshold_usd
        8 +                          // anti_sniper_window_slots
        2 +                          // anti_sniper_max_trade_bps
        8 +                          // price_max_age_seconds (NEW)
        32 * 5 +                     // approved_quote_tokens
        1 +                          // approved_quote_count
        1;                           // bump
}
```

---

### 2. Update Initialize Instruction

**File:** `programs/creator-amm-v2/src/instructions/initialize.rs`

```rust
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = Config::LEN,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        constraint = authority.key() == DEPLOYER_PUBKEY @ ErrorCode::Unauthorized
    )]
    pub authority: Signer<'info>,

    /// CHECK: Validated by authority
    pub fee_recipient: AccountInfo<'info>,

    // REMOVE:
    // pub crx_price_oracle: AccountInfo<'info>,

    /// CHECK: Validated by authority
    pub crx_mint: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    initial_crx_price_usd: u64,          // NEW PARAM
    pre_bonding_fee_bps: u16,
    pre_bonding_threshold_usd: u64,
    post_bonding_fee_bps: u16,
    graduation_threshold_usd: u64,
    anti_sniper_window_slots: u64,
    anti_sniper_max_trade_bps: u16,
    price_max_age_seconds: i64,          // NEW PARAM (default: 86400 = 24h)
    approved_quote_tokens: [Pubkey; 5],
    approved_quote_count: u8,
) -> Result<()> {
    // Validation...

    let config = &mut ctx.accounts.config;
    let clock = Clock::get()?;

    config.authority = ctx.accounts.authority.key();
    config.fee_recipient = ctx.accounts.fee_recipient.key();

    // NEW:
    config.crx_price_usd = initial_crx_price_usd;
    config.crx_price_last_updated = clock.unix_timestamp;

    config.crx_mint = ctx.accounts.crx_mint.key();

    config.pre_bonding_fee_bps = pre_bonding_fee_bps;
    config.pre_bonding_threshold_usd = pre_bonding_threshold_usd;
    config.post_bonding_fee_bps = post_bonding_fee_bps;
    config.graduation_threshold_usd = graduation_threshold_usd;

    config.anti_sniper_window_slots = anti_sniper_window_slots;
    config.anti_sniper_max_trade_bps = anti_sniper_max_trade_bps;

    // NEW:
    config.price_max_age_seconds = price_max_age_seconds;

    config.approved_quote_tokens = approved_quote_tokens;
    config.approved_quote_count = approved_quote_count;

    config.bump = ctx.bumps.config;

    Ok(())
}
```

---

### 3. Add Update Price Instruction

**File:** `programs/creator-amm-v2/src/instructions/update_crx_price.rs` (NEW FILE)

```rust
use anchor_lang::prelude::*;
use crate::state::Config;
use crate::errors::ErrorCode;
use crate::constants::*;

#[derive(Accounts)]
pub struct UpdateCrxPrice<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        constraint = authority.key() == config.authority @ ErrorCode::Unauthorized
    )]
    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateCrxPrice>, new_price_usd: u64) -> Result<()> {
    // Validate price is reasonable
    require!(
        new_price_usd >= CRX_PRICE_MIN_USD && new_price_usd <= CRX_PRICE_MAX_USD,
        ErrorCode::InvalidCrxPrice
    );

    let config = &mut ctx.accounts.config;
    let clock = Clock::get()?;

    config.crx_price_usd = new_price_usd;
    config.crx_price_last_updated = clock.unix_timestamp;

    msg!("CRX price updated to: ${}", new_price_usd as f64 / 1_000_000.0);

    Ok(())
}
```

---

### 4. Update CreatePool to Use Config Price

**File:** `programs/creator-amm-v2/src/instructions/create_pool.rs`

```rust
#[derive(Accounts)]
pub struct CreatePool<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    // ... pool, quote_mint, base_mint ...

    // REMOVE:
    // #[account(
    //     constraint = crx_price_oracle.key() == config.crx_price_oracle @ ErrorCode::InvalidOracle
    // )]
    // pub crx_price_oracle: Account<'info, PythPriceFeed>,

    // ... vaults, creator, etc. ...
}

pub fn handler(
    ctx: Context<CreatePool>,
    target_market_cap_usd: u64,
    token_supply: u64,
    fee_bps: u16,
    curve_type: CurveType,
    graduation_threshold_usd: u64,
    disable_waa: bool,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let clock = Clock::get()?;

    // Validation...

    // NEW: Check if price is fresh
    let price_age = clock
        .unix_timestamp
        .checked_sub(config.crx_price_last_updated)
        .ok_or(ErrorCode::OraclePriceStale)?;

    require!(
        price_age <= config.price_max_age_seconds,
        ErrorCode::OraclePriceStale  // Reuse error code
    );

    // Use price from config instead of oracle
    let crx_price_usd = config.crx_price_usd;

    // Validate CRX price is reasonable
    require!(
        crx_price_usd >= CRX_PRICE_MIN_USD && crx_price_usd <= CRX_PRICE_MAX_USD,
        ErrorCode::InvalidCrxPrice
    );

    // Rest of function stays the same...
    let (virtual_quote_reserves, virtual_base_reserves) =
        calculate_virtual_reserves_for_market_cap(
            target_market_cap_usd,
            token_supply,
            crx_price_usd,  // ← Now from config, not oracle
        )?;

    // ... rest unchanged ...
}
```

---

### 5. Remove oracle.rs (Optional)

**File:** `programs/creator-amm-v2/src/utils/oracle.rs`

You can DELETE the entire file, or just keep `calculate_virtual_reserves_for_market_cap()` and remove `PythPriceFeed` struct and `get_crx_price_usd()`.

**Simplified oracle.rs:**
```rust
use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::ErrorCode;

/// Calculate virtual reserves for target market cap
pub fn calculate_virtual_reserves_for_market_cap(
    target_market_cap_usd: u64,
    token_supply: u64,
    crx_price_usd: u64,
) -> Result<(u64, u64)> {
    // ... keep this function exactly as is ...
}
```

---

### 6. Update lib.rs

**File:** `programs/creator-amm-v2/src/lib.rs`

```rust
// Add new instruction
pub mod update_crx_price;

// In #[program] module:
pub fn update_crx_price(ctx: Context<UpdateCrxPrice>, new_price_usd: u64) -> Result<()> {
    instructions::update_crx_price::handler(ctx, new_price_usd)
}
```

---

## SDK Changes

**File:** `sdk/ScaleAMM.ts`

### Update initialize():
```typescript
export interface InitializeConfig {
  crxMint: PublicKey;
  // REMOVE: crxPriceOracle: PublicKey;
  feeRecipient: PublicKey;
  initialCrxPriceUsd: number;  // NEW: e.g., 2.0 for $2.00
  // ... rest
}

async initialize(config: InitializeConfig): Promise<string> {
  const priceWithDecimals = new BN(config.initialCrxPriceUsd * 1_000_000);

  const tx = await this.program.methods
    .initialize(
      priceWithDecimals,  // NEW PARAM FIRST
      config.preBondingFeeBps ?? 300,
      // ... rest
    )
    .accounts({
      config: configPda,
      authority: this.wallet.publicKey,
      feeRecipient: config.feeRecipient,
      // REMOVE: crxPriceOracle: config.crxPriceOracle,
      crxMint: config.crxMint,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return tx;
}
```

### Add updateCrxPrice():
```typescript
async updateCrxPrice(newPriceUsd: number): Promise<string> {
  const priceWithDecimals = new BN(newPriceUsd * 1_000_000);
  const [configPda] = this.deriveConfigPda();

  const tx = await this.program.methods
    .updateCrxPrice(priceWithDecimals)
    .accounts({
      config: configPda,
      authority: this.wallet.publicKey,
    })
    .rpc();

  return tx;
}
```

### Update createPool():
```typescript
async createPool(params: CreatePoolParams): Promise<PoolInfo> {
  // Remove oracle fetching
  const configData = await this.program.account.config.fetch(configPda);
  // No longer need: const oracleAccount = configData.crxPriceOracle;

  const tx = await this.program.methods
    .createPool(/* params */)
    .accounts({
      config: configPda,
      pool: poolPda,
      quoteMint: configData.crxMint,
      baseMint: params.baseMint,
      // REMOVE: crxPriceOracle: configData.crxPriceOracle,
      quoteVault: quoteVaultPda,
      baseVault: baseVaultPda,
      creatorBaseAccount: creatorBaseAccount.address,
      creator: this.wallet.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return /* ... */;
}
```

---

## Testing Changes

**File:** `tests/comprehensive.ts`

```typescript
before(async () => {
  // ... setup wallets, mints ...

  // REMOVE oracle creation:
  // crxPriceOracle = await createMockOracle();

  // Initialize with price instead:
  await program.methods
    .initialize(
      new anchor.BN(2_000_000),  // $2.00 CRX price
      300,                        // pre_bonding_fee_bps
      // ... rest of params
    )
    .accounts({
      config,
      authority: authority.publicKey,
      feeRecipient: feeRecipient.publicKey,
      // REMOVE: crxPriceOracle: crxPriceOracle.publicKey,
      crxMint,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();
});

// Add test for price updates:
it("Should update CRX price", async () => {
  await program.methods
    .updateCrxPrice(new anchor.BN(3_000_000))  // Update to $3.00
    .accounts({
      config,
      authority: authority.publicKey,
    })
    .signers([authority])
    .rpc();

  const configData = await program.account.config.fetch(config);
  expect(configData.crxPriceUsd.toString()).to.equal('3000000');
});
```

---

## Benefits

1. **✅ Fixes segfault** - No oracle account to deserialize
2. **✅ Simpler deployment** - Just pass initial price, no oracle setup
3. **✅ Fewer accounts** - CreatePool needs 1 fewer account (cheaper)
4. **✅ Early stage friendly** - Can use fixed price, update manually
5. **✅ Still accurate** - Authority can update price anytime (daily, hourly, etc.)

---

## Migration Path

### Phase 1: Manual Updates (Now)
- Authority updates price via `updateCrxPrice()`
- Can update as often as needed (hourly, daily, etc.)
- Simple automation: cron job calls `updateCrxPrice()`

### Phase 2: Add Oracle Back (Later)
If you need real-time oracle prices:
- Add optional oracle integration
- Keep manual price as fallback
- Use oracle OR manual price (whichever is fresher)

---

## Implementation Time

**Estimated:** 2-3 hours
1. Update structs (30 min)
2. Update instructions (1 hour)
3. Update SDK (30 min)
4. Update tests (30 min)
5. Test on devnet (30 min)

---

## Deployment

After changes:
```bash
# 1. Build
anchor build

# 2. Deploy NEW program (new structure = new program ID)
anchor deploy --provider.cluster devnet

# 3. Initialize with CRX price
await scaleAmm.initialize({
  crxMint: CRX_MINT,
  feeRecipient: YOUR_WALLET,
  initialCrxPriceUsd: 2.0,  // $2.00
});

# 4. Create pool (no oracle needed!)
await scaleAmm.createPool({
  baseMint: TOKEN_MINT,
  supply: 1_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 40_000,
});
```

---

**Ready to implement?** This removes all Pyth complexity and fixes the segfault issue.
