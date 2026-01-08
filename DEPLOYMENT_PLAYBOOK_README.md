# Scale AMM - Deployment Playbook

**Complete mainnet deployment documentation package**

---

## Overview

This deployment playbook provides comprehensive guidance for launching Scale AMM to Solana mainnet. The protocol is **permissionless once deployed** - meaning there's no upgrade mechanism, no iteration, and no second chances. These documents ensure a successful, secure, and well-coordinated launch.

---

## Document Structure

### 📘 Core Documents (4 files)

| Document | Size | Purpose | When to Use |
|----------|------|---------|-------------|
| **MAINNET_DEPLOYMENT_GUIDE.md** | 74 KB | Complete reference guide | Read fully during prep (Week 2-3) |
| **LAUNCH_DAY_CHECKLIST.md** | 6.7 KB | Quick reference for deployment | Keep open during launch day |
| **DEPLOYMENT_ARTIFACTS_TEMPLATE.md** | 15 KB | Record-keeping template | Fill out during/after deployment |
| **GO_NO_GO_DECISION_FORM.md** | 14 KB | Pre-launch decision template | Use at T-24h meeting |

### 📋 Related Documents (Already existed)

| Document | Purpose |
|----------|---------|
| **DEPLOYMENT_CHECKLIST.md** | Basic checklist (now superseded by comprehensive guide) |
| **DEPLOYER_WARNING.md** | Critical warning about DEPLOYER_PUBKEY |
| **CLAUDE.md** | Project context and conventions |

---

## How to Use This Playbook

### Phase 1: Preparation (Weeks 1-2)

**Week 1: Development & Testing**
1. Read **CLAUDE.md** for project context
2. Read **WHAT_IT_DOES.md** for protocol understanding
3. Complete all code development
4. Implement 103 tests (currently 7,252 lines of tests)
5. Run security checks

**Week 2: Pre-Launch Preparation**
1. **READ MAINNET_DEPLOYMENT_GUIDE.md IN FULL** (required for all team members)
   - Section 1: Complete all pre-launch checklist items
   - Section 7: Understand risk mitigation strategies
   - Section 5: Memorize emergency response procedures

2. Deploy to devnet using `scripts/deploy-devnet.sh`

3. Run 72-hour soak test on devnet:
   - 10,000+ trades
   - Multiple pools
   - Test graduation mechanics
   - Test emergency pause
   - Monitor for exploits

4. Complete performance optimization:
   - Target: <50k compute units per trade
   - Currently: ~100k CU (acceptable but needs optimization)

5. Set up infrastructure:
   - RPC providers (primary + backup)
   - Monitoring dashboard
   - Alert system
   - Multisig wallet

### Phase 2: Pre-Launch (Week 3, T-24h)

**T-24 Hours: Go/No-Go Meeting**

1. **Use GO_NO_GO_DECISION_FORM.md:**
   - All stakeholders meet
   - Review every checklist item
   - Verify critical blockers (ALL must be YES)
   - Vote GO or NO-GO
   - Document decision with signatures

2. **Critical Verification (T-4 hours):**
   ```bash
   # MOST IMPORTANT CHECK:
   grep "DEPLOYER_PUBKEY" programs/creator-amm-v2/src/instructions/initialize.rs
   # MUST show your actual wallet, NOT "11111111111111111111111111111111"

   # If still shows placeholder, DO NOT DEPLOY!
   ```

3. **Team Assembly (T-1 hour):**
   - All team members in war room
   - Roles confirmed
   - Scripts tested
   - Emergency contacts shared

### Phase 3: Launch Day (T-0)

**USE LAUNCH_DAY_CHECKLIST.md FOR THIS PHASE**

Keep this file open in a window during deployment. Check off items as you go.

**Key Timeline:**
```
T-30m:  Deploy program to mainnet
T-25m:  Verify deployment
T-20m:  Initialize config (CRITICAL - must be within 1 minute of deploy!)
T-18m:  Verify config
T-15m:  Create CRX/SOL pool
T-10m:  Execute test trades
T-5m:   Verify accounting
T+0m:   Soft launch (private community)
T+2h:   Public announcement (if stable)
```

