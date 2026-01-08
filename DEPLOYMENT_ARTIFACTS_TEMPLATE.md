# Scale AMM - Mainnet Deployment Artifacts

**Fill this out during and after deployment**
**This document serves as the official record of mainnet deployment**

---

## Deployment Metadata

**Deployment Date:** YYYY-MM-DD
**Deployment Time (UTC):** HH:MM
**Deployed By:** [Name / Wallet Address]
**Network:** Solana Mainnet (mainnet-beta)
**Deployment Status:** ⏳ In Progress / ✅ Complete / ❌ Failed

---

## 1. Program Deployment

### Program Information

**Program ID:**
```
CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3
```

**Program Data Address:**
```
[Address from deployment output]
```

**Deployer Wallet:**
```
[Your wallet address - should match DEPLOYER_PUBKEY]
```

**Deploy Transaction Signature:**
```
[Transaction signature from deployment]
```

**Deploy Slot:**
```
[Slot number when deployed]
```

**Deploy Timestamp (Unix):**
```
[Unix timestamp]
```

**Deploy Cost:**
```
[Amount of SOL spent]
```

### Program Binary

**Binary Size:**
```
[e.g., 412 KB]
```

**Binary Hash (SHA-256):**
```
[Hash of program binary for verification]
```

**Verifiable Build:** ✅ Yes / ❌ No

**Verification Command:**
```bash
solana program dump CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3 /tmp/program.so --url mainnet
sha256sum /tmp/program.so
```

### Build Information

**Anchor Version:**
```
[e.g., 0.29.0]
```

**Solana Version:**
```
[e.g., 1.17.0]
```

**Rust Version:**
```
[e.g., 1.75.0]
```

**Build Date:**
```
[Date of anchor build]
```

**Git Commit:**
```
Commit: [Git commit hash]
Branch: [Branch name]
Tag: [Git tag, e.g., v1.0.0-mainnet]
```

### Explorer Links

**Program:**
```
https://explorer.solana.com/address/CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3
```

**Solscan:**
```
https://solscan.io/account/CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3
```

---

## 2. Configuration Initialization

### Config PDA

**Config Address:**
```
[PDA derived from seeds: ["config"]]
```

**Initialize Transaction:**
```
[Transaction signature]
```

**Initialize Slot:**
```
[Slot number]
```

**Initialize Timestamp:**
```
[UTC timestamp]
```

**Time Since Deploy:**
```
[e.g., 45 seconds - should be <1 minute!]
```

### Configuration Parameters

**Protocol Authority:**
```
[Wallet address - initially deployer, later multisig]
```

**Fee Recipient:**
```
[Treasury/multisig wallet address]
```

**CRX Token Mint:**
```
[CRX token mint address]
```

**CRX Price Oracle:**
```
[Pyth/Switchboard oracle address]
```

**Pre-Bonding Fee:**
```
300 bps (3%)
```

**Pre-Bonding Threshold:**
```
$40,000 USD (40,000,000,000 with 6 decimals)
```

**Post-Bonding Fee:**
```
100 bps (1%)
```

**Graduation Threshold:**
```
$85,000 USD (85,000,000,000 with 6 decimals)
```

**Anti-Sniper Window:**
```
20 slots (~8 seconds)
```

**Anti-Sniper Max Trade:**
```
500 bps (5% of supply)
```

**Oracle Max Age:**
```
60 seconds
```

**Oracle Max Confidence:**
```
100 bps (1%)
```

**Approved Quote Tokens:**
```
[CRX mint address]
[Unused slot 2]
[Unused slot 3]
[Unused slot 4]
[Unused slot 5]
```

**Approved Quote Count:**
```
1 (only CRX initially)
```

**Initial Pause State:**
```
false (unpaused)
```

### Explorer Links

**Config Account:**
```
https://explorer.solana.com/address/[CONFIG_PDA]
```

**Initialize Transaction:**
```
https://explorer.solana.com/tx/[TX_SIGNATURE]
```

---

## 3. CRX Token Information

**CRX Mint Address:**
```
[Mint address]
```

**Decimals:**
```
6
```

**Total Supply:**
```
[e.g., 1,000,000 CRX]
```

**Mint Authority:**
```
[Authority address or "None" if revoked]
```

**Freeze Authority:**
```
[Authority address or "None" if revoked]
```

**Explorer Link:**
```
https://explorer.solana.com/address/[CRX_MINT]
```

---

## 4. Oracle Information

