# CreatePool Segfault - Config Exists

**Dev confirmed:** Config initialized successfully
**Still failing:** Same segfault at 6,279 compute units

---

## 🔴 New Root Cause: Oracle Account Issue

The segfault happens at **6,279 CU** - this is during **account loading**, not handler logic.

### Account Loading Order in CreatePool:
1. ✅ Config (loads successfully - confirmed by dev)
2. ⚠️ **Pool** (init - should be fine)
3. ⚠️ **Quote Mint** (CRX mint - must exist)
4. ⚠️ **Base Mint** (token being launched - must exist)
5. ⚠️ **CRX Price Oracle** ← **MOST LIKELY ISSUE**
6. Quote Vault (init)
7. Base Vault (init)
8. Creator Base Account (must exist)

---

## 🎯 Most Likely Issue: Oracle Account

**File:** `programs/creator-amm-v2/src/instructions/create_pool.rs:39-43`

```rust
#[account(
    constraint = crx_price_oracle.key() == config.crx_price_oracle @ ErrorCode::InvalidOracle
)]
pub crx_price_oracle: Account<'info, PythPriceFeed>,
```

This tries to deserialize the oracle as `PythPriceFeed` struct:

**File:** `programs/creator-amm-v2/src/utils/oracle.rs`
```rust
pub struct PythPriceFeed {
    pub price: i64,
    pub conf: u64,
    pub expo: i32,
    pub publish_time: i64,
}
```

### Three Possible Problems:

#### Problem 1: Oracle Account Doesn't Exist
```bash
# Check if oracle exists
solana account <ORACLE_ADDRESS> --url devnet

# If returns "Account does not exist" → THIS IS THE ISSUE
```

#### Problem 2: Oracle Format Mismatch
The dev might be passing a **real Pyth oracle** account, but the code expects a **simplified PythPriceFeed** format.

**Real Pyth oracle structure:** ~3000 bytes with complex data
**Expected PythPriceFeed:** 32 bytes with simple struct

If passing real Pyth address → Anchor fails to deserialize → SEGFAULT

#### Problem 3: Oracle Address Doesn't Match Config
The oracle address passed to `createPool()` must exactly match what was stored during `initialize()`.

```typescript
// During initialize - this address was stored:
await scaleAmm.initialize({
  crxPriceOracle: new PublicKey('ORACLE_ADDRESS_1'),
  ...
});

// During createPool - MUST use same address:
// SDK fetches config and automatically uses config.crx_price_oracle
// But if manually calling, must match!
```

---

## ✅ Diagnostic Script

Run this to check oracle:

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';

const connection = new Connection('https://api.devnet.solana.com');
const program = /* your program */;

async function diagnoseOracle() {
  // 1. Get config
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    program.programId
  );

  console.log('Config PDA:', configPda.toBase58());

  try {
    const config = await program.account.config.fetch(configPda);
    console.log('✅ Config exists');
    console.log('Oracle address in config:', config.crxPriceOracle.toBase58());

    // 2. Check if oracle account exists
    const oracleInfo = await connection.getAccountInfo(config.crxPriceOracle);

    if (!oracleInfo) {
      console.log('❌ ISSUE FOUND: Oracle account does NOT exist!');
      console.log('Address:', config.crxPriceOracle.toBase58());
      console.log('FIX: Create oracle account or use different address');
      return;
    }

    console.log('✅ Oracle account exists');
    console.log('Owner:', oracleInfo.owner.toBase58());
    console.log('Data length:', oracleInfo.data.length, 'bytes');

    // 3. Check oracle data structure
    if (oracleInfo.data.length !== 40) { // 8 discriminator + 32 data
      console.log('⚠️  WARNING: Oracle data length unexpected');
      console.log('Expected: 40 bytes (8 discriminator + 32 struct)');
      console.log('Actual:', oracleInfo.data.length, 'bytes');
      console.log('Are you using a real Pyth oracle? Code expects simplified PythPriceFeed');
    }

    // 4. Try to deserialize as PythPriceFeed
    try {
      const oracleData = await program.account.pythPriceFeed.fetch(config.crxPriceOracle);
      console.log('✅ Oracle deserializes correctly');
      console.log('Price:', oracleData.price.toString());
      console.log('Confidence:', oracleData.conf.toString());
      console.log('Exponent:', oracleData.expo);
      console.log('Publish time:', oracleData.publishTime.toString());
    } catch (err) {
      console.log('❌ ISSUE FOUND: Oracle cannot be deserialized as PythPriceFeed!');
      console.log('Error:', err.message);
      console.log('FIX: Use correct oracle format or update code to handle real Pyth oracles');
    }

  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

diagnoseOracle();
```

---

## 🔧 Quick Fixes

### Fix 1: Oracle Doesn't Exist
Create a mock oracle for testing:

```typescript
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';

async function createMockOracle(price: number = 2.0) {
  const oracle = Keypair.generate();

  // Create account (40 bytes: 8 discriminator + 32 data)
  const space = 40;
  const lamports = await connection.getMinimumBalanceForRentExemption(space);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: oracle.publicKey,
      lamports,
      space,
      programId: program.programId,
    })
  );

  await connection.sendTransaction(tx, [wallet, oracle]);

  // Write oracle data
  const data = Buffer.alloc(40);

  // Discriminator (first 8 bytes)
  data.write('9a271c8f3e2b4567', 0, 'hex');

  // Price (i64) - $2.00 with 8 decimals = 200000000
  data.writeBigInt64LE(BigInt(200_000_000), 8);

  // Confidence (u64) - 0.01 with 8 decimals = 1000000
  data.writeBigUInt64LE(BigInt(1_000_000), 16);

  // Exponent (i32) - -8 for 8 decimals
  data.writeInt32LE(-8, 24);

  // Publish time (i64) - current timestamp
  data.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)), 28);

  // Update account data (devnet only)
  await connection._rpcRequest('setAccount', [
    oracle.publicKey.toBase58(),
    {
      lamports,
      data: [data.toString('base64'), 'base64'],
      owner: program.programId.toBase58(),
      executable: false,
    },
  ]);

  console.log('Mock oracle created:', oracle.publicKey.toBase58());
  return oracle.publicKey;
}