**Most Critical Step:**
```bash
# Immediately after deployment (within 60 seconds):
npx ts-node scripts/initialize-mainnet.ts

# This MUST succeed. You're racing front-runners.
# But DEPLOYER_PUBKEY protection means only you can initialize.
```

### Phase 4: During & After Deployment

**USE DEPLOYMENT_ARTIFACTS_TEMPLATE.md**

Fill this out in real-time during deployment:

1. **During Deployment:**
   - Program ID and transaction signature
   - Config PDA address
   - Timestamps for each step
   - Any issues encountered

2. **First 24 Hours:**
   - Transaction metrics
   - Pool creation stats
   - User engagement
   - Any incidents

3. **After 24 Hours:**
   - Complete all sections
   - Add lessons learned
   - Get team sign-off
   - Commit to repository as `DEPLOYMENT_ARTIFACTS_MAINNET_[DATE].md`

---

## Quick Reference: Critical Checks

### Before Deployment

**The #1 Blocker:**
```bash
grep "11111111111111111111111111111111" programs/creator-amm-v2/src/instructions/initialize.rs
```
**MUST return NOTHING**. If it shows the placeholder, DO NOT DEPLOY!

**Run These Commands:**
```bash
# Verify DEPLOYER_PUBKEY is your wallet
solana address
# Should match the DEPLOYER_PUBKEY in initialize.rs

# Clean build
anchor clean && anchor build
# Must complete with 0 errors

# Run all tests
anchor test
# Must be 100% passing

# Check binary size
ls -lh target/deploy/creator_amm_v2.so
# Must be <500 KB

# Verify Solana config
solana config get
# Must show mainnet-beta

# Check balance
solana balance
# Must have >5 SOL
```

### Launch Day Commands

**Deployment:**
```bash
anchor deploy --provider.cluster mainnet-beta 2>&1 | tee logs/mainnet-deploy.log
```

**Initialize (IMMEDIATELY after deploy):**
```bash
npx ts-node scripts/initialize-mainnet.ts
```

**Emergency Pause (if needed):**
```bash
npx ts-node scripts/emergency-pause.ts
```

---

## Document Details

### MAINNET_DEPLOYMENT_GUIDE.md (74 KB)

**Complete reference covering:**

**Section 1: Pre-Launch Checklist** (11 subsections)
- Code verification (DEPLOYER_PUBKEY, security)
- Build verification (clean build, binary size)
- Test suite (103 tests, >95% coverage)
- Devnet testing (72-hour soak test)
- Performance (compute units)
- Infrastructure (RPC, monitoring, multisig)
- Legal & compliance
- Team readiness
- Documentation

**Section 2: Launch Sequence** (detailed timeline)
- T-24h: Final review
- T-4h: Team assembly
- T-1h: Final verification
- T-0: Deploy, initialize, test
- T+2h: Public announcement

**Section 3: Post-Launch Monitoring**
- First 24 hours (maximum intensity)
- First week (high vigilance)
- First month (steady state)
- Ongoing monitoring

**Section 4: Rollback Procedures**
- What's possible (limited - permissionless protocol)
- Emergency pause procedure
- "Rollback" via new deployment

**Section 5: Emergency Response Plan**
- Incident severity levels (P0-P3)
- Response workflows
- Communication chains
- Escalation procedures

**Section 6: Communication Templates**
- Pre-launch announcements
- Incident communications (P0-P3)
- Routine updates
- Maintenance windows

**Section 7: Risk Mitigation Strategies**
- Pre-launch risks (DEPLOYER_PUBKEY, tests, security)
- Launch risks (front-running, network congestion)
- Post-launch risks (exploits, oracle, slippage)
- Long-term risks (obsolescence, regulation)

**Section 8: Go/No-Go Decision Criteria**
- Critical must-haves (absolute blockers)
- High-priority items (can waive with justification)
- Nice-to-haves (not blockers)
- Decision framework with examples

**Appendices:**
- Useful commands
- Contact information template
- Deployment artifacts checklist
- Post-launch task list
- Success metrics

---

### LAUNCH_DAY_CHECKLIST.md (6.7 KB)

**Quick-reference single-page checklist:**

- Pre-deployment checks (T-1 hour)
- 10-step deployment sequence with commands
- Emergency procedures (pause, retry)
- Artifacts to save
- Contact info template
- Success criteria
- Common issues & solutions
- Decision points (when to announce, when to pause)

