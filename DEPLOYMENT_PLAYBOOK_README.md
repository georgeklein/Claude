# Scale AMM - Mainnet Deployment Playbook Summary

**Created:** 2026-01-08
**Status:** Ready for Use

---

## What Has Been Created

I've created a definitive **ONE-SHOT DEPLOYMENT PLAYBOOK** for Scale AMM mainnet launch.

**New File:** `/home/user/Claude/MAINNET_DEPLOYMENT_PLAYBOOK.md` (1,200+ lines)

This consolidates and enhances existing deployment documentation into a single, actionable guide.

---

## Why This Matters

Scale AMM is a **PERMISSIONLESS Solana protocol**, which means:
- ❌ **NO UPGRADES** after deployment
- ❌ **NO ROLLBACKS** once deployed  
- ❌ **NO SECOND CHANCES** - must be perfect first time
- ✅ **ONE PATH FORWARD** - new deployment if critical bugs found

**This is a ONE-SHOT DEPLOYMENT. You must get it right the first time.**

---

## Critical Blocker: DEPLOYER_PUBKEY

**THE #1 BLOCKER TO DEPLOYMENT**

**File:** `programs/creator-amm-v2/src/instructions/initialize.rs:23`

**Current State (BLOCKER):**
```rust
pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("11111111111111111111111111111111");
```

**Why This Blocks:**
- Without updating, ANYONE can initialize the protocol after you deploy
- This is a **front-running attack** that permanently bricks the protocol
- Once someone else initializes, you've lost control forever

**MUST Change To:**
```rust
pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("YOUR_ACTUAL_WALLET_ADDRESS");
```

**Verification Command:**
```bash
grep "11111111111111111111111111111111" programs/creator-amm-v2/src/instructions/initialize.rs
# MUST return NOTHING. If you see the constant, DO NOT DEPLOY.
```

---

## Complete Blocker List (12 Critical Items)

All of these MUST be resolved before deployment:

| # | Blocker | Verification |
|---|---------|--------------|
| 1 | DEPLOYER_PUBKEY is placeholder | `grep "11111..." initialize.rs` returns NOTHING |
| 2 | Unchecked arithmetic exists | `rg "unwrap\(\)"` returns ZERO results |
| 3 | Oracle validation incomplete | Manual code review passes |
| 4 | Tests failing | `anchor test` shows 100% pass rate |
| 5 | Devnet soak test incomplete | 72 hours, 10k+ trades, 0 exploits |
| 6 | Security tests failing | All security tests pass |
| 7 | Build fails | `anchor build` completes with 0 errors |
| 8 | Program size >500KB | Binary <500KB |
| 9 | Team unavailable | All key personnel confirmed available |
| 10 | Monitoring not operational | Alert system tested |
| 11 | No RPC provider | Primary + Backup RPCs confirmed |
| 12 | Deployer has <5 SOL | Balance ≥5 SOL verified |

**If ANY blocker is not resolved, deployment is NO-GO.**

---

## What's in the Playbook

### 1. Pre-Deployment Phase (Day -3 to -1)
- Go/No-Go decision meeting (60 min structured format)
- 8 verification commands to run live
- Complete blockers list with verification steps
- Deployment artifacts checklist

### 2. Devnet Soak Test Protocol (72 Hours)
**Complete TypeScript script provided** for automated testing:
- Target: 10,000+ trades over 72 hours
- Success rate requirement: ≥99%
- Exploit tolerance: ZERO
- Hour-by-hour manual testing checklist
- Every-5-minutes monitoring protocol
- 9 success criteria (all must pass)

### 3. Deployment Day Sequence (Day 0)
**Step-by-step with exact commands:**
- T-4h: Team assembly
- T-1h: Final verification (8 commands)
- T-30m: Deploy program (**POINT OF NO RETURN**)
- T-0: Initialize config (**RACE CONDITION** - within 1 minute!)
- T+5m: Create CRX/SOL pool
- T+10m: Test trades
- T+30m: Soft launch
- T+2h: Public announcement

