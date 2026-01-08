# Creator AMM v2 - Deployment Checklist

## ⚠️ PRE-DEPLOYMENT CRITICAL STEPS

### Legal (COMPLETE BEFORE ANYTHING ELSE)
- [ ] Hire crypto/securities lawyer
- [ ] Get legal opinion on CRX classification
- [ ] Register business entity
- [ ] Create Terms of Service
- [ ] Create Privacy Policy
- [ ] Draft risk disclosures
- [ ] Determine KYC/AML requirements
- [ ] Choose legal jurisdiction

### Code Security
- [ ] **MOVE TO PRIVATE REPOSITORY** (GitHub private or self-hosted)
- [ ] Remove any accidental public commits
- [ ] Security audit #1 (OtterSec, Kudelski, etc.) - $30-50k
- [ ] Security audit #2 (different firm) - $30-50k
- [ ] Fix all audit findings
- [ ] Bug bounty (private, trusted researchers only)
- [ ] Code review by senior Solana devs

### Infrastructure
- [ ] Set up secure key management system
- [ ] Create multi-sig wallet (Squads 3/5 recommended)
- [ ] Prepare deployer wallet with SOL
- [ ] Set up monitoring/alerting system
- [ ] Create backup/disaster recovery plan
- [ ] Prepare emergency pause procedures

---

## 🪙 CRX TOKEN DEPLOYMENT

### Step 1: Create CRX Token
```bash
# Use Token-2022 for advanced features or standard SPL
spl-token create-token --decimals 9

# Save token address!
CRX_MINT=<ADDRESS>
```

### Step 2: Mint Initial Supply
```bash
# Mint 1B CRX
spl-token create-account $CRX_MINT
spl-token mint $CRX_MINT 1000000000000000000

# Token distribution:
# - 800M to treasury (your multi-sig)
# - 100M to initial liquidity
# - 100M to team (vesting contract)
```

### Step 3: Set Up Token Metadata
```typescript
// Use Metaplex Token Metadata
{
  name: "Creator Token",
  symbol: "CRX",
  uri: "https://creator.platform/crx-metadata.json",
  // ... other metadata
}
```

### Step 4: Create CRX/SOL Pool
```bash
# Recommend Meteora DAMM or Raydium CLMM
# Initial liquidity example:
# - 100,000,000 CRX (100M)
# - 500 SOL (~$75k)
# Initial price: ~$0.75 per CRX
```

---

## 🔮 ORACLE SETUP

### Option 1: Pyth Network (Recommended)
```bash
# Request CRX price feed from Pyth
# https://pyth.network/publishers

# Initially use derived price:
# CRX/USD = (CRX/SOL) * (SOL/USD)

# As volume grows, request direct CRX/USD feed
```

### Option 2: Switchboard (Backup)
```bash
# Create custom feed
# https://switchboard.xyz

# Configure:
# - Update interval: 60 seconds
# - Deviation threshold: 1%
# - Sources: Your CRX/SOL pool + SOL/USD
```

---

## 🚀 AMM DEPLOYMENT

### Step 1: Build Program
```bash
cd creator-amm-v2
anchor build

# Verify build
anchor verify <PROGRAM_ID>
```

### Step 2: Deploy to Mainnet
```bash
# CRITICAL: Use secure deployer keypair
solana program deploy \
  --program-id target/deploy/creator_amm_v2-keypair.json \
  target/deploy/creator_amm_v2.so \
  --keypair ~/.config/solana/deployer.json

# SAVE PROGRAM ID
PROGRAM_ID=<YOUR_PROGRAM_ID>
```

### Step 3: Initialize Config
```typescript
await program.methods
  .initialize(
    300,              // 3% pre-bonding fee
    40_000_000_000,   // $40k pre-bonding threshold
    100,              // 1% post-bonding fee
    85_000_000_000,   // $85k graduation threshold
    20,               // 20 slot anti-sniper
    500,              // 5% max trade during anti-sniper
    60,               // 60 second oracle max age
    100               // 1% oracle max confidence
  )
  .accounts({
    config,
    authority: YOUR_AUTHORITY,
    feeRecipient: YOUR_MULTISIG,
    crxPriceOracle: PYTH_CRX_FEED,
    crxMint: CRX_MINT,
  })
  .rpc();
```

### Step 4: Test with Dummy Token
```bash
# Create test token
# Launch on platform
# Verify all mechanics work
# Test buy/sell/phase transitions
```

---

