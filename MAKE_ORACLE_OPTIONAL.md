# Make Oracle Optional for Pools

**Goal:** Pools can optionally use oracle, but default to config price
**Status:** Ready to implement
**Impact:** Fixes segfault, keeps flexibility

---

## Solution: Use Config Price, Oracle Optional

**Current (Required):**
```rust
pub crx_price_oracle: Account<'info, PythPriceFeed>,  // ← REQUIRED, causes segfault
```

**New (Optional):**
```rust
// Remove oracle from CreatePool entirely
// Use config.crx_price_usd instead
// Can add oracle support later as separate feature
```

---

## Minimal Changes Required

### 1. Add CRX Price to Config

**File:** `programs/creator-amm-v2/src/state.rs`

```rust
#[account]
pub struct Config {
    pub authority: Pubkey,
    pub fee_recipient: Pubkey,

    pub crx_price_oracle: Pubkey,        // Keep for backward compat (unused)

    // ADD:
    pub crx_price_usd: u64,              // Fallback price (6 decimals)
    pub crx_price_last_updated: i64,     // Timestamp

    pub crx_mint: Pubkey,
    // ... rest unchanged
}

impl Config {
    pub const LEN: usize = 8 +
        32 + 32 +                        // authority, fee_recipient
        32 +                             // crx_price_oracle (keep)
        8 + 8 +                          // crx_price_usd, crx_price_last_updated (NEW)
        32 +                             // crx_mint
        2 + 8 + 2 + 8 +                  // fees and thresholds
        8 + 2 +                          // anti-sniper
        8 + 8 +                          // oracle settings (keep)
        32 * 5 + 1 + 1;                  // approved tokens, bump
}
```

---

### 2. Update Initialize to Set Default Price

**File:** `programs/creator-amm-v2/src/instructions/initialize.rs`

```rust
pub fn handler(
    ctx: Context<Initialize>,
    initial_crx_price_usd: u64,          // NEW PARAM
    pre_bonding_fee_bps: u16,
    // ... rest of params
) -> Result<()> {
    // ... validation ...

    let config = &mut ctx.accounts.config;
    let clock = Clock::get()?;

    config.authority = ctx.accounts.authority.key();
    config.fee_recipient = ctx.accounts.fee_recipient.key();
    config.crx_price_oracle = ctx.accounts.crx_price_oracle.key();  // Keep

    // NEW:
    config.crx_price_usd = initial_crx_price_usd;
    config.crx_price_last_updated = clock.unix_timestamp;

    config.crx_mint = ctx.accounts.crx_mint.key();

    // ... rest unchanged

    Ok(())
}
```

---

### 3. Remove Oracle from CreatePool

**File:** `programs/creator-amm-v2/src/instructions/create_pool.rs`

```rust
#[derive(Accounts)]
pub struct CreatePool<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = creator,
        space = Pool::LEN,
        seeds = [b"pool", base_mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,

    pub quote_mint: Account<'info, Mint>,
    pub base_mint: Account<'info, Mint>,

    // REMOVE THIS ENTIRE BLOCK:
    // #[account(
    //     constraint = crx_price_oracle.key() == config.crx_price_oracle @ ErrorCode::InvalidOracle
    // )]
    // pub crx_price_oracle: Account<'info, PythPriceFeed>,

    #[account(
        init,
        payer = creator,
        seeds = [b"quote_vault", pool.key().as_ref()],
        bump,
        token::mint = quote_mint,
        token::authority = pool,
    )]
    pub quote_vault: Account<'info, TokenAccount>,

    // ... rest unchanged
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
    // ... validation ...

    // REPLACE oracle price fetch:
    // let crx_price_usd = get_crx_price_usd(&ctx.accounts.crx_price_oracle, ...)?;

    // WITH config price:
    let crx_price_usd = config.crx_price_usd;

    // Validate price is reasonable
    require!(
        crx_price_usd >= CRX_PRICE_MIN_USD && crx_price_usd <= CRX_PRICE_MAX_USD,
        ErrorCode::InvalidCrxPrice
    );

    // Rest stays the same...
    let (virtual_quote_reserves, virtual_base_reserves) =
        calculate_virtual_reserves_for_market_cap(
            target_market_cap_usd,
            token_supply,
            crx_price_usd,
        )?;

    // ... rest unchanged
}
```

