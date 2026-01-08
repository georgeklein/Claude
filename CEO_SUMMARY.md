# What Your AMM Does (CEO Summary)

**Read time: 3 minutes | No code knowledge required**

---

## The One-Sentence Version

You're building a **token launch platform** where creators can sell new tokens for CRX, with prices that go up as people buy - like a digital lemonade stand that raises its prices as the line gets longer.

---

## How It Works (ELI5)

### Step 1: Creator Launches Token
- Creator sets up a new token (like starting a new lemonade brand)
- They decide: initial price, total supply, and graduation goal
- Pool opens for trading

### Step 2: Early Buyers Phase ("PreBonding")
- People buy tokens with CRX
- Each purchase makes the price go UP (bonding curve)
- CRX accumulates in the pool vault
- This is the "fair launch" phase

### Step 3: Graduation ("Pool is a success!")
- When the pool collects enough CRX (e.g., $40k worth), it "graduates"
- Pool becomes a permanent trading venue
- No migration needed - same address works forever
- Like a startup going public

### Step 4: Forever Trading ("Graduated")
- Pool keeps working indefinitely
- Acts like a mini Uniswap
- Trading continues at market prices

---

## What Makes This Special

| Feature | What It Means | Why It Matters |
|---------|--------------|----------------|
| **CRX-Only** | All trades use CRX | Drives CRX demand |
| **Instant Graduation** | No migration when pool succeeds | Users keep same wallet, same address |
| **Curve Choices** | 2 price formulas | Creators pick their style |
| **Dynamic Thresholds** | $5k to $10M goals | Fits any project size |
| **No Rugs (Built-in)** | Vault security validated | Can't drain user funds |

---

## Your Competitive Position

| Competitor | Their Weakness | Your Advantage |
|------------|---------------|----------------|
| **PumpSwap** | No slippage protection | You have it |
| **Meteora** | Too complex | You're simpler |
| **Vertigo** | Closed source | You understand your own code |
| **Unisocks** | Only 1 curve | You have 2+ options |

---

## Current Status: Issues Found

### CRITICAL (Must fix before ANY users)

| # | Issue | Risk | Fix Time |
|---|-------|------|----------|
| 1 | Oracle crashes on zero/negative prices | Pools can't be created | 1 day |
| 2 | Price display wrong after graduation | Users see fake prices | 1 day |
| 3 | Oracle can overflow with extreme values | DoS attack | 1 day |

### HIGH (Should fix before launch)

| # | Issue | Risk | Fix Time |
|---|-------|------|----------|
| 4 | Anti-sniper uses wrong reserves (sell) | Snipers bypass limits | 0.5 day |
| 5 | CRX price never updates | USD values drift over time | 1 day |
| 6 | Can request more than vault has | Transaction fails confusingly | 0.5 day |
| 7 | Log message lies about fees | Users confused | 0.5 day |

### MEDIUM (Good to fix)

| # | Issue | Risk | Fix Time |
|---|-------|------|----------|
| 8 | Wasting gas on zero-fee transfers | Higher costs | 0.5 day |
| 9 | Unused config fields | Wasting rent/money | 0.5 day |
| 10 | No pause button | Can't stop exploits | 1 day |
| 11 | Assumes 6-decimal tokens | Some tokens won't work | 0.5 day |

### LOW (Nice to have)

| # | Issue | Risk | Fix Time |
|---|-------|------|----------|
| 12 | No events for dashboards | Hard to build analytics | 2 days |
| 13 | unique_traders field never used | Wasted storage | 0.5 day |

---

## What's Needed to Go Live

### Week 1-2: Fix Critical Bugs
- 4 critical issues
- 4 high-priority issues
- **~5 days of dev work**

### Week 3-8: Professional Audits
- 2 security firms
- ~$50k-150k cost
- **Required for any serious launch**

### Week 9-16: Testing & Bug Bounty
- Devnet deployment
- Public bug bounty ($100k+)
- Community testing

### Week 17+: Mainnet Launch
- After all above completed
- With insurance coverage

**Total time to production: ~4-5 months**

---

## The Bottom Line

| Question | Answer |
|----------|--------|
| Is the design sound? | **Yes** - well architected |
| Is it ready for mainnet? | **No** - needs fixes + audits |
| Can it compete with Pump/Meteora? | **Yes** - after production hardening |
| What's the main risk? | Launching without audits = potential loss of user funds |

---

## Key Numbers to Know

- **4** instructions in the AMM (simple!)
- **2** curve types (constant product + exponential)
- **$5k-$10M** graduation threshold range
- **0-1%** fee options per pool
- **4-5 months** to mainnet-ready
- **$50k-150k** audit cost estimate
- **$100k+** recommended bug bounty

---

## Action Items for You

1. **Decide**: Fix bugs internally or hire external devs?
2. **Budget**: Allocate $150k-300k for audits + bounty
3. **Timeline**: Plan for 4-5 month runway
4. **Legal**: Get legal review on token mechanics
5. **Insurance**: Research DeFi insurance options

---

*Generated: 2026-01-08*
*Status: Pre-audit, critical fixes needed*
