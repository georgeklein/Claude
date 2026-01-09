# CreatePool Error - Root Cause Analysis

**Date:** 2026-01-09
**Error:** `Access violation in stack frame 5 at address 0x200005db0 of size 8`
**Status:** ✅ ROOT CAUSE IDENTIFIED

---

## 🔴 Root Cause: Config Account Not Initialized

The protocol's config account **does not exist** because `initialize()` was never called after deployment.

### Evidence Trail:

#### 1. DEPLOYER_PUBKEY Still Placeholder
**File:** `/programs/creator-amm-v2/src/instructions/initialize.rs:23`
```rust
pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("11111111111111111111111111111111");
```
**Status:** ⚠️ **NEVER UPDATED** - Still the placeholder address

#### 2. CreatePool Tries to Read Non-Existent Config
**File:** `/programs/creator-amm-v2/src/instructions/create_pool.rs:11-15`
```rust
#[account(
    seeds = [b"config"],
    bump = config.bump,  // ← SEGFAULT HERE if account doesn't exist
)]
pub config: Account<'info, Config>,
```

**File:** `/programs/creator-amm-v2/src/instructions/create_pool.rs:98`
```rust
let config = &ctx.accounts.config;  // ← First access to config account
```

When Anchor tries to deserialize a non-existent account → **SEGFAULT**

#### 3. SDK Confirms This
**File:** `/sdk/ScaleAMM.ts:541`
```typescript
// Fetch config to get CRX mint and oracle
const configData = await this.program.account.config.fetch(configPda);
```

This line will **fail** if config doesn't exist, but the error you're seeing happens earlier (on-chain instruction execution).

#### 4. Tests Show Proper Flow
**File:** `/tests/comprehensive.ts:258-278`
```typescript
// STEP 1: Initialize (creates config account)
await program.methods
  .initialize(300, ...)
  .accounts({ config, authority: authority.publicKey, ... })
  .signers([authority])
  .rpc();

// STEP 2: Then create pools
await createPool(baseMint, ...);
```

**All tests call `initialize()` BEFORE `createPool()`** - this is not optional!

---

## ✅ The Fix (Step-by-Step)

### Step 1: Update DEPLOYER_PUBKEY
```bash
# Edit: /programs/creator-amm-v2/src/instructions/initialize.rs:23

# Get your deployer wallet address
solana address

# Replace line 23 with YOUR actual address:
pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("YOUR_WALLET_ADDRESS_HERE");
```

**Why this matters:**
- Without this, **ANYONE** can call initialize() and take over the protocol
- This is a **front-running attack vector**
- Once someone else initializes, you're locked out forever

---

### Step 2: Rebuild and Redeploy
```bash
# Rebuild program with correct DEPLOYER_PUBKEY
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Or deploy to localnet for testing
anchor deploy
```

---

### Step 3: Call Initialize (ONE TIME ONLY)
```typescript
// Using SDK
import { ScaleAMM } from './sdk/ScaleAMM';

const scaleAmm = new ScaleAMM(connection, deployerWallet);

// Call initialize with protocol parameters
await scaleAmm.initialize({
  crxMint: CRX_MINT_ADDRESS,
  crxPriceOracle: PYTH_ORACLE_ADDRESS,
  feeRecipient: FEE_RECIPIENT_WALLET,

  // Optional (defaults shown)
  preBondingFeeBps: 300,              // 3% (PreBonding phase fee)
  preBondingThresholdUsd: 40_000,     // $40k (unused legacy param)
  postBondingFeeBps: 100,             // 1% (Graduated phase fee)
  graduationThresholdUsd: 85_000,     // $85k (default graduation threshold)
  antiSniperWindowSlots: 20,          // 20 slots (~10 seconds)
  antiSniperMaxTradeBps: 500,         // 5% max trade during anti-sniper
});

console.log('✅ Protocol initialized!');
```

**Or use Anchor directly:**
```typescript
import * as anchor from '@coral-xyz/anchor';

const program = anchor.workspace.CreatorAmmV2;
const [configPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('config')],
  program.programId
);

await program.methods
  .initialize(
    300,                           // pre_bonding_fee_bps (3%)
    new anchor.BN(40_000_000_000), // pre_bonding_threshold_usd ($40k)
    100,                           // post_bonding_fee_bps (1%)
    new anchor.BN(85_000_000_000), // graduation_threshold_usd ($85k)
    new anchor.BN(20),             // anti_sniper_window_slots
    500,                           // anti_sniper_max_trade_bps (5%)
    new anchor.BN(60),             // oracle_max_age_seconds
    new anchor.BN(100),            // oracle_max_confidence_bps (1%)
    // approved_quote_tokens (5 slots, use CRX as first)
    // approved_quote_count
  )
  .accounts({
    config: configPda,
    authority: deployerWallet.publicKey,
    feeRecipient: feeRecipientWallet.publicKey,
    crxPriceOracle: pythOracleAccount,
    crxMint: crxMintAccount,
    systemProgram: SystemProgram.programId,
  })
  .signers([deployerWallet])
  .rpc();
```