---

### 4. Add Price Update Instruction

**File:** `programs/creator-amm-v2/src/instructions/update_crx_price.rs` (NEW)

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
    require!(
        new_price_usd >= CRX_PRICE_MIN_USD && new_price_usd <= CRX_PRICE_MAX_USD,
        ErrorCode::InvalidCrxPrice
    );

    let config = &mut ctx.accounts.config;
    let clock = Clock::get()?;

    config.crx_price_usd = new_price_usd;
    config.crx_price_last_updated = clock.unix_timestamp;

    msg!("CRX price updated to: {}", new_price_usd);

    Ok(())
}
```

---

### 5. Register New Instruction

**File:** `programs/creator-amm-v2/src/lib.rs`

```rust
pub mod instructions {
    // ... existing
    pub mod update_crx_price;
}

use instructions::*;

#[program]
pub mod creator_amm_v2 {
    use super::*;

    // ... existing instructions

    pub fn update_crx_price(ctx: Context<UpdateCrxPrice>, new_price_usd: u64) -> Result<()> {
        instructions::update_crx_price::handler(ctx, new_price_usd)
    }
}
```

---

## SDK Changes

**File:** `sdk/ScaleAMM.ts`

### Update initialize():
```typescript
export interface InitializeConfig {
  crxMint: PublicKey;
  crxPriceOracle: PublicKey;          // Keep for backward compat
  feeRecipient: PublicKey;
  initialCrxPriceUsd: number;         // NEW: e.g., 2.0
  // ... rest
}

