# Scale AMM - Pre-Launch Checklist

**DEFINITIVE launch checklist for mainnet deployment**

**Protocol:** Scale AMM v2.0
**Network:** Solana Mainnet-Beta
**Target Launch:** Day 21 (3-week sprint)
**Last Updated:** 2026-01-08

**CRITICAL:** Solana programs are IMMUTABLE after deployment. There is no second chance. This checklist must be completed 100% before launch.

---

## Table of Contents

1. [T-7 Days (One Week Before)](#t-7-days-one-week-before)
2. [T-3 Days (Three Days Before)](#t-3-days-three-days-before)
3. [T-1 Day (One Day Before)](#t-1-day-one-day-before)
4. [T-0 (Launch Day)](#t-0-launch-day)
5. [T+24h (First Day After)](#t24h-first-day-after)
6. [Emergency Procedures](#emergency-procedures)

---

## T-7 Days (One Week Before)

### Code Quality & Security Audits

#### Critical Blocker Verification
**Responsible:** Lead Developer
**Deadline:** T-7 days, 00:00 UTC

- [ ] **DEPLOYER_PUBKEY updated in initialize.rs**
  - **File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/initialize.rs:23`
  - **Action:** Replace `pubkey!("11111111111111111111111111111111")` with actual deployer wallet
  - **Verify:** `grep "11111111111111111111111111111111" programs/creator-amm-v2/src/instructions/initialize.rs` returns NOTHING
  - **Why Critical:** Without this, anyone can front-run initialization and permanently brick the protocol
  - **If Fails:** STOP. Cannot proceed to deployment.

#### Arithmetic Safety Audit
**Responsible:** Lead Developer + AI Assistant
**Deadline:** T-7 days, 06:00 UTC

- [ ] **All arithmetic uses checked operations**
  - **Files to check:**
    - `/home/user/Claude/programs/creator-amm-v2/src/state.rs` (lines 222-286, 296-349)
    - `/home/user/Claude/programs/creator-amm-v2/src/utils/oracle.rs` (lines 84-104, 115-151)
    - `/home/user/Claude/programs/creator-amm-v2/src/instructions/buy.rs`
    - `/home/user/Claude/programs/creator-amm-v2/src/instructions/sell.rs`
    - `/home/user/Claude/programs/creator-amm-v2/src/instructions/create_pool.rs`
  - **Action:** Review every math operation for `checked_add`, `checked_mul`, `checked_div`, `checked_sub`
  - **Verify:** `grep -r "\.wrapping_\|+ \|* \|/ \|- " programs/creator-amm-v2/src/ --include="*.rs"` returns only safe operations
  - **Exception:** `saturating_mul` and `saturating_div` are acceptable for WAA fee calculations
  - **If Fails:** Add checked arithmetic before proceeding

- [ ] **No unwrap() or panic!() in production code**
  - **Action:** Search entire codebase for dangerous patterns
  - **Verify:** `grep -r "unwrap()\|panic!\|expect(" programs/creator-amm-v2/src/ --include="*.rs"` returns ZERO results
  - **If Fails:** Replace with proper error handling using `?` operator and custom errors

#### Oracle Validation Review
**Responsible:** Lead Developer
**Deadline:** T-7 days, 08:00 UTC

- [ ] **Oracle staleness check implemented**
  - **File:** `/home/user/Claude/programs/creator-amm-v2/src/utils/oracle.rs:44-52`
  - **Verify:** Price age check exists and uses `oracle_max_age_seconds` from config
  - **Default:** 60 seconds max age
  - **If Fails:** Cannot deploy - critical security vulnerability

- [ ] **Oracle confidence validation**
  - **File:** `/home/user/Claude/programs/creator-amm-v2/src/utils/oracle.rs:64-73`
  - **Verify:** Confidence interval check ≤ max_confidence_bps
  - **Default:** 100 bps (1%) max confidence
  - **If Fails:** Add validation before deployment

- [ ] **Oracle exponent bounds check**
  - **File:** `/home/user/Claude/programs/creator-amm-v2/src/utils/oracle.rs:78-81`
  - **Verify:** Exponent range check (-12 to +6)
  - **Why Critical:** Prevents overflow attacks via malicious oracle
  - **If Fails:** Add bounds check immediately

- [ ] **Negative/zero price rejection**
  - **File:** `/home/user/Claude/programs/creator-amm-v2/src/utils/oracle.rs:41`
  - **Verify:** `price > 0` check exists
  - **If Fails:** Add check to prevent division by zero

- [ ] **Confidence cannot exceed price**
  - **File:** `/home/user/Claude/programs/creator-amm-v2/src/utils/oracle.rs:59-62`
  - **Verify:** `conf <= price_abs` check exists
  - **If Fails:** Add validation to prevent invalid oracle data

#### Vault Security Verification
**Responsible:** Lead Developer
**Deadline:** T-7 days, 10:00 UTC

- [ ] **Post-trade vault balance validation**
  - **Files:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/trade.rs`
  - **Action:** Verify all trades validate vault balances after execution
  - **Pattern:** Check for `validate_vault_balances()` or equivalent after token transfers
  - **If Fails:** Add vault validation to prevent reserve/vault mismatch

- [ ] **Reserve-vault matching checks**
  - **Verify:** Real reserves always match vault balances
  - **Check:** `real_quote_reserves == quote_vault.amount` after every trade
  - **If Fails:** Add post-trade validation

#### Anti-Sniper Protection Review
**Responsible:** Lead Developer
**Deadline:** T-7 days, 12:00 UTC

- [ ] **Trade size limits enforced**
  - **File:** `/home/user/Claude/programs/creator-amm-v2/src/state.rs:162-166`
  - **Verify:** `is_anti_sniper_active()` method exists and works correctly
  - **Default:** Max 5% of supply per trade during first 100 slots
  - **If Fails:** Implement size checks in buy/sell handlers

- [ ] **WAA (Weighted Average Age) system functional**
  - **File:** `/home/user/Claude/programs/creator-amm-v2/src/state.rs:380-488`
  - **Verify:** WAA calculations use saturating arithmetic (not checked)
  - **Verify:** Time-based decay formula is correct (10% → 1% → 0%)
  - **If Fails:** Review and fix WAA logic

#### Emergency Controls
**Responsible:** Lead Developer
**Deadline:** T-7 days, 14:00 UTC

- [ ] **Pause mechanism tested**
  - **File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/set_paused.rs`
  - **Test:** Set `is_paused = true`, verify all trades fail with `ProtocolPaused`
  - **Test:** Set `is_paused = false`, verify trades resume
  - **If Fails:** Fix pause mechanism before deployment

- [ ] **Authority-only access verified**
  - **Verify:** Only `config.authority` can call `set_paused` and `update_config`
  - **Test:** Attempt to call with non-authority wallet, expect `Unauthorized` error
  - **If Fails:** Add authority checks to all admin functions

### Test Coverage Verification

#### Critical Test Execution
**Responsible:** QA Lead / Lead Developer
**Deadline:** T-7 days, 18:00 UTC

- [ ] **Run all existing tests**
  - **Command:** `anchor test`
  - **Expected:** 100% pass rate (179 tests total based on README)
  - **Current Status:** ~8,270 lines of test code across 8 test files
  - **If Fails:** Fix all failing tests before proceeding

- [ ] **Critical test coverage - Oracle (30 tests)**
  - **File:** `/home/user/Claude/tests/CRITICAL_TESTS_NEEDED.ts`
  - **Tests needed:**
    - [ ] Stale oracle price rejection (>60s)
    - [ ] Negative oracle price rejection
    - [ ] Zero oracle price rejection
    - [ ] Exponent out of bounds (-13, +7)
    - [ ] Confidence exceeds price
    - [ ] Confidence >10% rejection
    - [ ] Price overflow with max exponent
    - [ ] Oracle account validation
  - **Status Check:** Review test file for "NOT IMPLEMENTED" markers
  - **If Fails:** Complete critical oracle tests first

- [ ] **Critical test coverage - Overflow protection (25 tests)**
  - **Tests needed:**
    - [ ] Max u64 reserve calculations
    - [ ] Virtual reserve calculation overflow
    - [ ] Market cap overflow (u64::MAX tokens × price)
    - [ ] Fee calculation overflow
    - [ ] WAA calculation overflow
    - [ ] Graduation threshold overflow
  - **If Fails:** Implement overflow tests immediately

- [ ] **Critical test coverage - Anti-sniper (15 tests)**
  - **Tests needed:**
    - [ ] Max trade size enforcement (5% limit)
    - [ ] WAA penalty decay over time
    - [ ] Anti-sniper disabled after window
    - [ ] Anti-sniper only active in PreBonding
    - [ ] Concurrent buys don't bypass limit
  - **If Fails:** Complete anti-sniper tests

- [ ] **Critical test coverage - Graduation (20 tests)**
  - **Tests needed:**
    - [ ] Graduation at exact threshold
    - [ ] Graduation with accumulated fees
    - [ ] Phase transition event emission
    - [ ] Reserve switching (virtual → real)
    - [ ] Cannot revert graduation
    - [ ] Trading continues post-graduation
  - **If Fails:** Implement graduation tests

- [ ] **Attack simulation tests (10+ tests)**
  - **File:** `/home/user/Claude/tests/security-tests.ts`
  - **Tests needed:**
    - [ ] Sandwich attack prevention
    - [ ] Front-running protection
    - [ ] Reentrancy (not applicable in Solana but test anyway)
    - [ ] Price manipulation attempts
    - [ ] Vault drainage attempts
  - **If Fails:** Implement security tests

#### Edge Case Testing
**Responsible:** QA Lead
**Deadline:** T-7 days, 20:00 UTC

- [ ] **Zero/dust amount handling**
  - **Test:** Buy with 0 CRX → expect `InvalidAmount`
  - **Test:** Sell 0 tokens → expect `InvalidAmount`
  - **Test:** Buy with 1 lamport → expect `OutputTooSmall` or success
  - **If Fails:** Add validation for minimum amounts

- [ ] **Maximum value testing**
  - **Test:** Pool with u64::MAX supply → verify calculations don't overflow
  - **Test:** Trade with maximum possible CRX amount
  - **Test:** Market cap at maximum USD value
  - **If Fails:** Fix overflow handling

- [ ] **Concurrent transaction testing**
  - **Test:** 10 users buying simultaneously
  - **Test:** Buy and sell in same block
  - **Test:** Multiple pools graduating simultaneously
  - **If Fails:** Fix race conditions

### Documentation Review

#### Technical Documentation
**Responsible:** Tech Writer / Lead Developer
**Deadline:** T-7 days, 22:00 UTC

- [ ] **README.md accuracy**
  - **File:** `/home/user/Claude/README.md`
  - **Verify:** All SDK examples work
  - **Verify:** Installation instructions correct
  - **Verify:** No references to placeholder values
  - **If Fails:** Update documentation

- [ ] **DEPLOYMENT.md completeness**
  - **File:** `/home/user/Claude/DEPLOYMENT.md`
  - **Verify:** All deployment steps documented
  - **Verify:** Emergency procedures included
  - **Verify:** Monitoring requirements clear
  - **If Fails:** Update deployment guide

- [ ] **WHAT_IT_DOES.md accuracy**
  - **File:** `/home/user/Claude/WHAT_IT_DOES.md`
  - **Verify:** Protocol mechanics correctly explained
  - **Verify:** All features documented
  - **Verify:** No outdated information
  - **If Fails:** Update protocol documentation

#### API Documentation
**Responsible:** Developer Relations
**Deadline:** T-7 days, 23:00 UTC

- [ ] **SDK README complete**
  - **File:** `/home/user/Claude/sdk/README.md`
  - **Verify:** All public methods documented
  - **Verify:** Code examples provided
  - **Verify:** Error handling explained
  - **If Fails:** Complete SDK documentation

- [ ] **Error codes documented**
  - **File:** `/home/user/Claude/programs/creator-amm-v2/src/errors.rs`
  - **Verify:** All 28 error codes have clear messages
  - **Verify:** Error handling guide exists
  - **If Fails:** Document all error codes

### Infrastructure Setup

#### RPC Provider Configuration
**Responsible:** DevOps / Lead Developer
**Deadline:** T-7 days, 16:00 UTC

- [ ] **Primary RPC provider selected**
  - **Recommended:** Helius (highest reliability for Solana)
  - **Alternatives:** QuickNode, Triton One
  - **Requirements:**
    - Rate limit: 1000+ requests/second
    - Uptime SLA: 99.9%+
    - WebSocket support for event monitoring
    - Dedicated endpoint (not shared)
  - **Setup:** Configure endpoint URL, API key
  - **If Fails:** Select and configure RPC immediately

- [ ] **Backup RPC providers configured**
  - **Minimum:** 2 backup providers
  - **Action:** Configure failover logic in SDK
  - **Test:** Simulate primary RPC failure, verify automatic switch
  - **If Fails:** Add RPC failover logic

- [ ] **RPC health monitoring**
  - **Tool:** Set up RPC health check endpoint
  - **Alert:** If RPC latency >500ms or error rate >1%
  - **If Fails:** Implement health checks

#### Wallet & Keys Setup
**Responsible:** Security Lead / Founder
**Deadline:** T-7 days, 17:00 UTC

- [ ] **Deployer keypair generated**
  - **Action:** `solana-keygen new --outfile ~/.config/solana/mainnet-deployer.json`
  - **Backup:** Store encrypted copy in 3 separate secure locations
  - **Hardware:** Consider using Ledger for deployer key
  - **If Fails:** Generate keypair immediately

- [ ] **Deployer wallet funded**
  - **Required:** Minimum 10 SOL for deployment + operations
  - **Breakdown:**
    - Program deployment: ~5 SOL
    - Account creation: ~2 SOL
    - Transaction fees: ~1 SOL
    - Buffer: 2 SOL
  - **If Fails:** Fund wallet before T-3

- [ ] **Multisig wallet created (RECOMMENDED)**
  - **Tool:** Squads Protocol (https://squads.so)
  - **Configuration:** 2-of-3 or 3-of-5 signatures
  - **Keys distributed:** Across team members (geographically separated)
  - **Purpose:** Protocol authority and fee recipient
  - **If Fails:** Deploy with single signer (higher risk)

- [ ] **Fee recipient wallet setup**
  - **Option 1:** Multisig (recommended)
  - **Option 2:** Hardware wallet
  - **Option 3:** Hot wallet (not recommended for mainnet)
  - **Action:** Create CRX token account for fee recipient
  - **If Fails:** Must have before initialization

#### Oracle Setup
**Responsible:** Lead Developer
**Deadline:** T-7 days, 19:00 UTC

- [ ] **Pyth CRX/USD feed identified**
  - **Production:** Verify CRX price feed exists on mainnet
  - **Alternative:** If CRX feed unavailable, use proxy strategy
  - **Proxy options:**
    - Use SOL/USD as temporary proxy (requires CRX/SOL off-chain price)
    - Deploy custom oracle (significant additional work)
  - **Feed address:** TBD (obtain from Pyth Network)
  - **If Fails:** Cannot launch without CRX price feed

- [ ] **Oracle feed validated**
  - **Test:** Query feed on mainnet
  - **Verify:** Price updates regularly (every few seconds)
  - **Verify:** Confidence intervals acceptable (<1%)
  - **Verify:** Exponent is expected value
  - **If Fails:** Find alternative oracle or fix feed

- [ ] **Backup oracle configured (optional)**
  - **Provider:** Switchboard, Chainlink, or custom
  - **Purpose:** Failover if Pyth feed fails
  - **Note:** Would require code changes to support multiple oracles
  - **If Fails:** Accept single oracle risk

### Compute Budget Analysis

#### Program Size & Efficiency
**Responsible:** Lead Developer
**Deadline:** T-6 days, 12:00 UTC

- [ ] **Program binary size measured**
  - **Check:** `du -h target/deploy/creator_amm_v2.so`
  - **Limit:** Max 512 KB (Solana program size limit)
  - **Current:** TBD (should be <100 KB for this program)
  - **If Fails:** Optimize or split program

- [ ] **Compute units measured for all instructions**
  - **Buy instruction:** Target <120k CU (absolute max 200k)
  - **Sell instruction:** Target <120k CU (absolute max 200k)
  - **Create pool:** Target <120k CU
  - **Initialize:** Target <50k CU
  - **Tool:** Use `solana-test-validator` with compute unit logging
  - **If Fails:** Optimize hot paths (remove msg!() calls, simplify logic)

- [ ] **Worst-case compute unit scenarios**
  - **Test:** Buy during anti-sniper with WAA calculation
  - **Test:** Sell with WAA penalty during PreBonding
  - **Test:** Pool graduation transition (boundary condition)
  - **All:** Must be <200k CU (Solana limit is 200k per instruction)
  - **If Fails:** Optimize or split transactions

### Code Review & Audit

#### Internal Code Review
**Responsible:** All Developers
**Deadline:** T-6 days, EOD

- [ ] **Peer review of all critical paths**
  - **Files to review:**
    - All files in `/home/user/Claude/programs/creator-amm-v2/src/instructions/`
    - `/home/user/Claude/programs/creator-amm-v2/src/state.rs`
    - `/home/user/Claude/programs/creator-amm-v2/src/utils/oracle.rs`
  - **Checklist per file:**
    - All arithmetic is checked
    - No unwrap() or panic!()
    - Error handling is comprehensive
    - Logic matches specification
  - **If Fails:** Fix issues before proceeding

- [ ] **Security-focused review**
  - **Focus areas:**
    - Vault security (no withdrawal bugs)
    - Oracle manipulation resistance
    - Overflow/underflow prevention
    - Access control (authority checks)
    - Reentrancy (not applicable but verify)
  - **If Fails:** Address security issues immediately

#### External Audit (Optional but Recommended)
**Responsible:** Founder / Project Manager
**Deadline:** T-6 days (must start by T-14 if doing)

- [ ] **Smart contract audit firm engaged**
  - **Recommended firms:**
    - OtterSec (Solana specialists)
    - Neodyme (Solana security)
    - Trail of Bits (general blockchain security)
  - **Timeline:** Most audits take 1-2 weeks
  - **Cost:** $20k-50k for program this size
  - **Note:** CLAUDE.md states "no external audit - Claude is sole auditor"
  - **If Skipping:** Accept increased risk, ensure internal review is thorough

- [ ] **Audit report received and reviewed**
  - **Action:** Address all Critical and High severity findings
  - **Action:** Document Medium/Low findings as "accepted risk" if not fixing
  - **If Fails:** Delay launch until critical issues fixed

---

## T-3 Days (Three Days Before)

### Final Code Freeze

#### Repository State
**Responsible:** Lead Developer
**Deadline:** T-3 days, 00:00 UTC

- [ ] **Code freeze announced**
  - **Action:** No new features, only critical bug fixes allowed
  - **Communication:** Notify all team members
  - **Branch:** Create `release/mainnet-v2.0` branch
  - **Protection:** Enable branch protection (no force push)
  - **If Fails:** N/A (policy decision)

- [ ] **Final commit tagged**
  - **Action:** `git tag -a v2.0.0-rc1 -m "Release candidate for mainnet"`
  - **Action:** `git push origin v2.0.0-rc1`
  - **Verify:** Tag points to correct commit
  - **If Fails:** Recreate tag on correct commit

- [ ] **Build from tagged release**
  - **Action:** `git checkout v2.0.0-rc1`
  - **Action:** `anchor clean && anchor build`
  - **Verify:** Build succeeds with 0 errors, 0 warnings
  - **Save:** Archive `.so` file and keypair
  - **If Fails:** Fix build issues, create new RC tag

#### Final Test Suite Run
**Responsible:** QA Lead
**Deadline:** T-3 days, 06:00 UTC

- [ ] **All tests passing on release candidate**
  - **Command:** `anchor test` (from v2.0.0-rc1 tag)
  - **Expected:** 100% pass rate
  - **Save:** Test results log
  - **If Fails:** Fix bugs, create new RC tag, re-test

- [ ] **Integration tests on devnet**
  - **Deploy:** Release candidate to devnet
  - **Test:** Complete end-to-end user flows
    - Initialize protocol
    - Create CRX/SOL pool
    - Create TOKEN/CRX pool
    - Execute buys
    - Execute sells
    - Reach graduation
    - Post-graduation trading
  - **If Fails:** Fix issues, create new RC

- [ ] **Load testing on devnet**
  - **Test:** 100+ concurrent transactions
  - **Test:** Multiple pools created simultaneously
  - **Test:** Rapid buy/sell cycles
  - **Monitor:** Compute units, error rates, latency
  - **If Fails:** Optimize or accept limitations

### Deployment Rehearsal

#### Dry Run on Devnet
**Responsible:** Lead Developer + DevOps
**Deadline:** T-3 days, 12:00 UTC

- [ ] **Full deployment script tested**
  - **Script:** `/home/user/Claude/scripts/deploy-devnet.sh`
  - **Action:** Run complete deployment to devnet
  - **Time:** Record deployment duration
  - **Expected:** <15 minutes for full deployment
  - **If Fails:** Debug script, fix issues

- [ ] **Initialization tested**
  - **Action:** Call `initialize()` instruction on devnet
  - **Verify:** Config PDA created correctly
  - **Verify:** All parameters set as expected
  - **Verify:** Authority matches deployer
  - **If Fails:** Fix initialization logic

- [ ] **First pool creation tested**
  - **Action:** Create CRX/SOL pool on devnet
  - **Verify:** Pool created successfully
  - **Verify:** Virtual reserves calculated correctly
  - **Verify:** Trading works
  - **If Fails:** Fix pool creation logic

- [ ] **Timing analysis**
  - **Record:** Time from deployment to first trade
  - **Target:** <5 minutes (to prevent front-running)
  - **Plan:** Optimize initialization script if needed
  - **If Fails:** Prepare pre-signed transactions

#### Mainnet Deployment Plan
**Responsible:** Lead Developer
**Deadline:** T-3 days, 18:00 UTC

- [ ] **Deployment checklist created**
  - **Document:** Step-by-step deployment procedure
  - **Include:** All commands, expected outputs, error handling
  - **Review:** With entire team
  - **If Fails:** Create checklist before T-1

- [ ] **Rollback plan documented**
  - **Note:** Solana programs CANNOT be upgraded or deleted once deployed
  - **Plan:**
    - If critical bug found: Use emergency pause
    - If initialization fails: Deploy new program (different program ID)
    - If oracle fails: Switch to backup oracle (requires code change)
  - **If Fails:** Document contingencies

- [ ] **Emergency pause procedure tested**
  - **Test:** Call `set_paused(true)` on devnet
  - **Verify:** All trades fail with `ProtocolPaused` error
  - **Test:** Call `set_paused(false)`
  - **Verify:** Trading resumes
  - **If Fails:** Fix pause mechanism immediately

### Monitoring & Alerting Setup

#### Monitoring Infrastructure
**Responsible:** DevOps / Lead Developer
**Deadline:** T-3 days, 14:00 UTC

- [ ] **Transaction monitoring setup**
  - **Tool:** Custom script or service (e.g., Helius webhooks)
  - **Monitor:**
    - Transaction success rate (target >95%)
    - Transaction latency (target <2s)
    - Failed transactions (alert if >5%)
    - Compute unit usage (alert if >180k)
  - **If Fails:** Set up basic logging at minimum

- [ ] **Account monitoring setup**
  - **Monitor:**
    - Config account (detect unauthorized changes)
    - Pool accounts (track creation, graduation)
    - Vault accounts (track balance changes)
    - Fee recipient account (track fee collection)
  - **If Fails:** Manual monitoring required

- [ ] **Oracle monitoring setup**
  - **Monitor:**
    - Price feed staleness (alert if >50s)
    - Confidence intervals (alert if >0.5%)
    - Price anomalies (alert if >10% deviation from expected)
  - **If Fails:** Risk of stale price issues

- [ ] **Alert system configured**
  - **Channels:**
    - PagerDuty / OpsGenie (critical alerts)
    - Telegram / Discord (team notifications)
    - Email (summary alerts)
  - **Thresholds:**
    - Critical: Transaction success rate <90%, oracle stale, vault mismatch
    - Warning: Success rate <95%, high compute units
    - Info: New pools, graduations, config changes
  - **If Fails:** Team may miss critical issues

#### Dashboard Setup
**Responsible:** Frontend Developer (if available)
**Deadline:** T-3 days, 20:00 UTC

- [ ] **Protocol metrics dashboard**
  - **Metrics:**
    - Total pools created
    - Total volume (in CRX and USD)
    - Total fees collected
    - Active pools vs graduated
    - Current TVL
  - **Tool:** Grafana, Metabase, or custom
  - **If Fails:** Use Solana Explorer as fallback

- [ ] **Health check dashboard**
  - **Metrics:**
    - RPC status (up/down, latency)
    - Oracle status (price, confidence, age)
    - Program status (deployed, initialized)
    - Transaction throughput
  - **If Fails:** Manual health checks required

### Team Briefing & Communication

#### Team Preparation
**Responsible:** Project Manager / Founder
**Deadline:** T-3 days, 16:00 UTC

- [ ] **Launch roles assigned**
  - **Roles needed:**
    - Deployment lead (executes deployment)
    - Monitoring lead (watches dashboards)
    - Support lead (handles user questions)
    - Communications lead (social media, announcements)
    - Incident response (handles emergencies)
  - **Backup:** Assign backup for each critical role
  - **If Fails:** Assign roles before T-1

- [ ] **Communication plan finalized**
  - **Pre-launch:**
    - T-24h: "Launching in 24 hours" announcement
    - T-1h: "Launching in 1 hour" announcement
  - **Launch:**
    - T+0: "Deployed!" announcement with program ID
    - T+5min: "Initialization complete"
    - T+15min: "First pool live"
  - **Post-launch:**
    - T+1h: Status update
    - T+6h: Status update
    - T+24h: Launch retrospective
  - **If Fails:** Create communication templates

- [ ] **Support preparation**
  - **Documentation:** User guides, FAQs, troubleshooting
  - **Channels:** Discord, Telegram, Twitter support ready
  - **Team:** Support team briefed on common issues
  - **Hours:** 24/7 coverage for first 72 hours
  - **If Fails:** Limited support capacity

#### External Communication Prep
**Responsible:** Marketing / Communications Lead
**Deadline:** T-2 days, EOD

- [ ] **Launch announcement drafted**
  - **Content:** What, when, how to participate
  - **Assets:** Graphics, videos, demo links
  - **Channels:** Twitter, Discord, Telegram, Blog
  - **Timing:** Publish at T+0 (deployment complete)
  - **If Fails:** Delayed announcement acceptable

- [ ] **User documentation ready**
  - **Guides:**
    - How to create a pool
    - How to trade
    - How fees work
    - What happens at graduation
  - **Examples:** Working SDK code examples
  - **If Fails:** Users may struggle, support load increases

- [ ] **Media outreach (optional)**
  - **Contacts:** Crypto media, Solana-focused publications
  - **Pitch:** Innovative bonding curve, CRX ecosystem growth
  - **Timing:** Coordinate with launch
  - **If Fails:** Organic growth only

---

## T-1 Day (One Day Before)

### Final System Verification

#### Pre-Launch Checklist Review
**Responsible:** Entire Team
**Deadline:** T-1 day, 10:00 UTC

- [ ] **Team meeting: Review all checklists**
  - **Attendees:** All team members
  - **Duration:** 2-3 hours
  - **Agenda:**
    - Review T-7 checklist completion
    - Review T-3 checklist completion
    - Review T-1 checklist items
    - Identify any remaining blockers
    - Assign last-minute tasks
  - **If Fails:** Delay launch if critical items incomplete

- [ ] **Go/No-Go decision poll**
  - **Question:** "Are we ready to launch?"
  - **Criteria:**
    - All critical blockers resolved
    - All tests passing
    - Monitoring operational
    - Team prepared
  - **Decision:** Unanimous "Go" required, or delay launch
  - **If No-Go:** Identify what's needed, set new launch date

#### Infrastructure Final Checks
**Responsible:** DevOps / Lead Developer
**Deadline:** T-1 day, 12:00 UTC

- [ ] **RPC provider confirmed operational**
  - **Test:** Query mainnet-beta RPC
  - **Verify:** Latency <100ms, success rate 100%
  - **Test:** WebSocket connection works
  - **If Fails:** Switch to backup RPC or delay launch

- [ ] **Deployer wallet balance verified**
  - **Check:** `solana balance -k ~/.config/solana/mainnet-deployer.json --url mainnet-beta`
  - **Required:** ≥10 SOL
  - **If Low:** Fund wallet immediately
  - **If Fails:** Cannot deploy

- [ ] **Multisig wallet tested on mainnet**
  - **Test:** Create test transaction on multisig
  - **Test:** All signers can sign
  - **Test:** Transaction executes successfully
  - **If Fails:** Fix multisig setup or use single signer

- [ ] **Oracle feed confirmed on mainnet**
  - **Check:** `solana account <ORACLE_ADDRESS> --url mainnet-beta`
  - **Verify:** Account exists and is Pyth price feed
  - **Test:** Query price, verify reasonable value
  - **If Fails:** Find alternative oracle or delay launch

#### Code Final Verification
**Responsible:** Lead Developer
**Deadline:** T-1 day, 14:00 UTC

- [ ] **DEPLOYER_PUBKEY final verification**
  - **Check:** `grep "DEPLOYER_PUBKEY" programs/creator-amm-v2/src/instructions/initialize.rs`
  - **Verify:** Shows actual deployer wallet address
  - **Verify:** NOT `11111111111111111111111111111111`
  - **Cross-check:** Matches `solana address -k mainnet-deployer.json`
  - **If Fails:** STOP - Update immediately, rebuild, re-test

- [ ] **Program ID confirmed in Anchor.toml**
  - **File:** `/home/user/Claude/Anchor.toml`
  - **Check:** `[programs.mainnet]` section has correct program ID
  - **Verify:** Matches `target/deploy/creator_amm_v2-keypair.json` address
  - **If Fails:** Update Anchor.toml

- [ ] **Final build from clean state**
  - **Actions:**
    ```bash
    git checkout v2.0.0-rc1  # Or final release tag
    anchor clean
    anchor build
    ```
  - **Verify:** Build succeeds, no errors/warnings
  - **Save:** Copy `.so` file and keypair to secure backup
  - **If Fails:** Fix build issues, cannot proceed

- [ ] **Binary hash verification**
  - **Action:** `sha256sum target/deploy/creator_amm_v2.so`
  - **Save:** Store hash in deployment log
  - **Purpose:** Verify deployed binary matches local build
  - **If Fails:** N/A (documentation only)

#### Configuration Parameters Review
**Responsible:** Lead Developer + Product Lead
**Deadline:** T-1 day, 16:00 UTC

- [ ] **Initialize parameters confirmed**
  - **Values to verify:**
    ```
    pre_bonding_fee_bps: 100          // 1% (was 300/3% in devnet)
    pre_bonding_threshold_usd: 40_000_000_000  // $40k (6 decimals)
    post_bonding_fee_bps: 100         // 1%
    graduation_threshold_usd: 40_000_000_000  // $40k (matches pre_bonding)
    anti_sniper_window_slots: 20      // ~8 seconds
    anti_sniper_max_trade_bps: 500    // 5% max trade size
    oracle_max_age_seconds: 60        // 1 minute
    oracle_max_confidence_bps: 100    // 1% max confidence
    ```
  - **Note:** Update deployment script with final parameters
  - **If Fails:** Confirm correct values with stakeholders

- [ ] **Fee recipient address confirmed**
  - **Address:** TBD (multisig or dedicated wallet)
  - **Verify:** Address is accessible and has CRX token account
  - **If Fails:** Create fee recipient wallet and token account

- [ ] **CRX mint address confirmed**
  - **Address:** TBD (must be mainnet CRX token)
  - **Verify:** Mint exists on mainnet
  - **Verify:** Is the official $CRX token (not test token)
  - **If Fails:** Cannot initialize without CRX mint

#### Monitoring Systems Final Test
**Responsible:** DevOps
**Deadline:** T-1 day, 18:00 UTC

- [ ] **All monitoring systems operational**
  - **Test:** Trigger test alert (e.g., manual alarm)
  - **Verify:** Alert received on all channels (PagerDuty, Telegram, Email)
  - **Test:** Dashboard loads and displays data
  - **If Fails:** Fix monitoring or proceed with manual monitoring

- [ ] **Alert contacts verified**
  - **Verify:** All team members' contact info current
  - **Test:** Send test notification to all contacts
  - **Verify:** All acknowledge receipt
  - **If Fails:** Update contact information

#### Team Readiness
**Responsible:** All Team Members
**Deadline:** T-1 day, 20:00 UTC

- [ ] **Launch day availability confirmed**
  - **Required:** All critical roles available for 12+ hours on launch day
  - **Backup:** Backup personnel identified and briefed
  - **Communication:** All team on designated Discord/Slack channel
  - **If Fails:** Delay launch if key personnel unavailable

- [ ] **Emergency contact list finalized**
  - **Contacts:**
    - Lead Developer (mobile + backup)
    - DevOps Lead (mobile + backup)
    - Founder/CEO (mobile)
    - RPC Provider support (email/phone)
    - Multisig signers (all contact info)
  - **Distribution:** Share with all team members
  - **If Fails:** Create contact list before launch

- [ ] **Deployment runbook printed/accessible**
  - **Content:** Step-by-step deployment commands
  - **Include:** Expected outputs, error handling, rollback procedures
  - **Format:** Markdown doc + printed copy
  - **If Fails:** Risk of mistakes during deployment

#### Sleep & Wellness
**Responsible:** All Team Members
**Deadline:** T-1 day, 22:00 UTC

- [ ] **Team members well-rested**
  - **Recommendation:** Full 8 hours sleep before launch day
  - **Avoid:** All-nighters, excessive caffeine, alcohol
  - **Reason:** Clear thinking critical for launch execution
  - **If Fails:** Consider delaying launch 24 hours

- [ ] **Meals planned for launch day**
  - **Plan:** Easy, healthy meals pre-ordered or prepared
  - **Avoid:** Blood sugar crashes, hunger-induced mistakes
  - **If Fails:** N/A (quality of life issue)

- [ ] **Backup power/internet confirmed**
  - **For critical roles:** Have backup internet, charged laptops, power banks
  - **If Fails:** Risk of losing connectivity during critical moment

---

## T-0 (Launch Day)

### Pre-Launch (T-6h to T-0)

#### Final Pre-Flight (T-6h)
**Responsible:** Lead Developer
**Time:** T-6 hours

- [ ] **Team standup meeting**
  - **Attendees:** All team members
  - **Agenda:**
    - Review deployment plan
    - Confirm roles and responsibilities
    - Final go/no-go decision
    - Address any last-minute concerns
  - **Duration:** 30 minutes
  - **If No-Go:** Delay launch, communicate to community

- [ ] **Systems green check**
  - **Check:** RPC provider status (green)
  - **Check:** Monitoring systems operational
  - **Check:** Team communication channels working
  - **Check:** Deployment environment ready
  - **If Fails:** Address issues before proceeding

#### Deployment Preparation (T-3h)
**Responsible:** Deployment Lead
**Time:** T-3 hours

- [ ] **Deployment environment setup**
  - **Actions:**
    ```bash
    # Set Solana CLI to mainnet
    solana config set --url mainnet-beta

    # Set deployer keypair
    solana config set --keypair ~/.config/solana/mainnet-deployer.json

    # Verify balance
    solana balance  # Must show ≥10 SOL

    # Verify configuration
    solana config get
    ```
  - **If Fails:** Fix configuration issues

- [ ] **Program keypair ready**
  - **Location:** `target/deploy/creator_amm_v2-keypair.json`
  - **Verify:** File exists and is not corrupted
  - **Backup:** Have secure backup available
  - **If Fails:** Regenerate from build or use backup

- [ ] **Pre-signed transactions prepared (optional)**
  - **Purpose:** Minimize time between deployment and initialization
  - **Create:** Initialize transaction (unsigned, ready to sign)
  - **Benefit:** Reduces front-running window to <30 seconds
  - **If Fails:** Use manual initialization (higher front-run risk)

#### Final Communication (T-1h)
**Responsible:** Communications Lead
**Time:** T-1 hour

- [ ] **Community notified (T-1h announcement)**
  - **Message:** "Deploying in 1 hour! Program ID: [will be announced]"
  - **Channels:** Twitter, Discord, Telegram
  - **Purpose:** Build anticipation, set expectations
  - **If Fails:** Post announcement at T+0 instead

- [ ] **Support team on standby**
  - **Verify:** All support channels staffed
  - **Briefing:** Support team knows what to expect
  - **FAQs:** Ready to answer common questions
  - **If Fails:** Delayed response to user questions

### Deployment Execution (T-0 to T+30min)

#### Deploy Program (T+0 to T+5min)
**Responsible:** Deployment Lead
**Time:** T+0 (Launch moment!)

**Commands:**
```bash
# T+0: Start deployment
echo "🚀 Starting Scale AMM mainnet deployment at $(date)"

# T+0min: Deploy program (takes 2-3 minutes)
anchor deploy --provider.cluster mainnet-beta

# Save program ID
PROGRAM_ID=$(solana address -k target/deploy/creator_amm_v2-keypair.json)
echo "Program deployed: $PROGRAM_ID"

# Verify deployment
solana program show $PROGRAM_ID --url mainnet-beta
```

**Verification:**
- [ ] **Program deployed successfully**
  - **Verify:** Program account exists on mainnet
  - **Verify:** Program ID matches expected
  - **Save:** Program ID to deployment log
  - **Announce:** Post program ID immediately to prevent fake deployments
  - **If Fails:** Check error message:
    - Insufficient funds → Fund wallet, retry
    - Network error → Switch RPC, retry
    - Program size too large → Optimize, rebuild (MAJOR ISSUE)

- [ ] **Program ownership verified**
  - **Check:** Program upgrade authority is deployer key
  - **Consider:** Immediately revoke upgrade authority (makes program immutable)
  - **Command:** `solana program set-upgrade-authority $PROGRAM_ID --final`
  - **If Fails:** Verify deployer key used for deployment

**Timing:** T+0 to T+5 minutes

#### Initialize Protocol (T+5min to T+10min)
**Responsible:** Deployment Lead
**Time:** T+5 minutes

**CRITICAL:** Must be done within 5 minutes of deployment to prevent front-running!

**Commands:**
```bash
# T+5min: Initialize protocol
# Use pre-prepared script or manual anchor call

# Derive config PDA
CONFIG_PDA=$(solana address --keypair <(echo "[\"config\"]") --program-id $PROGRAM_ID)

# Call initialize (via Anchor TS or Rust client)
anchor run initialize-mainnet  # Or custom script

# Parameters (from T-1 day verification):
# - pre_bonding_fee_bps: 100 (1%)
# - pre_bonding_threshold_usd: 40_000_000_000 ($40k with 6 decimals)
# - post_bonding_fee_bps: 100 (1%)
# - graduation_threshold_usd: 40_000_000_000 ($40k)
# - anti_sniper_window_slots: 20
# - anti_sniper_max_trade_bps: 500 (5%)
# - oracle_max_age_seconds: 60
# - oracle_max_confidence_bps: 100 (1%)
# - approved_quote_tokens: [CRX_MINT, Pubkey::default() x4]
# - approved_quote_count: 1
```

**Verification:**
- [ ] **Initialize transaction successful**
  - **Verify:** Transaction confirmed on-chain
  - **Verify:** Config PDA created
  - **Save:** Transaction signature
  - **If Fails:**
    - Check error message
    - If "Account already initialized" → Someone front-ran! Protocol bricked!
    - If other error → Debug, retry

- [ ] **Config parameters verified**
  - **Check:** Query config account, verify all parameters match expected
  - **Command:** Custom script to deserialize config account
  - **Verify:** Authority is deployer wallet
  - **Verify:** Fee recipient is correct address
  - **Verify:** CRX mint is correct
  - **Verify:** Oracle address is correct
  - **If Fails:** Parameters wrong → MAJOR ISSUE, may need new deployment

**Timing:** T+5 to T+10 minutes

#### Create CRX/SOL Pool (T+10min to T+15min)
**Responsible:** Deployment Lead
**Time:** T+10 minutes

**Purpose:** Create main liquidity pool that all other pools route through

**Commands:**
```bash
# T+10min: Create CRX/SOL pool
# Use SDK or custom script

# Parameters:
# - base_mint: CRX_MINT
# - quote_mint: SOL_WRAPPED_MINT (So11111111111111111111111111111111111111112)
# - supply: [Amount of CRX to bond]
# - initial_market_cap_usd: [Launch market cap for CRX]
# - graduation_threshold_usd: [Graduation target]
# - curve_type: ConstantProduct
# - fee_bps: 100 (1%)
```

**Verification:**
- [ ] **CRX/SOL pool created successfully**
  - **Verify:** Pool account created
  - **Verify:** Vaults created and funded
  - **Verify:** Virtual reserves calculated correctly
  - **Save:** Pool address
  - **Announce:** CRX/SOL pool address to community
  - **If Fails:** Debug, fix, retry

- [ ] **First test trade on CRX/SOL pool**
  - **Action:** Small buy (e.g., 0.01 SOL → CRX)
  - **Verify:** Trade executes successfully
  - **Verify:** Reserves update correctly
  - **Verify:** Fees collected
  - **If Fails:** Debug immediately, may indicate critical bug

**Timing:** T+10 to T+15 minutes

#### Initial Validation (T+15min to T+30min)
**Responsible:** Monitoring Lead
**Time:** T+15 minutes

- [ ] **All accounts created correctly**
  - **Check:** Config PDA exists and initialized
  - **Check:** CRX/SOL pool exists
  - **Check:** Vaults exist and have correct balances
  - **Check:** Fee recipient has CRX token account
  - **If Fails:** Create missing accounts manually

- [ ] **Monitoring systems receiving data**
  - **Check:** Transaction logs showing in monitoring
  - **Check:** Dashboard updating with pool data
  - **Check:** Alerts system functional
  - **If Fails:** Fix monitoring (non-blocking)

- [ ] **No critical errors in logs**
  - **Check:** Review all transaction logs
  - **Look for:** Error codes, failed transactions, unusual behavior
  - **If Found:** Investigate immediately

**Timing:** T+15 to T+30 minutes

### Post-Launch Communication (T+30min to T+1h)

#### Announcements
**Responsible:** Communications Lead
**Time:** T+30 minutes

- [ ] **Launch announcement posted**
  - **Content:**
    ```
    🚀 Scale AMM is now LIVE on Solana Mainnet!

    Program ID: [PROGRAM_ID]
    CRX/SOL Pool: [POOL_ADDRESS]

    Start creating and trading bonding curve pools powered by $CRX!

    Docs: [link]
    SDK: [link]
    ```
  - **Channels:** Twitter, Discord, Telegram, Blog
  - **Timing:** Within 30 minutes of successful deployment
  - **If Fails:** Post as soon as ready

- [ ] **Block explorer links shared**
  - **Links:**
    - Program: `https://solscan.io/account/$PROGRAM_ID`
    - Config: `https://solscan.io/account/$CONFIG_PDA`
    - CRX/SOL Pool: `https://solscan.io/account/$POOL_ADDRESS`
  - **Purpose:** Transparency, verification
  - **If Fails:** Share links when available

#### Documentation Updates
**Responsible:** Developer Relations
**Time:** T+30 minutes

- [ ] **README updated with mainnet addresses**
  - **File:** `/home/user/Claude/README.md`
  - **Updates:** Add program ID, pool addresses, mainnet examples
  - **If Fails:** Update within 24 hours

- [ ] **SDK updated with mainnet defaults**
  - **Files:** SDK configuration files
  - **Updates:** Default to mainnet-beta, use real program ID
  - **If Fails:** Users will need manual configuration

---

## T+24h (First Day After)

### Health Monitoring

#### Continuous Monitoring (First 24 Hours)
**Responsible:** Monitoring Lead (rotating shifts)
**Time:** T+0 to T+24h

- [ ] **Transaction success rate monitoring**
  - **Target:** >95% success rate
  - **Check:** Every 15 minutes for first 6 hours, then hourly
  - **Alert:** If success rate drops below 90%
  - **Action:** Investigate failed transactions, identify patterns
  - **If Issues:** May need to pause protocol, communicate to users

- [ ] **Oracle health monitoring**
  - **Check:** Oracle price updates regularly
  - **Check:** Confidence intervals acceptable (<1%)
  - **Check:** No stale prices (age <60s)
  - **Alert:** If any oracle issue detected
  - **Action:** Switch to backup oracle if configured, or pause protocol
  - **If Issues:** Critical - may need emergency pause

- [ ] **Vault balance monitoring**
  - **Check:** Real reserves == vault balances (every hour)
  - **Check:** No unexpected balance changes
  - **Alert:** If ANY mismatch detected
  - **Action:** Immediate investigation, likely critical bug
  - **If Issues:** Pause protocol immediately, investigate thoroughly

- [ ] **Compute unit tracking**
  - **Check:** Average and max CU per transaction
  - **Target:** Average <120k, max <180k
  - **Alert:** If any transaction exceeds 200k (will fail)
  - **Action:** Identify what causes high CU usage
  - **If Issues:** May need to optimize or limit certain operations

- [ ] **Fee collection verification**
  - **Check:** Fees being collected to fee_recipient account
  - **Check:** Fee amounts match expected (1% of volume)
  - **Alert:** If fees not collecting properly
  - **Action:** Investigate fee calculation logic
  - **If Issues:** May indicate logic bug, not critical to protocol safety

### Pool Activity Monitoring

#### First Pools Created (T+1h to T+24h)
**Responsible:** Monitoring Lead
**Ongoing**

- [ ] **Track first 10 pools created**
  - **Monitor:**
    - Pool creation parameters (market cap, graduation threshold, fees)
    - Creators (addresses)
    - Initial trading activity
    - Time to graduation (if any graduate in first 24h)
  - **Purpose:** Understand user behavior, identify issues
  - **If Issues:** Provide user support, document edge cases

- [ ] **Monitor for unusual pool parameters**
  - **Watch for:**
    - Extremely high market caps (potential overflow)
    - Extremely low market caps (dust)
    - Unusual fee structures
    - Rapid pool creation from single address (spam?)
  - **Action:** Investigate, ensure protocol handles correctly
  - **If Issues:** May need to communicate best practices to users

- [ ] **Graduation events tracking**
  - **Monitor:** When pools graduate (if any in first 24h)
  - **Verify:**
    - Phase transition occurs correctly
    - Virtual → real reserves switch
    - Trading continues post-graduation
    - Event emitted correctly
  - **If Issues:** Indicates potential graduation bug, high priority

### User Support

#### Support Monitoring (T+0 to T+72h)
**Responsible:** Support Lead (24/7 coverage)
**Ongoing**

- [ ] **Support channels monitored 24/7**
  - **Channels:** Discord, Telegram, Twitter DMs, Email
  - **Response time:** <15 minutes for first 24h
  - **Escalation:** Technical issues escalated to dev team immediately
  - **If Issues:** May need more support staff

- [ ] **Common issues documented**
  - **Track:**
    - Most frequent user questions
    - Most frequent errors
    - Confusion points in UX/documentation
  - **Action:** Create FAQ, update docs, improve error messages
  - **If Issues:** Indicates documentation gaps

- [ ] **Bug reports triaged**
  - **Process:**
    - Collect bug report details
    - Reproduce if possible
    - Assign severity (critical, high, medium, low)
    - Escalate critical/high to dev team
    - Track in issue tracker
  - **Action:** Fix critical bugs immediately, schedule others
  - **If Critical Bugs:** May need emergency pause

### Incident Response Readiness

#### Emergency Procedures Ready
**Responsible:** Incident Response Lead
**Ongoing**

- [ ] **Emergency pause ready to execute**
  - **Pre-prepared:** Transaction to call `set_paused(true)`
  - **Signers:** Multisig signers on standby (if using multisig)
  - **Decision authority:** Who can call emergency pause (Founder? Lead Dev?)
  - **Communication:** Template messages ready for "Protocol paused" announcement
  - **If Needed:** Execute pause within 5 minutes of critical bug discovery

- [ ] **Incident response plan reviewed**
  - **Steps:**
    1. Identify issue severity
    2. Pause protocol if critical (funds at risk)
    3. Investigate root cause
    4. Communicate to users (be transparent)
    5. Develop fix plan (may require new deployment)
    6. Execute fix
    7. Resume protocol (unpause)
    8. Post-mortem analysis
  - **If Issues:** Follow plan, document everything

- [ ] **Post-mortem template ready**
  - **Template:**
    - What happened
    - Timeline of events
    - Root cause analysis
    - Impact assessment (users affected, funds at risk)
    - Remediation steps taken
    - Lessons learned
    - Action items to prevent recurrence
  - **Purpose:** Transparency, learning, improvement
  - **If Incident:** Publish post-mortem within 48 hours

### Performance Analysis

#### Metrics Collection (T+24h)
**Responsible:** Analytics Lead
**Time:** T+24 hours

- [ ] **First 24h metrics compiled**
  - **Metrics:**
    - Total pools created
    - Total volume traded (CRX and USD)
    - Total fees collected
    - Unique users (wallets)
    - Transaction success rate
    - Average transaction latency
    - Average compute units used
    - Any pools graduated
  - **Purpose:** Understand initial traction, identify optimization opportunities
  - **If Issues:** Adjust expectations, plan improvements

- [ ] **Performance report published (internal)**
  - **Audience:** Team only (for first 24h)
  - **Content:** Metrics, observations, issues encountered, action items
  - **Purpose:** Team alignment, celebrate successes, plan next steps
  - **If Issues:** Share learnings, adjust strategy

### Retrospective

#### Launch Retrospective (T+24h to T+48h)
**Responsible:** Entire Team
**Time:** T+24 to T+48 hours

- [ ] **Team retrospective meeting**
  - **Attendees:** All team members
  - **Duration:** 1-2 hours
  - **Agenda:**
    - What went well
    - What could be improved
    - Surprising issues encountered
    - Action items for next release
  - **Purpose:** Learn, improve, celebrate
  - **If Issues:** Document lessons learned

- [ ] **Public launch retrospective (optional)**
  - **Timing:** T+48h to T+7 days
  - **Content:** High-level launch story, metrics, challenges overcome
  - **Channels:** Blog post, Twitter thread
  - **Purpose:** Transparency, community engagement, attract users
  - **If Issues:** Delay if still handling critical issues

---

## Emergency Procedures

### Critical Bug Found

#### Immediate Actions
**Responsible:** Incident Response Lead
**Timeframe:** 0-5 minutes

1. **[ ] Assess severity**
   - **Critical:** Funds at risk, exploit possible → Immediate pause
   - **High:** Functionality broken but funds safe → Pause recommended
   - **Medium/Low:** Degraded experience but safe → Monitor, plan fix

2. **[ ] Execute emergency pause (if critical)**
   - **Action:** Call `set_paused(true)` via multisig
   - **Verify:** All trades now fail with `ProtocolPaused` error
   - **Timing:** Within 5 minutes of discovery

3. **[ ] Notify team**
   - **Channel:** Emergency communication channel (PagerDuty, phone)
   - **Message:** "Critical bug found. Protocol paused. All hands on deck."
   - **Assemble:** Core team for emergency meeting

#### Investigation (5-30 minutes)

4. **[ ] Investigate root cause**
   - **Actions:**
     - Reproduce bug
     - Identify affected code
     - Assess impact (how many users, how much funds)
     - Determine if funds are at risk or already lost
   - **Document:** Everything for post-mortem

5. **[ ] Communicate to users**
   - **Timing:** Within 15 minutes of pause
   - **Message template:**
     ```
     ⚠️ PROTOCOL PAUSED

     We've identified a [critical/high] issue with Scale AMM and have
     paused the protocol as a precaution.

     Status: All funds are safe. Trading is temporarily disabled.

     We're investigating and will provide updates every 30 minutes.

     Next update: [TIME]
     ```
   - **Channels:** Twitter, Discord, Telegram (pinned messages)

#### Resolution (30 minutes - 48 hours)

6. **[ ] Develop fix plan**
   - **Options:**
     - Hot fix: Simple parameter change via `update_config` → Resume in hours
     - Code fix: Requires new deployment → May take days/weeks
     - Workaround: Change operational procedures → May work short-term
   - **Decision:** Choose based on severity and fix complexity

7. **[ ] Execute fix**
   - **If hot fix:** Update config, test on devnet, deploy to mainnet, unpause
   - **If code fix:**
     - Cannot update immutable program
     - Must deploy NEW program (different program ID)
     - Users must migrate to new program
     - Coordinate migration plan
   - **If workaround:** Implement, document, communicate to users

8. **[ ] Resume protocol (if safe)**
   - **Pre-requisites:**
     - Fix verified on devnet
     - Team consensus that it's safe
     - Communication prepared
   - **Action:** Call `set_paused(false)`
   - **Verify:** Trades work correctly
   - **Announce:** "Protocol resumed" message

9. **[ ] Post-mortem**
   - **Timing:** Within 48 hours of incident resolution
   - **Publish:** Transparent post-mortem report
   - **Include:** What happened, why, how fixed, how preventing future

### Oracle Failure

#### Symptoms
- Oracle price age >60 seconds
- Oracle price anomalous (>10x expected)
- Oracle confidence >1%
- Oracle account unavailable

#### Actions
**Responsible:** Incident Response Lead
**Timeframe:** Immediate

1. **[ ] Verify oracle failure**
   - **Check:** Query oracle account directly
   - **Check:** Compare to other price sources (Birdeye, CoinGecko)
   - **Determine:** Is oracle wrong, or is price actually moving?

2. **[ ] If oracle truly failed:**
   - **Impact:** All trades will fail automatically (staleness check)
   - **No pause needed:** Protocol self-protects by rejecting stale prices
   - **Action:** Work with oracle provider to restore feed

3. **[ ] If oracle is wrong but updating:**
   - **Impact:** Virtual reserves calculated incorrectly, potential arbitrage
   - **Action:** Consider emergency pause while investigating
   - **Long-term:** Need backup oracle or manual override (requires code change)

4. **[ ] Communicate to users**
   - **Message:** "Oracle price feed temporarily unavailable. Protocol is safe but trading is disabled until restored."
   - **Timeline:** Provide updates every hour

5. **[ ] Switch to backup oracle (if configured)**
   - **Note:** Current code only supports single oracle
   - **Would require:** Code change + new deployment to support multiple oracles

### RPC Provider Failure

#### Symptoms
- High latency (>1s)
- Transaction failures
- Connection timeouts
- 429 rate limit errors

#### Actions
**Responsible:** DevOps
**Timeframe:** 0-15 minutes

1. **[ ] Verify RPC failure**
   - **Check:** RPC health endpoint
   - **Check:** Alternative RPC (does it work?)
   - **Determine:** Is failure on our end or provider side?

2. **[ ] Switch to backup RPC**
   - **Action:** Update RPC URL in deployment configuration
   - **Verify:** Transactions succeed on new RPC
   - **No protocol impact:** This is infrastructure only, protocol unaffected

3. **[ ] Notify provider**
   - **Contact:** Primary RPC provider support
   - **Report:** Issue details, request ETA for resolution
   - **Decision:** When to switch back (after confirmed stable)

4. **[ ] Update monitoring**
   - **Action:** Add multi-RPC health checks
   - **Alert:** If any RPC fails, automatically notify team

### Vault/Reserve Mismatch

#### Symptoms
- `real_quote_reserves != quote_vault.amount`
- `real_base_reserves != base_vault.amount`
- Unexpected vault balance changes

#### Actions
**Responsible:** Lead Developer
**Timeframe:** IMMEDIATE (Highest Priority)

1. **[ ] PAUSE PROTOCOL IMMEDIATELY**
   - **Why:** Reserve mismatch indicates accounting bug, potential exploit
   - **Action:** Call `set_paused(true)` within 60 seconds

2. **[ ] Assess damage**
   - **Check:** How much discrepancy (1 lamport vs. millions)
   - **Check:** When did mismatch start (review transaction history)
   - **Check:** Is mismatch growing (active exploit) or static (past bug)
   - **Check:** Are funds missing or just miscounted?

3. **[ ] Identify root cause**
   - **Review:** All recent trades leading to mismatch
   - **Look for:**
     - Unchecked arithmetic overflow/underflow
     - Missing reserve update after token transfer
     - Race condition in concurrent trades
     - Exploit transaction (unusual pattern)
   - **Priority:** Highest - This is critical security bug

4. **[ ] Communicate (carefully)**
   - **If funds safe:** "Protocol paused for accounting discrepancy. All funds safe. Investigating."
   - **If funds at risk/lost:** "Critical issue detected. Protocol paused. Investigation underway. More details soon."
   - **Transparency:** Be honest about severity, provide frequent updates

5. **[ ] Plan remediation**
   - **If small discrepancy (rounding error):** May be acceptable, document, unpause
   - **If large discrepancy:** Critical bug, requires new deployment
   - **If funds lost:** Assess compensation options (team funds, insurance, etc.)

6. **[ ] Recovery plan**
   - **Cannot fix current deployment** (immutable)
   - **Must deploy new program** with fix
   - **Migration plan:** How to move users/liquidity to new program
   - **Timeline:** Could take days to weeks

### Front-Running of Initialization

#### Symptoms
- Initialization transaction fails with "Account already initialized"
- Config authority is not deployer wallet
- Unexpected config parameters

#### Actions
**Responsible:** Lead Developer
**Timeframe:** IMMEDIATE

1. **[ ] Verify front-running**
   - **Check:** Config account owner
   - **Check:** Config authority pubkey
   - **Check:** Initialization transaction signature
   - **Determine:** Was it malicious or our own mistake?

2. **[ ] If front-run by malicious actor:**
   - **Impact:** PROTOCOL BRICKED - Cannot be recovered
   - **Reason:** Config PDA can only be initialized once, attacker now controls protocol
   - **Action:** Deploy NEW program with different program ID
   - **Prevention:** Next time, use pre-signed transaction to minimize window

3. **[ ] If initialized by mistake (our team):**
   - **Check:** Are parameters correct?
   - **If correct:** Proceed normally, just different signer than expected
   - **If incorrect:** Protocol bricked, must deploy new program

4. **[ ] Communicate**
   - **If front-run:** "Initialization was front-run by malicious actor. Deploying new program. Stand by."
   - **Timeline:** 2-3 hours for new deployment
   - **Compensation:** Consider airdrop to early supporters for inconvenience

5. **[ ] Deploy new program**
   - **Action:** Full deployment process again
   - **Change:** Use different program ID (new keypair)
   - **Speed:** Prepare pre-signed initialization transaction
   - **Execute:** Deploy + initialize in <1 minute window

---

## Critical Metrics Dashboard

### Real-Time Metrics (Update every 1 minute)

**Protocol Health:**
- [ ] Protocol Status: `Active` / `Paused` / `Error`
- [ ] Config Authority: [Expected wallet] / [Unexpected - ALERT]
- [ ] Oracle Price: $X.XX (age: Xs, confidence: X%)
- [ ] Oracle Status: `Fresh` / `Stale - ALERT` / `Failed - CRITICAL`

**Transaction Metrics:**
- [ ] Success Rate (1h): XX% (Target: >95%, Alert: <90%)
- [ ] Average Latency: XXXms (Target: <2s, Alert: >5s)
- [ ] Compute Units (avg): XXXk CU (Target: <120k, Alert: >180k)
- [ ] Failed Transactions (1h): XX (Alert if: >10)

**Pool Metrics:**
- [ ] Total Pools: XX
- [ ] Pools Graduated: XX
- [ ] Total Volume (24h): XX CRX ($XXX USD)
- [ ] Total Fees Collected: XX CRX ($XXX USD)

**Vault Health:**
- [ ] Reserve/Vault Match: `OK` / `MISMATCH - CRITICAL`
- [ ] Unexpected Transfers: `None` / `DETECTED - ALERT`

**RPC Health:**
- [ ] Primary RPC: `UP` (latency: XXms) / `DOWN - SWITCH`
- [ ] Backup RPC: `UP` / `DOWN`

### Alert Thresholds

**CRITICAL (Immediate Action):**
- Reserve/vault mismatch
- Config authority changed
- Oracle stale (>90s)
- Transaction success rate <80%

**HIGH (Action within 15 minutes):**
- Transaction success rate <90%
- Oracle confidence >2%
- Compute units >180k average
- RPC latency >5s

**MEDIUM (Action within 1 hour):**
- Transaction success rate <95%
- Failed transactions >10 in 1 hour
- Unusual pool parameters detected

**LOW (Review daily):**
- Compute units >120k average
- Support tickets increasing

---

## Sign-Off Checklist

**All items must be checked before proceeding to launch:**

### T-7 Days Sign-Off
- [ ] Code quality verified (Lead Developer)
- [ ] All critical tests passing (QA Lead)
- [ ] Security review complete (Security Lead)
- [ ] Infrastructure ready (DevOps)
- [ ] Documentation complete (Tech Writer)

**Signed:** _________________ Date: _______

### T-3 Days Sign-Off
- [ ] Code freeze executed (Lead Developer)
- [ ] Deployment rehearsal successful (DevOps)
- [ ] Monitoring operational (Monitoring Lead)
- [ ] Team briefed (Project Manager)
- [ ] Communication plan ready (Marketing)

**Signed:** _________________ Date: _______

### T-1 Day Sign-Off
- [ ] DEPLOYER_PUBKEY verified (Lead Developer)
- [ ] Final build clean (Lead Developer)
- [ ] Configuration confirmed (Product Lead)
- [ ] Team ready (All)
- [ ] Go/No-Go: **GO** / **NO-GO**

**Signed:** _________________ Date: _______

If **NO-GO**, reason: _________________________________

New launch date: _________________________________

---

## Appendix: Quick Reference

### Critical Files
```
/home/user/Claude/programs/creator-amm-v2/src/instructions/initialize.rs  # DEPLOYER_PUBKEY
/home/user/Claude/programs/creator-amm-v2/src/state.rs                    # Pool logic
/home/user/Claude/programs/creator-amm-v2/src/utils/oracle.rs             # Oracle validation
/home/user/Claude/programs/creator-amm-v2/src/errors.rs                   # Error codes
/home/user/Claude/DEPLOYMENT.md                                            # Deployment guide
/home/user/Claude/Anchor.toml                                              # Program IDs
```

### Critical Commands
```bash
# Set to mainnet
solana config set --url mainnet-beta

# Check balance
solana balance

# Deploy program
anchor deploy --provider.cluster mainnet-beta

# Get program ID
solana address -k target/deploy/creator_amm_v2-keypair.json

# Verify deployment
solana program show <PROGRAM_ID>

# Emergency pause
# (Use custom script to call set_paused instruction)
```

### Contact Information
**RPC Provider Support:**
- Helius: support@helius.xyz, Discord

**Pyth Network Support:**
- Discord: #support channel

**Team Emergency Contacts:**
- Lead Developer: [PHONE]
- DevOps: [PHONE]
- Founder: [PHONE]

### Useful Links
- Solana Explorer: https://solscan.io
- Pyth Price Feeds: https://pyth.network/developers/price-feed-ids
- Anchor Docs: https://www.anchor-lang.com
- Squads (Multisig): https://squads.so

---

**END OF CHECKLIST**

**Remember:** Solana programs are IMMUTABLE. There are no second chances. Triple-check everything.

**Last Updated:** 2026-01-08
**Version:** 1.0
**Maintained By:** Scale AMM Team
