# Scale AMM

**Launch tokens at any market cap with zero upfront capital**

<img width="335" height="149" alt="Scale AMM Logo" src="https://github.com/user-attachments/assets/679e0b5f-b379-42bb-a6a4-44417618292a" />

Scale AMM is a fully permissionless bonding curve protocol on Solana. Create token pools at specific USD market caps without providing liquidity—pools automatically graduate to permanent AMMs when they reach your target.

Built for [Creator](https://www.creator.fun) · Powered by $CRX

---

## Quick Start

### Install the SDK

```bash
npm install @scale-amm/sdk @solana/web3.js @coral-xyz/anchor
```

### Launch Your First Token

```typescript
import { ScaleAMM } from '@scale-amm/sdk';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.fromSecretKey(/* your key */);
const scale = new ScaleAMM(connection, wallet);

// Create a bonding curve pool
const pool = await scale.createPool({
  baseMint: tokenMint,              // Your token address
  supply: 1_000_000,                // 1M token supply
  initialMarketCapUsd: 10_000,      // Start at $10k
  graduationThresholdUsd: 40_000,   // Graduate at $40k
});

console.log('Pool created:', pool.address);
console.log('Initial price:', pool.price, 'CRX per token');
```

That's it. Your token is live.

---

## Why Scale AMM?

### Zero Capital Launch
Traditional AMMs require you to deposit both tokens. Scale calculates virtual reserves from your target market cap and current $CRX price. No capital needed.

### Automatic Graduation
When your pool hits your chosen threshold (e.g., $40k), it automatically converts to a permanent x×y=k AMM. The accumulated $CRX stays locked forever—making $CRX deflationary.

### Built for Creator
All volume flows through $CRX:
```
SOL → $CRX → YOUR_TOKEN
```
This creates constant demand for $CRX and aligns all creators with the Creator ecosystem.

### Fully Permissionless
No pause button. No admin keys. No backdoors. Once deployed, it runs autonomously forever.

---

## Core Concepts

### Two-Phase Lifecycle

**Phase 1: PreBonding** (Launch → $40k)
- Pricing uses **virtual reserves** (oracle-calculated)
- Real $CRX accumulates from trades
- Anti-sniper protection active (first ~8 seconds)
- Optional anti-dump fees (WAA)

**Phase 2: Graduated** ($40k+)
- Pricing uses **real reserves** (actual vault balances)
- Functions as permanent AMM (x×y=k)
- $CRX locked forever
- Continues trading indefinitely

### Fee Tiers

Choose your pool's fee when creating:

- **0 bps** (0%) - Free trading, maximum growth
- **25 bps** (0.25%) - Balanced growth + creator income
- **100 bps** (1%) - Premium fees, maximum creator revenue

Fees are collected in $CRX and paid to the pool creator.

### Bonding Curves

**Constant Product** (default)
```
y = (x × Y) / (X + x)
```
Uniswap-style pricing. Proven, predictable, linear price growth.

**Exponential** (optional)
```
y = (x × Y) / (X + 1.5x)
```
Steeper curve, faster price increases. Reaches graduation ~33% faster.

---

## Examples

### Create a Pool

```typescript
import { ScaleAMM } from '@scale-amm/sdk';
import { Connection, Keypair } from '@solana/web3.js';

const scale = new ScaleAMM(connection, wallet);

const pool = await scale.createPool({
  baseMint: tokenMint,
  supply: 1_000_000_000,              // 1 billion tokens
  initialMarketCapUsd: 10_000,        // Launch at $10k market cap
  graduationThresholdUsd: 40_000,     // Graduate at $40k
  feeBps: 100,                        // 1% fee (0, 25, or 100)
  curveType: 'ConstantProduct',       // or 'Exponential'
  disableWaa: false,                  // Enable anti-dump protection
});
```

### Buy Tokens

```typescript
const result = await scale.buy(pool.address, {
  crxAmount: 100,      // Buy with 100 CRX
  slippage: 1.0,       // Max 1% slippage
});

console.log('Transaction:', result.signature);
console.log('New price:', result.newPrice);
```

### Sell Tokens

```typescript
const result = await scale.sell(pool.address, {
  tokenAmount: 50_000,  // Sell 50k tokens
  slippage: 1.0,
});

console.log('Received:', result.crxReceived, 'CRX');
```

### Get Pool Info

```typescript
const pool = await scale.getPool(poolAddress);

console.log({
  phase: pool.phase,                    // 'PreBonding' | 'Graduated'
  price: pool.price,                    // Current CRX price per token
  marketCap: pool.marketCapUsd,         // Current USD market cap
  liquidityCrx: pool.liquidityCrx,      // Real CRX in pool
  graduationProgress: pool.graduationProgress,  // 0-100%
});
```

### Get Price Quote

```typescript
const estimate = await scale.estimateBuy(poolAddress, 100);

console.log('You receive:', estimate.output, 'tokens');
console.log('Price impact:', estimate.priceImpact + '%');
console.log('Fee:', estimate.fee, 'CRX');
```

### Listen for Events

```typescript
// Listen for trades
scale.onTrade(pool.address, (event) => {
  console.log('Trade:', event.isBuy ? 'BUY' : 'SELL');
  console.log('Amount:', event.amount);
  console.log('User:', event.user);
});

// Listen for graduation
scale.onGraduation(pool.address, (event) => {
  console.log('Pool graduated at slot', event.slot);
  console.log('Final threshold:', event.graduationThresholdCrx);
});
```

---

## Complete Example: Launch to Trade

```typescript
import { ScaleAMM } from '@scale-amm/sdk';
import { Connection, Keypair } from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  setAuthority,
  AuthorityType,
} from '@solana/spl-token';

// 1. Setup
const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.fromSecretKey(/* your private key */);
const scale = new ScaleAMM(connection, wallet);

// 2. Create token (1B supply, 9 decimals)
const tokenMint = await createMint(
  connection,
  wallet,
  wallet.publicKey,
  null,  // No freeze authority
  9      // 9 decimals
);

const tokenAccount = await getOrCreateAssociatedTokenAccount(
  connection,
  wallet,
  tokenMint,
  wallet.publicKey
);

// 3. Mint supply
await mintTo(
  connection,
  wallet,
  tokenMint,
  tokenAccount.address,
  wallet,
  1_000_000_000 * 10**9  // 1B tokens
);

// 4. Revoke mint authority (prevent rugpulls)
await setAuthority(
  connection,
  wallet,
  tokenMint,
  wallet.publicKey,
  AuthorityType.MintTokens,
  null
);

// 5. Create Scale AMM pool
const pool = await scale.createPool({
  baseMint: tokenMint,
  supply: 1_000_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 40_000,
  feeBps: 100,
  curveType: 'ConstantProduct',
});

console.log('✅ Pool created:', pool.address);
console.log('📊 Initial price:', pool.price, 'CRX per token');

// 6. Trade
const buyResult = await scale.buy(pool.address, {
  crxAmount: 100,
  slippage: 1.0,
});

console.log('✅ Bought tokens:', buyResult.signature);
```

---

## API Reference

### `ScaleAMM`

#### Constructor

```typescript
new ScaleAMM(connection: Connection, wallet: Keypair)
```

Creates a new SDK instance.

#### Methods

##### `createPool(params)`

Creates a new bonding curve pool.

**Parameters:**
```typescript
{
  baseMint: PublicKey,              // Token to launch
  supply: number,                   // Total token supply (human-readable)
  initialMarketCapUsd: number,      // Starting market cap in USD
  graduationThresholdUsd: number,   // Graduate at this USD value
  feeBps?: number,                  // Pool fee: 0, 25, or 100 (default: 0)
  curveType?: 'ConstantProduct' | 'Exponential',  // default: ConstantProduct
  disableWaa?: boolean,             // Disable anti-dump fees (default: false)
}
```

**Returns:** `Promise<PoolInfo>`

---

##### `buy(pool, params)`

Buy tokens with CRX.

**Parameters:**
```typescript
{
  crxAmount: number,      // Amount of CRX to spend
  slippage: number,       // Max slippage (e.g., 1.0 = 1%)
}
```

**Returns:** `Promise<TradeResult>`

---

##### `sell(pool, params)`

Sell tokens for CRX.

**Parameters:**
```typescript
{
  tokenAmount: number,    // Amount of tokens to sell
  slippage: number,       // Max slippage (e.g., 1.0 = 1%)
}
```

**Returns:** `Promise<TradeResult>`

---

##### `getPool(address)`

Fetch pool state.

**Returns:**
```typescript
{
  address: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  creator: PublicKey,
  phase: 'PreBonding' | 'Graduated',
  curveType: 'ConstantProduct' | 'Exponential',
  price: number,                    // Current CRX per token
  marketCapUsd: number,             // Current market cap in USD
  liquidityCrx: number,             // Real CRX in pool
  liquidityTokens: number,          // Tokens in pool
  graduationProgress: number,       // 0-100%
  feeBps: number,                   // Pool fee in basis points
  disableWaa: boolean,              // Anti-dump protection enabled?
}
```

---

##### `estimateBuy(pool, crxAmount)`

Get buy quote without executing.

**Returns:**
```typescript
{
  output: number,         // Tokens you'll receive
  priceImpact: number,    // Price impact percentage
  fee: number,            // Fee in CRX
}
```

---

##### `estimateSell(pool, tokenAmount)`

Get sell quote without executing.

**Returns:**
```typescript
{
  output: number,         // CRX you'll receive
  priceImpact: number,    // Price impact percentage
  fee: number,            // Fee in CRX
}
```

---

### Events

##### `onTrade(pool, callback)`

Listen for trades on a pool.

```typescript
scale.onTrade(pool.address, (event) => {
  console.log('Trade:', event);
});
```

**Event:**
```typescript
{
  user: PublicKey,
  isBuy: boolean,
  crxAmount: number,
  tokenAmount: number,
  newPrice: number,
  slot: number,
}
```

---

##### `onGraduation(pool, callback)`

Listen for pool graduation.

```typescript
scale.onGraduation(pool.address, (event) => {
  console.log('Graduated!', event);
});
```

**Event:**
```typescript
{
  pool: PublicKey,
  slot: number,
  finalCrxReserves: number,
  finalTokenReserves: number,
}
```

---

## Error Handling

The SDK throws typed errors you can catch:

```typescript
import { ScaleError, ErrorCode } from '@scale-amm/sdk';

try {
  await scale.buy(pool, { crxAmount: 100, slippage: 1.0 });
} catch (error) {
  if (error instanceof ScaleError) {
    switch (error.code) {
      case 'SLIPPAGE_EXCEEDED':
        console.log('Price moved too much, try again');
        break;
      case 'INSUFFICIENT_BALANCE':
        console.log('Not enough CRX');
        break;
      case 'ANTI_SNIPER_ACTIVE':
        console.log('Trade too large during launch window');
        break;
      case 'POOL_NOT_FOUND':
        console.log('Pool does not exist');
        break;
      default:
        console.error('Error:', error.message);
    }
  }
}
```

**Common Error Codes:**
- `SLIPPAGE_EXCEEDED` - Price moved beyond tolerance
- `INSUFFICIENT_BALANCE` - Not enough tokens/CRX
- `ANTI_SNIPER_ACTIVE` - Trade too large during launch (~8 seconds)
- `POOL_NOT_FOUND` - Pool doesn't exist
- `INVALID_AMOUNT` - Amount must be > 0
- `INSUFFICIENT_LIQUIDITY` - Not enough liquidity for trade
- `GRADUATION_PRICE_JUMP_TOO_LARGE` - Price discontinuity detected

---

## Deployment

### Prerequisites

```bash
# Solana CLI (required)
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Anchor CLI v0.30.1 (required)
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.1
avm use 0.30.1

# Node.js 18+ (required)
node --version  # Should be v18 or higher
```

### Clone and Build

```bash
git clone https://github.com/georgeklein/Scale-AMM.git
cd Scale-AMM
npm install
anchor build
```

### Test

```bash
anchor test  # Runs all 368 tests
```

### Deploy to Devnet

```bash
# 1. Set cluster
solana config set --url devnet

# 2. Create/fund wallet (if needed)
solana-keygen new --outfile ~/.config/solana/devnet.json
solana airdrop 2

# 3. Deploy program
anchor deploy --provider.cluster devnet

# 4. Note program ID
# Update Anchor.toml and sdk/ScaleUtils.ts with new program ID
```

### Deploy to Mainnet

**⚠️ CRITICAL CHECKLIST:**

Before mainnet deployment, you **MUST** complete all items:

- [ ] Update `DEPLOYER_PUBKEY` in `programs/creator-amm-v2/src/instructions/initialize.rs:23`
  - Replace `"11111111111111111111111111111111"` with your wallet address
  - Get your address: `solana address`
  - **Why:** Prevents front-running of `initialize()` call

- [ ] Run all 368 tests: `anchor test`
  - All tests must pass
  - Fix any failures before proceeding

- [ ] Test on devnet for 72+ hours
  - Create pools, execute trades
  - Monitor for errors/anomalies
  - Verify graduation works correctly

- [ ] Fund deployment wallet
  - Minimum 10 SOL for deployment + rent
  - Check balance: `solana balance`

- [ ] Verify `.env` configuration
  - Copy `.env.example` to `.env`
  - Set `CRX_MINT` to mainnet $CRX token address
  - Set `FEE_RECIPIENT` to your fee collection wallet
  - Set `INITIAL_CRX_PRICE_USD` (6 decimals, e.g., 2000000 = $2.00)

**Deploy:**

```bash
# 1. Set cluster
solana config set --url mainnet-beta

# 2. Deploy program
anchor deploy --provider.cluster mainnet-beta

# 3. Initialize protocol (IMMEDIATELY after deploy!)
# Use scripts/deploy-amm.ts to initialize with correct params
npm run deploy:mainnet
```

**Post-Deploy:**

```bash
# Verify program deployed
solana program show <PROGRAM_ID>

# Initialize protocol (prevents front-running)
# This MUST be done immediately - first to call initialize() becomes authority
```

---

## Security

Scale AMM has been extensively tested and hardened:

✅ **Checked Arithmetic** - All math uses safe ops, no overflows
✅ **CEI Pattern** - Checks-Effects-Interactions prevents reentrancy
✅ **Oracle Validation** - Price freshness and confidence checks
✅ **Vault Security** - Post-trade balance verification
✅ **Slippage Protection** - User-defined maximum slippage
✅ **Graduation Continuity** - Price jump limited to 20% at graduation
✅ **No Admin Backdoors** - Fully permissionless, no pause button

**Test Coverage:** 368 tests covering:
- Oracle manipulation
- Flash loan attacks
- Concurrent trading
- Graduation edge cases
- Fee calculation accuracy
- Arithmetic overflow scenarios

**Audits:**
20 AI agent security audits completed. See `docs/security/` for reports.

**Bug Bounty:**
Report vulnerabilities to [security@creator.so](mailto:security@creator.so)

---

## Protocol Details

### Pricing Formulas

**Constant Product:**
```
output = (input × output_reserve) / (input_reserve + input)
```

**Exponential:**
```
output = (input × output_reserve) / (input_reserve + 1.5 × input)
```

### Virtual Reserve Calculation

At pool creation:
```
virtual_crx = (initial_market_cap_usd / crx_price_usd)
virtual_tokens = token_supply
```

Virtual reserves determine PreBonding pricing. They never change.

### Graduation Threshold

Calculated from USD target and current CRX price:
```
graduation_threshold_crx = graduation_threshold_usd / crx_price_usd
```

Pool graduates when `real_crx_reserves >= graduation_threshold_crx`.

### Fee Distribution

Pool fees (0%, 0.25%, or 1%) are collected in CRX and sent to pool creator on every trade.

### Anti-Sniper Protection

First ~8 seconds (20 slots) after pool creation:
- Maximum trade size limited to 5% of supply
- Prevents large instant buys at launch price

### WAA (Weighted Average Age) Anti-Dump

Optional per-pool protection (enabled by default):
- Sell fees decay linearly over 30 minutes
- Prevents instant dumps after buying
- Can be disabled with `disableWaa: true` for pure permissionless trading

---

## Requirements

- **Node.js:** 18 or higher
- **Solana:** 1.18+
- **Anchor:** 0.30.1+

**Dependencies:**
```json
{
  "@solana/web3.js": "^1.87.0",
  "@coral-xyz/anchor": "^0.30.1",
  "@solana/spl-token": "^0.3.9"
}
```

---

## Support

**Issues:** [GitHub Issues](https://github.com/georgeklein/Scale-AMM/issues)
**Discord:** [Creator Community](https://discord.gg/creator)
**Docs:** [docs.creator.so](https://docs.creator.so)

---

## License

Apache-2.0

---

**Built for [Creator](https://www.creator.so) · Powered by $CRX**