**Oracle Provider:**
```
[e.g., Pyth Network]
```

**Oracle Type:**
```
[e.g., CRX/USD price feed]
```

**Oracle Address:**
```
[Oracle account address]
```

**Update Frequency:**
```
[e.g., <10 seconds]
```

**Backup Oracle (if any):**
```
[Address or "None"]
```

**Explorer Link:**
```
https://explorer.solana.com/address/[ORACLE_ADDRESS]
```

---

## 5. Primary Pool (CRX/SOL)

### Pool Information

**Pool PDA:**
```
[Pool address]
```

**Create Transaction:**
```
[Transaction signature]
```

**Created Slot:**
```
[Slot number]
```

**Pool Creator:**
```
[Wallet address]
```

### Token Pair

**Quote Token (Token A):**
```
[CRX mint address]
```

**Base Token (Token B):**
```
[Wrapped SOL mint: So11111111111111111111111111111111111111112]
```

### Vaults

**Quote Vault:**
```
[Token account address for CRX]
```

**Base Vault:**
```
[Token account address for wSOL]
```

### Initial Parameters

**Target Market Cap (USD):**
```
[e.g., $1,000,000]
```

**Token Supply:**
```
[e.g., 1,000,000 CRX with 6 decimals]
```

**Fee (bps):**
```
[e.g., 100 bps = 1%]
```

**Curve Type:**
```
ConstantProduct / Exponential
```

**Graduation Threshold (USD):**
```
[e.g., $5,000,000]
```

### Initial State

**Current Phase:**
```
PreBonding / Graduated
```

**Virtual Quote Reserves:**
```
[Amount calculated by oracle]
```

**Virtual Base Reserves:**
```
[Token total supply]
```

**Real Quote Reserves:**
```
[Actual CRX in vault at creation - likely 0]
```

**Real Base Reserves:**
```
[Actual wSOL in vault at creation - likely token supply]
```

**Last CRX Price (USD):**
```
[Price from oracle at creation, 6 decimals]
```

### Explorer Links

**Pool Account:**
```
https://explorer.solana.com/address/[POOL_PDA]
```

**Quote Vault:**
```
https://explorer.solana.com/address/[QUOTE_VAULT]
```

**Base Vault:**
```
https://explorer.solana.com/address/[BASE_VAULT]
```

**Create Transaction:**
```
https://explorer.solana.com/tx/[TX_SIGNATURE]
```

---

## 6. Test Trades

### First Buy Transaction

**Transaction Signature:**
```
[Buy transaction signature]
```

**Buyer:**
```
[Wallet address]
```

**Amount In (Quote):**
```
[Amount of CRX/SOL]
```

**Amount Out (Base):**
```
[Amount of tokens received]
```

**Price Impact:**
```
[Percentage]
```

**Fees Collected:**
```
[Fee amount]
```

**Status:**
```
✅ Success / ❌ Failed
```

**Notes:**
```
[Any observations]
```

### First Sell Transaction

**Transaction Signature:**
```
[Sell transaction signature]
```

**Seller:**
```
[Wallet address]
```

**Amount In (Base):**
```
[Amount of tokens]
```

**Amount Out (Quote):**
```
[Amount of CRX/SOL received]
```

**Price Impact:**
```
[Percentage]
```

**Fees Collected:**
```
[Fee amount]
```

**Status:**
```
✅ Success / ❌ Failed
```

**Notes:**
```
[Any observations]
```

---

## 7. Authority & Access Control

### Initial Authority

**Protocol Authority (Config):**
```
[Wallet address - deployer initially]
```

**Fee Recipient:**
```
[Treasury wallet address]
```

**Emergency Pause Authority:**
```
[Same as protocol authority]
```

### Planned Authority Transfer

**Target Authority (Multisig):**
```
[Multisig address - if/when transferred]
```

**Transfer Transaction:**
```
[Transaction signature - when transferred]
```

**Transfer Date:**
```
[Date - when transferred]
```

**Multisig Configuration:**
```
Type: [e.g., Squads, Goki]
Signers: [List of signer addresses]
Threshold: [e.g., 3-of-5]
```

---

## 8. RPC & Infrastructure

### RPC Providers

**Primary RPC:**
```
Provider: [e.g., Helius]
Endpoint: [RPC URL]
Tier: [e.g., Pro, Enterprise]
Rate Limit: [e.g., Unlimited]
```

