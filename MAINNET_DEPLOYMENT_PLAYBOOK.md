# Scale AMM - Definitive Mainnet Deployment Playbook

**ONE-SHOT DEPLOYMENT GUIDE - NO ITERATION POSSIBLE**

**Version:** 2.0
**Created:** 2026-01-08
**Target Launch:** Day 21 of sprint
**Critical Requirement:** DEPLOYER_PUBKEY must be updated before deployment

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Pre-Deployment Phase (Day -3 to -1)](#pre-deployment-phase)
3. [Devnet Soak Test Protocol (72 Hours)](#devnet-soak-test-protocol)
4. [Deployment Day Sequence (Day 0)](#deployment-day-sequence)
5. [Post-Launch Monitoring (Day 0-7)](#post-launch-monitoring)
6. [Emergency Procedures](#emergency-procedures)
7. [GO/NO-GO Decision Criteria](#gono-go-decision-criteria)
8. [Complete Blockers List](#complete-blockers-list)

---

## Executive Summary

### Why This Matters

**Scale AMM is a PERMISSIONLESS protocol on Solana. This means:**
- ❌ **NO UPGRADES** - Cannot change code after deployment
- ❌ **NO ROLLBACKS** - Deployed program exists forever
- ❌ **NO SECOND CHANCES** - Must get it right the first time
- ✅ **ONE PATH FORWARD** - Deploy new version with different ID if needed

### Critical Blocker: DEPLOYER_PUBKEY

**Location:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/initialize.rs:23`

**Current Value (BLOCKER):**
```rust
pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("11111111111111111111111111111111");
```

**Why This Blocks Deployment:**
Without updating this, ANYONE can call `initialize()` after you deploy and take over the protocol. This is a **front-running attack vector** that bricks the protocol forever.

**Must Change To:**
```rust
pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("YOUR_ACTUAL_WALLET_ADDRESS");
```

### Deployment Timeline

```
Day -3:  Final go/no-go meeting
Day -3 to Day 0: Devnet soak test (72 hours continuous)
Day 0, T-4h: Team assembly
Day 0, T-1h: Final verification
Day 0, T-30m: Deploy program to mainnet
Day 0, T-0: Initialize config (RACE CONDITION - must be within 1 minute!)
Day 0, T+5m: Create CRX/SOL pool
Day 0, T+10m: Test trades
Day 0, T+30m: Soft launch announcement
Day 0 to Day 7: Intensive monitoring
```

---

## Pre-Deployment Phase

### Day -3: Final Go/No-Go Meeting

**Attendees:** Technical Lead, Security Lead, CEO/Founder, Infrastructure Lead

**Meeting Agenda (60 minutes):**

1. **Review Critical Blockers (30 minutes)**
   - Walk through complete blockers list (see Section 8)
   - Run verification commands live
   - Document status of each item

2. **Review Devnet Soak Test Plan (10 minutes)**
   - Confirm 72-hour start time
   - Assign monitoring responsibilities
   - Define success criteria

3. **Team Availability Confirmation (5 minutes)**
   - Launch day coverage (T-4h through T+24h)
   - On-call rotation for first week
   - Emergency contacts shared

4. **Final Decision (15 minutes)**
   - Individual votes (see GO_NO_GO_DECISION_FORM.md)
   - Weighted decision calculation
   - GO: Proceed with soak test
   - NO-GO: Delay launch, document gaps

**Output:**
- Completed GO_NO_GO_DECISION_FORM.md
- Devnet soak test start time confirmed
- Mainnet launch date/time scheduled

### Verification Commands (Run During Meeting)

```bash
# 1. CRITICAL: Verify DEPLOYER_PUBKEY is NOT placeholder
grep "11111111111111111111111111111111" programs/creator-amm-v2/src/instructions/initialize.rs
# MUST return NOTHING. If it shows the constant, this is a BLOCKER.

# 2. Verify DEPLOYER_PUBKEY matches your wallet
DEPLOYER=$(grep "DEPLOYER_PUBKEY" programs/creator-amm-v2/src/instructions/initialize.rs | grep -oP 'pubkey!\("\K[^"]+')
WALLET=$(solana address)
echo "DEPLOYER_PUBKEY: $DEPLOYER"
echo "Your wallet:     $WALLET"
# These MUST match

# 3. Verify no unchecked arithmetic
rg "unwrap\(\)" programs/creator-amm-v2/src/ --type rust | grep -v test | grep -v "// ok to unwrap"
# Should return ZERO results in production code

# 4. Verify all tests pass
anchor test
# MUST show 100% pass rate

# 5. Verify clean build
anchor clean && anchor build
# MUST complete with 0 errors

# 6. Verify program size
ls -lh target/deploy/creator_amm_v2.so
# Should be <500KB

# 7. Verify oracle validation exists
grep -A 5 "oracle_max_age" programs/creator-amm-v2/src/utils/oracle.rs
grep -A 5 "oracle_max_confidence" programs/creator-amm-v2/src/utils/oracle.rs
grep -A 5 "exponent" programs/creator-amm-v2/src/utils/oracle.rs
# All should show validation checks

# 8. Verify emergency pause instruction exists
ls programs/creator-amm-v2/src/instructions/set_paused.rs
# File must exist
```

**If ANY verification fails, decision is automatically NO-GO.**

---

## Devnet Soak Test Protocol

### Overview

**Duration:** 72 hours continuous
**Goal:** 10,000+ trades with zero exploits
**Start:** Immediately after GO decision from go/no-go meeting
**End:** T-1 hour before mainnet deployment

### Phase 1: Devnet Deployment (Hour 0-2)

```bash
# Step 1: Deploy to devnet
cd /home/user/Claude
anchor build
anchor deploy --provider.cluster devnet

# Step 2: Initialize config
npx ts-node scripts/init-config-devnet.ts

# Step 3: Create test pools
# Create 5 different pools for testing
for i in {1..5}; do
  npx ts-node scripts/create-test-pool-devnet.ts --pool $i
done

# Step 4: Fund test accounts
# Use deploy-devnet.sh if not already done
./scripts/deploy-devnet.sh
```

**Checklist:**
- [ ] Program deployed to devnet successfully
- [ ] Config initialized (authority = deployer wallet)
- [ ] 5 test pools created
- [ ] 10 test accounts funded with SOL and CRX
- [ ] Oracle feed verified operational
- [ ] Fee recipient account ready

### Phase 2: Automated Trading (Hour 2-72)

**Simulation Script:** Create `/home/user/Claude/scripts/soak-test-simulation.ts`

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import { ScaleAMM } from "../sdk/ScaleAMM";
import * as fs from "fs";

// Configuration
const DURATION_HOURS = 72;
const TARGET_TRADES = 10000;
const TRADES_PER_HOUR = Math.ceil(TARGET_TRADES / DURATION_HOURS); // ~139 trades/hour
const DELAY_BETWEEN_TRADES = (3600 * 1000) / TRADES_PER_HOUR; // ~25 seconds

// Load test accounts
const testAccounts = Array.from({ length: 10 }, (_, i) =>
  Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(fs.readFileSync(`.keypairs/test-user-${i + 1}.json`, "utf-8"))
    )
  )
);

// Load test pools
const testPools = JSON.parse(
  fs.readFileSync(".deployment-state-devnet.json", "utf-8")
).test_pools;

async function runSoakTest() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const startTime = Date.now();
  const endTime = startTime + DURATION_HOURS * 3600 * 1000;

  let tradeCount = 0;
  const results = {
    successful: 0,
    failed: 0,
    errors: [] as any[],
    trades: [] as any[],
  };

  console.log(`Starting ${DURATION_HOURS}-hour soak test`);
  console.log(`Target: ${TARGET_TRADES} trades`);
  console.log(`Rate: ~${TRADES_PER_HOUR} trades/hour`);

  while (Date.now() < endTime && tradeCount < TARGET_TRADES) {
    try {
      // Random: buy or sell
      const isBuy = Math.random() > 0.5;

      // Random: select user
      const user = testAccounts[Math.floor(Math.random() * testAccounts.length)];

      // Random: select pool
      const pool = testPools[Math.floor(Math.random() * testPools.length)];

      // Random: trade size (small to medium)
      const amount = 10 + Math.random() * 90; // 10-100 CRX or tokens

      const scale = new ScaleAMM(connection, user);

      if (isBuy) {
        const result = await scale.buy(pool, {
          crxAmount: amount,
          slippage: 2.0, // 2% slippage tolerance
        });
        console.log(`✅ Trade ${tradeCount + 1}: Buy ${amount} CRX`);
        results.successful++;
        results.trades.push({
          trade: tradeCount + 1,
          type: "buy",
          amount,
          user: user.publicKey.toString(),
          pool,
          timestamp: Date.now(),
          success: true,
        });
      } else {
        const result = await scale.sell(pool, {
          tokenAmount: amount,
          slippage: 2.0,
        });
        console.log(`✅ Trade ${tradeCount + 1}: Sell ${amount} tokens`);
        results.successful++;
        results.trades.push({
          trade: tradeCount + 1,
          type: "sell",
          amount,
          user: user.publicKey.toString(),
          pool,
          timestamp: Date.now(),
          success: true,
        });
      }

      tradeCount++;

      // Wait before next trade
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_TRADES));
    } catch (error: any) {
      console.error(`❌ Trade ${tradeCount + 1} failed:`, error.message);
      results.failed++;
      results.errors.push({
        trade: tradeCount + 1,
        error: error.message,
        timestamp: Date.now(),
      });

      // If error rate > 20%, stop test
      if (results.failed / (tradeCount + 1) > 0.2) {
        console.error("Error rate exceeded 20%. Stopping test.");
        break;
      }

      // Continue despite error
      tradeCount++;
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_TRADES));
    }

    // Checkpoint every 100 trades
    if (tradeCount % 100 === 0) {
      fs.writeFileSync(
        `soak-test-checkpoint-${tradeCount}.json`,
        JSON.stringify(results, null, 2)
      );
      console.log(`Checkpoint: ${tradeCount} trades completed`);
      console.log(`Success rate: ${(results.successful / tradeCount * 100).toFixed(2)}%`);
    }
  }

  // Final report
  const duration = (Date.now() - startTime) / 3600000;
  console.log("\n========== SOAK TEST COMPLETE ==========");
  console.log(`Duration: ${duration.toFixed(2)} hours`);
  console.log(`Total trades: ${tradeCount}`);
  console.log(`Successful: ${results.successful}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Success rate: ${(results.successful / tradeCount * 100).toFixed(2)}%`);
  console.log(`Average trades/hour: ${(tradeCount / duration).toFixed(0)}`);

  // Save final results
  fs.writeFileSync("soak-test-results-final.json", JSON.stringify(results, null, 2));

  // Pass/Fail criteria
  const passRate = results.successful / tradeCount;
  if (passRate >= 0.99 && results.failed < 10 && tradeCount >= TARGET_TRADES) {
    console.log("\n✅ SOAK TEST PASSED");
    return true;
  } else {
    console.log("\n❌ SOAK TEST FAILED");
    console.log(`Criteria:`);
    console.log(`  Pass rate ≥99%: ${passRate >= 0.99 ? '✅' : '❌'} (${(passRate * 100).toFixed(2)}%)`);
    console.log(`  Failed trades <10: ${results.failed < 10 ? '✅' : '❌'} (${results.failed})`);
    console.log(`  Total trades ≥${TARGET_TRADES}: ${tradeCount >= TARGET_TRADES ? '✅' : '❌'} (${tradeCount})`);
    return false;
  }
}

runSoakTest().catch(console.error);
```

**Run Soak Test:**

```bash
# Start soak test in background
nohup npx ts-node scripts/soak-test-simulation.ts > soak-test.log 2>&1 &

# Save process ID
echo $! > soak-test.pid

# Monitor progress
tail -f soak-test.log

# Check status (run this every few hours)
grep "Checkpoint" soak-test.log | tail -1
```

### Phase 3: Manual Testing (Throughout 72 hours)

**Team members should manually test these scenarios:**

**Hour 8-12:**
- [ ] Create pool with different curve types (ConstantProduct, Exponential)
- [ ] Test anti-sniper protection (trade in first 20 slots)
- [ ] Test WAA decay (buy, wait, sell - verify fee decay)
- [ ] Test slippage protection (set tight slippage, expect failure)
- [ ] Test with dust amounts (very small trades)

**Hour 24-28:**
- [ ] Test graduation mechanics (accumulate enough to trigger graduation)
- [ ] Verify phase transition (PreBonding → Graduated)
- [ ] Test trading after graduation (should still work)
- [ ] Verify reserves switch from virtual to real
- [ ] Test emergency pause/unpause

**Hour 48-52:**
- [ ] Test concurrent trades (multiple users trading same pool simultaneously)
- [ ] Test with extreme values (max supply, min supply)
- [ ] Test oracle staleness (mock stale oracle, verify rejection)
- [ ] Test oracle manipulation (mock bad confidence, verify rejection)
- [ ] Test with different fee tiers (0%, 0.25%, 1%)

**Hour 68-72:**
- [ ] Final stress test (rapid trades)
- [ ] Verify all pools still operational
- [ ] Check fee collection amounts
- [ ] Verify no accounting errors
- [ ] Final security review

### Phase 4: Monitoring & Validation (Continuous)

**Automated Monitoring (Every 5 minutes):**

```bash
# Check transaction success rate
grep -c "✅" soak-test.log
grep -c "❌" soak-test.log

# Calculate success rate
SUCCESSES=$(grep -c "✅" soak-test.log)
FAILURES=$(grep -c "❌" soak-test.log)
TOTAL=$((SUCCESSES + FAILURES))
SUCCESS_RATE=$(echo "scale=2; $SUCCESSES * 100 / $TOTAL" | bc)
echo "Success rate: $SUCCESS_RATE%"

# Check for critical errors
grep -i "exploit\|overflow\|panic" soak-test.log
# Should return NOTHING

# Check pool health
npx ts-node scripts/check-pool-health.ts
```

**Manual Checks (Every 4 hours):**

- [ ] Review soak test log for unusual patterns
- [ ] Check all pools still have correct reserves
- [ ] Verify vault balances match pool reserves
- [ ] Check fee recipient balance growing
- [ ] Check oracle still providing fresh prices
- [ ] Review any failed transactions

### Soak Test Success Criteria

**REQUIRED for mainnet deployment:**

✅ **Duration:** Full 72 hours completed
✅ **Trade Volume:** ≥10,000 trades executed
✅ **Success Rate:** ≥99% transactions successful
✅ **Failed Trades:** <10 total failures
✅ **Security:** Zero exploits discovered
✅ **Crashes:** Zero program crashes
✅ **Accounting:** All reserves match vaults
✅ **Graduation:** At least 1 successful graduation observed
✅ **Emergency Pause:** Successfully tested

**If ANY criteria fails, deployment is NO-GO.**

### Soak Test Completion Report

At hour 72, generate final report:

```bash
# Generate report
npx ts-node scripts/generate-soak-test-report.ts

# Report should include:
# - Total trades: ___
# - Success rate: ___%
# - Failed transactions: ___
# - Pools created: ___
# - Graduations: ___
# - Exploits found: ___ (must be 0)
# - Accounting errors: ___ (must be 0)
# - Recommendation: GO / NO-GO
```

**Save report as:** `SOAK_TEST_REPORT_[DATE].md`

**Distribute to:** All team members before T-1 hour meeting

---

## Deployment Day Sequence

### T-4 Hours: Team Assembly

**War Room Setup:**

```bash
# Create Discord channel: #mainnet-launch-[DATE]
# Pin these messages:
# 1. Deployment timeline
# 2. Emergency contacts
# 3. Soak test report
# 4. Link to this playbook
```

**Team Roll Call:**

```
✅ Technical Lead - [Name] - Ready / Not Ready
✅ Security Lead - [Name] - Ready / Not Ready
✅ Infrastructure Lead - [Name] - Ready / Not Ready
✅ Communications Lead - [Name] - Ready / Not Ready
✅ Support Lead - [Name] - Ready / Not Ready
```

**Pre-Deployment Checklist:**

```bash
# 1. Git status clean
cd /home/user/Claude
git status
# Should show: "nothing to commit, working tree clean"

# 2. On correct branch
git branch --show-current
# Should be: main or release/v1.0.0

# 3. Latest commit is deployment-ready
git log -1 --oneline
# Should show: commit message mentioning mainnet readiness

# 4. DEPLOYER_PUBKEY verified (CRITICAL - check again!)
grep "DEPLOYER_PUBKEY" programs/creator-amm-v2/src/instructions/initialize.rs
# Should show YOUR wallet, NOT 11111...

# 5. Solana CLI configured for mainnet
solana config get
# RPC URL: https://api.mainnet-beta.solana.com (or your RPC provider)
# WebSocket URL: ws://api.mainnet-beta.solana.com (or your RPC provider)
# Keypair Path: ~/.config/solana/id.json

# 6. Deployer wallet verified
solana address
# Should match DEPLOYER_PUBKEY in code

# 7. Deployer balance sufficient
solana balance
# Should show: ≥5 SOL (deployment costs 2-3 SOL)

# 8. Environment variables set
cat > .env.mainnet << 'EOF'
NETWORK=mainnet-beta
RPC_URL=https://api.mainnet-beta.solana.com
DEPLOYER_KEYPAIR=~/.config/solana/id.json
FEE_RECIPIENT=<YOUR_TREASURY_WALLET>
CRX_MINT=<CRX_TOKEN_MINT_ADDRESS>
ORACLE_ADDRESS=<PYTH_CRX_USD_FEED_ADDRESS>
EOF

source .env.mainnet
echo "Network: $NETWORK"
echo "Deployer: $(solana address)"
echo "Balance: $(solana balance)"
```

**All checks must pass. If any fail, delay deployment.**

### T-1 Hour: Final Verification

**Clean Build:**

```bash
# Remove all previous builds
anchor clean
cargo clean
rm -rf target/

# Fresh build for mainnet
anchor build

# Verify build succeeded
echo $?
# Should output: 0

# Check binary size
ls -lh target/deploy/creator_amm_v2.so
# Should be <500KB

# Verify program ID matches Anchor.toml
cat Anchor.toml | grep -A 1 "programs.mainnet"
# Should show: creator_amm_v2 = "CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3"

# Save program hash (for verification)
solana program dump target/deploy/creator_amm_v2-keypair.json /tmp/mainnet-program.so
sha256sum /tmp/mainnet-program.so | tee PROGRAM_HASH.txt
```

**Prepare Initialization Script:**

Create `/home/user/Claude/scripts/initialize-mainnet.ts`:

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CreatorAmmV2 } from "../target/types/creator_amm_v2";
import { PublicKey } from "@solana/web3.js";

async function main() {
  console.log("========================================");
  console.log("  SCALE AMM - MAINNET INITIALIZATION");
  console.log("========================================\n");

  // Setup provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CreatorAmmV2 as Program<CreatorAmmV2>;
  const programId = program.programId;

  console.log("Program ID:", programId.toString());
  console.log("Deployer:", provider.wallet.publicKey.toString());
  console.log("");

  // Derive config PDA
  const [configPda, configBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId
  );

  console.log("Config PDA:", configPda.toString());
  console.log("Config Bump:", configBump);
  console.log("");

  // PRODUCTION PARAMETERS
  const params = {
    preBondingFeeBps: 300,                              // 3%
    preBondingThresholdUsd: new anchor.BN(40_000_000_000),  // $40k
    postBondingFeeBps: 100,                             // 1%
    graduationThresholdUsd: new anchor.BN(85_000_000_000),  // $85k
    antiSniperWindowSlots: new anchor.BN(20),           // ~8 seconds
    antiSniperMaxTradeBps: 500,                         // 5%
    oracleMaxAgeSeconds: new anchor.BN(60),             // 1 minute
    oracleMaxConfidenceBps: new anchor.BN(100),         // 1%
  };

  console.log("Parameters:");
  console.log("  Pre-bonding fee: 3% (300 bps)");
  console.log("  Pre-bonding threshold: $40,000");
  console.log("  Post-bonding fee: 1% (100 bps)");
  console.log("  Graduation threshold: $85,000");
  console.log("  Anti-sniper window: 20 slots");
  console.log("  Anti-sniper max trade: 5% (500 bps)");
  console.log("  Oracle max age: 60 seconds");
  console.log("  Oracle max confidence: 1% (100 bps)");
  console.log("");

  // CRITICAL: Update these addresses before running!
  const FEE_RECIPIENT = new PublicKey(process.env.FEE_RECIPIENT!);
  const CRX_MINT = new PublicKey(process.env.CRX_MINT!);
  const ORACLE_ADDRESS = new PublicKey(process.env.ORACLE_ADDRESS!);

  console.log("Addresses:");
  console.log("  Fee Recipient:", FEE_RECIPIENT.toString());
  console.log("  CRX Mint:", CRX_MINT.toString());
  console.log("  Oracle:", ORACLE_ADDRESS.toString());
  console.log("");

  // Approved quote tokens (currently only CRX for permissionless tier)
  const approvedQuoteTokens = [
    CRX_MINT,
    PublicKey.default,
    PublicKey.default,
    PublicKey.default,
    PublicKey.default,
  ];

  console.log("⚠️  CRITICAL: You are about to initialize on MAINNET");
  console.log("This transaction cannot be reversed.");
  console.log("");
  console.log("Proceeding in 3 seconds...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  try {
    const tx = await program.methods
      .initialize(
        params.preBondingFeeBps,
        params.preBondingThresholdUsd,
        params.postBondingFeeBps,
        params.graduationThresholdUsd,
        params.antiSniperWindowSlots,
        params.antiSniperMaxTradeBps,
        params.oracleMaxAgeSeconds,
        params.oracleMaxConfidenceBps,
        approvedQuoteTokens,
        1 // approved_quote_count
      )
      .accounts({
        config: configPda,
        authority: provider.wallet.publicKey,
        feeRecipient: FEE_RECIPIENT,
        crxPriceOracle: ORACLE_ADDRESS,
        crxMint: CRX_MINT,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("");
    console.log("========================================");
    console.log("  ✅ INITIALIZATION SUCCESSFUL");
    console.log("========================================");
    console.log("");
    console.log("Transaction:", tx);
    console.log("Config PDA:", configPda.toString());
    console.log("");
    console.log("Explorer:", `https://explorer.solana.com/tx/${tx}`);
    console.log("");
    console.log("Next: Create CRX/SOL primary pool");
  } catch (err) {
    console.error("");
    console.error("========================================");
    console.error("  ❌ INITIALIZATION FAILED");
    console.error("========================================");
    console.error("");
    console.error("Error:", err);
    console.error("");
    console.error("ACTION REQUIRED:");
    console.error("1. Read error message carefully");
    console.error("2. Fix issue (parameters, accounts, or SOL balance)");
    console.error("3. Retry IMMEDIATELY (front-running risk)");
    process.exit(1);
  }
}

main().catch(console.error);
```

**Create Deployment Log:**

```bash
mkdir -p logs/
DEPLOY_LOG="logs/mainnet-deployment-$(date +%Y%m%d-%H%M%S).log"
echo "Deployment log: $DEPLOY_LOG"
```

**Final Team Sync:**

```
All team members confirm in war room:
✅ Ready for deployment
✅ Have read this playbook
✅ Understand their role
✅ Standing by for launch
```

### T-30 Minutes: Deploy Program

**POINT OF NO RETURN - This deploys the program to mainnet.**

```bash
# Set Solana config to mainnet (verify again!)
solana config set --url mainnet-beta
solana config set --keypair ~/.config/solana/id.json

# Verify config
solana config get
# MUST show mainnet-beta

# Deploy program
echo "Deploying to mainnet in 10 seconds..."
echo "Press Ctrl+C to abort, or wait..."
sleep 10

anchor deploy --provider.cluster mainnet-beta 2>&1 | tee $DEPLOY_LOG

# Check exit code
if [ $? -eq 0 ]; then
  echo "✅ Deployment successful"
else
  echo "❌ Deployment failed"
  exit 1
fi
```

**Expected Output:**

```
Deploying cluster: mainnet-beta
Upgrade authority: <YOUR_WALLET>
Deploying program "creator_amm_v2"...
Program Id: CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3

Deploy success
```

**Duration:** 2-3 minutes

**Save Artifacts:**

```bash
# Save program ID
PROGRAM_ID="CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3"
echo $PROGRAM_ID > PROGRAM_ID_MAINNET.txt

# Save deploy transaction signature
DEPLOY_TX=$(grep "Signature" $DEPLOY_LOG | awk '{print $2}')
echo $DEPLOY_TX > DEPLOY_TX_MAINNET.txt

# Save deploy slot
DEPLOY_SLOT=$(solana slot --url mainnet)
echo $DEPLOY_SLOT > DEPLOY_SLOT_MAINNET.txt

# Announce in war room
echo "✅ Program deployed!"
echo "Program ID: $PROGRAM_ID"
echo "Transaction: $DEPLOY_TX"
echo "Slot: $DEPLOY_SLOT"
```

### T-5 Minutes: Verify Deployment

```bash
# Verify program exists on-chain
solana program show $PROGRAM_ID --url mainnet

# Expected output:
# Program Id: CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3
# Owner: BPFLoaderUpgradeab1e11111111111111111111111
# ProgramData Address: <SOME_ADDRESS>
# Authority: <YOUR_WALLET>
# Last Deployed In Slot: <SLOT_NUMBER>
# Data Length: <SIZE> bytes

# Verify on explorer
echo "Verify on explorer:"
echo "https://explorer.solana.com/address/$PROGRAM_ID"

# Take screenshot of explorer page
# Save in: screenshots/program-deployed-mainnet.png
```

**Checklist:**
- [ ] Program account exists
- [ ] Owner is BPFLoaderUpgradeab1e
- [ ] Authority is deployer wallet
- [ ] Explorer shows program deployed
- [ ] Screenshot saved

### T-0: Initialize Config (CRITICAL - RACE CONDITION!)

**YOU HAVE ~60 SECONDS BEFORE FRONT-RUNNERS CAN ATTEMPT TO INITIALIZE**

However, because DEPLOYER_PUBKEY is hardcoded to your wallet, only you can successfully initialize. Still, execute IMMEDIATELY.

```bash
# Run initialization script
echo "Initializing config in 3 seconds..."
sleep 3

npx ts-node scripts/initialize-mainnet.ts

# Monitor output for success
```

**Expected Output:**

```
========================================
  SCALE AMM - MAINNET INITIALIZATION
========================================

Program ID: CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3
Deployer: <YOUR_WALLET>

Config PDA: <CONFIG_PDA>
Config Bump: <BUMP>

Parameters:
  Pre-bonding fee: 3% (300 bps)
  Pre-bonding threshold: $40,000
  Post-bonding fee: 1% (100 bps)
  Graduation threshold: $85,000
  Anti-sniper window: 20 slots
  Anti-sniper max trade: 5% (500 bps)
  Oracle max age: 60 seconds
  Oracle max confidence: 1% (100 bps)

Addresses:
  Fee Recipient: <FEE_RECIPIENT>
  CRX Mint: <CRX_MINT>
  Oracle: <ORACLE_ADDRESS>

⚠️  CRITICAL: You are about to initialize on MAINNET
This transaction cannot be reversed.

Proceeding in 3 seconds...

========================================
  ✅ INITIALIZATION SUCCESSFUL
========================================

Transaction: <TX_SIGNATURE>
Config PDA: <CONFIG_PDA>

Explorer: https://explorer.solana.com/tx/<TX_SIGNATURE>

Next: Create CRX/SOL primary pool
```

**Duration:** 5-15 seconds

**Save Artifacts:**

```bash
# Extract from script output
CONFIG_PDA="<from_output>"
INIT_TX="<from_output>"

# Save to files
echo $CONFIG_PDA > CONFIG_PDA_MAINNET.txt
echo $INIT_TX > INIT_TX_MAINNET.txt

# Announce in war room
echo "✅ Config initialized!"
echo "Config PDA: $CONFIG_PDA"
echo "Transaction: $INIT_TX"
```

### T+1 Minute: Verify Initialization

```bash
# Verify config account exists
solana account $CONFIG_PDA --url mainnet

# Should show account with data (not "Account not found")

# Verify config state using Anchor
npx ts-node scripts/verify-config.ts
```

**Verify Config Script** (`scripts/verify-config.ts`):

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CreatorAmmV2 } from "../target/types/creator_amm_v2";
import { PublicKey } from "@solana/web3.js";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.CreatorAmmV2 as Program<CreatorAmmV2>;

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  const config = await program.account.config.fetch(configPda);

  console.log("Config State:");
  console.log("  Authority:", config.authority.toString());
  console.log("  Fee Recipient:", config.feeRecipient.toString());
  console.log("  CRX Mint:", config.crxMint.toString());
  console.log("  CRX Oracle:", config.crxPriceOracle.toString());
  console.log("  Pre-bonding Fee:", config.preBondingFeeBps, "bps");
  console.log("  Pre-bonding Threshold:", config.preBondingThresholdUsd.toString());
  console.log("  Post-bonding Fee:", config.postBondingFeeBps, "bps");
  console.log("  Graduation Threshold:", config.graduationThresholdUsd.toString());
  console.log("  Anti-sniper Window:", config.antiSniperWindowSlots.toString(), "slots");
  console.log("  Anti-sniper Max Trade:", config.antiSniperMaxTradeBps, "bps");
  console.log("  Oracle Max Age:", config.oracleMaxAgeSeconds.toString(), "seconds");
  console.log("  Oracle Max Confidence:", config.oracleMaxConfidenceBps.toString(), "bps");
  console.log("  Is Paused:", config.isPaused);

  // Verify values
  console.log("\nVerification:");
  console.log("  Authority matches deployer:", config.authority.equals(provider.wallet.publicKey) ? "✅" : "❌");
  console.log("  Is NOT paused:", !config.isPaused ? "✅" : "❌");
  console.log("  Pre-bonding fee = 300 bps:", config.preBondingFeeBps === 300 ? "✅" : "❌");
  console.log("  Post-bonding fee = 100 bps:", config.postBondingFeeBps === 100 ? "✅" : "❌");

  if (
    config.authority.equals(provider.wallet.publicKey) &&
    !config.isPaused &&
    config.preBondingFeeBps === 300 &&
    config.postBondingFeeBps === 100
  ) {
    console.log("\n✅ Config verification PASSED");
  } else {
    console.log("\n❌ Config verification FAILED");
    process.exit(1);
  }
}

main().catch(console.error);
```

**Checklist:**
- [ ] Config PDA exists
- [ ] Authority is deployer wallet
- [ ] Fee recipient correct
- [ ] CRX mint correct
- [ ] Oracle address correct
- [ ] is_paused = false
- [ ] All parameters match expected values

**IF INITIALIZATION FAILS:**

```bash
# This should NOT happen if DEPLOYER_PUBKEY is set correctly
# But if it does:

# 1. Read error message
echo "Error: <paste error>"

# 2. Common issues:
# - Insufficient SOL: Transfer more SOL, retry immediately
# - Invalid parameters: Fix parameters in script, retry immediately
# - Account already initialized: Someone else initialized (CRITICAL - see emergency procedures)

# 3. Retry immediately (time-sensitive!)
npx ts-node scripts/initialize-mainnet.ts
```

### T+5 Minutes: Create CRX/SOL Primary Pool

**This is the main liquidity pool that powers all token launches.**

```bash
# Run pool creation script
npx ts-node scripts/create-crx-sol-pool-mainnet.ts
```

**Checklist:**
- [ ] Pool created successfully
- [ ] Pool PDA saved
- [ ] Transaction confirmed
- [ ] Pool visible on explorer

### T+10 Minutes: Execute Test Trades

**Small test trades to verify everything works.**

```bash
# Test buy (small amount)
npx ts-node scripts/test-buy-mainnet.ts --pool $POOL_PDA --amount 0.1

# Test sell (small amount)
npx ts-node scripts/test-sell-mainnet.ts --pool $POOL_PDA --amount 50
```

**Checklist:**
- [ ] Buy transaction successful
- [ ] Tokens received
- [ ] Sell transaction successful
- [ ] CRX received
- [ ] Reserves updated correctly
- [ ] Fees collected to fee_recipient

### T+15 Minutes: Verify Accounting

```bash
# Run accounting verification
npx ts-node scripts/verify-accounting-mainnet.ts --pool $POOL_PDA
```

**Verification script should check:**
- [ ] quote_reserves == quote_vault_balance
- [ ] base_reserves == base_vault_balance
- [ ] fee_recipient has collected fees
- [ ] No accounting discrepancies

### T+30 Minutes: Soft Launch Announcement

**ONLY if all tests passed and no issues detected.**

**Discord (Private Community):**

```
🚀 Scale AMM is LIVE on Solana Mainnet!

We've successfully deployed to mainnet and completed initial testing.

Program ID: CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3

Status:
✅ Program deployed
✅ Config initialized
✅ Test trades successful
✅ Accounting verified

What you can do:
- Create token pools (permissionlessly!)
- Trade on the bonding curve
- Test the graduation mechanics

⚠️ IMPORTANT:
- This is a NEW protocol - use at your own risk
- Start with SMALL amounts
- Report any issues to #bug-reports

Docs: [link]
SDK: [link]
Explorer: https://explorer.solana.com/address/CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3

We'll announce publicly in ~2 hours if everything remains stable.

Thank you for being early! 🎉
```

### T+2 Hours: Public Announcement

**ONLY if first 2 hours are completely stable.**

**Decision Point:**
- [ ] No security incidents
- [ ] Transaction success rate >99%
- [ ] No critical bugs discovered
- [ ] Team consensus: GO for public announcement

**Twitter:**

```
🚀 Scale AMM is LIVE on Solana Mainnet

Launch your token at ANY market cap. No presale. No VC unlock.

Features:
✅ Fair launch bonding curves
✅ Oracle-based virtual liquidity
✅ Auto-graduation at $85k
✅ Permissionless & unstoppable

Program: CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3

Docs: [link]
SDK: [link]

⚠️ New protocol. DYOR. Use at your own risk.

LFG 🔥

[Thread below ⬇️]
```

---

## Post-Launch Monitoring

### First 24 Hours (Maximum Intensity)

**Team Coverage:** 24/7 on-call rotation

**Monitoring Checklist (Every Hour):**

```bash
# 1. Transaction success rate
# Target: >99%

# 2. Check for errors
grep -i "error\|fail" logs/mainnet-*.log | tail -20

# 3. Oracle health
# Verify prices updating and within reasonable bounds

# 4. Pool health
# Check reserves match vaults

# 5. TVL growth
# Is it growing at expected rate?

# 6. Security alerts
# Any unusual patterns?
```

**Alert Thresholds:**

| Metric | Threshold | Response Time |
|--------|-----------|---------------|
| Transaction failure rate >5% | CRITICAL | <5 min |
| Oracle staleness >5 min | HIGH | <15 min |
| Unusual fee drain | CRITICAL | <5 min |
| RPC downtime | HIGH | <10 min |
| Security alert | CRITICAL | <1 min |

### First Week (High Vigilance)

**Team Coverage:** 16/7 (8am-12am coverage)

**Daily Checks (2x per day):**

- [ ] Growth metrics (TVL, pools, users)
- [ ] System health (uptime, tx success rate)
- [ ] User feedback (Discord sentiment)
- [ ] Security monitoring (review all transactions)

**Weekly Metrics (Day 7):**

```
Growth:
- Week 1 TVL: $___
- Pools created: ___
- Unique users: ___
- Volume: $___

Performance:
- Uptime: ___%
- Tx success rate: ___%

Revenue:
- Fees collected: ___ CRX ($__)

Issues:
- Total incidents: ___
- Critical incidents: ___
```

---

## Emergency Procedures

### Scenario 1: Exploit Detected

**Severity:** CRITICAL (P0)

**Detection:**
- Automated alert fires
- Security researcher reports
- Unusual transaction pattern observed
- Funds draining rapidly

**Immediate Actions (Within 5 minutes):**

```bash
# 1. Verify exploit is real (not false alarm)
# Check transaction details

# 2. Emergency pause protocol
npx ts-node scripts/emergency-pause.ts

# 3. Notify team in war room
echo "🚨 CRITICAL: Exploit detected. Protocol paused."

# 4. Begin investigation
# - What is being exploited?
# - How much is at risk?
# - How many users affected?

# 5. Prepare user communication (within 15 minutes)
# See Section 6 of MAINNET_DEPLOYMENT_GUIDE.md for templates
```

**Emergency Pause Script** (`scripts/emergency-pause.ts`):

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CreatorAmmV2 } from "../target/types/creator_amm_v2";
import { PublicKey } from "@solana/web3.js";

async function main() {
  console.log("⚠️⚠️⚠️ EMERGENCY PAUSE ⚠️⚠️⚠️");
  console.log("");
  console.log("This will HALT ALL TRADING on Scale AMM.");
  console.log("Only use this for critical security issues.");
  console.log("");
  console.log("Proceeding in 5 seconds...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.CreatorAmmV2 as Program<CreatorAmmV2>;

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  try {
    const tx = await program.methods
      .setPaused(true)
      .accounts({
        config: configPda,
        authority: provider.wallet.publicKey,
      })
      .rpc();

    console.log("");
    console.log("🛑 PROTOCOL PAUSED");
    console.log("Transaction:", tx);
    console.log("All trading halted.");
    console.log("");
    console.log("ACTION REQUIRED:");
    console.log("1. Investigate issue immediately");
    console.log("2. Communicate to users (see deployment guide)");
    console.log("3. Develop fix or mitigation");
    console.log("4. When safe, run: npx ts-node scripts/unpause.ts");
  } catch (err) {
    console.error("❌ EMERGENCY PAUSE FAILED");
    console.error(err);
    console.error("");
    console.error("CRITICAL: Manual intervention required");
    process.exit(1);
  }
}

main().catch(console.error);
```

**Post-Pause Actions:**

1. **Investigation (1-4 hours)**
   - Identify root cause
   - Assess damage
   - Estimate funds at risk
   - Develop mitigation plan

2. **Communication (Within 15 minutes of pause)**
   - Tweet: "Scale AMM temporarily paused for emergency maintenance. User funds safe. Investigating."
   - Discord announcement with details
   - Update website banner

3. **Resolution (Variable)**
   - Option A: Fix and resume (if minor)
   - Option B: Deploy new version (if critical)
   - Option C: Keep paused indefinitely (if unfixable)

### Scenario 2: Oracle Failure

**Severity:** HIGH (P1)

**Detection:**
- Transactions failing with "OraclePriceStale"
- Oracle staleness >10 minutes persistent
- Oracle confidence >1% persistent

**Actions:**

```bash
# 1. Verify oracle is actually down
# Check Pyth status page

# 2. If Pyth is down globally:
# - This affects all protocols using Pyth
# - Wait for Pyth team to fix
# - Communicate to users (RPC/Oracle issue, not protocol)

# 3. If only our feed is down:
# - Switch to backup oracle (if admin function exists)
# - Or emergency pause until recovered

# 4. If prolonged (>1 hour):
# - Consider emergency pause
# - Communicate ETA to users
```

### Scenario 3: RPC Provider Outage

**Severity:** MEDIUM (P2)

**Detection:**
- Transactions failing to confirm
- RPC errors in logs
- Monitoring shows RPC down

**Actions:**

```bash
# 1. Switch to backup RPC immediately
export RPC_URL="<BACKUP_RPC_URL>"

# 2. Update environment
# Update .env.mainnet with backup RPC

# 3. Verify backup RPC working
solana cluster-version --url $RPC_URL

# 4. Communicate to users (if prolonged)
# "We're experiencing issues with our RPC provider.
# Protocol is operational. We've switched to backup."

# 5. Contact primary RPC support
# Report issue, get ETA
```

### Scenario 4: High Transaction Failure Rate

**Severity:** MEDIUM to HIGH (P1-P2)

**Detection:**
- Success rate drops below 95%
- Many users reporting failed transactions

**Actions:**

```bash
# 1. Investigate cause
# - Are transactions failing in our program or elsewhere?
# - What error codes?
# - Specific pools or all pools?

# 2. If program bug:
# - Assess severity
# - Emergency pause if critical
# - Fix and deploy new version if needed

# 3. If network congestion:
# - This is expected on Solana sometimes
# - Advise users to use higher priority fees
# - Monitor and wait for congestion to clear

# 4. If RPC issues:
# - Switch to backup RPC
# - See Scenario 3
```

### Scenario 5: Someone Initialized Before You (Should Be Impossible)

**Severity:** CRITICAL - PROTOCOL COMPROMISED

**This should NEVER happen if DEPLOYER_PUBKEY is set correctly.**

**If it does happen:**

```bash
# 1. STOP IMMEDIATELY
# Do NOT proceed with pool creation or any other actions

# 2. Verify config state
npx ts-node scripts/verify-config.ts

# 3. Check who initialized
# Look at config.authority
# If it's not your wallet, protocol is compromised

# 4. Communicate to team
echo "🚨 CRITICAL: Protocol was initialized by wrong wallet"
echo "Authority: <authority from config>"
echo "Expected: <your wallet>"

# 5. Post-mortem
# - How did this happen?
# - Was DEPLOYER_PUBKEY updated?
# - Was code compromised?

# 6. DO NOT USE THIS DEPLOYMENT
# - Deploy new version with correct DEPLOYER_PUBKEY
# - Investigate security breach
# - Warn community
```

**This is why DEPLOYER_PUBKEY verification is the #1 blocker.**

---

## GO/NO-GO Decision Criteria

### Meeting: T-24 Hours Before Launch

**Use form:** `GO_NO_GO_DECISION_FORM.md`

**Critical Blockers (Any NO = Automatic NO-GO):**

1. **DEPLOYER_PUBKEY Updated**
   ```bash
   grep "11111111111111111111111111111111" programs/creator-amm-v2/src/instructions/initialize.rs
   # MUST return NOTHING
   ```

2. **All Arithmetic Checked**
   ```bash
   rg "unwrap\(\)" programs/creator-amm-v2/src/ --type rust | grep -v test
   # MUST return ZERO results in production code
   ```

3. **Oracle Validation Complete**
   - Staleness check: ✅
   - Confidence check: ✅
   - Exponent bounds: ✅
   - Negative price rejection: ✅

4. **All Tests Pass**
   ```bash
   anchor test
   # MUST show 100% pass rate
   ```

5. **Devnet Soak Test Complete**
   - Duration: 72 hours ✅
   - Trades: ≥10,000 ✅
   - Success rate: ≥99% ✅
   - Exploits: 0 ✅

6. **Clean Build Succeeds**
   ```bash
   anchor clean && anchor build
   # MUST complete with 0 errors
   ```

7. **Team Available**
   - All key personnel ✅

8. **Monitoring Operational**
   - Alert system tested ✅

9. **RPC Providers Confirmed**
   - Primary + Backup ✅

10. **Multisig Ready** (or plan to transfer later)

**Vote:**
- Technical Lead (50% weight): GO / NO-GO
- Security Lead (30% weight): GO / NO-GO
- CEO/Founder (20% weight): GO / NO-GO

**Outcome:**
- ✅ **GO:** Proceed with launch at scheduled time
- ❌ **NO-GO:** Delay launch, resolve blockers, reschedule

---

## Complete Blockers List

### Absolute Blockers (Cannot Deploy)

| # | Blocker | Verification | Impact if Not Fixed |
|---|---------|--------------|---------------------|
| 1 | DEPLOYER_PUBKEY is placeholder (11111...) | `grep "11111111111111111111111111111111" initialize.rs` | CRITICAL - Anyone can take over protocol |
| 2 | Unchecked arithmetic exists | `rg "unwrap\(\)" programs/creator-amm-v2/src/ --type rust` | CRITICAL - Overflow attacks possible |
| 3 | Oracle validation incomplete | Manual code review | HIGH - Price manipulation possible |
| 4 | Tests failing | `anchor test` | HIGH - Unknown bugs likely |
| 5 | Devnet soak test incomplete | Review soak test report | HIGH - Production behavior unknown |
| 6 | Security tests failing | `anchor test -- security-tests.ts` | CRITICAL - Known vulnerabilities |
| 7 | Build fails | `anchor build` | CRITICAL - Cannot deploy |
| 8 | Program size >500KB | `ls -lh target/deploy/creator_amm_v2.so` | MEDIUM - May hit Solana limits |
| 9 | Team unavailable | Manual confirmation | HIGH - Cannot respond to incidents |
| 10 | Monitoring not operational | Test alert system | HIGH - Cannot detect issues |
| 11 | No RPC provider | Verify RPC access | CRITICAL - Cannot interact with chain |
| 12 | Deployer has <5 SOL | `solana balance` | HIGH - Cannot pay deployment costs |

### High-Priority (Can Waive with Justification)

| # | Item | Target | Acceptable | Impact |
|---|------|--------|------------|--------|
| 13 | Compute units per trade | <50k CU | <150k CU | Higher transaction costs |
| 14 | Code coverage | >95% | >85% | Some code untested |
| 15 | External security audit | Completed | Internal review | Higher security risk |
| 16 | Monitoring dashboard | Operational | Manual monitoring | Slower incident detection |

### Nice-to-Haves (Not Blockers)

| # | Item | Status |
|---|------|--------|
| 17 | User guides complete | Optional |
| 18 | Video tutorials | Optional |
| 19 | FAQ comprehensive | Optional |
| 20 | Launch announcement drafted | Optional |
| 21 | SDK published to NPM | Optional |
| 22 | Frontend UI ready | Optional |

---

## Deployment Artifacts to Save

**Immediately after each step, document in `DEPLOYMENT_ARTIFACTS_MAINNET.md`:**

```markdown
# Scale AMM - Mainnet Deployment Artifacts

**Deployment Date:** YYYY-MM-DD
**Deployment Time:** HH:MM:SS UTC

## Program

- **Program ID:** CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3
- **Deploy Transaction:** <signature>
- **Deploy Slot:** <slot>
- **Program Data Account:** <address>
- **Upgrade Authority:** <wallet>
- **Program Hash (SHA256):** <hash>

## Config

- **Config PDA:** <address>
- **Initialize Transaction:** <signature>
- **Initialize Slot:** <slot>
- **Authority:** <wallet>
- **Fee Recipient:** <wallet>
- **CRX Mint:** <address>
- **Oracle Address:** <address>

## Parameters

- **Pre-bonding Fee:** 300 bps (3%)
- **Pre-bonding Threshold:** $40,000 USD
- **Post-bonding Fee:** 100 bps (1%)
- **Graduation Threshold:** $85,000 USD
- **Anti-sniper Window:** 20 slots (~8 seconds)
- **Anti-sniper Max Trade:** 500 bps (5%)
- **Oracle Max Age:** 60 seconds
- **Oracle Max Confidence:** 100 bps (1%)

## Primary Pool (CRX/SOL)

- **Pool PDA:** <address>
- **Quote Vault:** <address>
- **Base Vault:** <address>
- **Create Transaction:** <signature>
- **Create Slot:** <slot>

## Git Info

- **Commit Hash:** <hash>
- **Branch:** main
- **Tag:** v1.0.0-mainnet

## Build Info

- **Anchor Version:** 0.29.0
- **Solana Version:** 1.17
- **Rust Version:** <version>
- **Build Date:** YYYY-MM-DD HH:MM:SS UTC

## Explorer Links

- Program: https://explorer.solana.com/address/<PROGRAM_ID>
- Config: https://explorer.solana.com/address/<CONFIG_PDA>
- CRX Mint: https://explorer.solana.com/address/<CRX_MINT>
- Primary Pool: https://explorer.solana.com/address/<POOL_PDA>
```

---

## Summary Checklist

**Before you begin deployment, verify ALL of these:**

### Pre-Deployment
- [ ] Go/No-Go meeting completed (GO decision)
- [ ] DEPLOYER_PUBKEY updated and verified (NOT 11111...)
- [ ] All tests passing (100%)
- [ ] Devnet soak test completed (72 hours, 10k+ trades, 0 exploits)
- [ ] Clean build succeeds
- [ ] Team assembled and ready
- [ ] Monitoring operational
- [ ] RPC providers confirmed
- [ ] Deployer has ≥5 SOL
- [ ] Initialize script ready
- [ ] Emergency pause script ready

### During Deployment
- [ ] Program deployed successfully
- [ ] Program verified on explorer
- [ ] Config initialized within 1 minute
- [ ] Config state verified
- [ ] Primary pool created
- [ ] Test trades successful
- [ ] Accounting verified (reserves = vaults)
- [ ] No errors in any transaction

### Post-Deployment
- [ ] All artifacts saved
- [ ] Soft launch announced (T+30m)
- [ ] First 2 hours stable
- [ ] Public announcement made (T+2h)
- [ ] Monitoring active 24/7
- [ ] No security incidents
- [ ] Team standing by

---

## Final Notes

### Remember

1. **DEPLOYER_PUBKEY is the #1 blocker** - Check it multiple times
2. **Initialize within 1 minute** of deployment - Front-running risk
3. **You cannot upgrade** - Get it right the first time
4. **Emergency pause is your safety net** - Use it if needed
5. **Communication is critical** - Keep users informed during incidents
6. **Monitor intensively** - First 24 hours are critical

### Success Criteria

**Day 1:**
- ✅ Uptime >99%
- ✅ Transaction success rate >99%
- ✅ Zero security incidents
- ✅ No critical bugs discovered

**Week 1:**
- ✅ Uptime >99.5%
- ✅ TVL >$100k
- ✅ >100 pools created
- ✅ At least 1 graduation observed

**Month 1:**
- ✅ TVL >$1M
- ✅ >1,000 pools
- ✅ Protocol operating smoothly
- ✅ Planning next features

---

## Document Information

**Version:** 2.0
**Last Updated:** 2026-01-08
**Maintained By:** Scale AMM Team
**Location:** `/home/user/Claude/MAINNET_DEPLOYMENT_PLAYBOOK.md`

**Related Documents:**
- `MAINNET_DEPLOYMENT_GUIDE.md` - Comprehensive 3180-line guide
- `LAUNCH_DAY_CHECKLIST.md` - Quick reference for launch day
- `GO_NO_GO_DECISION_FORM.md` - Decision meeting template
- `DEPLOYMENT_CHECKLIST.md` - Pre-launch requirements
- `DEPLOYER_WARNING.md` - DEPLOYER_PUBKEY blocker details

---

**Good luck with the launch! 🚀**

**Remember: Permissionless means no second chances. Get it right the first time.**