**How to use:**
- Print or keep open in a window
- Check off items as you complete them
- Reference emergency procedures if needed
- Have all team members follow along

---

### DEPLOYMENT_ARTIFACTS_TEMPLATE.md (15 KB)

**Comprehensive record-keeping template with 20 sections:**

1. Deployment metadata
2. Program deployment (ID, hash, transaction)
3. Configuration initialization (parameters)
4. CRX token information
5. Oracle information
6. Primary pool (CRX/SOL)
7. Test trades (first buy, first sell)
8. Authority & access control
9. RPC & infrastructure
10. Deployment timeline
11. First 24 hours metrics (usage, performance, revenue)
12. Issues & incidents (log any problems)
13. Security events
14. Communication log
15. Team members
16. Post-deployment actions
17. Links & resources
18. Backup & recovery
19. Lessons learned
20. Sign-off & verification

**How to use:**
- Open during deployment
- Fill in real-time as events occur
- Complete remaining sections in first 24 hours
- Add lessons learned after retrospective
- Get team sign-off
- Commit to repository as official record

---

### GO_NO_GO_DECISION_FORM.md (14 KB)

**Structured decision-making template for T-24h meeting:**

**Critical Blockers (12 items - ALL must be YES):**
1. DEPLOYER_PUBKEY updated
2. No unchecked arithmetic
3. Oracle validation complete
4. All tests pass
5. Devnet soak test complete
6. Security tests pass
7. Clean build succeeds
8. Program size within limits
9. Team available
10. Monitoring operational
11. RPC providers confirmed
12. Multisig ready

**High-Priority Items (4 items - can waive with justification):**
13. Compute units acceptable (<100k)
14. Code coverage >95%
15. External security audit
16. Monitoring dashboard

**Nice-to-Haves (not blockers):**
- Documentation, marketing, features

**Includes:**
- Discussion section for concerns
- Individual vote forms (Tech Lead, Security Lead, CEO)
- Weighted voting system (50/30/20)
- Risk acceptance documentation
- Signatures
- Next steps (GO or NO-GO paths)

**How to use:**
- Schedule meeting at T-24h before launch
- All stakeholders attend
- Review each item systematically
- Document concerns and discuss
- Vote (individual + weighted)
- Record decision with signatures
- Execute launch plan (GO) or gap resolution (NO-GO)

---

## Pre-Launch Preparation Checklist

**Use this to track your progress through Week 1-3:**

### Week 1: Development
- [ ] All features implemented
- [ ] 103 tests implemented and passing
- [ ] Code coverage >95%
- [ ] No TODOs/FIXMEs in critical paths
- [ ] All arithmetic is checked (no unwrap/panic)
- [ ] Security review complete

### Week 2: Devnet Testing
- [ ] DEPLOYER_PUBKEY updated (verify 3x times!)
- [ ] Deployed to devnet successfully
- [ ] 72-hour soak test running
- [ ] 10,000+ trades executed
- [ ] Multiple pools created and graduated
- [ ] Emergency pause tested
- [ ] Zero exploits discovered

### Week 3: Mainnet Preparation
- [ ] All team members read MAINNET_DEPLOYMENT_GUIDE.md
- [ ] RPC providers contracted (primary + backup)
- [ ] Monitoring systems deployed
- [ ] Alert system configured and tested
- [ ] Multisig wallet created and tested
- [ ] Communication templates customized
- [ ] Emergency contact info shared
- [ ] War room Discord channel created
- [ ] Go/No-Go meeting scheduled

### T-24 Hours
- [ ] Go/No-Go meeting completed
- [ ] Decision: GO (with conditions documented)
- [ ] Launch time confirmed
- [ ] Team assignments confirmed
- [ ] All team members available and ready

### T-4 Hours
- [ ] Team assembled in war room
- [ ] DEPLOYER_PUBKEY verified one final time
- [ ] Clean build completed
- [ ] Solana CLI configured for mainnet
- [ ] Deployer wallet has >5 SOL
- [ ] Initialize script ready and tested
- [ ] Monitoring systems live

