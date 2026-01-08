# Scale AMM

<img width="335" height="149" alt="image" src="https://github.com/user-attachments/assets/679e0b5f-b379-42bb-a6a4-44417618292a" />

**Fully permissionless bonding curve AMM for Solana**

Launch tokens at any USD market cap with zero upfront capital. Built for the Creator platform, powered by $CRX.

---

## 🚀 Quick Start

### Environment Setup

**Prerequisites:**
```bash
# Solana CLI (v1.17+)
sh -c "$(curl -sSfL https://release.solana.com/v1.17.0/install)"

# Anchor CLI (v0.29.0)
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.29.0
avm use 0.29.0

# Node.js (v18+) & pnpm
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

**Clone & Build:**
```bash
git clone https://github.com/georgeklein/Scale-AMM.git
cd Scale-AMM
pnpm install
anchor build
```

**Run Tests:**
```bash
anchor test  # 137/223 tests passing (61%)
```

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
npm install @scale-amm/sdk @solana/web3.js @solana/spl-token
```

### 1. Deploy the AMM Protocol

**First-time setup only** - Deploy the Scale AMM program:

```typescript
import { ScaleAMM } from '@scale-amm/sdk';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const deployerWallet = Keypair.fromSecretKey(yourPrivateKey);
const scale = new ScaleAMM(connection, deployerWallet);

// Initialize the protocol (call once after program deployment)
await scale.initialize({
  feeRecipient: YOUR_FEE_WALLET,
  crxMint: CRX_MINT_ADDRESS,
  crxPriceOracle: PYTH_CRX_FEED_ADDRESS,
  preBondingFeeBps: 300,  // 3%
  preBondingThresholdUsd: 40_000_000_000,  // $40k
  postBondingFeeBps: 100,  // 1%
  graduationThresholdUsd: 85_000_000_000,  // $85k
  antiSniperWindowSlots: 20,  // ~8 seconds
  antiSniperMaxTradeBps: 500,  // 5% max trade size
  oracleMaxAgeSeconds: 60,
  oracleMaxConfidenceBps: 100,
  approvedQuoteTokens: [CRX_MINT, SOL_MINT, USDC_MINT, ...],
  approvedQuoteCount: 3,
});

console.log('Scale AMM initialized!');
```

**See DEPLOYMENT.md for full deployment guide.**

---

### 2. Create a New Token

Create an SPL token to launch on the AMM:

```typescript
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';

// Create new token mint
const tokenMint = await createMint(
  connection,
  wallet,                // Payer
  wallet.publicKey,      // Mint authority
  null,                  // Freeze authority (null to disable)
  6                      // Decimals
);

// Get token account for yourself
const tokenAccount = await getOrCreateAssociatedTokenAccount(
  connection,
  wallet,
  tokenMint,
  wallet.publicKey
);

// Mint initial supply (1 million tokens)
await mintTo(
  connection,
  wallet,
  tokenMint,
  tokenAccount.address,
  wallet,
  1_000_000_000_000  // 1M tokens with 6 decimals
);

// CRITICAL: Revoke mint authority (required for Scale AMM)
await setAuthority(
  connection,
  wallet,
  tokenMint,
  wallet.publicKey,
  AuthorityType.MintTokens,
  null  // Revoke = no more minting possible
);

console.log('Token created:', tokenMint.toBase58());
console.log('Mint authority revoked - ready for Scale AMM');
```

---

### 3. Launch Token on Scale AMM

**3-line pool creation** with your new token:

```typescript
const scale = new ScaleAMM(connection, wallet);

const pool = await scale.createPool({
  baseMint: tokenMint,
  supply: 1_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 40_000,
  creatorFeeBps: 100,  // 1% creator fee (optional)
});

console.log('Pool created:', pool.address);
```

### Trading
```typescript
// Buy tokens
await scale.buy(poolAddress, {
  crxAmount: 100,
  slippage: 1.0,  // 1%
});

// Sell tokens
await scale.sell(poolAddress, {
  tokenAmount: 5000,
  slippage: 1.0,
});

// Get pool state
const pool = await scale.getPool(poolAddress);
console.log('Price:', pool.price);
console.log('Phase:', pool.phase);  // PreBonding → Graduated
console.log('Progress:', pool.graduationProgress);
```

### Launch Options

**Fee Tiers:**
- `creatorFeeBps: 0` → 0% fee (max growth)
- `creatorFeeBps: 25` → 0.25% fee (balanced)
- `creatorFeeBps: 100` → 1% fee (premium)

**Bonding Curves:**
- `ConstantProduct` → Uniswap-style (x×y=k)
- `Exponential` → 33% faster graduation

**Anti-Dump:**
- `disableWaa: false` → Default, protects early buyers
- `disableWaa: true` → Pure permissionless

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

**Mainnet Readiness:** 70-80%

✅ Core protocol complete
✅ 61% test coverage (137/223 tests)
✅ Security fundamentals strong
✅ SDK production-ready
⏳ DEPLOYER_PUBKEY needs update
⏳ Remaining tests in progress

---

## 🤝 Contributing

This is a production protocol. No external contributions accepted at this time.

For bugs or questions, open an issue.

---

## 📄 License

Apache-2.0

---

**Built for Creator. Powered by $CRX.**