**Backup RPC:**
```
Provider: [e.g., Alchemy]
Endpoint: [RPC URL]
Tier: [e.g., Growth]
Rate Limit: [e.g., 1000 RPS]
```

### Monitoring

**Monitoring Dashboard:**
```
URL: [e.g., Grafana dashboard]
Access: [How to access]
```

**Alert System:**
```
Platform: [e.g., PagerDuty, Discord]
Recipients: [Who gets alerted]
```

**Transaction Indexer:**
```
Provider: [e.g., Helius Webhooks]
Configuration: [What's being tracked]
```

---

## 9. Deployment Timeline

**Sequence of Events:**

| Time (UTC) | Event | Status | Notes |
|------------|-------|--------|-------|
| HH:MM | Team assembly | ✅ | All members present |
| HH:MM | Final pre-flight checks | ✅ | All green |
| HH:MM | Program deployment started | ✅ | |
| HH:MM | Program deployment complete | ✅ | 2m 34s duration |
| HH:MM | Deployment verification | ✅ | Explorer check |
| HH:MM | Config initialization started | ✅ | |
| HH:MM | Config initialization complete | ✅ | 12s after deploy |
| HH:MM | Config verification | ✅ | Parameters correct |
| HH:MM | Primary pool creation | ✅ | |
| HH:MM | Test buy transaction | ✅ | |
| HH:MM | Test sell transaction | ✅ | |
| HH:MM | Accounting verification | ✅ | Reserves match vaults |
| HH:MM | Soft launch announcement | ✅ | Private Discord |
| HH:MM | Monitoring initiated | ✅ | 24/7 coverage |
| HH:MM+2h | Public announcement | ✅ | Twitter + public Discord |

---

## 10. First 24 Hours Metrics

**Measured at T+24h:**

### Usage Metrics

**Transactions:**
```
Total: [Number]
Successful: [Number] ([%])
Failed: [Number] ([%])
```

**Pools:**
```
Total Created: [Number]
Active: [Number]
Graduated: [Number]
```

**Users:**
```
Unique Wallets: [Number]
Pool Creators: [Number]
Traders: [Number]
```

**Volume:**
```
Total Volume (USD): $[Amount]
Largest Trade: $[Amount]
Average Trade: $[Amount]
```

**Liquidity:**
```
Total Value Locked (USD): $[Amount]
Largest Pool: $[Amount]
```

### Performance Metrics

**Uptime:**
```
[Percentage, should be >99%]
```

**Transaction Success Rate:**
```
[Percentage, should be >99%]
```

**Average Confirmation Time:**
```
[Seconds]
```

**Average Compute Units Used:**
```
[CU per transaction]
```

### Revenue Metrics

**Fees Collected:**
```
Total Fees (CRX): [Amount]
USD Value: $[Amount]
Fee Recipient Balance: [Amount] CRX
```

---

## 11. Issues & Incidents

**Log any issues during first 24 hours:**

### Issue 1

**Time Detected:** HH:MM UTC
**Severity:** P0 / P1 / P2 / P3
**Description:** [What happened]
**Impact:** [How many users affected]
**Root Cause:** [Why it happened]
**Resolution:** [How it was fixed]
**Time to Resolution:** [Duration]
**Status:** Resolved / Ongoing / Monitoring

### Issue 2

[Same format as above]

### Issue 3

[Same format as above]

**Total Incidents:**
- P0 (Critical): [Number]
- P1 (High): [Number]
- P2 (Medium): [Number]
- P3 (Low): [Number]

**Total Resolved:** [Number]
**Average Resolution Time:** [Duration]

---

## 12. Security

### Security Events

**Exploit Attempts:**
```
Total: [Number]
Successful: [Number] (should be 0!)
Types: [e.g., sandwich, front-run, oracle manipulation]
```

**Anti-Sniper Activations:**
```
Times Triggered: [Number]
Prevented Trades: [Number]
```

**Emergency Pauses:**
```
Total Pauses: [Number]
Duration: [If any]
Reason: [If any]
```

### Audit Status

**External Audit:**
```
Firm: [Name, or "None"]
Date: [Date, or "N/A"]
Findings: [Summary, or "N/A"]
```

**Bug Bounty:**
```
Platform: [e.g., Immunefi, or "Not launched"]
Max Bounty: $[Amount]
Submissions: [Number]
Valid Submissions: [Number]
```

---

## 13. Communication Log

**All external communications:**