### T-0 (Launch)
- [ ] Follow LAUNCH_DAY_CHECKLIST.md step-by-step
- [ ] Fill out DEPLOYMENT_ARTIFACTS_TEMPLATE.md in real-time

---

## Success Criteria

### Launch Day Success (T+24h)

✅ **Technical:**
- Uptime >99%
- Transaction success rate >99%
- Zero security incidents
- Reserves match vault balances
- Fees collecting correctly

✅ **Adoption:**
- >10 pools created
- >$10k volume
- >50 unique users
- Positive community sentiment

✅ **Team:**
- All systems monitored
- No critical incidents
- Team morale high
- Lessons documented

### Week 1 Success (T+7 days)

✅ **Growth:**
- TVL >$100k
- >100 pools created
- >$100k volume
- >500 unique users

✅ **Product:**
- At least 1 token graduated
- No critical bugs discovered
- User feedback positive

✅ **Business:**
- Protocol revenue >$1k
- Ecosystem developing
- Partnerships forming

### Month 1 Success (T+30 days)

✅ **Scale:**
- TVL >$1M
- >1,000 pools
- >$1M volume
- >5,000 unique users

✅ **Maturity:**
- Protocol stable and battle-tested
- Feature roadmap for months 2-6
- Community self-sustaining
- Competitors emerging (validation!)

---

## Emergency Scenarios

### Scenario 1: Initialize Transaction Fails

**Symptoms:** Transaction rejected, error message shown

**Response:**
1. Read error message carefully
2. Check parameters in script (likely issue)
3. Verify wallet has SOL for fees
4. Retry IMMEDIATELY (clock is ticking)
5. If repeated failure, check DEPLOYER_PUBKEY matches

**Time Pressure:** You have ~60-120 seconds before front-runners could attempt (but DEPLOYER_PUBKEY protection means only you can succeed)

---

### Scenario 2: Test Trades Fail After Deploy

**Symptoms:** Buy or sell transactions fail with error

**Response:**
1. Check error code: `solana confirm <TX_SIG> -v --url mainnet`
2. Common errors:
   - Slippage: Increase min_base_amount tolerance
   - Oracle stale: Wait 30 seconds, retry
   - Insufficient balance: Check wallet balances
3. If critical bug discovered:
   - Assess severity (see MAINNET_DEPLOYMENT_GUIDE Section 5)
   - Consider emergency pause if funds at risk
   - Communicate to team immediately

---

### Scenario 3: Need to Emergency Pause

**When to use:** ONLY for critical issues (exploit, critical bug, oracle failure, funds at risk)

**How to pause:**
```bash
npx ts-node scripts/emergency-pause.ts
```

**Immediately after pausing:**
1. Announce to users (within 5 minutes):
   - Twitter: "Scale AMM trading paused for emergency maintenance"
   - Discord: Detailed explanation
2. Investigate root cause
3. Assess impact (funds lost? users affected?)
4. Develop mitigation plan
5. Decide: Fix and resume, or deploy new version?

**DO NOT pause for:**
- High volatility (expected)
- User complaints about losses
- Feature requests
- Competitor activity

---

### Scenario 4: Oracle Issues

**Symptoms:** Transactions failing with "OraclePriceStale" or "OracleConfidenceTooLow"

**Response:**
1. Check oracle account: `solana account <ORACLE_ADDRESS> --url mainnet`
2. Check Pyth website for feed status
3. If temporary: Wait for oracle to update (usually <60 seconds)
4. If persistent:
   - Contact oracle provider (Pyth Discord)
   - Consider switching to backup oracle (if admin function exists)
   - May need emergency pause if prolonged

---

## Team Roles & Responsibilities

### Deploy Lead (Technical Lead)
- Execute deployment commands
- Initialize config
- Create primary pool
- Technical decision-making
- Final authority on pause decisions

### Security Lead
- Monitor for exploits in real-time
- Review transaction patterns
- Incident response coordination
- Post-mortem investigation

### Infrastructure Lead
- RPC health monitoring
- Monitoring systems operation
- Alert system management
- Oracle status tracking

### Communications Lead
- User announcements (soft + public launch)
- Incident communication
- Social media updates
- Community management

### Support Lead
- User question triage
- Bug report collection
- FAQ updates
- Discord/Telegram moderation

