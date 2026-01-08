# Scale AMM - Launch Day Quick Reference

**One-page checklist for deployment day**
**Keep this open during launch - check off items as you go**

---

## Pre-Deployment (T-1 Hour)

```bash
# 1. Verify DEPLOYER_PUBKEY
grep "DEPLOYER_PUBKEY" programs/creator-amm-v2/src/instructions/initialize.rs
# ✅ Should show YOUR wallet, NOT 11111...

# 2. Clean build
anchor clean && anchor build
# ✅ Should complete with 0 errors

# 3. Verify Solana config
solana config get
# ✅ Should show: mainnet-beta

# 4. Check deployer balance
solana balance
# ✅ Should show: >5 SOL

# 5. Verify deployer address matches code
solana address
# ✅ Should match DEPLOYER_PUBKEY in code
```

**Pre-Flight Checklist:**
- [ ] All tests passing (anchor test)
- [ ] Team assembled in war room
- [ ] Monitoring systems ready
- [ ] RPC endpoints confirmed
- [ ] Initialize script ready
- [ ] Emergency contacts shared
- [ ] Everyone has read deployment guide

---

## Deployment Sequence

### Step 1: Deploy Program (T-30m)

```bash
anchor deploy --provider.cluster mainnet-beta 2>&1 | tee logs/mainnet-deploy.log
```

**Expected:** Program deploys in 2-3 minutes
**Save:** Program ID from output

---

### Step 2: Verify Deployment (T-25m)

```bash
PROGRAM_ID="CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3"
solana program show $PROGRAM_ID --url mainnet
```

**Expected:** Program account exists
**Check:** Explorer link works

---

### Step 3: Initialize Config (T-20m) ⚠️ CRITICAL

```bash
# Run initialization script IMMEDIATELY
npx ts-node scripts/initialize-mainnet.ts
```

**Expected:** Transaction confirms in 5-15 seconds
**CRITICAL:** Do this within 1 minute of deployment!
**Save:** Config PDA address and transaction signature

---

### Step 4: Verify Config (T-18m)

```bash
CONFIG_PDA="<from_script_output>"
solana account $CONFIG_PDA --url mainnet
```

**Expected:** Account exists with data
**Check:**
- [ ] Authority is your wallet
- [ ] Fee recipient correct
- [ ] CRX mint correct
- [ ] Oracle address correct
- [ ] is_paused = false

---

### Step 5: Create CRX/SOL Pool (T-15m)

```bash
npx ts-node scripts/create-crx-sol-pool.ts
```

**Expected:** Pool created successfully
**Save:** Pool PDA address

---

### Step 6: Test Trades (T-10m)

```bash
# Small buy
npx ts-node scripts/test-buy.ts --amount 0.1

# Small sell
npx ts-node scripts/test-sell.ts --amount 50
```

**Expected:** Both transactions succeed
**Check:**
- [ ] Tokens received
- [ ] Reserves updated
- [ ] Fees collected

---

### Step 7: Verify Accounting (T-5m)

**Check pool reserves match vault balances:**
- [ ] Quote reserves = quote vault balance
- [ ] Base reserves = base vault balance
- [ ] Fee recipient has collected fees

---

### Step 8: Soft Launch (T+0m)

**Post in private Discord:**
```
🚀 Scale AMM is live on mainnet!
Program: CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3
Testing with small amounts for next 2 hours.
```

---

### Step 9: Monitor (T+0 to T+2h)

**Check every 15 minutes:**
- [ ] Transaction success rate >99%
- [ ] No security alerts
- [ ] Oracle prices updating
- [ ] No unusual patterns
- [ ] Support tickets manageable

---

### Step 10: Public Announcement (T+2h)

**If all stable, tweet:**
```
🚀 Scale AMM is LIVE on Solana Mainnet
[Use template from deployment guide]
```

---

## Quick Emergency Procedures

### If Initialize Fails

```bash
# Read error message
# Fix issue (usually parameters)
# Retry IMMEDIATELY - you're racing front-runners
npx ts-node scripts/initialize-mainnet.ts
```

### If You Need to Emergency Pause

```bash
# ONLY use if critical issue
npx ts-node scripts/emergency-pause.ts

# Then immediately communicate to users
# See deployment guide Section 6 for templates
```

### If Test Trades Fail

```bash
# Check transaction error
solana confirm <TX_SIGNATURE> -v --url mainnet

# Investigate error code
# If critical, consider emergency pause
# If minor, document and investigate
```

---

## Deployment Artifacts to Save

**Immediately after each step, document:**

- [ ] Program ID: _______________
- [ ] Deploy transaction: _______________
- [ ] Deploy slot: _______________
- [ ] Config PDA: _______________
- [ ] Initialize transaction: _______________
- [ ] CRX mint: _______________
- [ ] Fee recipient: _______________
- [ ] Oracle address: _______________
- [ ] Primary pool PDA: _______________
- [ ] Pool create transaction: _______________

**Save deployment log:**
```bash
cp logs/mainnet-deploy.log MAINNET_DEPLOYMENT_$(date +%Y%m%d-%H%M%S).log
```

---

## Contact Info (Fill Before Launch)

**Tech Lead:** [Name] - [Phone] - [Discord]
**Security:** [Name] - [Phone] - [Discord]
**Infrastructure:** [Name] - [Phone] - [Discord]
**Communications:** [Name] - [Phone] - [Discord]

**War Room:** Discord #mainnet-launch

**RPC Support:** [Provider] - [Contact info]
**Oracle Support:** [Provider] - [Discord channel]

---

## Success Criteria (First 24h)

- [ ] Uptime >99%
- [ ] Transaction success rate >99%
- [ ] Zero security incidents
- [ ] >10 pools created
- [ ] >$10k volume
- [ ] >50 unique users
- [ ] No critical bugs

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Deploy fails - insufficient SOL | Transfer more SOL, retry |
| Initialize fails - parameters invalid | Check parameters in script, retry |
| Test trade fails - slippage | Increase slippage tolerance, retry |
| Oracle error - stale price | Wait 30 sec for oracle update, retry |
| Transaction fails - compute units | Not expected (<200k limit), investigate |

---

## Decision Points

### Should we proceed to public announcement?

**Check at T+2h:**
- [ ] All systems operational?
- [ ] No incidents in first 2 hours?
- [ ] Test trades working?
- [ ] Team consensus GO?

**If YES:** Proceed with public announcement
**If NO:** Extend soft launch, investigate issues

---

### Should we emergency pause?

**ONLY if:**
- [ ] Active exploit in progress
- [ ] Critical bug discovered
- [ ] Oracle failure (persistent)
- [ ] Funds at risk

**NOT for:**
- High volatility (expected)
- User complaints about losses
- Feature requests
- Competitor activity

---

## Post-Launch (First 24h)

**Every hour, check:**
- [ ] Transaction success rate
- [ ] Error logs
- [ ] Oracle health
- [ ] TVL growth
- [ ] Support tickets

**Every 4 hours, report:**
- Status update in war room
- Key metrics summary
- Any issues observed

**At 24 hours:**
- [ ] Team retrospective meeting
- [ ] Publish first update
- [ ] Document lessons learned

---

## Remember

1. DEPLOYER_PUBKEY must be your wallet (not 11111...)
2. Initialize within 1 minute of deployment
3. Test with small amounts first
4. Monitor closely for first 24 hours
5. Communicate proactively if issues arise
6. You cannot upgrade once deployed (permissionless!)

---

**For detailed procedures, see MAINNET_DEPLOYMENT_GUIDE.md**

**Good luck! 🚀**
