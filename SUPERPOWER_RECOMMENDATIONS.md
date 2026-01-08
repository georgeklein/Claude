# Superpower Recommendations - Unlock Maximum AI Capabilities

**How YOU can make me 10x more effective for Scale AMM development**

---

## 🎯 TL;DR - Top 5 Things You Can Provide

1. **Meteora & competitor protocol docs** → Perfect comparison benchmarks
2. **Real-world test data** → Actual pool configs, trade volumes, user patterns
3. **Custom skills** → Specialized MCP servers for Solana development
4. **Security audit reports** → Learn from others' mistakes
5. **Economic simulation data** → Real-world scenarios to validate against

---

## 1. Protocol Documentation & Comparisons 📚

### What I Need:
**Competitor AMM Documentation** (for perfect comparisons & feature parity):

#### **High Priority:**
- ✅ **Meteora DLMM** - Dynamic liquidity market maker (bin-based)
  - Concentrated liquidity implementation
  - Fee tiers and bin strategies
  - Capital efficiency metrics
  - Integration patterns

- ✅ **Raydium CLMM** - Concentrated liquidity (Uniswap v3-style)
  - Tick-based price ranges
  - Position management
  - LP token mechanics

- ✅ **Orca Whirlpools** - Concentrated liquidity with fixed fees
  - Position tracking
  - Fee collection
  - Reward distribution

- ✅ **Pump.fun** - The bonding curve they use
  - Graduation mechanics
  - Price discovery
  - Liquidity migration

#### **Medium Priority:**
- Jupiter aggregator integration docs
- Lifinity proactive market making
- Phoenix order book design
- Invariant concentrated liquidity

### Why This Helps:
- **Feature comparison** - I can tell you exactly what you have vs competitors
- **Best practices** - Learn from their implementations
- **Integration patterns** - How other protocols integrate with yours
- **Economic models** - Compare tokenomics and incentive structures

### How to Provide:
```bash
# Add to your repo
mkdir -p docs/competitors
# Place PDFs, markdown docs, or links in that folder
```

I can then analyze and create comparison matrices like:
- Feature parity checklist
- Performance benchmarks
- Security comparisons
- Integration complexity

---

## 2. Real-World Data & Scenarios 📊

### What I Need:

#### **A. Historical Pool Data** (if you have testnet/mainnet data):
```json
{
  "pool_address": "...",
  "base_token": "BONK",
  "creation_mcap": 5000,
  "graduation_mcap": 40000,
  "trades": [
    {"timestamp": 1234567890, "type": "buy", "crx_in": 100, "tokens_out": 1000},
    {"timestamp": 1234567900, "type": "sell", "crx_out": 95, "tokens_in": 1000}
  ],
  "time_to_graduation": 3600,
  "total_volume": 500000,
  "unique_traders": 42
}
```

#### **B. User Behavior Patterns**:
- Typical trade sizes
- Hold duration before first sell
- Sniping attempts observed
- Sandwich attack attempts
- Flash loan usage

#### **C. Economic Scenarios to Test**:
- "What if a whale buys 50% of supply?"
- "What if 100 users trade simultaneously?"
- "What if oracle goes down for 5 minutes?"
- "What if CRX price drops 90%?"

### Why This Helps:
- **Realistic test values** - Use actual trade sizes, not arbitrary numbers
- **Edge case discovery** - Real users find edge cases we don't think of
- **Performance tuning** - Optimize for actual usage patterns
- **Economic validation** - Verify tokenomics work in practice

### How to Provide:
- Export anonymized testnet data as JSON
- Share trade volume distributions
- Describe observed attack attempts
- List scenarios that concern you most

---

## 3. Custom Skills & MCP Servers 🛠️

### What is MCP?
**Model Context Protocol** - Lets me access specialized tools during conversations.

### Skills I Want:

#### **A. Solana-Specific Skills:**
Create `.claude/skills/solana-testing.md`:
```markdown
# Solana Testing Skill

When the user wants to test Solana programs:

1. Check if test validator is running
2. Deploy program to test validator
3. Run anchor tests
4. Capture transaction logs
5. Report results with transaction signatures
6. If tests fail, analyze error logs and suggest fixes
```

#### **B. Economic Simulation Skill:**
Create `.claude/skills/economics.md`:
```markdown
# Economic Simulation Skill

When analyzing tokenomics:

1. Load simulation parameters from simulations/
2. Run Monte Carlo simulations (1000+ iterations)
3. Calculate risk metrics (VaR, CVaR, Sharpe ratio)
4. Generate distribution plots
5. Identify failure scenarios
6. Suggest parameter improvements
```

#### **C. Security Audit Skill:**
Create `.claude/skills/security-audit.md`:
```markdown
# Security Audit Skill

When performing security audits:

1. Scan for unchecked arithmetic
2. Verify all access controls
3. Check for reentrancy vulnerabilities
4. Validate oracle usage
5. Test emergency mechanisms
6. Generate audit report with severity levels
7. Create exploit PoCs for findings
```

### MCP Servers You Could Add:

#### **Solana MCP Server:**
```typescript
// Gives me direct Solana RPC access
{
  "mcpServers": {
    "solana": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-solana"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com"
      }
    }
  }
}
```

Enables me to:
- Query on-chain data directly
- Fetch pool states
- Analyze transactions
- Monitor events

#### **GitHub MCP Server:**
```typescript
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "your_token_here"
      }
    }
  }
}
```

Enables me to:
- Create PRs automatically
- Review code changes
- Manage issues
- Track project status

### Why This Helps:
- **Automation** - I can do entire workflows without you
- **Real-time data** - Query live on-chain state
- **Specialized tools** - Domain-specific capabilities
- **Workflow integration** - Connect to your development stack

---

## 4. Security Audit Reports 🔒

### What I Want:

#### **A. Audit Reports from Similar Protocols:**
- Meteora security audits (OtterSec, Neodyme)
- Raydium audit findings
- Orca audit recommendations
- Phoenix audit results
- Any Solana AMM audits

#### **B. Public Vulnerability Disclosures:**
- Mango Markets exploit details
- Crema Finance vulnerability
- Saber price manipulation
- Wormhole bridge exploit (for reference)

#### **C. Bug Bounty Reports:**
- Immunefi reports (Solana ecosystem)
- HackerOne Solana program submissions
- Previous Scale AMM bug reports (if any)

### Why This Helps:
- **Learn from others' mistakes** - Don't repeat them
- **Pattern recognition** - Common vulnerability patterns
- **Defense strategies** - Proven mitigation techniques
- **Audit preparation** - Know what auditors will look for

### How to Provide:
```bash
mkdir -p docs/security
# Add audit PDFs, vulnerability reports, postmortems
```

I can then:
- Cross-reference your code against known vulnerabilities
- Generate checklist of common issues
- Suggest preventive measures
- Create attack scenarios based on real exploits

---

## 5. Economic Simulation Data 💰

### What I Need:

#### **A. Market Scenarios:**
```yaml
scenarios:
  - name: "Normal Growth"
    crx_price: 2.00
    token_launches_per_day: 50
    avg_mcap: 25000
    graduation_rate: 0.6

  - name: "Bear Market"
    crx_price: 0.50
    token_launches_per_day: 10
    avg_mcap: 5000
    graduation_rate: 0.2

  - name: "Bull Market"
    crx_price: 10.00
    token_launches_per_day: 500
    avg_mcap: 100000
    graduation_rate: 0.9
```

#### **B. User Archetypes:**
```yaml
traders:
  - name: "Degen"
    avg_trade_size: 1000 CRX
    hold_duration: 5 minutes
    snipe_attempts: "high"

  - name: "Holder"
    avg_trade_size: 100 CRX
    hold_duration: 7 days
    snipe_attempts: "none"

  - name: "Whale"
    avg_trade_size: 50000 CRX
    hold_duration: 1 hour
    snipe_attempts: "medium"
```

