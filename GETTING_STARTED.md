# Getting Started

**Launch your first token pool in 5 minutes**

---

## Prerequisites

Install Solana + Anchor:

```bash
# Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.29.0
avm use 0.29.0
```

Verify:
```bash
solana --version   # Should show 1.17+
anchor --version   # Should show 0.29.0
```

---

## Setup

```bash
git clone https://github.com/georgeklein/Scale-AMM.git
cd Scale-AMM
npm install
```

---

## Build & Test

```bash
# Build Solana program
anchor build

# Run all tests (179 tests)
anchor test
```

If `anchor build` fails, try: `cargo check`

---

## Deploy to Devnet

### Automatic (recommended):
```bash
./scripts/deploy-devnet.sh
```

### Manual:
```bash
# Set Solana to devnet
solana config set --url devnet

# Airdrop SOL for deployment
solana airdrop 2

# Deploy
anchor deploy --provider.cluster devnet

# Get program ID
solana address -k target/deploy/creator_amm_v2-keypair.json
```

---

## Create Your First Pool

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { ScaleAMM } from '@scale-amm/sdk';
import { PublicKey } from '@solana/web3.js';

// Connect
const connection = new Connection('https://api.devnet.solana.com');
const wallet = Keypair.fromSecretKey(yourSecretKey);
const scale = new ScaleAMM(connection, wallet);

// Create pool
const pool = await scale.createPool({
  baseMint: new PublicKey('YourTokenMintAddress'),
  supply: 1_000_000,                 // 1M tokens
  initialMarketCapUsd: 10_000,       // Launch at $10k
  graduationThresholdUsd: 85_000,    // Graduate at $85k
});

console.log('Pool created:', pool.address.toString());
```

---

## Make Your First Trade

```typescript
// Buy tokens
const buyResult = await scale.buy(pool.address, {
  crxAmount: 100,      // Spend 100 CRX
  slippage: 1.0,       // 1% slippage tolerance
});

console.log('Bought:', buyResult.tokensReceived, 'tokens');

// Sell tokens
const sellResult = await scale.sell(pool.address, {
  tokenAmount: 5000,   // Sell 5000 tokens
  slippage: 1.0,
});

console.log('Received:', sellResult.crxReceived, 'CRX');
```

---

## Troubleshooting

**Build fails:**
- Try `cargo check` instead of `anchor build`
- Check Anchor version: `anchor --version` (must be 0.29.0)

**Tests fail:**
- Ensure you have SOL: `solana balance`
- Check Solana version: `solana --version` (needs 1.17+)

**Deployment fails:**
- Airdrop more SOL: `solana airdrop 2`
- Check you're on devnet: `solana config get`

**Program not found:**
- Update `programs/creator-amm-v2/src/lib.rs` with deployed program ID
- Redeploy: `anchor deploy --provider.cluster devnet`

---

## Next Steps

- **SDK API:** See [sdk/README.md](sdk/README.md)
- **Protocol Details:** See [WHAT_IT_DOES.md](WHAT_IT_DOES.md)
- **Mainnet Deploy:** See [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