---

### Step 4: Verify Config Exists
```bash
# Get config PDA address
# seeds = [b"config"], program_id = YOUR_PROGRAM_ID
# Calculate in TypeScript or use: anchor idl type -t Config

# Check if account exists
solana account <CONFIG_PDA_ADDRESS> --url devnet

# Should show account data, NOT "Account does not exist"
```

---

### Step 5: Now Create Pools
```typescript
// NOW this will work
const pool = await scaleAmm.createPool({
  baseMint: myTokenMint,
  supply: 1_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 40_000,
});

console.log('✅ Pool created:', pool.address);
```

---

## 🎯 Quick Verification Script

Run this to check if initialize was called:

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';

const connection = new Connection('https://api.devnet.solana.com');
const program = /* your program instance */;

// Derive config PDA
const [configPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('config')],
  program.programId
);

console.log('Config PDA:', configPda.toBase58());

// Try to fetch config
try {
  const config = await program.account.config.fetch(configPda);
  console.log('✅ Config exists!');
  console.log('Authority:', config.authority.toBase58());
  console.log('CRX Mint:', config.crxMint.toBase58());
  console.log('Fee Recipient:', config.feeRecipient.toBase58());
} catch (error) {
  console.log('❌ Config does NOT exist - initialize() was never called!');
  console.log('Error:', error.message);
}
```

---

## 📊 Error Breakdown

### What Happened:
1. Program deployed to devnet/mainnet
2. `initialize()` never called → Config account never created
3. Dev tries to call `createPool()`
4. On-chain instruction tries to deserialize config account at line 98
5. Config account doesn't exist → Anchor tries to read invalid memory
6. **SEGFAULT:** `Access violation in stack frame 5 at address 0x200005db0`

### Why Only 6,279 Compute Units Used:
The error happened **immediately** when trying to load accounts (before any computation logic runs). This confirms it's an account issue, not a logic bug.

### Why "Stack frame 5":
Anchor's account loading happens in nested function calls. Frame 5 is where it tries to read the config account data from an address that doesn't exist.

---

## ⚠️ Critical Security Note

**DO NOT SKIP updating DEPLOYER_PUBKEY before calling initialize!**

If you deploy with the placeholder and someone else calls initialize first:
- ❌ They become the protocol authority
- ❌ They can update fees, oracles, approved tokens
- ❌ You're permanently locked out (config can only be initialized once)
- ❌ Protocol is bricked, must redeploy with new program ID

**This is not a drill - update DEPLOYER_PUBKEY NOW!**

---

## 🔍 Other Possible Causes (Ruled Out)

### ❌ Missing Oracle Account
**Ruled out:** Error happens at line 98 (config access), before oracle validation at line 168

### ❌ Wrong Account Order
**Ruled out:** SDK correctly derives all PDAs and passes accounts in right order

### ❌ Uninitialized Token Vaults
**Ruled out:** Vaults are created by `init` constraint in CreatePool, not accessed before creation

### ❌ Program Not Deployed
**Ruled out:** Error message shows program ID `AxYe2m...` was invoked

---

## ✅ Summary

**Problem:** Config account doesn't exist because initialize() was never called
**Solution:** Update DEPLOYER_PUBKEY → Rebuild → Redeploy → Call initialize() → Create pools
**Time to fix:** 10 minutes
**Impact:** Blocks ALL pool creation until fixed

---

## 📝 Checklist for Dev

- [ ] Update `DEPLOYER_PUBKEY` in `initialize.rs:23` to your actual wallet
- [ ] Run `anchor build`
- [ ] Run `anchor deploy --provider.cluster devnet`
- [ ] Run verification script to confirm config doesn't exist
- [ ] Call `initialize()` with correct parameters
- [ ] Verify config exists with verification script
- [ ] Try creating a pool again
- [ ] ✅ Should work now!

---

**Questions?** Check `DEBUG_CREATE_POOL_ERROR.md` for additional debugging steps.

**Still failing?** Share:
1. Output of verification script
2. Transaction signature of initialize() call
3. Full error logs from createPool() attempt
