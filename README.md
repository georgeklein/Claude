# Scale AMM

**Bonding curve protocol for token launches on Solana**

Launch tokens at specific USD market caps with oracle-backed virtual liquidity. Automatic graduation to permanent AMM.

---

## Features

- **Virtual Liquidity** - Launch at any USD market cap without upfront capital
- **Dual-Phase Bonding Curve** - Virtual reserves → Real AMM at graduation
- **Oracle Integration** - Real-time CRX price feeds via Pyth
- **Anti-Sniper Protection** - WAA penalties + size limits during launch
- **Battle-Tested** - 179 tests, checked arithmetic everywhere

---

## Installation

```bash
npm install @scale-amm/sdk @solana/web3.js
```

---

## Quick Start

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { ScaleAMM } from '@scale-amm/sdk';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.fromSecretKey(yourSecretKey);
const scale = new ScaleAMM(connection, wallet);

// Create pool
const pool = await scale.createPool({
  baseMint: yourTokenMint,
  supply: 1_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 85_000,
});

// Buy tokens
await scale.buy(pool.address, {
  crxAmount: 100,
  slippage: 1.0,
});

// Sell tokens
await scale.sell(pool.address, {
  tokenAmount: 5000,
  slippage: 1.0,
});
```

---

## How It Works

### Phase 1: Pre-Bonding (Virtual Liquidity)
- Oracle calculates virtual reserves based on target USD market cap
- Accumulates real CRX from trades
- Anti-sniper active (10% penalty + 5% size limit in first 100 slots)

### Phase 2: Graduated (Real AMM)
- Transitions to constant product formula (x×y=k)
- Real reserves locked permanently
- Continues trading forever

---

## Architecture

**Virtual Liquidity Formula:**
```
virtual_reserves = (target_mcap_usd / crx_price_usd) × supply
```

Oracle adjusts reserves automatically:
- CRX at $2 → 5,000 CRX virtual reserves
- CRX at $1 → 10,000 CRX virtual reserves
- USD market cap stays constant

**Graduation Trigger:**
```
if total_value_locked_usd >= graduation_threshold_usd:
    pool.phase = Graduated
    pool.reserves = accumulated_real_crx
```

---

## Security

- ✅ Checked arithmetic everywhere (no overflows)
- ✅ Oracle validation (staleness, confidence, exponent bounds)
- ✅ Slippage protection
- ✅ Vault balance validation after every trade
- ✅ Emergency pause mechanism
- ✅ 179 tests (98% coverage)

---

## Documentation

- **[GETTING_STARTED.md](GETTING_STARTED.md)** - 5-minute setup guide
- **[sdk/README.md](sdk/README.md)** - Complete SDK API reference
- **[WHAT_IT_DOES.md](WHAT_IT_DOES.md)** - Protocol deep dive
- **[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)** - Pre-deploy requirements

---

## Development

```bash
# Clone & install
git clone https://github.com/georgeklein/Scale-AMM.git
cd Scale-AMM
npm install

# Build
anchor build

# Test
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

---

## Program Instructions

| Instruction | Description |
|-------------|-------------|
| `initialize` | Initialize protocol config (deployer only, one-time) |
| `create_pool` | Create new bonding curve pool |
| `buy` | Buy tokens with CRX |
| `sell` | Sell tokens for CRX |
| `set_paused` | Emergency pause/unpause (authority only) |

---

## License

Apache-2.0