| Time (UTC) | Channel | Type | Content Summary | Link |
|------------|---------|------|-----------------|------|
| HH:MM | Discord | Soft launch | "Scale AMM is live (soft launch)" | [Link] |
| HH:MM | Twitter | Public launch | "Scale AMM is LIVE on mainnet" | [Link] |
| HH:MM | Discord | Update | "First 2h stats update" | [Link] |
| HH:MM | Twitter | Update | "24h recap" | [Link] |

---

## 14. Team Members

**Deployment Team:**

| Name | Role | Wallet Address | Responsibilities |
|------|------|----------------|------------------|
| [Name] | Deploy Lead | [Address] | Program deployment, config init |
| [Name] | Security | [Address] | Security monitoring |
| [Name] | Infrastructure | [Address] | RPC, monitoring |
| [Name] | Communications | [Address] | User communication |
| [Name] | Support | [Address] | User questions |

---

## 15. Post-Deployment Actions

**Completed after deployment:**

- [ ] Program hash published for verification
- [ ] Website updated with mainnet info
- [ ] Documentation updated (README, etc.)
- [ ] Explorer links added to docs
- [ ] Social media updated with addresses
- [ ] Community notified
- [ ] Bug bounty activated
- [ ] Monitoring confirmed operational
- [ ] 24-hour post-launch report published
- [ ] Authority transferred to multisig (if applicable)
- [ ] Deployment artifacts saved to GitHub
- [ ] Team retrospective completed

---

## 16. Links & Resources

**Official Resources:**

**Documentation:**
```
GitHub: [Repository URL]
Docs Site: [Documentation URL]
SDK: [SDK package URL]
```

**Explorers:**
```
Solana Explorer: https://explorer.solana.com/address/[PROGRAM_ID]
Solscan: https://solscan.io/account/[PROGRAM_ID]
```

**Community:**
```
Discord: [Invite URL]
Twitter: [Handle]
Website: [URL]
```

**Developer:**
```
SDK Examples: [GitHub URL]
API Docs: [URL]
Postman Collection: [URL, if applicable]
```

---

## 17. Backup & Recovery

**Key Backups:**

**Deployer Keypair:**
```
Location: [Where is backup stored?]
Backup Date: [Date]
Access: [Who has access?]
```

**Multisig Signers (if applicable):**
```
Signer 1: [Backup location]
Signer 2: [Backup location]
Signer 3: [Backup location]
```

**Environment Files:**
```
.env.mainnet: [Backup location]
RPC keys: [Backup location]
API keys: [Backup location]
```

**Deployment Logs:**
```
Full logs saved to: [File path or URL]
Date: [Date]
Size: [File size]
```

---

## 18. Lessons Learned

**What Went Well:**
```
1. [Positive observation]
2. [Another positive]
3. [Another positive]
```

**What Could Be Improved:**
```
1. [Improvement area]
2. [Another improvement]
3. [Another improvement]
```

**Surprises:**
```
1. [Unexpected thing]
2. [Another unexpected thing]
```

**Action Items for Next Time:**
```
1. [Improvement to implement]
2. [Another improvement]
3. [Another improvement]
```

---

## 19. Sign-Off

**Deployment Approved By:**

**Technical Lead:**
```
Name: [Name]
Signature: ___________________
Date: [Date]
```

**Security Lead:**
```
Name: [Name]
Signature: ___________________
Date: [Date]
```

**CEO/Founder (if applicable):**
```
Name: [Name]
Signature: ___________________
Date: [Date]
```

---

## 20. Verification

**Community Verification:**

Anyone can verify this deployment by:

1. **Verify program code matches source:**
```bash
# Download deployed program
solana program dump CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3 /tmp/deployed.so --url mainnet

# Hash it
sha256sum /tmp/deployed.so

# Compare to published hash (should match):
[PUBLISHED_HASH]
```

2. **Verify config parameters:**
```bash
# Fetch config account
solana account [CONFIG_PDA] --url mainnet --output json

# Verify parameters match documentation
```

3. **Verify source code:**
```bash
# Clone repository
git clone [REPO_URL]
cd Scale-AMM
git checkout [GIT_TAG]

# Build
anchor build

# Compare hash
```

---

**END OF DEPLOYMENT ARTIFACTS**

**Document Version:** 1.0
**Last Updated:** [Date]
**Status:** Draft / In Progress / Complete

---

**This document should be committed to the repository after deployment as:**
`DEPLOYMENT_ARTIFACTS_MAINNET_[DATE].md`