### 4. Post-Launch Monitoring (Day 0-7)
- First 24 hours: Maximum intensity (hourly checks)
- First week: High vigilance (twice-daily checks)
- Alert thresholds with response times
- Success metrics for Day 1, Week 1, Month 1

### 5. Emergency Procedures
**5 complete runbooks:**
1. Exploit Detected → Emergency pause within 5 min
2. Oracle Failure → Switch to backup or pause
3. RPC Provider Outage → Failover procedures
4. High Transaction Failure → Investigation steps
5. Wrong Wallet Initialized → Protocol compromised

**Complete scripts provided:**
- `emergency-pause.ts` - Full implementation
- `unpause.ts` - Resume trading  
- `verify-config.ts` - Config verification
- `verify-accounting.ts` - Reserves vs vaults check

### 6. GO/NO-GO Decision Criteria
- 12 critical blockers (any NO = automatic NO-GO)
- 4 high-priority items (can waive with justification)
- 6 nice-to-haves (not blockers)
- Weighted voting: Tech Lead (50%), Security (30%), CEO (20%)

---

## Scripts Provided

All scripts are complete implementations in the playbook:

**Deployment:**
1. `initialize-mainnet.ts` - Config initialization
2. `verify-config.ts` - Verify config state
3. `emergency-pause.ts` - Emergency pause
4. `unpause.ts` - Resume trading

**Testing:**
5. `soak-test-simulation.ts` - 72-hour automated trading
6. `test-buy-mainnet.ts` - Buy test
7. `test-sell-mainnet.ts` - Sell test
8. `verify-accounting-mainnet.ts` - Accounting verification

**Monitoring:**
9. `check-pool-health.ts` - Pool health
10. `generate-soak-test-report.ts` - Soak test report

---

## Quick Start Guide

### Step 1: Update DEPLOYER_PUBKEY (DO THIS FIRST!)

```bash
# Get your wallet address
solana address

# Edit initialize.rs
nano programs/creator-amm-v2/src/instructions/initialize.rs

# Change line 23 to YOUR wallet address

# Verify (CRITICAL):
grep "11111111111111111111111111111111" programs/creator-amm-v2/src/instructions/initialize.rs
# Should return NOTHING
```

### Step 2: Run Pre-Deployment Verification

```bash
# 1. Verify no unchecked arithmetic
rg "unwrap\(\)" programs/creator-amm-v2/src/ --type rust | grep -v test

# 2. Run all tests
anchor test

# 3. Clean build
anchor clean && anchor build

# 4. Check program size
ls -lh target/deploy/creator_amm_v2.so

# 5. Verify deployer balance
solana balance
# Must be ≥5 SOL
```

### Step 3: Start Devnet Soak Test (72 hours before mainnet)

```bash
# Deploy to devnet
./scripts/deploy-devnet.sh

# Start soak test (script provided in playbook)
nohup npx ts-node scripts/soak-test-simulation.ts > soak-test.log 2>&1 &

# Monitor
tail -f soak-test.log
```

### Step 4: Go/No-Go Meeting (T-24 hours)

Use `GO_NO_GO_DECISION_FORM.md` template:
- Review all 12 critical blockers
- Review soak test results
- Individual votes (weighted)
- GO or NO-GO decision

### Step 5: Launch Day (Day 0)

Follow playbook section "Deployment Day Sequence" **EXACTLY**.

**Critical timing:**
- T-1h: Final verification (DO NOT SKIP)
- T-30m: Deploy (POINT OF NO RETURN)
- **T-0: Initialize (MUST be within 1 minute of deploy!)**

---

## Emergency Runbooks

### Exploit Detected

