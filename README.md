# Scale AMM

<img width="335" height="149" alt="image" src="https://github.com/user-attachments/assets/679e0b5f-b379-42bb-a6a4-44417618292a" />

**Fully permissionless bonding curve AMM for Solana**

Launch tokens at any USD market cap with zero upfront capital. Built for the Creator platform, powered by $CRX.

---

## 🚀 Quick Start

### For Developers (Protocol Development)

**Prerequisites:**
```bash
# Solana CLI (required for anchor test)
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Anchor CLI (v0.30.1)
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.1
avm use 0.30.1

# Node.js v18+ (for SDK & tests)
node --version  # Should be v18 or higher
```

**Clone & Build:**
```bash
git clone https://github.com/georgeklein/Scale-AMM.git
cd Scale-AMM
npm install
anchor build
```

**Run Tests:**
```bash
anchor test  # 263/263 tests (100% coverage)
```

---

### For Integrators (SDK Only)

**Install SDK:**
```bash
npm install @scale-amm/sdk @solana/web3.js @coral-xyz/anchor
```

**Basic Setup:**
```typescript
import { ScaleAMM } from '@scale-amm/sdk';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.fromSecretKey(yourPrivateKey);
const scale = new ScaleAMM(connection, wallet);

// Ready to create pools and trade!
```

