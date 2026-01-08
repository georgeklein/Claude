# Scale AMM - Deployment Guide

**Production deployment checklist and procedures**

---

## 🚨 Pre-Deployment Checklist

### 1. DEPLOYER_PUBKEY (CRITICAL BLOCKER)

**File:** `programs/creator-amm-v2/src/instructions/initialize.rs:23`

**Get your wallet address:**
```bash
solana address
```

**Update the constant:**
```rust
// Line 23 - Replace with YOUR actual wallet address
pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("YourActualWalletAddressHere...");
```

**Verify the fix:**
```bash
# This MUST return nothing
grep "11111111111111111111111111111111" programs/creator-amm-v2/src/instructions/initialize.rs
```

**Why Critical:** Anyone can front-run `initialize()` and become protocol authority if this isn't fixed.

---

### 2. Environment Setup

**Solana CLI:**
```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.17.0/install)"

# Configure for mainnet
solana config set --url https://api.mainnet-beta.solana.com

# Check your wallet balance (need ~5 SOL for deployment)
solana balance
```

**Anchor CLI:**
```bash
# Install Anchor version manager
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force

# Install Anchor 0.29.0
avm install 0.29.0
avm use 0.29.0

# Verify version
anchor --version  # Should show: anchor-cli 0.29.0
```

**Verify Setup:**
```bash
solana --version   # Should be 1.17.x
anchor --version   # Should be 0.29.0
cargo --version    # Should be 1.70+
```

---

### 3. Build Verification

```bash
# Clean build
anchor clean
anchor build

# Verify program compiles
cargo check

# Run tests (optional but recommended)
anchor test
```

**Expected:**
- ✅ Build succeeds
- ✅ 0 compile errors
- ✅ Tests pass (137/223 minimum)

---

### 4. Configuration Parameters

Before deployment, decide on these protocol parameters:

**Oracle Settings:**
- `crx_price_oracle`: Pyth feed address for $CRX/USD
- `oracle_max_age_seconds`: `60` (1 minute staleness check)
- `oracle_max_confidence_bps`: `100` (1% max confidence interval)

**Phase Thresholds:**
- `pre_bonding_threshold_usd`: `40_000_000_000` ($40k with 6 decimals)
- `graduation_threshold_usd`: `85_000_000_000` ($85k with 6 decimals)

**Fee Settings:**
- `pre_bonding_fee_bps`: `300` (3% during pre-bonding)
- `post_bonding_fee_bps`: `100` (1% after graduation)

**Anti-Sniper:**
- `anti_sniper_window_slots`: `20` (~8 seconds at 400ms/slot)
- `anti_sniper_max_trade_bps`: `500` (5% max trade size)

**Quote Tokens (Whitelist):**
- Default: `[CRX_MINT, SOL_MINT, USDC_MINT, Pubkey::default(), Pubkey::default()]`
- `approved_quote_count`: `3`

---

## 📦 Deployment Steps

### Step 1: Deploy Program

```bash
# Deploy to mainnet
anchor deploy --provider.cluster mainnet-beta

# Save the program ID (shown in output)
# Example: CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3
```

**Cost:** ~2-3 SOL for program deployment

---

### Step 2: Initialize Protocol (WITHIN 60 SECONDS)

**CRITICAL:** Call `initialize()` immediately after deployment to prevent front-running.

```bash
# Using Anchor client
anchor run initialize-mainnet
```

Or using SDK:

```typescript
import { ScaleAMM } from '@scale-amm/sdk';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.fromSecretKey(yourDeployerKey);
const scale = new ScaleAMM(connection, wallet);

await scale.initialize({
  feeRecipient: YOUR_FEE_WALLET,
  crxMint: CRX_MINT_ADDRESS,
  crxPriceOracle: PYTH_CRX_FEED,
  preBondingFeeBps: 300,
  preBondingThresholdUsd: 40_000_000_000,
  postBondingFeeBps: 100,
  graduationThresholdUsd: 85_000_000_000,
  antiSniperWindowSlots: 20,
  antiSniperMaxTradeBps: 500,
  oracleMaxAgeSeconds: 60,
  oracleMaxConfidenceBps: 100,
  approvedQuoteTokens: [CRX_MINT, SOL_MINT, USDC_MINT, ...],
  approvedQuoteCount: 3,
});
```

---

### Step 3: Verify Deployment

```bash
# Check program is deployed
solana program show <PROGRAM_ID>

# Verify config account exists
solana account <CONFIG_PDA_ADDRESS>

# Test on-chain data
anchor run verify-deployment
```