async initialize(config: InitializeConfig): Promise<string> {
  const priceWithDecimals = new BN(config.initialCrxPriceUsd * 1_000_000);

  const tx = await this.program.methods
    .initialize(
      priceWithDecimals,                // NEW: First param
      config.preBondingFeeBps ?? 300,
      // ... rest of params
    )
    .accounts({
      config: configPda,
      authority: this.wallet.publicKey,
      feeRecipient: config.feeRecipient,
      crxPriceOracle: config.crxPriceOracle,  // Keep
      crxMint: config.crxMint,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return tx;
}
```

### Update createPool() - Remove oracle:
```typescript
async createPool(params: CreatePoolParams): Promise<PoolInfo> {
  const [configPda] = this.deriveConfigPda();
  const [poolPda] = this.derivePoolPda(params.baseMint);
  const [quoteVaultPda] = this.deriveQuoteVaultPda(poolPda);
  const [baseVaultPda] = this.deriveBaseVaultPda(poolPda);

  const configData = await this.program.account.config.fetch(configPda);

  const creatorBaseAccount = await getOrCreateAssociatedTokenAccount(
    this.connection,
    this.wallet.payer,
    params.baseMint,
    this.wallet.publicKey
  );

  const curveTypeEnum = params.curveType === 'Exponential'
    ? { exponential: {} }
    : { constantProduct: {} };

  const tx = await this.program.methods
    .createPool(
      targetMarketCapUsd,
      tokenSupply,
      feeBps,
      curveTypeEnum,
      graduationThresholdUsd,
      disableWaa
    )
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

---

## Test Changes

**File:** `tests/comprehensive.ts`

```typescript
before(async () => {
  // ... setup ...

  crxMint = await createMint(provider.connection, authority, authority.publicKey, null, 6);
  crxPriceOracle = await createMockOracle();  // Keep for tests

  [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

  await program.methods
    .initialize(
      new anchor.BN(2_000_000),          // NEW: Initial CRX price $2.00
      300,                                // pre_bonding_fee_bps
      new anchor.BN(40_000_000_000),     // pre_bonding_threshold_usd
      100,                                // post_bonding_fee_bps
      new anchor.BN(85_000_000_000),     // graduation_threshold_usd
      new anchor.BN(20),                 // anti_sniper_window_slots
      500,                                // anti_sniper_max_trade_bps
      new anchor.BN(60),                 // oracle_max_age_seconds
      new anchor.BN(100)                 // oracle_max_confidence_bps
    )
    .accounts({
      config,
      authority: authority.publicKey,
      feeRecipient: feeRecipient.publicKey,
      crxPriceOracle: crxPriceOracle.publicKey,  // Keep
      crxMint,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();
});

async function createPool(
  baseMint: PublicKey,
  targetMarketCapUsd: anchor.BN,
  tokenSupply: anchor.BN,
  feeBps: number,
  curveType: any,
  graduationThresholdUsd: anchor.BN
) {
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), baseMint.toBuffer()],
    program.programId
  );
  const [quoteVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("quote_vault"), pool.toBuffer()],
    program.programId
  );
  const [baseVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("base_vault"), pool.toBuffer()],
    program.programId
  );
  const creatorBaseAccount = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    creator,
    baseMint,
    creator.publicKey
  );

  await program.methods
    .createPool(targetMarketCapUsd, tokenSupply, feeBps, curveType, graduationThresholdUsd, false)
    .accounts({
      config,
      pool,
      quoteMint: crxMint,
      baseMint,
      // REMOVE: crxPriceOracle: crxPriceOracle.publicKey,
      quoteVault,
      baseVault,
      creatorBaseAccount: creatorBaseAccount.address,
      creator: creator.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([creator])
    .rpc();

  return { pool, quoteVault, baseVault };
}
```

---

## Deployment Steps

```bash
# 1. Build
anchor build

# 2. Update program ID in lib.rs and Anchor.toml
solana address -k target/deploy/creator_amm_v2-keypair.json

# 3. Deploy
anchor deploy --provider.cluster devnet

# 4. Initialize with price
await scaleAmm.initialize({
  crxMint: CRX_MINT,
  crxPriceOracle: PublicKey.default,     // Dummy, not used
  feeRecipient: YOUR_WALLET,
  initialCrxPriceUsd: 2.0,               // $2.00
});

# 5. Create pool (NO ORACLE ACCOUNT NEEDED!)
await scaleAmm.createPool({
  baseMint: TOKEN_MINT,
  supply: 1_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 40_000,
});

# 6. Update price anytime
await scaleAmm.updateCrxPrice(2.15);  // Update to $2.15
```

---

## Benefits

1. **✅ Fixes segfault immediately** - No oracle account in CreatePool
2. **✅ Simpler for most pools** - Use config price, no oracle needed
3. **✅ Still flexible** - Can add per-pool oracles later if needed
4. **✅ Fewer accounts** - CreatePool cheaper (1 fewer account)
5. **✅ Easy price updates** - Authority can update anytime

---

## Future: Add Per-Pool Oracles (Optional)

If you want pools to optionally use their own oracles:

```rust
// In Pool struct:
pub custom_oracle: Option<Pubkey>,  // If Some, use this instead of config price

// In CreatePool:
pub custom_oracle: Option<Account<'info, PythPriceFeed>>,  // Optional

// In handler:
let crx_price_usd = if let Some(oracle) = &ctx.accounts.custom_oracle {
    get_crx_price_usd(oracle, config.oracle_max_age_seconds, config.oracle_max_confidence_bps)?
} else {
    config.crx_price_usd  // Fallback to config
};
```

---

## Implementation Time

**1-2 hours:**
- Add crx_price_usd to Config: 15 min
- Update initialize: 15 min
- Remove oracle from CreatePool: 15 min
- Add update_crx_price: 15 min
- Update SDK: 30 min
- Update tests: 30 min

---

**This is the simplest fix.** Removes oracle dependency from CreatePool, keeps flexibility for future.