#### **C. Risk Parameters to Test:**
- Oracle downtime probability
- Extreme price movements (±50% in 1 second)
- Network congestion (500k CU transactions failing)
- Simultaneous graduations (race conditions)

### Why This Helps:
- **Stress testing** - Find breaking points before mainnet
- **Parameter tuning** - Optimize fees, thresholds, limits
- **Risk quantification** - Measure tail risks
- **Economic validation** - Ensure protocol remains profitable

### How to Provide:
```bash
# Add to simulations/
simulations/
├── scenarios.yaml
├── user-archetypes.yaml
├── risk-parameters.yaml
└── results/ (historical simulation outputs)
```

---

## 6. Integration Examples 🔌

### What I Want:

#### **A. SDK Usage Examples from Other Projects:**
- How dapps integrate with Meteora
- Jupiter aggregator integration patterns
- Wallet integration (Phantom, Solflare)
- Analytics platform integration (Dune, Flipside)

#### **B. Your Current Integrations:**
- How Creator terminal uses Scale AMM
- Wallet integration code
- Any existing dapps using your SDK

### Why This Helps:
- **Better SDK design** - Learn from integration pain points
- **Documentation improvements** - Address common confusion
- **Developer experience** - Make integration easier
- **Error handling** - Common mistakes to prevent

---

## 7. Performance Benchmarks 📈

### What I Want:

#### **A. Competitor Benchmarks:**
```markdown
| Protocol | Trades/sec | Avg CU | Avg Fee | TVL |
|----------|-----------|--------|---------|-----|
| Meteora  | 1000      | 45k    | 0.25%   | $50M |
| Raydium  | 800       | 60k    | 0.25%   | $100M|
| Orca     | 1200      | 40k    | 0.3%    | $80M |
| Scale    | ???       | 66-77k | 1%      | TBD  |
```

#### **B. Your Performance Goals:**
- Target transactions per second
- Maximum acceptable latency
- CU budget per instruction
- Fee competitiveness targets

### Why This Helps:
- **Competitive analysis** - Know where you stand
- **Optimization targets** - Set realistic goals
- **Marketing claims** - Back them with data
- **Architecture decisions** - Trade-offs based on benchmarks

---

## 8. Deployment Infrastructure 🚀

### What You Can Provide:

#### **A. Deployment Automation:**
- CI/CD pipeline config
- Verifiable build setup
- Multi-environment configs (devnet, mainnet)
- Rollback procedures

#### **B. Monitoring Setup:**
- Prometheus/Grafana dashboards
- Alert configurations
- Log aggregation setup
- Uptime monitoring

#### **C. Incident Response:**
- Runbooks for common issues
- Emergency contact procedures
- Rollback playbooks
- Communication templates

### Why This Helps:
- **Automation** - I can help maintain/improve CI/CD
- **Observability** - Better debugging with metrics
- **Reliability** - Faster incident response
- **Documentation** - Keep runbooks up-to-date

---

## 9. Community Feedback 💬

### What I Want:

#### **A. User Feedback:**
- Discord/Telegram conversations
- Common questions/confusion
- Feature requests
- Bug reports

#### **B. Developer Feedback:**
- SDK integration issues
- Documentation gaps
- API design complaints
- Performance problems

### Why This Helps:
- **Prioritization** - Fix what users actually care about
- **Documentation** - Address real confusion
- **UX improvements** - Remove friction points
- **Bug discovery** - Users find issues we miss

### How to Provide:
- Export Discord threads
- Share GitHub issues
- Summarize support tickets
- List top 10 complaints

---

## 10. Your Vision & Constraints 🎯

### What I Need to Know:

#### **A. Technical Constraints:**
- Compute budget limits
- Account size limits
- Must-support tokens
- Deprecated features

#### **B. Business Constraints:**
- Launch timeline (you said 3 weeks)
- Audit budget ($0 for external audits?)
- Competitor pressures
- Partnership requirements