// Then re-initialize with correct oracle
const oraclePubkey = await createMockOracle();

await program.methods
  .updateOracle(oraclePubkey) // If update function exists
  .accounts({ config: configPda, authority: wallet.publicKey })
  .rpc();
```

### Fix 2: Using Real Pyth Oracle
If you want to use **real Pyth oracles**, you need to update the code:

**Option A:** Update oracle.rs to parse real Pyth data structure
**Option B:** Use Pyth SDK to fetch price, then store in simplified format
**Option C:** Use mock oracle for now, switch to real Pyth later

For now, **use mock oracle** on devnet.

### Fix 3: Wrong Oracle Address
```typescript
// Check what oracle was set during initialize
const config = await program.account.config.fetch(configPda);
console.log('Oracle in config:', config.crxPriceOracle.toBase58());

// SDK automatically uses this, but if calling manually:
await program.methods
  .createPool(...)
  .accounts({
    crxPriceOracle: config.crxPriceOracle, // ← MUST match config
    ...
  })
  .rpc();
```

---

## 🔍 Other Possible Issues

### Issue 2: Base Mint Doesn't Exist
```bash
solana account <BASE_MINT> --url devnet
# Must return token mint account
```

### Issue 3: Mint Authority Not Revoked
```bash
spl-token display <BASE_MINT>
# Mint Authority: None (required)
# Freeze Authority: None (required)
```

### Issue 4: Creator Doesn't Own Tokens
```bash
spl-token accounts <BASE_MINT> --owner <CREATOR_WALLET>
# Must show token account with sufficient balance
```

---

## 📋 Full Diagnostic Checklist

Run these checks in order:

```bash
# 1. Check config exists
solana account <CONFIG_PDA> --url devnet
# Should exist (dev confirmed this works)

# 2. Check oracle exists
solana account <ORACLE_FROM_CONFIG> --url devnet
# If "does not exist" → CREATE MOCK ORACLE

# 3. Check base mint exists
solana account <BASE_MINT> --url devnet
# If "does not exist" → CREATE TOKEN FIRST

# 4. Check mint authorities revoked
spl-token display <BASE_MINT>
# Both authorities must be None

# 5. Check creator token account exists
spl-token accounts <BASE_MINT> --owner <CREATOR>
# Must show account with supply balance

# 6. Check quote mint (CRX) exists
solana account <CRX_MINT> --url devnet
# Must exist
```

---

## 🎯 Most Likely Fix

**90% chance it's the oracle.** Run the diagnostic script and check:

1. Does oracle account exist?
2. Is it the right format (PythPriceFeed)?
3. Does it match what's in config?

If oracle is missing → Create mock oracle → Try again.

---

## 🚨 If Still Failing

Share these outputs:
1. Result of diagnostic script above
2. Full transaction logs: `solana logs <PROGRAM_ID>`
3. Transaction signature of failed createPool attempt
4. Output of: `solana account <ORACLE_ADDRESS>`
5. SDK code snippet showing how you're calling createPool

---

**Next:** Run diagnostic script and share results
