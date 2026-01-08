# Scale AMM - Deployment Checklist

**CRITICAL:** Complete ALL items before deploying to mainnet!

---

## ⚠️ CRITICAL BLOCKER: Update DEPLOYER_PUBKEY

**Location:** `programs/creator-amm-v2/src/instructions/initialize.rs:23`

**Current Value (INSECURE):**
```rust
pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("11111111111111111111111111111111");
```

### Why This Is Critical

❌ **If left unchanged:**
- Anyone can call `initialize()` and become the protocol authority
- Attacker can drain fees, change parameters, add malicious tokens
- Protocol is bricked forever once someone else initializes it
- **This is the #1 security risk in the entire codebase**

### How To Fix

**Step 1: Get Your Wallet Address**
```bash
solana address
```

Example output: `YourActualWalletAddressHere12345678901234567890`

**Step 2: Update initialize.rs**

Open `programs/creator-amm-v2/src/instructions/initialize.rs` and replace line 23:

```rust
pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("YourActualWalletAddressHere12345678901234567890");
```

**Step 3: Rebuild**
```bash
anchor build
```

**Step 4: Deploy Immediately**

Once deployed to mainnet:
1. **Call `initialize()` within the SAME TRANSACTION as deployment** to prevent front-running
2. Or deploy and initialize in rapid succession (< 1 second)
3. Verify initialization succeeded by checking the config PDA

---

## 📋 Pre-Deployment Checklist

### 1. Code Changes
- [ ] ✅ DEPLOYER_PUBKEY updated to your actual wallet address
- [ ] Program ID in `Anchor.toml` matches deployed program
- [ ] Program ID in `lib.rs` (declare_id!) matches deployed program

### 2. Testing
- [ ] All 233 tests pass on localnet: `anchor test`
- [ ] 72-hour devnet soak test completed (10,000+ trades)
- [ ] No failed transactions in devnet testing
- [ ] Fee sponsorship tested with 100+ pools

### 3. Configuration Values
Review initialization parameters in `deploy-amm.ts`:
- [ ] `crx_price_oracle` - Correct Pyth oracle for mainnet CRX/USD
- [ ] `crx_mint` - Correct mainnet CRX token mint
- [ ] `fee_recipient` - Secure wallet for protocol fees
- [ ] `approved_quote_tokens` - Whitelisted SOL/USDC/USDT mints (mainnet addresses)

### 4. Security
- [ ] All optimization commits tested and verified
- [ ] No TODOs or FIXMEs in critical paths
- [ ] Emergency pause feature removed (verified in commit history)
- [ ] All arithmetic is checked (verified: 65 checked operations, 0 unwraps)

### 5. Economic Parameters
Review defaults in `deploy-amm.ts`:
- [ ] `pre_bonding_fee_bps: 300` (3% fee during pre-bonding)
- [ ] `post_bonding_fee_bps: 100` (1% fee after bonding)
- [ ] `graduation_threshold_usd: 40_000_000_000` ($40k graduation)
- [ ] `anti_sniper_window_slots: 20` (~8 seconds)
- [ ] `anti_sniper_max_trade_bps: 500` (5% max trade during anti-sniper)
- [ ] `oracle_max_age_seconds: 60` (1 minute stale threshold)
- [ ] `oracle_max_confidence_bps: 100` (1% max confidence interval)

### 6. Wallet Funding
- [ ] Deployer wallet funded with 5+ SOL (deployment + initialization)
- [ ] Fee sponsorship wallet funded with 100+ SOL (for pool creations)
- [ ] Fee recipient wallet created and secured

---

## 🚀 Deployment Commands

### Devnet (Testing)
```bash
# Update DEPLOYER_PUBKEY first!
anchor build
anchor deploy --provider.cluster devnet

# Initialize protocol
npm run deploy:amm:devnet
```

### Mainnet (Production)
```bash
# 1. Final verification
cargo check  # Must pass with 0 errors
anchor test  # All tests must pass

# 2. Update DEPLOYER_PUBKEY (if not done)
# Edit programs/creator-amm-v2/src/instructions/initialize.rs:23

# 3. Build for mainnet
anchor build

# 4. Deploy program
anchor deploy --provider.cluster mainnet-beta

# 5. Initialize protocol IMMEDIATELY
# (within same transaction or < 1 second to prevent front-running)
npm run deploy:amm:mainnet
```

---

## ⚡ Post-Deployment Verification

### 1. Verify Config Initialized
```bash
# Check config PDA exists and has correct authority
solana account <CONFIG_PDA_ADDRESS>
```

### 2. Create Test Pool
```bash
npm run create:pool:mainnet
```

### 3. Monitor First 100 Pools
- [ ] All pools created successfully (100% success rate)
- [ ] No failed transactions
- [ ] Average creation time < 5 seconds
- [ ] Fee sponsorship working ($0 to users)

### 4. Set Up Monitoring
- [ ] Indexer deployed for PoolCreated events
- [ ] Indexer deployed for TradeExecuted events
- [ ] Indexer deployed for PoolGraduated events
- [ ] Anomaly detection alerts configured
- [ ] Oracle health monitoring active
- [ ] Fee recipient balance monitoring active

---

## 🔴 Emergency Procedures

### If Protocol Hijacked (Someone Else Initialized)

**THERE IS NO RECOVERY** - The protocol is bricked forever.

Prevention is the only option:
1. Update DEPLOYER_PUBKEY before ANY deployment
2. Initialize within 1 second of deployment
3. Never deploy without immediate initialization

### If Wrong Parameters Set

Authority can update some parameters after initialization:
- `update_approved_quotes()` - Change approved quote tokens

**Cannot be changed after initialization:**
- Pre-bonding fee
- Post-bonding fee
- Graduation threshold
- Anti-sniper settings
- Oracle settings
- CRX oracle
- CRX mint
- Authority transfer (requires separate admin instruction)

---

## 📊 Success Metrics

### Week 1 (Devnet)
- ✅ 100 pools created successfully
- ✅ Zero failed transactions
- ✅ Fee sponsorship working
- ✅ SDK queries functional
- ✅ Event listeners receiving data

### Week 4 (Mainnet Launch)
- ✅ 10,000+ pools in first month
- ✅ >99% success rate
- ✅ <5 seconds average pool creation time
- ✅ Monitoring and alerts operational
- ✅ Fee sponsorship sustainable

---

## 🎯 Final Pre-Launch Verification

**Run this command before mainnet deployment:**
```bash
grep -n "11111111111111111111111111111111" programs/creator-amm-v2/src/instructions/initialize.rs
```

**Expected output:** `(empty)`

If you see any output, DEPLOYER_PUBKEY is still the placeholder!

---

**Last Updated:** 2026-01-08
**Status:** Ready for deployment after DEPLOYER_PUBKEY update