## 🛡️ SECURITY POST-DEPLOYMENT

### Monitoring
- [ ] Set up 24/7 pool monitoring
- [ ] Alert on large trades (> $10k)
- [ ] Alert on unusual price movements
- [ ] Monitor vault balances
- [ ] Track all phase transitions

### Emergency Procedures
- [ ] Test emergency pause mechanism
- [ ] Document multi-sig signing process
- [ ] Create incident response playbook
- [ ] Establish communication channels
- [ ] Prepare legal contact info

### Ongoing Security
- [ ] Weekly vault balance reconciliation
- [ ] Monthly security reviews
- [ ] Quarterly penetration testing
- [ ] Annual comprehensive audit
- [ ] Bug bounty program (private)

---

## 📱 PLATFORM FRONTEND

### Features to Build
- [ ] Pool creation interface
- [ ] Trading interface (buy/sell)
- [ ] Pool analytics dashboard
- [ ] Fee collection interface
- [ ] Admin panel
- [ ] User wallet connection
- [ ] Transaction history
- [ ] Price charts

### Required Integrations
- [ ] Wallet adapter (Phantom, Solflare, etc.)
- [ ] RPC provider (Helius, Triton, etc.)
- [ ] Price oracle display
- [ ] Transaction notifications
- [ ] Error handling

---

## 🎯 LAUNCH STRATEGY

### Week 1: Private Beta
- [ ] Invite 5-10 trusted projects
- [ ] Manual onboarding process
- [ ] Close monitoring
- [ ] Gather feedback
- [ ] Fix any issues

### Week 2: Limited Release
- [ ] Whitelist 20-50 approved creators
- [ ] Public announcement (Twitter, Discord)
- [ ] Marketing campaign
- [ ] Community building
- [ ] Support channels

### Week 3-4: Scale
- [ ] Remove/expand whitelist
- [ ] Onboard more projects
- [ ] Track all metrics
- [ ] Iterate based on data
- [ ] Build partnerships

---

## 📊 METRICS TO TRACK

### Daily
- [ ] Pools created
- [ ] Total volume (USD)
- [ ] CRX price
- [ ] Fee revenue
- [ ] Active users

### Weekly
- [ ] CRX liquidity depth
- [ ] Graduation rate
- [ ] Average token MC at launch
- [ ] User retention
- [ ] Platform TVL

### Monthly
- [ ] Revenue growth
- [ ] CRX price appreciation
- [ ] Market share
- [ ] Competitor analysis
- [ ] Feature requests

---

## ⚠️ CRITICAL WARNINGS

### DO NOT
- ❌ Publicly discuss "pumping" CRX
- ❌ Make false statements about CRX value
- ❌ Artificially manipulate trading
- ❌ Commit secrets to git
- ❌ Deploy without audits
- ❌ Skip legal counsel

### DO
- ✅ Get professional legal advice
- ✅ Implement compliance measures
- ✅ Disclose your CRX ownership
- ✅ Keep code private
- ✅ Monitor security constantly
- ✅ Build sustainably

---

## 📞 EMERGENCY CONTACTS

### Security Issue
- Security Firm 1: [CONTACT]
- Security Firm 2: [CONTACT]
- Solana Foundation: security@solana.foundation

### Legal Issue
- Primary Lawyer: [CONTACT]
- Regulatory Counsel: [CONTACT]

### Technical Issue
- Lead Developer: [CONTACT]
- DevOps: [CONTACT]
- Multi-sig signers: [LIST]

---

## ✅ FINAL PRE-LAUNCH CHECKLIST

- [ ] All legal documents complete
- [ ] 2+ security audits completed
- [ ] All audit findings resolved
- [ ] CRX token deployed
- [ ] CRX/SOL pool created with liquidity
- [ ] Oracle integrated and tested
- [ ] AMM deployed to mainnet
- [ ] Config initialized
- [ ] Frontend deployed
- [ ] Testing complete (all scenarios)
- [ ] Multi-sig set up correctly
- [ ] Emergency procedures documented
- [ ] Monitoring active
- [ ] Team trained
- [ ] Marketing materials ready
- [ ] Community channels set up
- [ ] Support system in place
- [ ] Insurance considered/acquired
- [ ] Terms of Service live
- [ ] Privacy Policy live
- [ ] Risk disclosures displayed

---

**DO NOT LAUNCH WITHOUT COMPLETING THIS ENTIRE CHECKLIST**

One mistake could cost millions. Take your time. Do it right.