**Verification Checklist:**
- [ ] Program deployed successfully
- [ ] Config account initialized
- [ ] Authority matches your wallet
- [ ] Fee recipient correct
- [ ] Oracle configured
- [ ] Parameters match expectations

---

### Step 4: Create Test Pool

```typescript
// Create a test pool with small values
const testPool = await scale.createPool({
  baseMint: TEST_TOKEN_MINT,
  supply: 10_000,
  initialMarketCapUsd: 100,  // $100 test
  graduationThresholdUsd: 1_000,  // $1k graduation
  creatorFeeBps: 100,
});

console.log('Test pool created:', testPool.address);
```

**Verify:**
- [ ] Pool created successfully
- [ ] Virtual reserves calculated correctly
- [ ] Can execute buy transaction
- [ ] Can execute sell transaction
- [ ] Fees collected properly

---

### Step 5: Production Launch

Once test pool works:

```typescript
// Launch primary $CRX/SOL pool
const crxPool = await scale.createPool({
  baseMint: CRX_MINT,
  quoteMint: SOL_MINT,
  supply: 10_000_000,  // 10M $CRX
  initialMarketCapUsd: 1_000_000,  // $1M launch
  graduationThresholdUsd: 5_000_000,  // $5M graduation
  creatorFeeBps: 100,  // 1% protocol fee
});

console.log('$CRX/SOL pool:', crxPool.address);
```

---

## 🔍 Post-Deployment Monitoring

### Health Checks

```bash
# Monitor transactions
solana logs | grep <PROGRAM_ID>

# Check pool states
curl https://api.mainnet-beta.solana.com \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getProgramAccounts","params":["<PROGRAM_ID>"]}'
```

### SDK Monitoring

```typescript
// Listen for all trades
scale.onTrade('*', (trade) => {
  console.log('Trade:', trade.pool, trade.direction, trade.amount);
});

// Listen for graduations
scale.onGraduation('*', (event) => {
  console.log('Pool graduated:', event.pool, event.totalCrxLocked);
});

// Monitor pool health
setInterval(async () => {
  const pools = await scale.getAllPools();
  for (const pool of pools) {
    const health = await scale.getPoolHealth(pool.address);
    if (!health.isHealthy) {
      console.warn('Unhealthy pool:', pool.address, health.issues);
    }
  }
}, 60000);  // Every minute
```

---

## ⚠️ Emergency Procedures

### If Initialize Fails

**DO NOT PANIC.** The protocol is already deployed, but not initialized.

1. Check if someone front-ran you:
   ```bash
   solana account <CONFIG_PDA_ADDRESS>
   ```

2. If config exists but authority is wrong:
   - Protocol is bricked (attacker is authority)
   - Redeploy with new program ID

3. If config doesn't exist:
   - Retry initialize immediately
   - Use higher priority fees

### If Wrong Parameters

Once initialized, parameters are **IMMUTABLE**. You cannot change:
- Fee recipient
- Oracle address
- Fee percentages
- Anti-sniper settings

If parameters are wrong, you must:
1. Deploy new program with different ID
2. Initialize with correct parameters
3. Migrate users to new program

### Rollback Procedure

There is **NO ROLLBACK** for blockchain deployments. Once deployed and initialized, the protocol runs forever. This is by design (fully permissionless).

---

## 📊 Cost Estimates

| Operation | Estimated Cost |
|-----------|----------------|
| Program deployment | 2-3 SOL |
| Initialize config | 0.01 SOL |
| Create pool | 0.02 SOL |
| Execute trade | 0.0001-0.0005 SOL |

Total deployment cost: **~3 SOL**

---

## 🔐 Security Reminders

**Before mainnet:**
- ✅ DEPLOYER_PUBKEY updated with YOUR wallet
- ✅ Fee recipient is a secure multisig (recommended)
- ✅ Oracle feed is correct and active
- ✅ Test pool works on devnet first
- ✅ Smart contract audited (optional but recommended)

**After deployment:**
- ⚠️ Protocol is **immutable** - no upgrades possible
- ⚠️ No emergency pause - fully permissionless
- ⚠️ Parameters cannot be changed
- ✅ Creator flexibility (WAA optional per pool)

---

## 📞 Support

**Issues:** https://github.com/georgeklein/Scale-AMM/issues

**Documentation:** See README.md and sdk/README.md

---

**Once deployed, it runs forever. Plan accordingly.**