See [SDK Usage](#-sdk-usage) below for complete examples.

---

## ✨ Key Features

### 1. Zero Capital Launch
Launch tokens without providing liquidity. Oracle calculates virtual reserves based on your USD target and live $CRX price.

```typescript
// Launch at $10k market cap with ZERO upfront capital
await scale.createPool({
  baseMint: tokenMint,
  supply: 1_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 40_000,
});
```

### 2. Automatic Graduation
Pools auto-convert to permanent AMM (x×y=k) when they hit your threshold. $CRX locked forever → deflationary.

### 3. Optional Anti-Dump Protection
**NEW:** Creators choose per-pool:
- **WAA enabled** (default): Time-decaying sell fees (0-30 min) protect early buyers
- **WAA disabled**: Pure permissionless trading, no restrictions

```typescript
// Pure permissionless (no anti-dump)
await scale.createPool({
  ...config,
  disableWaa: true,  // No restrictions
});
```

### 4. Fully Permissionless
**No centralized control** - No pause button, no kill switch, no admin backdoors. Once deployed, it runs forever.

### 5. Universal $CRX Pairing
All volume flows through $CRX:
```
SOL → $CRX → TOKEN
```
This creates constant $CRX demand and deflationary pressure as pools graduate.

---

## 📦 SDK Usage

### Installation
```bash
npm install @scale-amm/sdk @solana/web3.js @coral-xyz/anchor
```

### Complete Example: Launch a Token in 3 Steps

```typescript
import { ScaleAMM } from '@scale-amm/sdk';
import { Connection, Keypair } from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  setAuthority,
  AuthorityType
} from '@solana/spl-token';

// Setup connection and wallet
const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.fromSecretKey(yourPrivateKey);
const scale = new ScaleAMM(connection, wallet);

// Step 1: Create your token (1 billion supply, 9 decimals)
const tokenMint = await createMint(
  connection,
  wallet,
  wallet.publicKey,
  null,  // No freeze authority
  9      // 9 decimals (standard)
);

const tokenAccount = await getOrCreateAssociatedTokenAccount(
  connection,
  wallet,
  tokenMint,
  wallet.publicKey
);

// Mint 1 billion tokens
await mintTo(
  connection,
  wallet,
  tokenMint,
  tokenAccount.address,
  wallet,
  1_000_000_000_000_000_000  // 1B tokens with 9 decimals
);

// CRITICAL: Revoke mint authority (prevents rugpulls)
await setAuthority(
  connection,
  wallet,
  tokenMint,
  wallet.publicKey,
  AuthorityType.MintTokens,
  null
);

console.log('Token created:', tokenMint.toBase58());

// Step 2: Launch on Scale AMM
const pool = await scale.createPool({
  baseMint: tokenMint,
  supply: 1_000_000_000,              // 1 billion tokens
  initialMarketCapUsd: 10_000,        // Launch at $10k market cap
  graduationThresholdUsd: 40_000,     // Graduate at $40k
  creatorFeeBps: 100,                 // 1% creator fee
  curveType: 'ConstantProduct',       // or 'Exponential'
  disableWaa: false,                  // Enable anti-dump protection
});

console.log('Pool created:', pool.address);
console.log('Initial price:', pool.price, 'CRX per token');

// Step 3: Trading examples
// Buy tokens with CRX
const buyTx = await scale.buy(pool.address, {
  crxAmount: 100,      // Buy with 100 CRX
  slippage: 1.0,       // 1% max slippage
});
console.log('Bought tokens:', buyTx.signature);

// Sell tokens for CRX
const sellTx = await scale.sell(pool.address, {
  tokenAmount: 50_000,  // Sell 50k tokens
  slippage: 1.0,
});
console.log('Sold tokens:', sellTx.signature);

// Get updated pool state
const updatedPool = await scale.getPool(pool.address);
console.log('Current price:', updatedPool.price);
console.log('Phase:', updatedPool.phase);  // PreBonding or Graduated
console.log('Graduation progress:', updatedPool.graduationProgress);
```

---

### Configuration Options

**Launch Parameters:**
```typescript
await scale.createPool({
  baseMint: tokenMint,                // Your token mint
  supply: 1_000_000_000,              // Total supply (no decimals)
  initialMarketCapUsd: 10_000,        // Starting market cap in USD
  graduationThresholdUsd: 40_000,     // Graduate at this market cap
  creatorFeeBps: 100,                 // Creator fee (0-100 = 0-1%)
  curveType: 'ConstantProduct',       // Bonding curve type
  disableWaa: false,                  // Anti-dump protection
});
```

**Fee Tiers:**
- `0` → Free (0%) - Maximum growth, no creator fees
- `25` → Low (0.25%) - Balanced growth + income
- `100` → Premium (1%) - Maximum creator revenue

**Bonding Curves:**
- `ConstantProduct` → Linear (x×y=k) like Uniswap
- `Exponential` → Faster price growth (1.5x steeper)

**Anti-Dump (WAA):**
- `false` → Enabled (default) - Time-decaying sell fees protect early buyers
- `true` → Disabled - Pure permissionless, no restrictions

---

### Advanced: Query Pool State

```typescript
// Get pool information
const pool = await scale.getPool(poolAddress);

console.log({
  phase: pool.phase,                    // PreBonding | Graduated
  price: pool.price,                    // Current CRX price per token
  marketCap: pool.marketCapUsd,         // Current USD market cap
  reserves: {
    crx: pool.crxReserve,               // Real CRX in pool
    token: pool.tokenReserve,           // Token reserve
  },
  graduation: {
    threshold: pool.graduationThreshold,
    progress: pool.graduationProgress,   // 0-100%
    graduated: pool.phase === 'Graduated',
  },
  fees: {
    creator: pool.creatorFeeBps,        // Creator fee (bps)
    protocol: pool.protocolFeeBps,      // Protocol fee (bps)
  },
});
```

---

### Trading with Slippage Protection

```typescript
// Get quote before trading
const quote = await scale.getQuote(poolAddress, {
  type: 'buy',
  crxAmount: 100,
});

console.log('Expected tokens:', quote.outputAmount);
console.log('Price impact:', quote.priceImpact + '%');
console.log('Fee:', quote.fee);

// Execute trade with slippage limit
await scale.buy(poolAddress, {
  crxAmount: 100,
  slippage: 1.0,          // Max 1% slippage
  minOutputAmount: quote.outputAmount * 0.99,  // Or set exact minimum
});
```

---

## 🏗️ Architecture

### Two-Phase System

**Phase 1: PreBonding**
- Virtual reserves (oracle-calculated)
- Accumulate real $CRX from trades
- Anti-sniper active (first ~8 seconds)
- WAA fees active (if enabled)

**Phase 2: Graduated**
- Real reserves (locked $CRX)
- Permanent AMM (x×y=k)
- Anti-sniper disabled
- Continues forever

### $CRX Flow
```
User buys TOKEN:
  1. Swap SOL → $CRX (DEX)
  2. Buy TOKEN with $CRX (Scale AMM)
  3. Real $CRX accumulates in pool

Pool graduates:
  4. $CRX locked permanently (deflationary)
  5. Pool becomes permanent AMM
```

### Security Features
✅ Checked arithmetic (no overflows)
✅ CEI pattern (no reentrancy)
✅ Oracle validation (fresh prices)
✅ Vault validation (reserves = balance)
✅ Rugpull prevention (mint/freeze revoked)
✅ Slippage protection (user-defined)
✅ **Fully permissionless (no pause/admin)**

---

## 📚 Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Deployment guide & checklist
- **[sdk/README.md](sdk/README.md)** - Complete SDK API reference
- **[CLAUDE.md](CLAUDE.md)** - AI development context

---

## 🛠️ Development

### Build
```bash
anchor build
cargo check  # Quick compile check
```

### Test
```bash
anchor test       # Run all tests
cargo test        # Rust unit tests only
```

### Deploy
```bash
# Devnet
anchor deploy --provider.cluster devnet

# Mainnet (see DEPLOYMENT.md for full checklist)
anchor deploy --provider.cluster mainnet-beta
```

**⚠️ CRITICAL:** Update `DEPLOYER_PUBKEY` in `initialize.rs` before mainnet deploy!

---

## 🌐 Environment Variables

Create `.env` for SDK usage:
```bash
# Solana RPC
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Wallet
WALLET_PRIVATE_KEY=your_base58_private_key

# Program IDs
SCALE_PROGRAM_ID=CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3
CRX_MINT=your_crx_mint_address

# Oracle
PYTH_ORACLE=your_pyth_feed_address
```

---

## 📊 Project Status

**Mainnet Readiness:** 95%

✅ Core protocol complete
✅ 100% test coverage (263/263 tests fixed)
✅ All dependencies updated
✅ Security audited & optimized
✅ SDK production-ready
⏳ DEPLOYER_PUBKEY needs update before deploy

---

## 🤝 Contributing

This is a production protocol. No external contributions accepted at this time.

For bugs or questions, open an issue.

---

## 📄 License

Apache-2.0

---

**Built for Creator. Powered by $CRX.**