---

## Critical Reminders

### Before You Deploy

1. **DEPLOYER_PUBKEY MUST be your actual wallet** (not `11111...`)
   - Check 3 times before deployment
   - This is the #1 cause of failed deployments
   - No second chances on mainnet

2. **Initialize within 1 minute of deployment**
   - Have script ready to run
   - Don't troubleshoot on mainnet - test on devnet first
   - DEPLOYER_PUBKEY protection prevents front-running

3. **You cannot upgrade after deployment**
   - Permissionless = permanent
   - Any bugs require new deployment (different program ID)
   - Users must migrate manually
   - Get it right the first time!

4. **Test EVERYTHING on devnet first**
   - Same commands you'll use on mainnet
   - Same parameters
   - Same scripts
   - Time yourself - practice the 1-minute window

5. **Emergency pause is your safety net**
   - But use sparingly (protocol reputation)
   - Only for critical issues
   - Have clear criteria for when to pause

---

## Additional Resources

### Related Documentation

- **README.md** - Project overview and setup
- **WHAT_IT_DOES.md** - Protocol mechanics explained
- **CLAUDE.md** - Project context, conventions, commands
- **SDK_IMPROVEMENTS.md** - Future SDK enhancements
- **TOKEN_LAUNCH_FEATURES.md** - Token launch features

### External Resources

- **Solana Documentation:** https://docs.solana.com
- **Anchor Framework:** https://www.anchor-lang.com
- **Pyth Network:** https://pyth.network
- **Solana Explorer:** https://explorer.solana.com

### Tools

- **Solana CLI:** `solana --version` (must be 1.17+)
- **Anchor CLI:** `anchor --version` (must be 0.29.0)
- **Node.js:** `node --version` (must be 18+)

---

## Questions & Support

### During Preparation

If you have questions while preparing for launch:
1. Re-read the relevant section in MAINNET_DEPLOYMENT_GUIDE.md
2. Test on devnet to understand the behavior
3. Discuss with team in preparation meetings
4. Document your questions and answers for others

### During Launch

If issues arise during launch:
1. Stay calm - you have prepared for this
2. Follow emergency procedures in LAUNCH_DAY_CHECKLIST.md
3. Use war room Discord for team coordination
4. Reference MAINNET_DEPLOYMENT_GUIDE Section 5 (Emergency Response)
5. Prioritize user fund safety over everything else

### After Launch

For post-launch issues:
1. Monitor dashboards and alerts
2. Triage issues by severity (P0-P3)
3. Follow incident response workflow
4. Document everything in DEPLOYMENT_ARTIFACTS
5. Conduct post-mortem for major incidents

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-08 | Initial comprehensive deployment playbook created |

---

## Final Thoughts

**This is a major undertaking.** You're deploying a permissionless, immutable protocol to mainnet. There are no second chances, no upgrades, no take-backs.

**But you're prepared.**

You have:
- ✅ Comprehensive documentation (74 KB guide)
- ✅ Step-by-step checklists
- ✅ Emergency procedures
- ✅ Risk mitigation strategies
- ✅ Communication templates
- ✅ 72 hours of devnet testing
- ✅ 103 tests with >95% coverage
- ✅ Security-focused design
- ✅ Experienced team

**Trust your preparation. Follow the process. Stay calm under pressure.**

**When in doubt:**
1. Pause and assess
2. Consult the guide
3. Discuss with team
4. Make informed decisions
5. Document everything

**You've got this. 🚀**

---

## Quick Navigation

**Need something specific?**

- 📘 **Full reference?** → MAINNET_DEPLOYMENT_GUIDE.md
- ✅ **Launch day commands?** → LAUNCH_DAY_CHECKLIST.md
- 📝 **Record keeping?** → DEPLOYMENT_ARTIFACTS_TEMPLATE.md
- 🔍 **Go/No-Go decision?** → GO_NO_GO_DECISION_FORM.md
- ⚠️ **DEPLOYER_PUBKEY warning?** → DEPLOYER_WARNING.md
- 📋 **Basic checklist?** → DEPLOYMENT_CHECKLIST.md

---

**Good luck with your mainnet launch!**

**Remember: Permissionless is powerful. Permissionless is permanent. Deploy wisely.**
