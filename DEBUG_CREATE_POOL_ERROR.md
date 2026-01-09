# CreatePool On-Chain Error - Debug Guide

**Error:**
```
Access violation in stack frame 5 at address 0x200005db0 of size 8
Program consumed 6279 of 200000 compute units
```

---

## Error Analysis

This is a **memory access violation (SEGFAULT)** happening very early in the CreatePool instruction (only 6,279 CU used).

### Most Likely Causes (in order):

#### 1. Config Account Not Initialized ⚠️ **MOST LIKELY**
The CreatePool instruction tries to read from the Config account immediately, but if it hasn't been initialized via `initialize()` first, you'll get a segfault.

**Check:**
```bash
# See if config account exists
solana account <CONFIG_PUBKEY> --url devnet

# If returns "Account does not exist" → THIS IS THE ISSUE
```

**Fix:**
```typescript
// Must call initialize FIRST (one-time setup)
await scaleAmm.initialize({
  deployer: deployerWallet.publicKey,
  // ... other config params
});

// THEN you can create pools
await scaleAmm.createPool({ ... });
```

**In code:** `/programs/creator-amm-v2/src/instructions/initialize.rs:23`
- Current DEPLOYER_PUBKEY: `11111111111111111111111111111111` (placeholder)
- This MUST be updated to actual deployer wallet before calling initialize

---

#### 2. Missing Oracle Account
If CreatePool tries to validate CRX price immediately but oracle account is missing/invalid.

**Check:**
```typescript
// Ensure oracle account is passed and exists
const oracleAccount = new PublicKey('YOUR_PYTH_ORACLE');
// Pass to createPool instruction
```

**In code:** `/programs/creator-amm-v2/src/utils/oracle.rs`
- Validates oracle data freshness (<60s)
- Validates confidence interval (<1%)
- Validates price bounds ($0.01 - $1000)

---

#### 3. Wrong Account Order
Anchor expects accounts in specific order. If passed incorrectly → segfault.

**Expected order for CreatePool:**
```rust
// From state.rs
pub struct CreatePool<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,

    #[account(init, payer = creator, space = 8 + std::mem::size_of::<Pool>())]
    pub pool: Account<'info, Pool>,

    pub base_mint: Account<'info, Mint>,
    pub quote_mint: Account<'info, Mint>,

    // ... vaults, oracle, etc.
}
```

**Check your SDK call:**
```typescript
// Ensure accounts match Rust struct order exactly
await scaleAmm.createPool({
  creator: wallet.publicKey,      // Must match position 0
  config: configPda,              // Must match position 1
  pool: poolPda,                  // Must match position 2
  // ...
});
```

---

#### 4. Uninitialized Vault Accounts
If the program tries to read from token vaults that haven't been created yet.

**Check:**
```typescript
// Ensure vaults are created BEFORE pool creation
const baseVault = await getAssociatedTokenAddress(baseMint, poolPda, true);
const quoteVault = await getAssociatedTokenAddress(quoteMint, poolPda, true);

// Create vault accounts if they don't exist
await createAssociatedTokenAccountIdempotent(connection, payer, baseMint, poolPda);
await createAssociatedTokenAccountIdempotent(connection, payer, quoteMint, poolPda);
```

---

## Debugging Steps

### Step 1: Check Config Account Existence
```bash
# Get config PDA
anchor idl init --filepath target/idl/creator_amm_v2.json <PROGRAM_ID>

# Check if config exists
solana account <CONFIG_PDA> --url devnet
```

**If "Account does not exist":**
```typescript
// Run initialize first
await scaleAmm.initialize({
  deployer: deployerWallet.publicKey,
  oracleAuthority: oracleAuthority.publicKey,
  treasuryAuthority: treasuryAuthority.publicKey,
});
```

---

### Step 2: Enable Verbose Logs
```typescript
// In SDK
const tx = await scaleAmm.createPool({ ... });

try {
  const sig = await connection.sendTransaction(tx, [wallet], {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  await connection.confirmTransaction(sig);
} catch (error) {
  // Get full logs
  if (error.logs) {
    console.log('Program logs:', error.logs);
  }

  // Get transaction details
  const txDetails = await connection.getTransaction(sig, {
    maxSupportedTransactionVersion: 0,
  });
  console.log('Transaction details:', txDetails);
}
```

---

### Step 3: Check All Accounts
```typescript
// Log all account addresses before sending transaction
console.log('Creator:', creator.publicKey.toBase58());
console.log('Config:', configPda.toBase58());
console.log('Pool:', poolPda.toBase58());
console.log('Base Mint:', baseMint.toBase58());
console.log('Quote Mint:', quoteMint.toBase58());
console.log('Base Vault:', baseVault.toBase58());
console.log('Quote Vault:', quoteVault.toBase58());
console.log('Oracle:', oracleAccount.toBase58());

// Verify each account exists on-chain
for (const account of accounts) {
  const info = await connection.getAccountInfo(account);
  console.log(`${account.toBase58()}: ${info ? 'EXISTS' : 'MISSING'}`);
}
```

---

### Step 4: Compare with Working Tests
```bash
# Run unit tests to see working example
anchor test

# Check logs for successful CreatePool call
# Compare account setup with your frontend code
```

---

## Quick Fix Checklist

- [ ] Update `DEPLOYER_PUBKEY` in `initialize.rs:23` to actual wallet
- [ ] Run `initialize()` instruction ONCE (creates config account)
- [ ] Verify config account exists: `solana account <CONFIG_PDA>`
- [ ] Ensure oracle account is valid Pyth price feed
- [ ] Pass accounts in correct order (match Rust struct)
- [ ] Create token vaults before pool creation
- [ ] Check all accounts exist before sending transaction
- [ ] Enable verbose logging to see which account fails

---

## Most Likely Solution

**If you haven't run `initialize()` yet:**

```typescript
// 1. Update DEPLOYER_PUBKEY in Rust code
// programs/creator-amm-v2/src/instructions/initialize.rs:23
pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("YOUR_ACTUAL_WALLET");

// 2. Rebuild and redeploy
anchor build
anchor deploy --provider.cluster devnet

// 3. Run initialize ONCE
const scaleAmm = new ScaleAMM(connection, wallet);
await scaleAmm.initialize({
  deployer: deployerWallet.publicKey,
  oracleAuthority: oracleWallet.publicKey,
  treasuryAuthority: treasuryWallet.publicKey,
});

// 4. NOW create pools
await scaleAmm.createPool({ ... });
```

---

## If Still Failing

1. Share full program logs (enable with `solana logs <PROGRAM_ID>`)
2. Share SDK code that's calling createPool
3. Check if program was rebuilt after DEPLOYER_PUBKEY change
4. Verify devnet vs mainnet mismatch (program deployed to devnet but frontend pointing to mainnet?)

---

**Next:** Run the checklist above and report which step fails
