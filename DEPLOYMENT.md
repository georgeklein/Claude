# Scale AMM - Deployment Guide

**Essential checklist and procedures for mainnet deployment**

---

## 🚨 CRITICAL BLOCKERS (Must Fix Before Deploy)

### 1. DEPLOYER_PUBKEY Placeholder ⚠️

**File:** `programs/creator-amm-v2/src/instructions/initialize.rs:10`

**Current (UNSAFE):**
```rust
pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("11111111111111111111111111111111");
```

**Fix:**
```bash
# Get your wallet address
solana address

# Update initialize.rs line 10 with your ACTUAL wallet
# Verify placeholder removed
grep "11111111111111111111111111111111" programs/creator-amm-v2/src/instructions/initialize.rs
# MUST return nothing!
```

**Why Critical:** Without this, anyone can front-run your `initialize()` call and become protocol authority, permanently bricking the protocol.

**Time to fix:** 5 minutes

---

##✅ Pre-Deployment Checklist

### Code Quality
- [ ] DEPLOYER_PUBKEY updated (see above)
- [ ] All tests passing (`anchor test`)
- [ ] No `unwrap()` or `panic!()` in production code
- [ ] Compute units measured (<200k per trade)

### Security
- [ ] Mint/freeze authorities revoked check works
- [ ] Oracle validation tested
- [ ] Vault balance validation tested
- [ ] Emergency pause tested
- [ ] CEI pattern verified in all instructions

### Testing
- [ ] Pool creation tested
- [ ] Buy/sell tested
- [ ] Graduation tested
- [ ] WAA fees tested
- [ ] Anti-sniper tested
- [ ] Devnet soak test completed (72 hours recommended)

### Infrastructure
- [ ] RPC provider configured (Helius recommended)
- [ ] Multisig wallet created (Squads recommended)
- [ ] Monitoring set up (transaction success rate, errors)
- [ ] Oracle feed validated (Pyth)

### Configuration
Review these values in `initialize.rs`:
```rust
pre_bonding_fee_bps: 100,           // 1%
graduation_threshold_usd: 40_000,   // $40k
anti_sniper_window_slots: 20,       // ~8 seconds
anti_sniper_max_trade_bps: 500,     // 5% max
oracle_max_age_seconds: 60,         // 1 minute
oracle_max_confidence_bps: 100,     // 1% max deviation
```

---

## 📋 Deployment Process

### 1. Build & Deploy Program

```bash
# Clean build
anchor clean
anchor build

# Get program ID
solana address -k target/deploy/creator_amm_v2-keypair.json

# Deploy to mainnet
anchor deploy --provider.cluster mainnet-beta

# Verify deployment
solana program show <PROGRAM_ID>
```

### 2. Initialize Protocol (IMMEDIATELY After Deploy)

**⏱️ Do this within 1 minute of deployment to prevent front-running**

```bash
# Call initialize instruction
# (Use your SDK or Anchor CLI)

# Verify initialization
# Check that config.authority == your wallet
```

### 3. Create CRX/SOL Pool

```bash
# This is the main liquidity pool
# All TOKEN/CRX trades route through CRX/SOL

# Use your SDK to create the pool
# Set appropriate parameters for CRX tokenomics
```

### 4. Test with Small Amounts

```bash
# Create test token pool ($1k target)
# Buy small amount (0.01 SOL worth)
# Sell small amount
# Verify fees calculated correctly
# Verify reserves update correctly
```

### 5. Monitor for 24 Hours

Watch for:
- Transaction success rate >95%
- No reserve mismatches
- Oracle feeds stable
- Fees collecting correctly

---

## 🚀 Post-Deployment

### First Hour
- [ ] Initialize protocol ✅
- [ ] Create CRX/SOL pool ✅
- [ ] Test trades work ✅
- [ ] Monitoring operational ✅

### First 24 Hours
- [ ] No critical bugs
- [ ] 10+ test pools created
- [ ] 100+ test trades executed
- [ ] Emergency pause ready

### First Week
- [ ] Gradual TVL increase
- [ ] Community testing
- [ ] Support monitoring 24/7

---

## ⚠️ Emergency Procedures

### If Critical Bug Found:

```bash
# 1. Pause protocol immediately
# Call update_config with is_paused = true

# 2. Notify users
# Post on all channels

# 3. Analyze issue
# Determine if funds at risk

# 4. Coordinate response
# Cannot redeploy, plan mitigation
```

### If Oracle Fails:

- All trades will revert (price staleness check)
- Switch to backup oracle if configured
- No funds at risk, but protocol halted

### If RPC Fails:

- Switch to backup RPC provider
- Helius → QuickNode → Triton
- No protocol impact, only frontend

---

## 📊 Monitoring

### Key Metrics to Track:

**Transaction Success Rate:**
- Target: >95%
- Alert if <90%

**Reserve Health:**
- `real_quote_reserves == quote_vault.amount`
- `real_base_reserves == base_vault.amount`
- Alert on ANY mismatch

**Oracle Status:**
- Price age <60 seconds
- Confidence <1%
- Alert if stale

**Compute Units:**
- Target: <120k per trade
- Alert if >200k (transaction may fail)

---

## 🔐 Security Best Practices

### Multisig Setup (Recommended):

```bash
# Use Squads for protocol authority
# Require 2-of-3 or 3-of-5 signatures
# Distribute keys across team

# Set as protocol authority
# Set as fee recipient
```

### Key Management:

- Store deployer key in hardware wallet
- Backup all keys (encrypted, offline)
- Document recovery procedures
- Never share keys

---

## ❌ DO NOT Deploy If:

- DEPLOYER_PUBKEY is still placeholder
- Tests are failing
- Devnet testing incomplete
- Monitoring not ready
- Team not available for 48h support

## ✅ Ready When:

- All blockers resolved
- All checklists complete
- Team reviewed and approved
- Support team ready
- Emergency procedures documented

---

**ONE-SHOT DEPLOYMENT:** Solana programs are immutable. Once deployed, code cannot be changed. Test thoroughly before deploying.

**Last Updated:** 2026-01-08