```bash
# 1. Emergency pause (within 5 min)
npx ts-node scripts/emergency-pause.ts

# 2. Notify team
# Post in war room: "🚨 CRITICAL: Exploit detected. Protocol paused."

# 3. Investigate (1-4 hours)
# - Identify root cause
# - Assess damage
# - Develop fix

# 4. Communicate (within 15 min of pause)
# Tweet: "Scale AMM temporarily paused for emergency maintenance..."
# (Full templates in playbook Section 6)

# 5. Resolution
# - Fix and unpause (if minor)
# - Deploy new version (if critical)
```

### Oracle Failure

```bash
# 1. Verify oracle down
# Check Pyth status page

# 2. If Pyth down globally:
# - Wait for Pyth team
# - Communicate to users

# 3. If only our feed:
# - Switch to backup oracle (if exists)
# - Or emergency pause
```

### RPC Outage

```bash
# 1. Switch to backup
export RPC_URL="<BACKUP_RPC>"

# 2. Update .env.mainnet

# 3. Verify backup working
solana cluster-version --url $RPC_URL
```

---

## Success Criteria

### Day 1
- ✅ Uptime >99%
- ✅ Transaction success rate >99%
- ✅ Zero security incidents
- ✅ >10 pools created
- ✅ >$10k volume

### Week 1
- ✅ Uptime >99.5%
- ✅ TVL >$100k
- ✅ >100 pools created
- ✅ At least 1 graduation

### Month 1
- ✅ TVL >$1M
- ✅ >1,000 pools
- ✅ Protocol operating smoothly

---

## Files Overview

### New Files (Created Today)
1. **`MAINNET_DEPLOYMENT_PLAYBOOK.md`** - Complete 1,200+ line playbook
2. **`DEPLOYMENT_PLAYBOOK_README.md`** - This summary (YOU ARE HERE)

### Existing Files (Referenced)
3. `MAINNET_DEPLOYMENT_GUIDE.md` - Comprehensive 3,180-line guide
4. `LAUNCH_DAY_CHECKLIST.md` - Quick reference
5. `GO_NO_GO_DECISION_FORM.md` - Decision template
6. `DEPLOYMENT_CHECKLIST.md` - Pre-launch checklist
7. `DEPLOYER_WARNING.md` - DEPLOYER_PUBKEY warning

---

## Next Steps

### Immediate (Today)
- [ ] Read full playbook: `MAINNET_DEPLOYMENT_PLAYBOOK.md`
- [ ] **Update DEPLOYER_PUBKEY** in initialize.rs (CRITICAL!)
- [ ] Verify update with grep command
- [ ] Commit change to git

### This Week
- [ ] Complete all tests (target: 103 tests, 100% pass rate)
- [ ] Prepare soak test scripts
- [ ] Schedule go/no-go meeting (Day -3)
- [ ] Set up monitoring infrastructure
- [ ] Confirm RPC providers (primary + backup)

### Day -3 (72 hours before launch)
- [ ] Go/No-Go meeting
- [ ] Start devnet soak test
- [ ] Team assignments
- [ ] War room setup

### Day 0 (Launch Day)
- [ ] Follow playbook step-by-step
- [ ] Save all artifacts
- [ ] Monitor intensively
- [ ] Communicate proactively

---

## Important Reminders

1. **DEPLOYER_PUBKEY** is the #1 blocker - Check it 3+ times
2. **Initialize within 1 minute** of deployment - Have script ready
3. **You cannot upgrade** - Get it right the first time
4. **Emergency pause** is your safety net - Test on devnet first
5. **Communication is key** - Keep users informed, use provided templates

---

## Document Information

**Created:** 2026-01-08
**Playbook:** `MAINNET_DEPLOYMENT_PLAYBOOK.md` (1,200+ lines)
**This Summary:** `DEPLOYMENT_PLAYBOOK_README.md`
**Status:** Ready for use

---

**Good luck with your mainnet deployment! 🚀**

**The most important thing: Update DEPLOYER_PUBKEY before you do ANYTHING else.**
