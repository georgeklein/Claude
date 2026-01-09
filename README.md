# Scale AMM

**Launch tokens at any market cap with zero upfront capital**

<img width="335" height="149" alt="Scale AMM Logo" src="https://github.com/user-attachments/assets/679e0b5f-b379-42bb-a6a4-44417618292a" />

Fully permissionless bonding curve protocol on Solana. Launch tokens without providing liquidity—pools automatically graduate to permanent AMMs when they hit your threshold.

Built for [Creator](https://www.creator.so) · Powered by $CRX

---

## Install

```bash
npm install @scale-amm/sdk @solana/web3.js @coral-xyz/anchor
```

## Launch a Token

```typescript
import { ScaleAMM } from '@scale-amm/sdk';
import { Connection, Keypair } from '@solana/web3.js';

const scale = new ScaleAMM(connection, wallet);

// Create pool
const pool = await scale.createPool({
  baseMint: tokenMint,
  supply: 1_000_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 40_000,
});

// Trade
await scale.buy(pool.address, { crxAmount: 100, slippage: 1.0 });
await scale.sell(pool.address, { tokenAmount: 5000, slippage: 1.0 });
```

---

## SDK Usage

### Create Pool

```typescript
import { ScaleAMM } from '@scale-amm/sdk';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const scale = new ScaleAMM(connection, wallet);

const pool = await scale.createPool({
  baseMint: tokenMint,              // Token to launch
  supply: 1_000_000_000,            // Total supply
  initialMarketCapUsd: 10_000,      // Launch at $10k market cap
  graduationThresholdUsd: 40_000,   // Graduate at $40k
  feeBps: 0,                        // Creator fee (0% = free)
});

console.log('Pool created:', pool.address);
```

### Trade

```typescript
// Buy tokens with CRX
const buyTx = await scale.buy(pool.address, {
  crxAmount: 100,
  slippage: 1.0,  // 1% max slippage
});

// Sell tokens for CRX
const sellTx = await scale.sell(pool.address, {
  tokenAmount: 5000,
  slippage: 1.0,
});
```

### Get Pool Info

```typescript
const pool = await scale.getPool(poolAddress);

console.log({
  phase: pool.phase,                         // 'PreBonding' | 'Graduated'
  price: pool.price,                         // CRX per token
  marketCapUsd: pool.marketCapUsd,           // Current market cap
  graduationProgress: pool.graduationProgress, // 0-100%
  liquidityCrx: pool.liquidityCrx,           // CRX in pool
});
```

### Estimate Trades

```typescript
// Get quote without executing trade
const buyEstimate = await scale.estimateBuy(pool.address, 100);
console.log('You will receive:', buyEstimate.output, 'tokens');

const sellEstimate = await scale.estimateSell(pool.address, 5000);
console.log('You will receive:', sellEstimate.output, 'CRX');
```

### Listen to Events

```typescript
// Listen for trades
scale.onTrade(pool.address, (event) => {
  console.log(event.isBuy ? 'BUY' : 'SELL', event.amount);
});

// Listen for graduation
scale.onGraduation(pool.address, (event) => {
  console.log('Pool graduated at', event.marketCapUsd);
});
```

**Full API documentation:** See `sdk/README.md`

---

## Deployment

Deploy your own instance of Scale AMM.

### Prerequisites

```bash
# Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Anchor v0.30.1
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.1 && avm use 0.30.1

# Node.js 18+
node --version
```

### Build & Test

```bash
git clone https://github.com/georgeklein/Scale-AMM.git
cd Scale-AMM
npm install
anchor build
anchor test  # 368 tests
```

### Deploy to Devnet

```bash
solana config set --url devnet
anchor deploy --provider.cluster devnet
```

### Deploy to Mainnet

**⚠️ CRITICAL CHECKLIST:**

1. **Update deployer pubkey** in `programs/creator-amm-v2/src/instructions/initialize.rs:23`
   - Replace `"11111111111111111111111111111111"` with your wallet
   - Run: `solana address` to get your pubkey
   - This prevents front-running of initialize()

2. **Run all tests:** `anchor test` (must pass all 368)

3. **Fund wallet:** Minimum 10 SOL for deployment

4. **Deploy:**
```bash
solana config set --url mainnet-beta
anchor deploy --provider.cluster mainnet-beta
```

5. **Initialize immediately** (first caller becomes authority):
```bash
npm run deploy:mainnet
```

See `.env.example` for configuration.

---

## How It Works

### 1. Zero Capital Launch
No liquidity required. Virtual reserves are calculated from your target market cap and current $CRX price.

### 2. Two-Phase System

**PreBonding** (Launch → Threshold)
- Virtual reserves price tokens
- Real $CRX accumulates from trades
- Optional WAA anti-dump fees

**Graduated** (After Threshold)
- Real reserves price tokens (x×y=k AMM)
- $CRX locked permanently (deflationary)
- Continues trading forever

### 3. Universal $CRX Flow
```
SOL → $CRX → YOUR_TOKEN
```
All volume flows through $CRX, creating constant demand.

---

## Configuration

### Pool Creation

```typescript
await scale.createPool({
  baseMint: PublicKey,
  supply: number,
  initialMarketCapUsd: number,
  graduationThresholdUsd: number,
  feeBps?: number,                 // Optional: creator fee (default: 0)
});
```

<details>
<summary><b>Advanced options (rarely used)</b></summary>

- `metadataUri?: string` - Arweave/IPFS URI (default: '')
- `curveType?: 'ConstantProduct' | 'Exponential'` - (default: ConstantProduct)
- `disableWaa?: boolean` - Disable anti-dump (default: true)
</details>

### Pool Fees

**Creator Fees** (per-pool, set at creation):
- Can be **any value** in basis points (bps)
- 0 bps = 0%, 25 bps = 0.25%, 100 bps = 1%
- Goes to pool creator
- *Creator platform uses 0/25/100 as preset options*

**Protocol Fee** (global, adjustable):
- Optional fee applied to **all pools**
- Starts at 0% (disabled) on mainnet launch
- Adjustable by protocol authority (0-10% range)
- Goes to fee recipient for $CRX deflation/treasury
- Retroactive - affects all pools when changed

---


## Governance

Protocol authority has control over mutable parameters:

**Authority Management:**
```typescript
// Transfer authority (e.g., to multisig or DAO)
await scale.updateAuthority(newAuthority);
```

**Protocol Fee (0-10%, default: 0%):**
```typescript
// Adjust global protocol fee (affects all pools retroactively)
await scale.updateProtocolFee(50);  // 0.5%
```

**WAA Configuration (Anti-Dump Protection):**

Optional per-pool feature (disabled by default). WAA fees go to the creator.

```typescript
// Adjust anti-dump protection parameters
await scale.updateWaaConfig({
  tier1Slots: 25,    // 10 seconds
  tier2Slots: 150,   // 1 minute
  tier3Slots: 750,   // 5 minutes
  feeMaxBps: 300,    // 3%
  feeMinBps: 50,     // 0.5%
});

// Or disable WAA entirely
await scale.updateWaaConfig({
  tier1Slots: 25,
  tier2Slots: 150,
  tier3Slots: 750,
  feeMaxBps: 0,      // Disabled
  feeMinBps: 0,
});
```

**Governance Progression:**
1. Single wallet (deploy & initial tuning)
2. Multisig (e.g., Squads)
3. DAO governance (full decentralization)

---

## Security

✅ Checked arithmetic (no overflows)
✅ CEI pattern (no reentrancy)
✅ Oracle validation (price freshness)
✅ Vault verification (balance checks)
✅ Graduation protection (max 20% price jump)
✅ Slippage protection (user-defined)
✅ No pause button (fully permissionless)
✅ Rugpull prevention (mint/freeze revoked)
✅ Token-2022 blocked (no transfer hooks)
✅ Mutable governance (upgradeable authority)

**Test Coverage:** 368 tests passing
**Audits:** 20 AI agent security audits covering all attack vectors
**Documentation:** See `docs/SECURITY.md`

---

## Protocol Details

### Virtual Reserves

At pool creation:
```
virtual_crx = initial_market_cap_usd / crx_price_usd
virtual_tokens = token_supply
```

Virtual reserves never change during PreBonding.

### Graduation

Pool graduates when:
```
real_crx_reserves >= (graduation_threshold_usd / crx_price_usd)
```

Pricing switches from virtual → real reserves.

### Bonding Curves

**Constant Product** (Uniswap-style):
```
output = (input × output_reserve) / (input_reserve + input)
```

**Exponential** (Faster growth):
```
output = (input × output_reserve) / (input_reserve + 1.5 × input)
```

### WAA (Optional)

Time-decaying sell fees when enabled:
- T1 (0-10s): 3% fee
- T2 (10s-1min): Decays from 3% → 0.5%
- T3 (1min-5min): Decays from 0.5% → 0%
- After 5min: 0% extra fee

Set `disableWaa: true` to skip.

---

## Requirements

- Node.js 18+
- Solana 1.18+
- Anchor 0.30.1+

```json
{
  "@solana/web3.js": "^1.87.0",
  "@coral-xyz/anchor": "^0.30.1"
}
```

---

## Support

**Issues:** [GitHub](https://github.com/georgeklein/Scale-AMM/issues)
**Discord:** [Creator Community](https://discord.gg/creator)
**Docs:** [docs.creator.so](https://docs.creator.so)

---

## License

Apache-2.0

---

**Built for [Creator](https://www.creator.so) · Powered by $CRX**
