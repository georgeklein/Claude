# Scale AMM

**Tokenize everything on Solana with $CRX**

Power the Creator platform. Launch tokens at any USD market cap with zero upfront capital. Built for AI-powered creation.

---

## What is Scale AMM?

Scale AMM is the bonding curve protocol that powers the **Creator platform** and the **$CRX ecosystem**.

**Primary Use (99%):** Fuel custom token concepts on Creator
**Other Use (1%):** Enable developers to build AI-powered token tools

Launch tokens at specific USD market caps using oracle-backed virtual liquidity. Automatic graduation to permanent AMM when targets are hit.

---

## Why Scale AMM?

**Built for Creator:**
- Launch tokens at any USD market cap without upfront capital
- Oracle-adjusted virtual liquidity keeps USD prices stable
- Automatic graduation to permanent AMM
- All volume flows through $CRX (deflationary pressure)

**Enable AI Builders:**
- Simple 3-line SDK
- AI agents can create and manage pools
- Event listeners for automated strategies
- TypeScript-first API

**Grow $CRX Economy:**
- Every trade uses $CRX
- Graduated pools lock $CRX permanently
- Protocol fees accumulate in $CRX
- Creator fees paid in $CRX

---

## Quick Start

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { ScaleAMM } from '@scale-amm/sdk';

const scale = new ScaleAMM(connection, wallet);

// Launch a token
const pool = await scale.createPool({
  baseMint: yourTokenMint,
  supply: 1_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 85_000,
});

// Trade
await scale.buy(pool.address, { crxAmount: 100 });
await scale.sell(pool.address, { tokenAmount: 5000 });
```

---

## How It Works

### Virtual Liquidity
```
Launch at $10k market cap with $0 upfront
Oracle adjusts reserves based on $CRX price
USD market cap stays constant
```

### Automatic Graduation
```
When TVL hits $85k threshold:
  → Pool converts to permanent AMM (x×y=k)
  → Accumulated $CRX locked forever
  → Continues trading indefinitely
```

### $CRX Flow
```
User trades SOL → CRX → Token
Protocol earns 1% fees in $CRX
Creator earns custom % in $CRX
Graduated pools trap $CRX (deflationary)
```

---

## Features

- **Virtual Liquidity** - Launch at any USD market cap with $0 upfront
- **Oracle Integration** - Real-time $CRX price feeds via Pyth
- **Anti-Sniper** - WAA penalties + size limits during launch
- **Dual-Phase** - Virtual reserves → Real AMM at graduation
- **Battle-Tested** - 179 tests, checked arithmetic everywhere

---

## For Creator Platform

Scale AMM powers token launches on Creator:
- Custom token concepts for your community
- AI-generated token launches
- Automated trading strategies
- Event-driven integrations

**Everything runs on $CRX.**

---

## For AI Builders

Build AI agents that:
- Create tokens automatically
- Monitor and trade pools
- React to market events
- Execute complex strategies

See [sdk/README.md](sdk/README.md) for complete API.

---

## Installation

```bash
npm install @scale-amm/sdk @solana/web3.js
```

---

## Documentation

- **[GETTING_STARTED.md](GETTING_STARTED.md)** - 5-minute setup
- **[sdk/README.md](sdk/README.md)** - Complete API reference
- **[WHAT_IT_DOES.md](WHAT_IT_DOES.md)** - Protocol deep dive
- **[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)** - Pre-deploy requirements

---

## Security

- ✅ Checked arithmetic everywhere
- ✅ Oracle validation (staleness, confidence, bounds)
- ✅ Slippage protection
- ✅ Vault balance validation
- ✅ Emergency pause mechanism
- ✅ 179 tests (98% coverage)

---

## Development

```bash
git clone https://github.com/georgeklein/Scale-AMM.git
cd Scale-AMM
npm install
anchor build
anchor test
```

---

## License

Apache-2.0

---

**Built for Creator. Powered by $CRX.**
