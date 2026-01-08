# Scale AMM - Mainnet Deployment Guide

**Comprehensive launch playbook for permissionless bonding curve protocol**

**Version:** 1.0
**Target Launch:** Day 21 of sprint
**Last Updated:** 2026-01-08

---

## Table of Contents

1. [Pre-Launch Checklist](#1-pre-launch-checklist)
2. [Launch Sequence](#2-launch-sequence)
3. [Post-Launch Monitoring](#3-post-launch-monitoring)
4. [Rollback Procedures](#4-rollback-procedures)
5. [Emergency Response Plan](#5-emergency-response-plan)
6. [Communication Templates](#6-communication-templates)
7. [Risk Mitigation Strategies](#7-risk-mitigation-strategies)
8. [Go/No-Go Decision Criteria](#8-gono-go-decision-criteria)

---

# 1. Pre-Launch Checklist

## 1.1 Code Verification

### Critical Blocker Items

- [ ] **DEPLOYER_PUBKEY updated** (`programs/creator-amm-v2/src/instructions/initialize.rs:23`)
  ```bash
  # Verify placeholder is gone
  grep "11111111111111111111111111111111" programs/creator-amm-v2/src/instructions/initialize.rs
  # Should return NOTHING

  # Verify your actual pubkey is present
  grep "$(solana address)" programs/creator-amm-v2/src/instructions/initialize.rs
  # Should show your wallet in DEPLOYER_PUBKEY constant
  ```

- [ ] **Program ID matches Anchor.toml**
  ```bash
  # Check program ID in Anchor.toml [programs.mainnet]
  # Should be: CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3
  # Or your custom vanity address if generated
  ```

### Security Verification

- [ ] **No unchecked arithmetic**
  ```bash
  # Search for dangerous patterns
  rg "unwrap\(\)" programs/creator-amm-v2/src/ --type rust
  rg "panic!" programs/creator-amm-v2/src/ --type rust
  rg "\+ " programs/creator-amm-v2/src/ --type rust | grep -v "checked_add"
  rg "\* " programs/creator-amm-v2/src/ --type rust | grep -v "checked_mul"
  # All should return minimal/no production code results
  ```

- [ ] **All require!() checks present**
  - Oracle validation (age, confidence, exponent bounds)
  - Slippage protection (min_base_amount, min_quote_amount)
  - Anti-sniper limits
  - Vault balance validation
  - Mint/freeze authority revocation checks

- [ ] **No console.log or debug msg!() in critical paths**
  ```bash
  # Check for unnecessary logging
  rg "msg!\(" programs/creator-amm-v2/src/instructions/ --type rust
  # Should only show essential events, no debug spam
  ```

- [ ] **No TODO/FIXME in production code**
  ```bash
  rg "TODO|FIXME" programs/creator-amm-v2/src/ --type rust
  # Should return ZERO results in critical paths
  ```

### Configuration Verification

- [ ] **Fee parameters are correct**
  - Pre-bonding fee: 300 bps (3%) - fair launch tax
  - Post-bonding fee: 100 bps (1%) - sustainable revenue
  - Creator fee range: 0-100 bps (0-1%) - aligned incentives

- [ ] **Thresholds are production-ready**
  - Pre-bonding threshold: $40,000 USD (40_000_000_000 with 6 decimals)
  - Graduation threshold: $85,000 USD (85_000_000_000 with 6 decimals)
  - Graduation > Pre-bonding (validated in code)

- [ ] **Anti-sniper settings tuned**
  - Window: 20 slots (~8 seconds at 400ms/slot)
  - Max trade: 500 bps (5% of supply)
  - Sufficient to prevent MEV, not too restrictive

- [ ] **Oracle settings are safe**
  - Max age: 60 seconds (balance freshness vs. availability)
  - Max confidence: 100 bps (1% - tight spreads)
  - Exponent bounds: -12 to +6 (prevents overflow)

## 1.2 Build Verification

- [ ] **Clean build succeeds**
  ```bash
  anchor clean
  cargo clean
  anchor build
  ```

- [ ] **Program binary within size limits**
  ```bash
  ls -lh target/deploy/creator_amm_v2.so
  # Should be <500KB (Solana limit is ~1MB)
  ```

- [ ] **Verifiable build generated**
  ```bash
  anchor build --verifiable
  # Generates hash for community verification
  ```

- [ ] **Program hash documented**
  ```bash
  solana program dump target/deploy/creator_amm_v2-keypair.json program.so
  sha256sum program.so
  # Save hash in DEPLOYMENT_ARTIFACTS.md
  ```

- [ ] **Dependencies audited**
  ```bash
  cargo audit
  # Should show ZERO critical/high vulnerabilities
  ```

## 1.3 Test Suite Verification

### Automated Testing

- [ ] **All tests pass**
  ```bash
  anchor test
  # Target: 103 tests, 0 failures
  ```

- [ ] **Code coverage >95%**
  ```bash
  # Run with coverage tool
  cargo tarpaulin --out Html --output-dir coverage/
  # Review coverage/index.html
  ```

- [ ] **Security tests pass**
  ```bash
  anchor test -- security-tests.ts
  # Validates: oracle attacks, overflow, anti-sniper, reentrancy
  ```

- [ ] **Edge case tests pass**
  ```bash
  anchor test -- edge-cases-final.ts
  # Tests: zero values, max values, dust trades, boundary conditions
  ```

- [ ] **Graduation tests pass**
  ```bash
  anchor test -- graduation-overflow-tests.ts
  # Tests: phase transitions, reserve accounting, fee collection
  ```

### Manual Testing Checklist

- [ ] **Devnet soak test completed (72 hours)**
  - 10,000+ trades executed
  - Multiple pools created
  - Graduation events observed
  - Emergency pause tested
  - No exploits or crashes
  - Oracle feeds stable
  - Fee collection verified

- [ ] **Load testing completed**
  - 100 concurrent users
  - 50 pools simultaneously active
  - Network congestion scenarios
  - RPC failover tested
  - Transaction success rate >99%

- [ ] **Attack simulations passed**
  - Sandwich attacks (should fail due to slippage)
  - Front-running (anti-sniper should block)
  - Flash loan attempts (stateless, no benefit)
  - Oracle manipulation (confidence checks block)
  - MEV extraction (minimized by design)

## 1.4 Performance Optimization

- [ ] **Compute units measured**
  ```bash
  # Test on devnet with compute budget logging
  # Target: <50,000 CU per trade (currently ~100k)
  ```

- [ ] **Transaction size optimized**
  - Minimal account loads
  - Efficient PDA derivations
  - No redundant calculations

- [ ] **Optional: buy.rs + sell.rs consolidated**
  - Can reduce CU by ~10-15%
  - Not required for mainnet
  - Defer to post-launch optimization

## 1.5 Devnet Deployment Validation

- [ ] **Devnet deployment successful**
  ```bash
  ./scripts/deploy-devnet.sh
  # Check: deployment-devnet.log for success
  ```

- [ ] **Config initialized within 1 minute**
  - Proves you can beat front-runners
  - Practice for mainnet timing

- [ ] **CRX/SOL pool created and trading**
  - Buy transactions successful
  - Sell transactions successful
  - Graduation mechanics working
  - Fees collecting to fee_recipient

- [ ] **All devnet addresses documented**
  - Program ID
  - Config PDA
  - CRX mint
  - Oracle address
  - Fee recipient
  - Test pool addresses

## 1.6 Security Audit

### Automated Security Analysis

- [ ] **Anchor verify passes**
  ```bash
  anchor verify <program-id>
  # Ensures deployed bytecode matches source
  ```

- [ ] **Solana security best practices followed**
  - Account validation (owner checks, signer checks)
  - PDA derivation (seeds documented)
  - Token program safety (freeze checks, mint authority)
  - Overflow prevention (all checked arithmetic)
  - Reentrancy protection (stateless design)

### Manual Security Review

- [ ] **Oracle validation comprehensive**
  - Price staleness check (max_age_seconds)
  - Confidence interval check (max_confidence_bps)
  - Exponent bounds check (-12 to +6)
  - Negative/zero price rejection
  - Confidence < price validation

- [ ] **Vault accounting secure**
  - Post-trade balance validation
  - Real vs. virtual reserve separation
  - No token loss scenarios
  - Fee collection tracked

- [ ] **Anti-rugpull mechanisms enforced**
  - Mint authority revocation required
  - Freeze authority revocation required
  - Cannot create pool without revocations

- [ ] **Emergency controls tested**
  - Pause/unpause functionality
  - Authority-only access
  - No fund lockup when paused
  - Resume functionality verified

### External Audit (Optional)

- [ ] **Professional audit completed** (if budget allows)
  - Recommended firms: OtterSec, Zellic, Trail of Bits
  - Cost: $30k-$100k
  - Timeline: 2-4 weeks
  - All findings remediated

- [ ] **Bug bounty program prepared**
  - Platform: Immunefi or HackerOne
  - Bounty structure: $1k-$50k based on severity
  - Scope document ready
  - Response team assigned

## 1.7 Infrastructure Setup

### RPC Providers

- [ ] **Primary RPC configured**
  - Provider: Helius, Alchemy, QuickNode, or Triton
  - Tier: Pro/Enterprise (not free tier)
  - Rate limits: Unlimited or 1000+ RPS
  - Uptime SLA: >99.9%

- [ ] **Backup RPC configured**
  - Different provider than primary
  - Automatic failover logic
  - Health check monitoring

- [ ] **RPC endpoint security**
  - API keys rotated
  - IP whitelisting enabled (if applicable)
  - Rate limit alerts configured

### Oracle Setup

- [ ] **CRX price oracle selected**
  - Primary: Pyth Network (recommended)
  - Alternative: Switchboard, Chainlink
  - Feed exists and active on mainnet
  - Update frequency: <10 seconds

- [ ] **Oracle address verified**
  ```bash
  # For Pyth mainnet CRX/USD feed (replace with actual)
  solana account <ORACLE_ADDRESS> --url mainnet
  # Should show valid account data
  ```

- [ ] **Oracle fallback plan**
  - If primary fails, use backup oracle
  - If both fail, emergency pause protocol
  - Manual intervention procedures documented

### Monitoring Infrastructure

- [ ] **Transaction monitoring**
  - Tool: Helius Webhooks, Solana RPC subscriptions, or custom
  - Tracks: All protocol transactions
  - Alerts: Failed transactions, unusual patterns

- [ ] **Protocol health dashboard**
  - Metrics: TVL, volume, pool count, fee revenue
  - Visualization: Grafana, Metabase, or custom
  - Access: Team members only (private)

- [ ] **Alert system configured**
  - Channel: Discord/Slack/PagerDuty
  - Triggers: Failed tx >5%, oracle stale >5min, unusual fee drain
  - Escalation: On-call engineer gets paged

- [ ] **Log aggregation**
  - Tool: Datadog, Splunk, or CloudWatch
  - Retention: 90 days minimum
  - Search: Full-text indexed

## 1.8 Multisig Setup (Recommended)

- [ ] **Multisig wallet created**
  - Tool: Squads, Goki, or Solana native multisig
  - Signers: 3-5 trusted team members
  - Threshold: 2-of-3 or 3-of-5
  - Test on devnet first

- [ ] **Protocol authority → Multisig**
  - Config.authority transferred after initialization
  - Cannot be rushed (requires multisig approval)
  - Irreversible (plan carefully)

- [ ] **Fee recipient → Treasury**
  - Separate from hot wallets
  - Multisig or hardware wallet
  - Regular withdrawal schedule

- [ ] **Emergency pause authority**
  - Can be same as protocol authority
  - Or separate "security multisig" for faster response
  - Test pause/unpause on devnet

- [ ] **Key management procedures**
  - Hardware wallets for all signers
  - Backup seed phrases in secure locations
  - Key rotation policy (quarterly)
  - Signer replacement procedures

## 1.9 Legal & Compliance

- [ ] **Legal entity established** (if applicable)
  - LLC, DAO, or Foundation
  - Jurisdiction selected
  - Operating agreement signed

- [ ] **Terms of Service drafted**
  - User risks disclosed
  - No investment advice disclaimer
  - Protocol-as-is, no warranties
  - Governing law specified

- [ ] **Privacy Policy published**
  - Data collection disclosure (if any)
  - No PII stored on-chain
  - Cookie policy (for website)

- [ ] **Regulatory assessment completed**
  - Legal counsel consulted
  - Securities law compliance
  - AML/KYC not required (permissionless protocol)
  - Tax implications understood

- [ ] **Intellectual property protected**
  - Codebase license selected (see LICENSE file)
  - Trademark application filed (if desired)
  - Brand assets copyrighted

## 1.10 Team Readiness

- [ ] **Launch team assembled**
  - Lead Engineer (deploys program)
  - Security Engineer (monitors for exploits)
  - DevOps Engineer (infrastructure)
  - Community Manager (communications)
  - Support Engineer (user issues)

- [ ] **Roles and responsibilities documented**
  - Who deploys the program?
  - Who initializes the config?
  - Who creates the first pool?
  - Who monitors alerts?
  - Who communicates to community?

- [ ] **Launch day schedule coordinated**
  - Date and time selected (avoid weekends/holidays)
  - All team members available
  - Backup personnel identified
  - War room setup (Discord/Slack channel)

- [ ] **Runbook reviewed by all team members**
  - Everyone has read this document
  - Launch sequence rehearsed on devnet
  - Emergency procedures memorized
  - Contact information shared

- [ ] **Support resources prepared**
  - FAQ document ready
  - Discord/Telegram support channels staffed
  - First 24 hours: 24/7 coverage
  - Response time target: <15 minutes

## 1.11 Documentation Finalization

- [ ] **README.md updated for mainnet**
  - Installation instructions
  - Mainnet RPC endpoints
  - Program ID (after deployment)
  - Quick start examples

- [ ] **WHAT_IT_DOES.md accurate**
  - Protocol mechanics explained
  - Fee structure documented
  - Graduation process described
  - Risk disclosures included

- [ ] **SDK documentation complete**
  - All public methods documented
  - Code examples for common operations
  - TypeScript types exported
  - NPM package ready (if publishing)

- [ ] **API reference generated**
  - Instruction documentation
  - Account structure definitions
  - Error code meanings
  - Event definitions

- [ ] **User guides created**
  - How to create a pool
  - How to buy tokens
  - How to sell tokens
  - How to check pool status

---

# 2. Launch Sequence

## Timeline Overview

```
T-24h:  Final pre-launch review
T-4h:   Team assembly
T-1h:   Final verification
T-30m:  Deploy program to mainnet
T-5m:   Verify deployment
T-0:    Initialize config (RACE CONDITION!)
T+1m:   Verify config initialized
T+5m:   Create CRX/SOL primary pool
T+10m:  Execute test trades
T+15m:  Monitor for issues
T+30m:  Gradual public announcement
T+1h:   Full monitoring mode
T+24h:  Post-launch review
```

---

## T-24 Hours: Final Pre-Launch Review

### Go/No-Go Meeting

**Attendees:** All team members + key stakeholders

**Agenda:**
1. Review all checklist items (30 min)
2. Discuss any blockers or concerns (15 min)
3. Confirm launch time and team availability (5 min)
4. Final Go/No-Go decision (10 min)

**Decision Criteria:** See Section 8

**Output:**
- Official Go/No-Go decision
- Launch time confirmed
- Team assignments finalized

### Final Checklist Verification

- [ ] All pre-launch checklist items completed
- [ ] Devnet soak test successful (72 hours, 10k+ trades)
- [ ] DEPLOYER_PUBKEY verified (not placeholder)
- [ ] Multisig setup complete
- [ ] Monitoring systems operational
- [ ] Team members available and ready

### Communication Preparation

- [ ] Draft announcement tweets/posts
- [ ] Prepare blog post (if applicable)
- [ ] Notify key community members (mods, partners)
- [ ] Set up launch day communication channel

### Infrastructure Final Checks

- [ ] RPC providers confirmed operational
- [ ] Monitoring dashboards accessible
- [ ] Alert system tested (send test alert)
- [ ] Backup systems verified

---

## T-4 Hours: Team Assembly

### War Room Setup

- [ ] Create private Discord/Slack channel: `#mainnet-launch`
- [ ] All team members join
- [ ] Screen sharing setup for deployment
- [ ] Emergency contact info shared

### Pre-Deployment Checklist

```bash
# 1. Verify you're on the correct git branch
git branch --show-current
# Should be: main or release/mainnet

# 2. Verify last commit
git log -1 --oneline
# Should include: "Ready for mainnet deployment"

# 3. Verify DEPLOYER_PUBKEY one last time
grep "DEPLOYER_PUBKEY" programs/creator-amm-v2/src/instructions/initialize.rs
# Should show YOUR wallet address

# 4. Verify Solana CLI configured for mainnet
solana config get
# Should show: RPC URL: https://api.mainnet-beta.solana.com

# 5. Check deployer wallet balance
solana balance
# Should have: >5 SOL (deploy costs ~2-3 SOL)

# 6. Verify keypair loaded
solana address
# Should match DEPLOYER_PUBKEY in code
```

### Team Role Confirmation

| Role | Person | Responsibilities |
|------|--------|------------------|
| **Deploy Lead** | [Name] | Execute deployment commands |
| **Security Monitor** | [Name] | Watch for exploits/attacks |
| **Infrastructure** | [Name] | Monitor RPC/oracle health |
| **Communications** | [Name] | Public announcements |
| **Support** | [Name] | Handle user questions |

---

## T-1 Hour: Final Verification

### Clean Build

```bash
# Navigate to project directory
cd ~/Scale-AMM

# Clean all previous builds
anchor clean
cargo clean
rm -rf target/

# Fresh build
anchor build

# Verify build succeeded
ls -lh target/deploy/creator_amm_v2.so
# Should show file size (e.g., 400KB)
```

### Generate Verifiable Build (Optional)

```bash
# Generate build with Docker for reproducibility
anchor build --verifiable

# Save build hash
solana program dump target/deploy/creator_amm_v2-keypair.json /tmp/program.so
sha256sum /tmp/program.so > PROGRAM_HASH.txt
cat PROGRAM_HASH.txt
# Save this for community verification
```

### Prepare Deployment Wallet

```bash
# Request airdrop if balance low (mainnet - need to buy SOL)
solana balance
# If <5 SOL, transfer more from exchange

# Create deployment log file
mkdir -p logs/
touch logs/mainnet-deployment-$(date +%Y%m%d-%H%M%S).log
```

### Load Environment Variables

```bash
# Create .env.mainnet file
cat > .env.mainnet << 'EOF'
NETWORK=mainnet-beta
RPC_URL=https://api.mainnet-beta.solana.com
DEPLOYER_KEYPAIR=~/.config/solana/id.json
FEE_RECIPIENT=<YOUR_TREASURY_WALLET>
CRX_MINT=<CRX_TOKEN_MINT>
ORACLE_ADDRESS=<PYTH_CRX_USD_FEED>
EOF

# Load environment
source .env.mainnet
```

---

## T-30 Minutes: Deploy Program

### Deployment Command

```bash
# Set Solana config to mainnet
solana config set --url mainnet-beta
solana config set --keypair ~/.config/solana/id.json

# Deploy program (THIS IS THE POINT OF NO RETURN)
anchor deploy --provider.cluster mainnet-beta 2>&1 | tee logs/mainnet-deployment-*.log
```

**Expected Output:**
```
Deploying cluster: mainnet-beta
Upgrade authority: <YOUR_WALLET>
Deploying program "creator_amm_v2"...
Program Id: CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3

Deploy success
```

**Duration:** 2-3 minutes (depending on network congestion)

### Post-Deployment Checklist

- [ ] Deployment transaction confirmed
- [ ] Program ID matches expected value
- [ ] No errors in deployment log
- [ ] Wallet balance reduced by ~2-3 SOL

---

## T-5 Minutes: Verify Deployment

### Check Program Account

```bash
# Verify program exists on-chain
solana program show CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3 --url mainnet

# Expected output:
# Program Id: CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3
# Owner: BPFLoaderUpgradeab1e11111111111111111111111
# ProgramData Address: <SOME_ADDRESS>
# Authority: <YOUR_WALLET>
# Last Deployed In Slot: <SLOT_NUMBER>
# Data Length: <SIZE> bytes
```

### View on Explorer

```bash
# Open in browser
echo "https://explorer.solana.com/address/CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3"
# Verify "Program" account type
```

### Save Program ID

```bash
# Document program ID
echo "CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3" > PROGRAM_ID_MAINNET.txt
echo "Deployed: $(date)" >> PROGRAM_ID_MAINNET.txt
echo "Slot: $(solana slot --url mainnet)" >> PROGRAM_ID_MAINNET.txt
```

---

## T-0: Initialize Config (CRITICAL - RACE CONDITION!)

### CRITICAL TIMING WINDOW

**You have approximately 60-120 seconds from deployment before front-runners can call initialize()**

This is why DEPLOYER_PUBKEY hardcoding is critical - even if someone beats you, they can't initialize without your wallet signature.

### Prepare Initialize Script

Create `scripts/initialize-mainnet.ts`:

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CreatorAmmV2 } from "../target/types/creator_amm_v2";
import { PublicKey } from "@solana/web3.js";

async function main() {
  // Setup provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CreatorAmmV2 as Program<CreatorAmmV2>;
  const programId = program.programId;

  console.log("Program ID:", programId.toString());
  console.log("Deployer:", provider.wallet.publicKey.toString());

  // Derive config PDA
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId
  );

  console.log("Config PDA:", configPda.toString());

  // Configuration parameters
  const params = {
    preBondingFeeBps: 300,                              // 3%
    preBondingThresholdUsd: new anchor.BN(40_000_000_000),  // $40k
    postBondingFeeBps: 100,                             // 1%
    graduationThresholdUsd: new anchor.BN(85_000_000_000),  // $85k
    antiSniperWindowSlots: new anchor.BN(20),           // ~8 seconds
    antiSniperMaxTradeBps: 500,                         // 5%
    oracleMaxAgeSeconds: new anchor.BN(60),             // 1 minute
    oracleMaxConfidenceBps: new anchor.BN(100),         // 1%
    approvedQuoteTokens: [
      new PublicKey("<CRX_MINT>"),  // Replace with actual CRX mint
      PublicKey.default,             // Unused
      PublicKey.default,             // Unused
      PublicKey.default,             // Unused
      PublicKey.default,             // Unused
    ],
    approvedQuoteCount: 1,
  };

  console.log("Initializing with params:", JSON.stringify(params, null, 2));

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
        params.approvedQuoteTokens,
        params.approvedQuoteCount
      )
      .accounts({
        config: configPda,
        authority: provider.wallet.publicKey,
        feeRecipient: new PublicKey("<FEE_RECIPIENT>"),
        crxPriceOracle: new PublicKey("<ORACLE_ADDRESS>"),
        crxMint: new PublicKey("<CRX_MINT>"),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Config initialized!");
    console.log("Transaction:", tx);
    console.log("Explorer:", `https://explorer.solana.com/tx/${tx}`);

  } catch (err) {
    console.error("❌ Initialization failed:", err);
    process.exit(1);
  }
}

main().catch(console.error);
```

### Execute Initialize

```bash
# IMMEDIATELY after deployment succeeds, run:
npx ts-node scripts/initialize-mainnet.ts

# Monitor output for success
```

**Expected Duration:** 5-15 seconds

**Success Criteria:**
- Transaction confirms
- Config PDA created
- No errors

### Verify Config Initialized

```bash
# Check config account exists
CONFIG_PDA="<OUTPUT_FROM_SCRIPT>"
solana account $CONFIG_PDA --url mainnet

# Should show account with data (not "Account not found")
```

---

## T+1 Minute: Verify Initialization Success

### Check Config State

```bash
# View config on explorer
echo "https://explorer.solana.com/address/$CONFIG_PDA"
```

### Verify Config Parameters (using SDK or Anchor)

```typescript
// Quick verification script
const config = await program.account.config.fetch(configPda);
console.log("Authority:", config.authority.toString());
console.log("Fee Recipient:", config.feeRecipient.toString());
console.log("CRX Mint:", config.crxMint.toString());
console.log("Pre-bonding Fee:", config.preBondingFeeBps, "bps");
console.log("Graduation Threshold:", config.graduationThresholdUsd.toString());
console.log("Is Paused:", config.isPaused); // Should be false
```

### Emergency Check

**If initialization fails:**
1. DO NOT PANIC - you have DEPLOYER_PUBKEY protection
2. Check error message
3. Verify wallet has SOL for transaction fees
4. Retry immediately (you still have time)
5. If repeated failure, investigate cause

**If someone else initialized (SHOULD BE IMPOSSIBLE):**
1. This means DEPLOYER_PUBKEY was not updated correctly
2. Protocol is compromised
3. Execute emergency communication plan (Section 5)
4. DO NOT proceed with pool creation

---

## T+5 Minutes: Create CRX/SOL Primary Pool

### Why CRX/SOL Pool?

This is the PRIMARY liquidity pool that powers all TOKEN/CRX sub-pools through two-hop routing (SOL → CRX → TOKEN). It must be created and liquid before any token launches.

### Prepare Pool Creation Script

```typescript
// scripts/create-crx-sol-pool.ts
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CreatorAmmV2 } from "../target/types/creator_amm_v2";
import { PublicKey } from "@solana/web3.js";
import { CurveType } from "../sdk/ScaleAMM";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.CreatorAmmV2 as Program<CreatorAmmV2>;

  // CRX/SOL pool parameters
  const params = {
    quoteMint: new PublicKey("<CRX_MINT>"),
    baseMint: new PublicKey("<WRAPPED_SOL_MINT>"), // So11111111111111111111111111111111111111112
    targetMarketCapUsd: new anchor.BN(1_000_000_000_000), // $1M initial liquidity target
    tokenSupply: new anchor.BN(1_000_000_000_000),        // 1M CRX supply (6 decimals)
    feeBps: 100,                                           // 1% fee
    curveType: CurveType.ConstantProduct,
    graduationThresholdUsd: new anchor.BN(5_000_000_000_000), // $5M graduation
  };

  // Create pool
  const tx = await program.methods
    .createPool(
      params.targetMarketCapUsd,
      params.tokenSupply,
      params.feeBps,
      { constantProduct: {} },
      params.graduationThresholdUsd
    )
    .accounts({
      // ... account setup
    })
    .rpc();

  console.log("✅ CRX/SOL pool created!");
  console.log("Transaction:", tx);
}

main().catch(console.error);
```

### Execute Pool Creation

```bash
npx ts-node scripts/create-crx-sol-pool.ts
```

### Verify Pool Created

```bash
# Check pool account
POOL_PDA="<OUTPUT_FROM_SCRIPT>"
solana account $POOL_PDA --url mainnet
```

---

## T+10 Minutes: Execute Test Trades

### Small Buy Test

```bash
# Buy 100 CRX with SOL (small amount)
npx ts-node scripts/test-buy.ts --pool $POOL_PDA --amount 0.1
```

**Expected:** Transaction succeeds, CRX received

### Small Sell Test

```bash
# Sell 50 CRX back for SOL
npx ts-node scripts/test-sell.ts --pool $POOL_PDA --amount 50
```

**Expected:** Transaction succeeds, SOL received

### Verify Accounting

```typescript
// Check pool reserves match vault balances
const pool = await program.account.pool.fetch(poolPda);
const quoteVaultBalance = await connection.getTokenAccountBalance(pool.quoteVault);
const baseVaultBalance = await connection.getTokenAccountBalance(pool.baseVault);

console.log("Real Quote Reserves:", pool.realQuoteReserves.toString());
console.log("Quote Vault Balance:", quoteVaultBalance.value.amount);
console.assert(pool.realQuoteReserves.toString() === quoteVaultBalance.value.amount);

console.log("Real Base Reserves:", pool.realBaseReserves.toString());
console.log("Base Vault Balance:", baseVaultBalance.value.amount);
console.assert(pool.realBaseReserves.toString() === baseVaultBalance.value.amount);
```

---

## T+15 Minutes: Initial Monitoring

### Check for Immediate Issues

- [ ] No failed transactions
- [ ] No unusual transaction patterns
- [ ] Oracle price updates flowing
- [ ] Fee collection working
- [ ] No security alerts

### Monitor Dashboards

- [ ] Transaction success rate: >99%
- [ ] Average confirmation time: <30 seconds
- [ ] RPC health: Green
- [ ] Oracle staleness: <60 seconds
- [ ] No error rate spikes

### Team Sync

**Quick standup in war room:**
1. Any issues observed? (30 sec each person)
2. Monitoring systems all green? (Y/N)
3. Ready for public announcement? (Go/No-Go)

---

## T+30 Minutes: Gradual Public Announcement

### Phase 1: Soft Launch (T+30m)

**Audience:** Close community members, beta testers

**Channel:** Private Discord/Telegram

**Message Template:**
```
🚀 Scale AMM is now live on Solana mainnet!

Program ID: CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3

We're in soft launch mode for the next few hours. Feel free to test with small amounts.

⚠️ Use at your own risk. Protocol is new and unaudited.

Docs: <LINK>
```

### Phase 2: Public Announcement (T+2h, if stable)

**Audience:** General public

**Channels:** Twitter, Discord, Website

**Message Template:**
```
📢 Scale AMM is LIVE on Solana Mainnet

Launch your token at any market cap. No presale. No VC unlock.

✅ Fair launch mechanics
✅ Bonding curve AMM
✅ CRX-powered liquidity
✅ Graduation to permanent pools

Program: CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3

Docs: <LINK>
SDK: <LINK>
Examples: <LINK>

⚠️ New protocol. Use at your own risk. DYOR.
```

### Phase 3: Full Marketing (T+24h, if stable)

**Only if first 24 hours are smooth:**
- Blog post
- Partner announcements
- Influencer mentions
- Community AMAs
- Tutorial videos

---

## T+1 Hour: Full Monitoring Mode

### Handoff to On-Call Team

- [ ] Deploy team signs off
- [ ] On-call engineer takes over monitoring
- [ ] Support team active for user questions
- [ ] Emergency contacts verified

### Monitoring Checklist (Every Hour for 24h)

- [ ] Check transaction success rate
- [ ] Review error logs
- [ ] Verify oracle health
- [ ] Check TVL growth
- [ ] Monitor for unusual patterns
- [ ] Review support tickets

---

## T+24 Hours: Post-Launch Review

### Metrics Review

| Metric | Target | Actual |
|--------|--------|--------|
| Uptime | >99% | ___ |
| Transaction Success Rate | >99% | ___ |
| Total Pools Created | >10 | ___ |
| Total Volume (USD) | >$10k | ___ |
| Unique Users | >50 | ___ |
| Security Incidents | 0 | ___ |

### Team Retrospective

**Agenda:**
1. What went well? (15 min)
2. What could be improved? (15 min)
3. Any issues to address? (15 min)
4. Next steps (5 min)

**Output:**
- Retrospective document
- Action items for improvements
- Lessons learned

---

# 3. Post-Launch Monitoring

## 3.1 First 24 Hours (Critical Period)

### Monitoring Intensity: MAXIMUM

**Team Coverage:** 24/7 on-call rotation

### Hourly Checks

- [ ] **Transaction Monitoring**
  - Success rate >99%
  - Failed tx investigation
  - Unusual patterns (sandwich attacks, MEV)

- [ ] **Oracle Health**
  - Price updates <60 seconds old
  - Confidence <1%
  - No stale price errors

- [ ] **Pool Health**
  - Reserve accounting accurate
  - Fee collection working
  - No vault balance mismatches

- [ ] **Security Monitoring**
  - No exploit attempts
  - No unusual drain patterns
  - Anti-sniper working correctly

### Alert Thresholds (First 24h)

| Alert | Threshold | Severity | Response Time |
|-------|-----------|----------|---------------|
| Transaction failure rate >5% | CRITICAL | <5 min |
| Oracle staleness >5 min | HIGH | <15 min |
| Unusual fee drain | CRITICAL | <5 min |
| RPC downtime | HIGH | <10 min |
| Security alert (exploit pattern) | CRITICAL | <1 min |

### Metrics to Track

```
Transactions:
- Total transactions: ___
- Success rate: ___%
- Average confirmation time: ___ sec
- Compute units used: ___ CU

Pools:
- Total pools created: ___
- Active pools: ___
- Total TVL: $___
- Largest pool: $___

Volume:
- 24h volume: $___
- Average trade size: $___
- Largest trade: $___

Users:
- Unique wallets: ___
- Pool creators: ___
- Traders: ___

Fees:
- Total fees collected: ___ CRX
- Fee recipient balance: ___ CRX
- Protocol revenue: $___

Issues:
- Failed transactions: ___
- Error types: ___
- Support tickets: ___
```

### Known Issues Log

| Time | Issue | Severity | Status | Resolution |
|------|-------|----------|--------|------------|
| T+2h | Example: High slippage | Low | Resolved | Expected behavior |
| | | | | |

### Incident Response (First 24h)

**If ANY critical issue arises:**
1. Immediately notify team in war room
2. Assess severity (use Section 5 framework)
3. Consider emergency pause if needed
4. Communicate to users (use templates in Section 6)
5. Investigate root cause
6. Implement fix or mitigation
7. Post-mortem after resolution

---

## 3.2 First Week (High Vigilance)

### Monitoring Intensity: HIGH

**Team Coverage:** 16/7 (8am-12am coverage)

### Daily Checks (2x per day: morning + evening)

- [ ] **Growth Metrics**
  - TVL growth rate
  - Pool creation rate
  - User acquisition rate
  - Are trends healthy or concerning?

- [ ] **System Health**
  - Uptime percentage
  - Average transaction success rate
  - RPC performance
  - Oracle reliability

- [ ] **User Feedback**
  - Discord/Telegram sentiment
  - Support ticket themes
  - Feature requests
  - Bug reports

- [ ] **Security Monitoring**
  - Review all transactions for exploits
  - Check for unusual patterns
  - Monitor competitor activity
  - Bug bounty submissions

### Weekly Metrics (Day 7)

```
Growth:
- Week 1 TVL: $___
- Week 1 Volume: $___
- Total pools created: ___
- Total unique users: ___
- Growth rate: ___%

Performance:
- Uptime: ___%
- Avg tx success rate: ___%
- Avg confirmation time: ___ sec
- Avg CU per trade: ___

Revenue:
- Total fees collected: ___ CRX
- USD value: $___
- Annualized revenue (if sustained): $___

Issues:
- Total incidents: ___
- Critical incidents: ___
- Resolved: ___
- Outstanding: ___
```

### Optimization Opportunities

After 1 week of stable operation, consider:
- [ ] Compute unit optimization (consolidate buy/sell)
- [ ] Fee parameter tuning (if data supports)
- [ ] Oracle configuration adjustments
- [ ] RPC provider evaluation
- [ ] Monitoring system improvements

---

## 3.3 First Month (Steady State)

### Monitoring Intensity: MODERATE

**Team Coverage:** Business hours + on-call

### Weekly Checks

- [ ] **Growth Dashboard Review**
  - TVL trajectory
  - Volume trends
  - User retention
  - Pool quality (are good projects launching?)

- [ ] **System Performance**
  - Monthly uptime report
  - Transaction success rate trends
  - Cost analysis (RPC, hosting)
  - Scaling needs assessment

- [ ] **Community Health**
  - Discord/Telegram activity
  - Support ticket volume trends
  - User satisfaction scores
  - Feature request prioritization

- [ ] **Competitive Analysis**
  - Competitor launches
  - Market share trends
  - Feature parity assessment

### Monthly Metrics (Day 30)

```
Growth:
- Month 1 TVL: $___
- Month 1 Volume: $___
- Total pools: ___
- Total users: ___
- MoM growth: ___%

Revenue:
- Month 1 fees: ___ CRX ($__)
- Run rate: $___ annually
- Revenue per pool: $___
- Revenue per user: $___

Product:
- Graduated pools: ___
- Average graduation time: ___ hours
- Largest pool: $___
- Most traded token: ___

Reliability:
- Uptime: ___%
- Incidents: ___
- Mean time to resolution: ___ hours
- User satisfaction: ___/10
```

### Iteration Planning

Based on 30 days of data:
- [ ] Prioritize feature requests
- [ ] Plan performance optimizations
- [ ] Evaluate fee structure
- [ ] Consider protocol upgrades (if possible)
- [ ] Roadmap for months 2-6

---

## 3.4 Ongoing Monitoring (Steady State)

### Monitoring Intensity: STANDARD

**Team Coverage:** Business hours + on-call rotation

### Daily Automated Monitoring

**Automated Alerts Only** (no manual checks unless alerted)

- Transaction success rate <95%
- Oracle staleness >10 minutes
- RPC downtime >5 minutes
- Unusual transaction patterns
- Security anomalies

### Weekly Manual Review (30 minutes)

- [ ] Review key metrics dashboard
- [ ] Check for any trends or anomalies
- [ ] Scan support tickets for themes
- [ ] Review competitor activity
- [ ] Update team on protocol health

### Monthly Deep Dive (2 hours)

- [ ] Comprehensive metrics analysis
- [ ] Revenue and cost review
- [ ] User research and feedback
- [ ] Security audit review
- [ ] Roadmap progress check

### Quarterly Planning

- [ ] Strategic planning session
- [ ] Feature roadmap review
- [ ] Infrastructure scaling assessment
- [ ] Team capacity planning
- [ ] Budget and revenue forecast

---

# 4. Rollback Procedures

## 4.1 Understanding Limitations

**CRITICAL: Scale AMM is a PERMISSIONLESS protocol.**

Once deployed, you CANNOT:
- ❌ Upgrade the program code (no upgrade authority)
- ❌ Delete the program
- ❌ Change the config (only authority can, via multisig)
- ❌ Close pools (they exist forever)
- ❌ Reverse transactions

**What you CAN do:**
- ✅ Emergency pause (stops new trades)
- ✅ Transfer authority (to multisig)
- ✅ Update oracle address (via admin function, if implemented)
- ✅ Communicate issues to users
- ✅ Deploy a new version (different program ID)

---

## 4.2 Emergency Pause Procedure

### When to Pause

**ONLY use emergency pause for:**
- Active exploit in progress
- Critical bug discovered that risks user funds
- Oracle failure (persistent staleness or manipulation)
- Severe accounting error (reserve/vault mismatch)

**DO NOT pause for:**
- High volatility (this is expected)
- User complaints about losses (they accepted risk)
- Feature requests
- Competitor activity

### How to Pause

```bash
# Emergency pause script (must be run by authority wallet)
npx ts-node scripts/emergency-pause.ts
```

```typescript
// scripts/emergency-pause.ts
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

  console.log("⚠️  INITIATING EMERGENCY PAUSE");
  console.log("Config PDA:", configPda.toString());

  const tx = await program.methods
    .setPaused(true)
    .accounts({
      config: configPda,
      authority: provider.wallet.publicKey,
    })
    .rpc();

  console.log("🛑 PROTOCOL PAUSED");
  console.log("Transaction:", tx);
  console.log("All trading halted. Investigate issue immediately.");
}

main().catch(console.error);
```

**Duration:** 5-10 seconds

### After Pausing

1. **Immediate Communication** (within 5 minutes)
   - Tweet: "Scale AMM trading temporarily paused for emergency maintenance. User funds are safe. Investigating. Updates shortly."
   - Discord announcement
   - Update website banner

2. **Investigation** (within 1 hour)
   - Identify root cause
   - Assess impact (funds lost, users affected)
   - Develop mitigation plan
   - Estimate resolution time

3. **Decision Point** (within 4 hours)
   - Can we fix and resume safely?
   - Do we need to deploy new version?
   - Should we keep paused indefinitely?

4. **Resume Trading** (when safe)
   ```bash
   npx ts-node scripts/unpause.ts
   ```
   - Same script as pause, but `setPaused(false)`
   - Announce resumption immediately
   - Monitor closely for 24 hours

---

## 4.3 "Rollback" via New Deployment

### When New Deployment is Needed

- Critical bug in program code
- Emergency pause is insufficient
- Users need to migrate to fixed version

### Process

1. **Keep Original Paused**
   - Pause old program if possible
   - Prevent further damage

2. **Fix Bug**
   - Implement fix in code
   - Comprehensive testing
   - Security review

3. **Deploy New Program**
   - Different program ID (can't reuse)
   - New Config PDA
   - New pools

4. **Migration Plan**
   - Users must manually migrate liquidity
   - Provide clear instructions
   - Offer migration assistance

5. **Communication**
   - Explain what happened (transparency)
   - Provide migration guide
   - Offer support

**Downside:**
- Liquidity fragmentation
- User inconvenience
- Reputation damage
- Old pools still exist (can't be deleted)

**This is why pre-launch testing is CRITICAL!**

---

# 5. Emergency Response Plan

## 5.1 Incident Severity Levels

### CRITICAL (P0)

**Definition:** Active exploit, significant funds at risk, protocol unusable

**Examples:**
- Active drain exploit
- Oracle manipulation enabling arbitrage
- Accounting bug causing token loss
- Complete RPC outage

**Response:**
- **Target Response Time:** <5 minutes
- **Team:** All hands on deck immediately
- **Actions:**
  1. Emergency pause protocol (if possible)
  2. Notify all team members
  3. Begin investigation
  4. Prepare user communication
  5. Contact RPC provider / Oracle provider if relevant

### HIGH (P1)

**Definition:** Serious issue impacting many users, no immediate fund risk

**Examples:**
- Transaction failure rate >20%
- Oracle staleness >10 minutes (persistent)
- Single pool accounting error
- Security researcher report (unconfirmed)

**Response:**
- **Target Response Time:** <15 minutes
- **Team:** On-call engineer + security lead
- **Actions:**
  1. Assess severity (could escalate to P0?)
  2. Begin investigation
  3. Monitor for escalation
  4. Prepare communication if prolonged

### MEDIUM (P2)

**Definition:** Noticeable issue affecting some users, workaround available

**Examples:**
- Transaction failure rate 10-20%
- Specific RPC endpoint slow
- Anti-sniper false positives
- Pool graduation delayed

**Response:**
- **Target Response Time:** <1 hour
- **Team:** On-call engineer
- **Actions:**
  1. Log issue in incident tracker
  2. Investigate root cause
  3. Implement fix or workaround
  4. Monitor for resolution

### LOW (P3)

**Definition:** Minor issue, minimal user impact

**Examples:**
- Documentation error
- UI bug (non-blocking)
- Support ticket about expected behavior
- Feature request

**Response:**
- **Target Response Time:** <24 hours
- **Team:** Assigned engineer (not urgent)
- **Actions:**
  1. Add to backlog
  2. Prioritize in next sprint
  3. Respond to user (if applicable)

---

## 5.2 Incident Response Workflow

### Phase 1: Detection (T+0)

**How incidents are detected:**
- Automated monitoring alerts
- User reports (Discord/Twitter)
- Team member observation
- Security researcher report

**Initial Actions (within 60 seconds):**
1. Acknowledge alert
2. Verify issue is real (not false alarm)
3. Determine severity level
4. Notify appropriate team members

### Phase 2: Assessment (T+1-5 min)

**Investigation Questions:**
- What is happening?
- How many users affected?
- Is it getting worse?
- Are funds at risk?
- What is root cause (initial hypothesis)?

**Decision Point:**
- Do we need to emergency pause?
- Do we escalate severity?
- Who else needs to be involved?

### Phase 3: Containment (T+5-30 min)

**Actions based on severity:**

**P0 (Critical):**
- Emergency pause protocol (if safe to do so)
- All team members mobilized
- Incident channel created
- External help contacted (if needed)

**P1 (High):**
- Identify workaround
- Monitor for escalation
- Prepare pause if needed

**P2/P3 (Medium/Low):**
- Standard investigation
- Fix in progress

### Phase 4: Resolution (Variable timing)

**P0 Critical:**
- Fix implemented and tested
- Deploy new version (if needed)
- Unpause protocol (if paused)
- User communication sent
- Target: <4 hours

**P1 High:**
- Root cause identified
- Fix deployed or workaround shared
- Monitoring for recurrence
- Target: <24 hours

**P2/P3:**
- Fix merged to main
- Deployed in next release
- Target: <1 week

### Phase 5: Communication (Throughout)

**See Section 6 for templates**

**Timing:**
- **P0:** Communicate within 15 minutes
- **P1:** Communicate within 1 hour (if user-facing)
- **P2/P3:** Communicate when resolved (if public)

### Phase 6: Post-Mortem (After resolution)

**Required for P0/P1, optional for P2/P3**

**Template:**

```markdown
# Incident Post-Mortem: [Title]

**Date:** YYYY-MM-DD
**Severity:** P0/P1/P2/P3
**Duration:** XX hours XX minutes
**Impact:** XX users, $XX at risk, etc.

## Summary
[1-2 sentence description of what happened]

## Timeline
- **T+0:** [Detection]
- **T+5m:** [Assessment]
- **T+15m:** [Containment]
- **T+2h:** [Resolution]

## Root Cause
[Technical explanation of why it happened]

## Impact
- Users affected: XX
- Transactions failed: XX
- Funds at risk: $XX
- Funds lost: $XX (if any)

## Resolution
[What was done to fix it]

## Prevention
[What we'll do to prevent this in the future]

## Action Items
- [ ] [Task 1]
- [ ] [Task 2]
- [ ] [Task 3]

## Lessons Learned
[What we learned from this incident]
```

---

## 5.3 Communication Chain

### Internal Communication

**Incident Notification (P0/P1):**

```
🚨 INCIDENT ALERT 🚨

Severity: P0 / P1
Issue: [Brief description]
Impact: [Users affected, funds at risk]
Status: Investigating / Contained / Resolved

War Room: #incident-YYYYMMDD
Lead: @[person]
ETA: [estimate]

All hands: Please acknowledge with ✅
```

### External Communication

**See Section 6 for full templates**

**Channels (in order):**
1. **Discord/Telegram** (immediate, <5 min for P0)
2. **Twitter** (public, <15 min for P0)
3. **Website Banner** (for prolonged issues)
4. **Email** (if user emails collected)
5. **Blog Post** (for post-mortem)

---

## 5.4 Escalation Procedures

### When to Escalate

- Issue is more severe than initially assessed
- Resolution is taking longer than expected
- Additional expertise needed
- External help required (RPC provider, Oracle team, security firm)

### Escalation Path

```
On-Call Engineer
  ↓ (if issue persists >30 min or unclear)
Security Lead / CTO
  ↓ (if critical or requires external help)
CEO / Founder
  ↓ (if legal/financial/PR implications)
Board / Investors (if applicable)
```

### External Escalation

**When to contact external parties:**

**RPC Provider:**
- Network issues, rate limiting, downtime
- Contact: Support ticket + emergency hotline

**Oracle Provider (Pyth/Switchboard):**
- Price feed issues, staleness, manipulation
- Contact: Discord developer channel + support

**Security Firms (OtterSec, Zellic, etc.):**
- Active exploit, need expert help
- Contact: Emergency hotline (if contracted)

**Solana Foundation:**
- Network-wide issues
- Contact: Validator Discord

---

# 6. Communication Templates

## 6.1 Pre-Launch Announcements

### Soft Launch Announcement (Private Community)

**Channel:** Discord/Telegram (private)
**Timing:** T+30 minutes after successful deployment

```
🚀 Scale AMM Soft Launch - Mainnet

Hey everyone!

We've just deployed Scale AMM to Solana mainnet. We're starting with a soft launch to our closest community members.

✅ Program deployed and initialized
✅ CRX/SOL primary pool live
✅ First test trades successful

**Program ID:** CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3

**What you can do:**
- Create token pools (permissionlessly!)
- Buy/sell tokens on the bonding curve
- Test the graduation mechanics

**Important Notes:**
⚠️ This is a new protocol - use at your own risk
⚠️ Start with small amounts
⚠️ Report any bugs to #bug-reports

**Resources:**
- Docs: [link]
- SDK Examples: [link]
- Explorer: [link]

We'll announce publicly in a few hours if everything remains stable.

Happy launching! 🎉
```

---

### Public Launch Announcement (Twitter)

**Channel:** Twitter
**Timing:** T+2 hours (if stable)

```
🚀 Scale AMM is LIVE on Solana Mainnet

Launch your token at ANY market cap. No presale. No VC unlock. No BS.

Features:
✅ Fair launch bonding curves
✅ Oracle-based virtual liquidity
✅ Automatic graduation at $85k
✅ Permissionless & unstoppable

Program: CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3

Docs: [link]
SDK: [link]

⚠️ New protocol. DYOR. Use at your own risk.

LFG 🔥

[Thread with details below ⬇️]
```

**Thread:**
```
1/ What is Scale AMM?

A bonding curve AMM that lets you launch tokens at ANY market cap - $10k, $100k, $1M - you choose.

No need to raise millions in presales or deal with VCs.

2/ How it works:

1. Create a TOKEN/CRX pool at your chosen market cap
2. Virtual reserves power initial liquidity
3. As people buy, real liquidity accumulates
4. At $85k, pool graduates to permanent constant-product AMM

3/ Why it's different:

- No inflated $CRX supply needed for liquidity
- Fair launch mechanics (anti-sniper protection)
- Permissionless (anyone can launch)
- Graduation ensures long-term pools

4/ Built on:

- Solana (fast, cheap)
- Pyth Oracle (accurate CRX pricing)
- Anchor Framework (auditable Rust)
- Open source (verify the code)

5/ Get Started:

📖 Read the docs: [link]
💻 Use the SDK: [link]
🚀 Launch your token: [link]

⚠️ DISCLAIMER: New protocol. Not audited. Use at your own risk.

DYOR. Never invest more than you can afford to lose.

6/ We're just getting started.

Follow @ScaleAMM for updates.

Join our community: [Discord link]

Let's build the future of fair token launches. 🔥
```

---

## 6.2 Incident Communications

### Critical Incident (P0) - Initial Alert

**Channel:** Twitter + Discord (simultaneous)
**Timing:** Within 5-15 minutes of incident

```
⚠️ Scale AMM - Service Alert

We've paused trading temporarily due to a technical issue.

Status: Investigating
User funds: Safe (no evidence of loss)
ETA: Investigating, will update in 30 min

Updates:
- This thread (Twitter)
- #announcements (Discord)

Thank you for your patience.
```

**Discord (more details):**
```
🚨 SCALE AMM - TRADING PAUSED 🚨

We've temporarily paused all trading on Scale AMM due to [brief description of issue, if known].

**What we know:**
- Issue detected at [time] UTC
- Trading has been paused as a precaution
- No evidence of funds lost (we're verifying)
- Team is investigating

**What this means for you:**
- You cannot buy/sell tokens right now
- Your funds remain in your wallet (or pools)
- Existing pools are not affected
- We'll resume trading once we verify safety

**Next steps:**
- We're investigating the root cause
- We'll provide an update within 30 minutes
- Once resolved, we'll announce trading resumption

**Stay tuned:**
- Monitor this channel for updates
- Check our Twitter: @ScaleAMM

We apologize for the inconvenience and appreciate your patience.
```

---

### Critical Incident (P0) - Update

**Channel:** Twitter + Discord
**Timing:** Every 30-60 minutes until resolved

```
⚠️ Scale AMM Update - [Time] UTC

Status: Still investigating / Fixing / Testing fix

What we've learned:
[Brief technical explanation]

Impact:
- [Number] users affected
- [Nature of impact]

Next update: [Time estimate]

We appreciate your patience.
```

---

### Critical Incident (P0) - Resolution

**Channel:** Twitter + Discord
**Timing:** Once issue is resolved

```
✅ Scale AMM - Trading Resumed

The issue has been resolved. Trading is now active.

Summary:
- Issue: [Brief description]
- Duration: [X hours Y minutes]
- Impact: [What happened]
- Resolution: [How we fixed it]

What we did:
[Bullet points of actions taken]

User funds: Safe ✅
Protocol status: Operational ✅

We'll publish a detailed post-mortem within 24 hours.

Thank you for your patience and understanding.
```

**Discord (detailed):**
```
✅ SCALE AMM - TRADING RESUMED ✅

Good news: The issue has been resolved and trading is now active.

**What Happened:**
[Detailed technical explanation of the issue]

**Impact:**
- Duration: [X hours Y minutes]
- Users affected: [Number and how]
- Transactions affected: [Number]
- Funds lost: None ✅ / [Amount if any]

**How We Fixed It:**
[Step-by-step explanation of resolution]

**Prevention:**
[What we're doing to prevent this in future]

**Compensation:**
[If applicable - e.g., "We'll reimburse gas fees for failed transactions"]

**Next Steps:**
- We're monitoring closely for the next 24 hours
- A detailed post-mortem will be published [link]
- Bug bounty increased to [amount] to encourage security research

**Thank You:**
We deeply apologize for this incident. We take security and reliability extremely seriously.

Thank you for your patience and for being part of our community.

If you have any questions, please ask in #support.
```

---

### High Priority Incident (P1) - User-Facing

**Channel:** Discord + Twitter (if prolonged)
**Timing:** Within 1 hour

```
⚠️ Scale AMM - Temporary Issues

We're experiencing [brief description, e.g., "higher than normal transaction failures"].

Status: Investigating
Impact: [What users are experiencing]
Workaround: [If available]

We're working on a fix and will update shortly.

Your funds are safe. Thank you for your patience.
```

---

## 6.3 Routine Communications

### Weekly Update (If Things Are Going Well)

**Channel:** Discord
**Timing:** Every Monday (or weekly cadence)

```
📊 Scale AMM - Weekly Update

Week of [Date]

**Growth:**
- TVL: $[amount] (+/- X%)
- Pools Created: [number] (+X this week)
- Unique Users: [number] (+X)
- Volume: $[amount]

**Highlights:**
- [Notable pool/launch]
- [Milestone hit]
- [New feature shipped]

**Coming Soon:**
- [Feature 1]
- [Feature 2]

**Reminder:**
Use at your own risk. DYOR. Protocol is new.

Have a great week! 🚀
```

---

### Monthly Recap

**Channel:** Twitter + Blog Post
**Timing:** First Monday of each month

```
📈 Scale AMM - Month [X] Recap

What a month! Here's what happened:

📊 Stats:
- TVL: $[amount] (+X% MoM)
- Total Pools: [number]
- Total Volume: $[amount]
- Unique Users: [number]

🎉 Highlights:
- [Biggest achievement]
- [Notable launch]
- [New feature]

🔮 Coming Next Month:
- [Roadmap item 1]
- [Roadmap item 2]

Read the full recap: [Blog link]

Thank you for being part of the journey! 🙏
```

---

## 6.4 Maintenance Windows

### Planned Maintenance (If Applicable)

**Channel:** Twitter + Discord
**Timing:** 48 hours before + 24 hours before + 1 hour before

```
🔧 Scale AMM - Scheduled Maintenance

We'll be performing maintenance on [Date] at [Time] UTC.

Duration: Estimated [X] hours
Impact: [What will be unavailable]

**Timeline:**
- Start: [Time] UTC
- Expected end: [Time] UTC
- Updates: Every 30 minutes

**What you can do:**
- Complete any critical transactions before [Time]
- Check back after [Time] for status

We apologize for any inconvenience.
```

---

# 7. Risk Mitigation Strategies

## 7.1 Pre-Launch Risks & Mitigations

### Risk: DEPLOYER_PUBKEY Not Updated

**Probability:** Low (if checklist followed)
**Impact:** CRITICAL - Protocol can be hijacked
**Mitigation:**
- Multiple checklist items specifically for this
- Automated grep check in CI/CD
- Manual verification by 2+ team members
- Test on devnet first

**If it happens:**
- DO NOT deploy to mainnet
- Update DEPLOYER_PUBKEY immediately
- Rebuild and redeploy

---

### Risk: Tests Incomplete or Failing

**Probability:** Medium (complex protocol)
**Impact:** HIGH - Bugs in production
**Mitigation:**
- Target: 103 tests, >95% coverage
- No deployment until all tests pass
- Include edge cases and attack simulations
- Devnet soak test (72 hours)

**If it happens:**
- Delay mainnet launch
- Complete test suite
- Add missing test cases
- Re-run full suite

---

### Risk: Security Vulnerability Undiscovered

**Probability:** Low-Medium (new codebase)
**Impact:** CRITICAL - Funds at risk
**Mitigation:**
- Checked arithmetic everywhere
- Manual security review
- Automated security tools (cargo audit)
- External audit (if budget allows)
- Bug bounty program at launch

**If it happens:**
- Depends on severity (see Emergency Response)
- Emergency pause if critical
- Deploy fixed version
- Compensate affected users (if feasible)

---

### Risk: Oracle Failure at Launch

**Probability:** Low
**Impact:** HIGH - Protocol unusable
**Mitigation:**
- Use established oracle (Pyth)
- Verify oracle active on mainnet before deploy
- Have backup oracle address ready
- Test oracle integration extensively on devnet

**If it happens:**
- Switch to backup oracle (if admin function exists)
- Or emergency pause until oracle recovers
- Communicate to users

---

### Risk: Insufficient Deployer SOL

**Probability:** Low
**Impact:** HIGH - Deployment fails
**Mitigation:**
- Verify balance >5 SOL before deploy
- Have backup wallet with funds
- Test deployment cost on devnet

**If it happens:**
- Transfer more SOL immediately
- Retry deployment

---

## 7.2 Launch Risks & Mitigations

### Risk: Front-Running Initialize

**Probability:** Medium-High (public blockchain)
**Impact:** CRITICAL - Protocol hijacked
**Mitigation:**
- DEPLOYER_PUBKEY hardcoded (only you can init)
- Call initialize() within 1 minute of deploy
- Have script ready to execute immediately

**If it happens:**
- This CANNOT happen if DEPLOYER_PUBKEY is set correctly
- If someone tries, their transaction will fail
- Only your wallet can successfully initialize

---

### Risk: Network Congestion During Deploy

**Probability:** Medium
**Impact:** HIGH - Delays deployment
**Mitigation:**
- Choose low-traffic time (avoid US market hours)
- Use priority fees for transactions
- Have backup RPC endpoints

**If it happens:**
- Be patient, keep retrying
- Increase priority fees
- Switch to faster RPC if needed

---

### Risk: Initialize Transaction Fails

**Probability:** Low
**Impact:** HIGH - Must retry quickly
**Mitigation:**
- Test initialize on devnet first
- Verify all parameters are correct
- Ensure sufficient SOL for tx fee

**If it happens:**
- Read error message carefully
- Fix issue (usually parameters or accounts)
- Retry immediately (clock is ticking)

---

### Risk: Test Trades Fail After Deploy

**Probability:** Low-Medium
**Impact:** MEDIUM - Protocol may have bugs
**Mitigation:**
- Extensive devnet testing
- Use small amounts for first tests
- Have team standing by to investigate

**If it happens:**
- Investigate immediately
- If critical bug, consider emergency pause
- If minor, document and fix in next iteration

---

## 7.3 Post-Launch Risks & Mitigations

### Risk: Economic Exploit Discovered

**Probability:** Low (if tested well)
**Impact:** CRITICAL - Protocol drained
**Mitigation:**
- Comprehensive testing (attack simulations)
- Conservative fee parameters
- Anti-sniper protection
- Slippage checks
- Monitor for unusual patterns

**If it happens:**
- Emergency pause immediately
- Assess damage
- Fix exploit
- Deploy new version (if needed)
- Compensate affected users (if feasible)

---

### Risk: Oracle Manipulation

**Probability:** Low (Pyth is robust)
**Impact:** HIGH - Incorrect pricing
**Mitigation:**
- Strict confidence interval checks (1%)
- Staleness checks (60 seconds)
- Exponent bounds validation
- Use reputable oracle (Pyth)

**If it happens:**
- Transactions with bad prices will fail (checks in place)
- If persistent, switch to backup oracle
- Or emergency pause until resolved

---

### Risk: High Slippage User Complaints

**Probability:** HIGH (bonding curves have slippage)
**Impact:** LOW - Reputation damage (minor)
**Mitigation:**
- Clear documentation about slippage
- min_base_amount / min_quote_amount parameters
- UI shows expected slippage (if you build UI)
- Educate users about bonding curve mechanics

**If it happens:**
- This is expected behavior, not a bug
- Point users to documentation
- Explain bonding curve math
- Suggest smaller trade sizes

---

### Risk: Graduation Fails

**Probability:** Low
**Impact:** MEDIUM - Pool stuck in PreBonding
**Mitigation:**
- Extensive graduation testing
- Monitor first graduations closely
- Clear graduation logic in code

**If it happens:**
- Investigate why (accounting error? logic bug?)
- If bug, may need new deployment
- Affected pool may be stuck (can't fix without upgrade)

---

### Risk: Fee Collection Issues

**Probability:** Low
**Impact:** MEDIUM - Lost revenue
**Mitigation:**
- Test fee collection on devnet
- Verify fee_recipient receives fees
- Monitor fee_recipient balance

**If it happens:**
- Investigate where fees are going
- May be accounting bug
- May need new deployment to fix

---

### Risk: RPC Provider Downtime

**Probability:** MEDIUM
**Impact:** MEDIUM - Protocol inaccessible
**Mitigation:**
- Use tier-1 RPC provider (Helius, Alchemy, etc.)
- Have backup RPC configured
- Automatic failover logic

**If it happens:**
- Switch to backup RPC
- Communicate to users (provider issue, not protocol)
- Protocol itself is fine (Solana network still running)

---

### Risk: Rug Pull Accusations

**Probability:** MEDIUM (crypto culture)
**Impact:** MEDIUM - Reputation damage
**Mitigation:**
- Open source code (verify on GitHub)
- Verifiable build (on-chain verification)
- No admin keys (or multisig only)
- Clear documentation of mechanics
- Transparent team (if applicable)

**If it happens:**
- Respond calmly with facts
- Point to code and documentation
- Explain mechanics clearly
- Show on-chain evidence (no fund extraction)

---

### Risk: Competitor Launches Similar Protocol

**Probability:** HIGH (open source)
**Impact:** MEDIUM - Market share loss
**Mitigation:**
- First mover advantage (launch fast)
- Superior UX/features
- Strong community
- Continuous improvement

**If it happens:**
- Competition is healthy
- Focus on your strengths
- Iterate faster
- Build better product

---

## 7.4 Long-Term Risks & Mitigations

### Risk: Protocol Becomes Obsolete

**Probability:** MEDIUM (fast-moving space)
**Impact:** HIGH - Usage drops to zero
**Mitigation:**
- Continuous innovation
- Listen to user feedback
- Monitor competitor features
- Roadmap for improvements

**If it happens:**
- Accept that this is natural
- Protocol will continue to exist (permissionless)
- Users can still use it
- Team can move on to next project

---

### Risk: Regulatory Action

**Probability:** LOW-MEDIUM (depends on jurisdiction)
**Impact:** Variable (depends on action)
**Mitigation:**
- Legal counsel consulted
- Terms of Service with disclaimers
- No KYC/AML (permissionless protocol)
- Team anonymity (optional)

**If it happens:**
- Depends on specific action
- May need to shut down website/frontend
- Protocol itself cannot be shut down (on-chain)
- Consult legal counsel immediately

---

### Risk: Key Personnel Leave

**Probability:** MEDIUM (startups are hard)
**Impact:** MEDIUM - Slower development
**Mitigation:**
- Documentation of all processes
- Knowledge sharing (no single points of failure)
- Succession planning
- Multisig (no single key holder)

**If it happens:**
- Backfill role
- Transition knowledge
- Community can fork if needed (open source)

---

# 8. Go/No-Go Decision Criteria

## 8.1 Decision Framework

**Timing:** T-24 hours (final go/no-go meeting)

**Decision Makers:**
- Technical Lead (50% weight)
- Security Lead (30% weight)
- CEO/Founder (20% weight)

**Process:**
1. Review all checklist items (30 min)
2. Assess each criterion below (20 min)
3. Discuss concerns and blockers (15 min)
4. Vote Go/No-Go (5 min)
5. If No-Go, set new date and identify gaps

**Outcome:**
- **GO:** Proceed with launch at scheduled time
- **NO-GO:** Delay launch, address blockers, reschedule

---

## 8.2 Critical Must-Haves (Absolute Blockers)

**If ANY of these are NO, decision is automatically NO-GO:**

### Code Verification

- [ ] **DEPLOYER_PUBKEY is NOT placeholder** (`11111...`)
  ```bash
  grep "11111111111111111111111111111111" programs/creator-amm-v2/src/instructions/initialize.rs
  # Must return NOTHING
  ```

- [ ] **All arithmetic is checked (no unwrap/panic)**
  ```bash
  rg "unwrap\(\)" programs/creator-amm-v2/src/ --type rust
  # Must return 0 results in critical paths
  ```

- [ ] **Oracle validation comprehensive**
  - Staleness check: YES
  - Confidence check: YES
  - Exponent bounds: YES
  - Negative price rejection: YES

### Testing

- [ ] **All implemented tests pass** (100% pass rate)
- [ ] **Devnet soak test completed** (72 hours, 10k+ trades, 0 exploits)
- [ ] **Security tests pass** (overflow, oracle, anti-sniper, reentrancy)

### Build

- [ ] **Clean build succeeds** (`anchor build` with 0 errors)
- [ ] **Program binary <500KB** (within Solana limits)

### Team

- [ ] **All team members available** for launch day
- [ ] **Monitoring systems operational** (alerts working)
- [ ] **RPC providers confirmed** (primary + backup)

### Authority & Security

- [ ] **Multisig setup complete** (or ready to transfer authority)
- [ ] **Emergency pause tested** on devnet
- [ ] **Fee recipient address verified**

---

## 8.3 High-Priority Items (Strong No-Go Unless Waived)

**These should be YES, but team can vote to waive if there's strong justification:**

### Performance

- [ ] **Compute units <100k per trade** (target: <50k, but not blocker)
  - If >100k: Will transactions fail due to CU limit?
  - Mitigation: Consolidate buy/sell instructions post-launch

### Testing Completeness

- [ ] **Code coverage >95%** (target: 100%)
  - If <95%: What critical paths are untested?
  - Mitigation: Add tests for uncovered areas

### External Audit

- [ ] **Security audit completed** (recommended, not required)
  - If NO: Team accepts higher risk
  - Mitigation: Rely on internal review + bug bounty

### Infrastructure

- [ ] **Monitoring dashboard operational** (nice-to-have)
  - If NO: Can we still detect issues quickly?
  - Mitigation: Manual monitoring for first 24h

---

## 8.4 Nice-to-Haves (Not Blockers)

**These improve launch quality but won't block deployment:**

### Documentation

- [ ] **User guides complete**
- [ ] **Video tutorials recorded**
- [ ] **FAQ comprehensive**

### Marketing

- [ ] **Launch announcement drafted**
- [ ] **Community notified**
- [ ] **Influencers reached out**

### Features

- [ ] **SDK published to NPM**
- [ ] **Frontend UI ready** (if building one)
- [ ] **Analytics dashboard** (Dune, etc.)

---

## 8.5 Go/No-Go Vote Template

**Meeting Minutes:**

```markdown
# Scale AMM Mainnet Launch - Go/No-Go Decision

**Date:** YYYY-MM-DD
**Time:** HH:MM UTC
**Attendees:** [Names and roles]

## Checklist Review

### Critical Must-Haves (All must be YES)
- [ ] DEPLOYER_PUBKEY updated
- [ ] Checked arithmetic only
- [ ] Oracle validation complete
- [ ] All tests pass
- [ ] Devnet soak test done
- [ ] Clean build succeeds
- [ ] Team available
- [ ] Monitoring operational
- [ ] RPC confirmed
- [ ] Multisig ready

### High-Priority Items
- [ ] Compute units <100k (or acceptable)
- [ ] Code coverage >95% (or acceptable)
- [ ] Security audit (or risk accepted)
- [ ] Monitoring dashboard (or manual ok)

### Nice-to-Haves (Status only, not blocking)
- [ ] Documentation
- [ ] Marketing
- [ ] Features

## Discussion

**Concerns Raised:**
1. [Concern 1]
   - Severity: Low / Medium / High / Critical
   - Can we launch with this? Yes / No
   - Mitigation: [If yes, how do we mitigate?]

2. [Concern 2]
   - ...

**Blockers:**
- [Any absolute blockers?]

## Votes

| Person | Role | Vote | Reasoning |
|--------|------|------|-----------|
| [Name] | Tech Lead | GO / NO-GO | [Brief reason] |
| [Name] | Security Lead | GO / NO-GO | [Brief reason] |
| [Name] | CEO | GO / NO-GO | [Brief reason] |

**Decision:** GO / NO-GO

## Next Steps

**If GO:**
- Launch date: [Date and time]
- Launch lead: [Name]
- War room: [Discord channel]
- Final checks: T-1 hour

**If NO-GO:**
- Blockers to resolve: [List]
- Target resolution: [Dates]
- Next go/no-go meeting: [Date]
```

---

## 8.6 Decision Examples

### Example 1: Clear GO

**Scenario:** All critical items YES, high-priority items YES, team confident

**Decision:** GO
- All blockers resolved
- Devnet testing successful
- Team ready
- Proceed with launch

---

### Example 2: GO with Waiver

**Scenario:** All critical items YES, but compute units are 120k (above target)

**Discussion:**
- Is 120k CU within Solana's 200k limit? YES
- Will transactions succeed? YES
- Can we optimize post-launch? YES
- Risk acceptable? YES

**Decision:** GO (with waiver)
- Compute units higher than target but not blocking
- Optimization can happen post-launch
- Monitor closely for CU-related failures

---

### Example 3: NO-GO

**Scenario:** Tests pass, but DEPLOYER_PUBKEY is still placeholder

**Decision:** NO-GO
- This is an absolute blocker (CRITICAL risk)
- Cannot proceed under any circumstances
- Update DEPLOYER_PUBKEY, rebuild, test
- Reschedule go/no-go for tomorrow

---

### Example 4: NO-GO (Multiple concerns)

**Scenario:**
- Devnet soak test only ran 24 hours (not 72)
- Code coverage is 87% (not >95%)
- 2 security tests are failing

**Decision:** NO-GO
- Multiple high-risk gaps
- Need more confidence before mainnet
- Extend devnet test to full 72 hours
- Add tests to reach 95% coverage
- Fix failing security tests
- Reschedule for next week

---

## 8.7 Final Checklist Before Launch

**Signed off by all team members on T-1 hour:**

```
I, [Name], [Role], have reviewed the Scale AMM codebase and launch plan.

I confirm:
- [ ] I have read this deployment guide in full
- [ ] I am available for the full launch day
- [ ] I understand my role and responsibilities
- [ ] I have verified critical items in my area
- [ ] I am comfortable proceeding with mainnet launch
- [ ] I accept the risks involved in this deployment

Signature: _________________
Date: _________________
```

---

# Appendix: Additional Resources

## A. Useful Commands

### Check Deployment Status

```bash
# View program account
solana program show <PROGRAM_ID> --url mainnet

# View config account
solana account <CONFIG_PDA> --url mainnet

# Check deployer balance
solana balance --url mainnet

# Get current slot (for timing reference)
solana slot --url mainnet
```

### Transaction Monitoring

```bash
# Watch recent transactions
solana transaction-history <PROGRAM_ID> --url mainnet

# Check specific transaction
solana confirm <TX_SIGNATURE> -v --url mainnet
```

### Emergency Commands

```bash
# Emergency pause
npx ts-node scripts/emergency-pause.ts

# Unpause
npx ts-node scripts/unpause.ts

# Transfer authority (to multisig)
npx ts-node scripts/transfer-authority.ts
```

---

## B. Contact Information Template

**Fill this out before launch and share with all team members:**

```markdown
# Scale AMM Launch - Emergency Contacts

## Team Members

**Technical Lead:**
- Name: [Name]
- Role: Program deployment, technical decisions
- Phone: [Phone]
- Discord: [Handle]
- Email: [Email]

**Security Lead:**
- Name: [Name]
- Role: Security monitoring, incident response
- Phone: [Phone]
- Discord: [Handle]
- Email: [Email]

**DevOps/Infrastructure:**
- Name: [Name]
- Role: RPC, monitoring, alerts
- Phone: [Phone]
- Discord: [Handle]
- Email: [Email]

**Communications:**
- Name: [Name]
- Role: User communication, social media
- Phone: [Phone]
- Discord: [Handle]
- Email: [Email]

**Support:**
- Name: [Name]
- Role: User questions, triage
- Phone: [Phone]
- Discord: [Handle]
- Email: [Email]

## External Contacts

**RPC Provider (Primary):**
- Provider: [e.g., Helius]
- Support: [Email/Phone]
- Emergency hotline: [If available]

**RPC Provider (Backup):**
- Provider: [e.g., Alchemy]
- Support: [Email/Phone]

**Oracle Provider:**
- Provider: [e.g., Pyth]
- Support: [Discord channel]
- Emergency: [If available]

**Security Firm (If contracted):**
- Firm: [e.g., OtterSec]
- Contact: [Email/Phone]
- Emergency: [If available]

**Legal Counsel:**
- Firm: [Name]
- Attorney: [Name]
- Phone: [Phone]
- Email: [Email]

## Communication Channels

**War Room:** Discord #mainnet-launch (private)
**Incident Response:** Discord #incident-YYYYMMDD (created as needed)
**Public Updates:** Twitter @ScaleAMM + Discord #announcements
```

---

## C. Deployment Artifacts Checklist

**Save these after deployment:**

```markdown
# Scale AMM Mainnet Deployment - Artifacts

## Deployed Addresses

**Program:**
- Program ID: [Address]
- Program Data: [Address]
- Deploy Transaction: [Signature]
- Deploy Slot: [Slot number]
- Deploy Timestamp: [UTC]

**Config:**
- Config PDA: [Address]
- Initialize Transaction: [Signature]
- Initialize Slot: [Slot number]

**CRX Token:**
- Mint Address: [Address]
- Total Supply: [Amount]

**Primary Pool (CRX/SOL):**
- Pool PDA: [Address]
- Quote Vault: [Address]
- Base Vault: [Address]
- Create Transaction: [Signature]

**Authorities:**
- Deployer Wallet: [Address]
- Fee Recipient: [Address]
- Current Authority: [Address] (deployer initially, then multisig)

## Hashes & Verification

**Program Hash:**
```
[SHA256 hash of program binary]
```

**Git Commit:**
```
Commit: [Git commit hash]
Branch: [Branch name]
Tag: [Git tag, e.g., v1.0.0-mainnet]
```

**Build Info:**
```
Anchor Version: [Version]
Solana Version: [Version]
Rust Version: [Version]
Build Date: [Date]
```

## Configuration Parameters

```
Pre-bonding Fee: 300 bps (3%)
Pre-bonding Threshold: $40,000 USD
Post-bonding Fee: 100 bps (1%)
Graduation Threshold: $85,000 USD
Anti-sniper Window: 20 slots (~8 seconds)
Anti-sniper Max Trade: 500 bps (5%)
Oracle Max Age: 60 seconds
Oracle Max Confidence: 100 bps (1%)
```

## Explorer Links

- Program: https://explorer.solana.com/address/[PROGRAM_ID]
- Config: https://explorer.solana.com/address/[CONFIG_PDA]
- CRX Mint: https://explorer.solana.com/address/[CRX_MINT]
- Primary Pool: https://explorer.solana.com/address/[POOL_PDA]

## Deployment Log

[Full log file attached: mainnet-deployment-YYYYMMDD-HHMMSS.log]
```

---

## D. Post-Launch Task List

**Complete within first week:**

- [ ] Publish verifiable build hash
- [ ] Update website with mainnet info
- [ ] Announce on all channels
- [ ] Monitor for 24 hours straight
- [ ] Create first post-launch update
- [ ] Gather user feedback
- [ ] Activate bug bounty program
- [ ] Transfer authority to multisig (if ready)
- [ ] Document any issues encountered
- [ ] Write launch retrospective
- [ ] Plan next iteration

---

## E. Success Metrics

**How do we know if launch was successful?**

### Day 1 Success Criteria

- [ ] Uptime >99%
- [ ] Transaction success rate >99%
- [ ] Zero security incidents
- [ ] >10 pools created
- [ ] >$10k volume
- [ ] >50 unique users
- [ ] Positive community sentiment

### Week 1 Success Criteria

- [ ] Uptime >99.5%
- [ ] TVL >$100k
- [ ] >100 pools created
- [ ] >$100k volume
- [ ] >500 unique users
- [ ] At least 1 token graduated
- [ ] No critical bugs discovered

### Month 1 Success Criteria

- [ ] TVL >$1M
- [ ] >1,000 pools created
- [ ] >$1M volume
- [ ] >5,000 unique users
- [ ] Protocol revenue >$10k
- [ ] Healthy ecosystem developing
- [ ] Planning next features

---

**END OF DEPLOYMENT GUIDE**

---

## Document Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-01-08 | Initial comprehensive guide | AI + Human |

---

## Feedback

This document will be updated based on actual deployment experience.

**Please provide feedback:**
- What sections were most helpful?
- What was missing?
- What could be clearer?
- What should be added for next deployment?

**Document maintained in:** `/home/user/Claude/MAINNET_DEPLOYMENT_GUIDE.md`

---

**Remember:**
- Permissionless means no second chances
- Test everything on devnet first
- DEPLOYER_PUBKEY is critical
- Initialize within 1 minute of deploy
- Monitor closely for first 24 hours
- Communication is key during incidents

**Good luck with the launch! 🚀**
