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

# Configure for your target network
solana config set --url devnet      # For devnet testing
solana config set --url mainnet-beta # For mainnet deployment

# Check your wallet address
solana address

# Check your wallet balance
solana balance
```

**Wallet Setup & Funding (REQUIRED):**
```bash
# Your wallet must already exist and be funded before deployment

# For Devnet (testing):
solana airdrop 2 --url devnet
# You may need to run this multiple times to get 2+ SOL

# For Testnet (pre-production):
solana airdrop 2 --url testnet

# For Mainnet (production):
# Purchase SOL and send to your wallet address
# Required: 5+ SOL for deployment + initialization
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
solana balance     # Should show 2+ SOL (devnet) or 5+ SOL (mainnet)
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

### Step 1: Configure Environment

Create a `.env` file in the project root (copy from `.env.example`):

```bash
# Copy template
cp .env.example .env

# Edit with your values
nano .env
```

**Required Configuration:**

```bash
# Deployer wallet
DEPLOYER_KEYPAIR=~/.config/solana/id.json

# Protocol parameters
FEE_RECIPIENT_ADDRESS=YourFeeRecipientPublicKeyHere
CRX_MINT_ADDRESS=YourCRXMintAddressHere
CRX_PRICE_ORACLE_ADDRESS=YourPythOracleFeedAddressHere

# Optional: Approved quote tokens (comma-separated)
APPROVED_QUOTE_TOKENS=

# Optional: Custom RPC URLs
DEVNET_RPC_URL=https://api.devnet.solana.com
MAINNET_RPC_URL=https://api.mainnet-beta.solana.com
```

**Get your addresses:**
```bash
# Your wallet address (for DEPLOYER_PUBKEY in initialize.rs)
solana address

# Pyth oracle feeds: https://pyth.network/developers/price-feed-ids
# Example CRX/USD feed: (get from Pyth)
```

---

### Step 2: Deploy AMM Protocol (ONE-TIME)

**Deploy the Scale AMM protocol and initialize global configuration:**

```bash
# Devnet (testing)
npm run deploy:amm:devnet

# Testnet (pre-production)
npm run deploy:amm:testnet

# Mainnet (production)
npm run deploy:amm:mainnet
```

**What happens automatically:**
1. ✅ Checks deployer balance (requires 2-5 SOL)
2. ✅ Builds the program (`anchor build`)
3. ✅ Deploys to cluster (`anchor deploy`)
4. ✅ **Initializes config** (prevents front-running)
5. ✅ Verifies deployment
6. ✅ Generates deployment report

**This is a ONE-TIME operation per network.** After this, use Step 3 to create individual pools.

**Output example:**
```
========================================
Scale AMM - Automated Deployment
========================================
Network: mainnet-beta
Deployer: 7xK...abc

Step 1: Checking balance...
✅ Balance: 5.234 SOL

Step 2: Building program...
✅ Build successful

Step 3: Deploying program...
✅ Program deployed: CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3

Step 4: Initializing config...
✅ Config initialized: Config PDA: 8aB...xyz

Step 5: Verifying deployment...
✅ Verification passed

========================================
Deployment Report
========================================
Timestamp: 2026-01-08 12:00:00 UTC
Program ID: CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3
Config PDA: 8aB...xyz
Fee Recipient: YourFeeWallet...
CRX Oracle: PythOracleFeed...
Status: READY FOR PRODUCTION
========================================
```

**Cost:** ~2-3 SOL for program deployment + initialization

---

### Step 3: Create Token Pools

**After AMM deployment, create individual token pools:**

```bash
# Create a pool on devnet
npm run create:pool:devnet

# Or specify parameters directly
ts-node scripts/create-pool.ts devnet \
  <TOKEN_MINT> \
  <SUPPLY> \
  <INITIAL_MCAP_USD> \
  <GRADUATION_THRESHOLD_USD>
```

**Example - Create SOL pool:**
```bash
ts-node scripts/create-pool.ts devnet \
  So11111111111111111111111111111111111111112 \
  1000000 \
  10000 \
  40000
```

**Parameters:**
- `TOKEN_MINT`: SPL token mint address (must have revoked mint authority)
- `SUPPLY`: Total token supply to deposit into pool
- `INITIAL_MCAP_USD`: Initial market cap in USD (e.g., 10000 = $10k)
- `GRADUATION_THRESHOLD_USD`: Graduation threshold in USD (e.g., 40000 = $40k)

**Pool creation output:**
```
🏊 Scale AMM Pool Creator
📍 Cluster: devnet

✅ Configuration loaded
   Creator: 7xK...abc
   Program: CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3

💰 Checking creator balance...
   Balance: 1.5000 SOL
✅ Sufficient balance

🔍 Verifying token mint...
   Token: So11111111111111111111111111111111111111112
✅ Token verified

🏗️  Creating pool...
   Token: So11111111111111111111111111111111111111112
   Supply: 1000000
   Initial Market Cap: $10k
   Graduation Threshold: $40k
   Creator Fee: 1%
   Curve Type: ConstantProduct
   WAA Enabled: true

✅ Pool created successfully
   Transaction: 5Kx...xyz
   Pool Address: 8aB...pool

✨ ════════════════════════════════════════════ ✨
✨                                              ✨
✨  🎉 POOL CREATED!                            ✨
✨                                              ✨
✨  Pool Address: 8aB...pool                    ✨
✨  Token: So11111111111111111111111111111112   ✨
✨  Network: devnet                             ✨
✨                                              ✨
✨ ════════════════════════════════════════════ ✨
```

**Cost per pool:** ~0.02 SOL

**You can create multiple pools** - repeat this step for each token pair.

---

### Step 4: Verify Deployment

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
- [ ] At least one pool created and functional

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