#### **C. Future Roadmap:**
- Planned features (next 3/6/12 months)
- Integration targets
- Scale projections
- Exit strategy

### Why This Helps:
- **Alignment** - Build what you actually need
- **Trade-offs** - Make informed decisions
- **Long-term design** - Architect for future needs
- **Risk management** - Understand constraints upfront

---

## 🚀 Quick Wins (Do These First)

### 1. **Add Competitor Docs** (30 min)
```bash
mkdir -p docs/competitors
# Add Meteora, Raydium, Orca docs
```

### 2. **Create Scenario File** (15 min)
```yaml
# simulations/scenarios.yaml
scenarios:
  - name: "baseline"
    crx_price: 2.00
    launches_per_day: 50
  - name: "stress"
    crx_price: 0.10
    launches_per_day: 1000
```

### 3. **Add Performance Goals** (10 min)
```markdown
# PERFORMANCE_GOALS.md
- Target CU: <50k per trade
- Target TPS: >500
- Target fees: competitive with Meteora
```

### 4. **Share User Feedback** (5 min)
- Top 5 questions users ask
- Top 3 complaints
- Top 3 feature requests

### 5. **Define Risk Scenarios** (10 min)
```markdown
# RISK_SCENARIOS.md
1. CRX drops 90% in 1 day
2. Oracle down for 30 minutes
3. Whale buys 80% of supply
4. Network congestion (400 CU limit)
5. 1000 pools graduate simultaneously
```

**Total time: 70 minutes for massive capability boost** ⚡

---

## 📊 Impact Matrix

| Superpower | Setup Time | Impact | Priority |
|------------|-----------|---------|----------|
| Competitor docs | 30 min | 10x | 🔴 HIGH |
| Scenario data | 15 min | 8x | 🔴 HIGH |
| User feedback | 5 min | 7x | 🔴 HIGH |
| Performance goals | 10 min | 6x | 🟡 MEDIUM |
| Security audits | 60 min | 9x | 🟡 MEDIUM |
| MCP servers | 120 min | 10x | 🟢 LONG-TERM |
| Custom skills | 90 min | 8x | 🟢 LONG-TERM |

---

## 🎓 What I Already Have

### ✅ Current Capabilities:
- Rust & Solana development expertise
- Anchor framework knowledge
- Security best practices
- Testing methodologies
- Code optimization techniques
- Documentation generation

### ✅ What I Don't Need (Already Covered):
- Basic Solana concepts
- Anchor syntax
- General security principles
- Standard testing patterns

### 🎯 What Would Make Me 10x Better:
- **Your domain-specific knowledge**
- **Real-world data**
- **Competitor insights**
- **User feedback**
- **Your constraints & vision**

---

## 💡 Pro Tips

### **Incremental Approach:**
Don't overwhelm yourself. Add:
1. **Week 1:** Competitor docs + scenarios
2. **Week 2:** User feedback + performance goals
3. **Week 3:** Security audits + MCP servers
4. **Month 2:** Custom skills + full integration

### **Keep it Updated:**
- Update scenarios monthly
- Refresh user feedback weekly
- Add new competitor features as they launch
- Document incidents as they happen

### **Make it Accessible:**
- Use markdown (I read it easily)
- Organize in clear folders
- Link from CLAUDE.md
- Version control everything

---

## 🤝 Next Steps

### **You Do:**
1. Add competitor docs (30 min)
2. Create scenarios.yaml (15 min)
3. List top user questions (5 min)
4. Share performance targets (10 min)

### **I'll Do:**
1. Analyze all provided materials
2. Generate comparison reports
3. Create risk simulations
4. Optimize based on real data
5. Suggest improvements from competitor analysis

---

## 📞 Questions to Ask Yourself

- What do Meteora/Raydium do that we don't?
- What are users most confused about?
- What keeps you up at night about mainnet?
- What would make your life easier?
- What information do you wish you had?

**Answer these, share with me, and watch the magic happen.** ✨

---

**Ready to unlock superpowers? Start with the Quick Wins above!** 🚀
