# Getting Started with Scale AMM

Get up and running in 5 minutes. This guide takes you from zero to deployed pool.

## Prerequisites

You need:
- **Node.js** 16+ ([download](https://nodejs.org))
- **Rust** ([install](https://rustup.rs))
- **Solana CLI** 1.17+ ([install](https://docs.solana.com/cli/install-solana-cli-tools))
- **Anchor** 0.29.0 ([install](https://www.anchor-lang.com/docs/installation))

Verify installations:

```bash
node --version          # v16.0.0 or higher
rustc --version         # 1.70.0 or higher
solana --version        # 1.17.0 or higher
anchor --version        # 0.29.0
```

## Step 1: Clone & Install (1 min)

```bash
git clone https://github.com/georgeklein/Scale-AMM.git
cd Scale-AMM
npm install
```

## Step 2: Build the Program (2 min)

```bash
anchor build
```

If `anchor build` fails, try:
```bash
cargo check          # More detailed error messages
cargo update         # Update dependencies
anchor build         # Try again
```

**Expected output:**
```
Compiling creator-amm-v2 v0.1.0
   Finished release [optimized] target(s) in 45.23s
```

## Step 3: Run Tests (1 min)

```bash
anchor test
```

This runs all 179 tests. You should see:
```
179 passing (2m)
```

If any tests fail, check the [Troubleshooting](#troubleshooting) section.

## Step 4: Deploy to Devnet (1 min)

### Option A: Automatic (Recommended)

```bash
./scripts/deploy-devnet.sh
```

### Option B: Manual

```bash
# Set devnet as default
solana config set --url devnet

# Airdrop some SOL (for fees)
solana airdrop 10

# Deploy
anchor deploy --provider.cluster devnet

# Get your program ID
solana address -k target/deploy/creator_amm_v2-keypair.json
```

Save your program ID - you'll need it for the SDK.

## Step 5: Create Your First Pool (1 min)

Create a file `create-pool.ts`:

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { ScaleAMM } from './sdk/ScaleAMM';

async function main() {
  // Connect to devnet
  const connection = new Connection('https://api.devnet.solana.com');

  // Load your wallet (or create a new one)
  const wallet = Keypair.generate();
  console.log('Wallet:', wallet.publicKey.toString());

  // Airdrop SOL for fees
  const airdrop = await connection.requestAirdrop(
    wallet.publicKey,
    10 * 1e9  // 10 SOL
  );
  await connection.confirmTransaction(airdrop);

  // Initialize SDK
  const scale = new ScaleAMM(connection, wallet);

  // Create your first pool
  const pool = await scale.createPool({
    supply: 1_000_000,                  // 1M tokens total supply
    initialMarketCapUsd: 10_000,        // Launch at $10k market cap
    graduationThresholdUsd: 85_000,     // Graduate at $85k
    creatorFeeBps: 100,                 // 1% creator fee
  });

  console.log('✅ Pool created!');
  console.log('Pool address:', pool.address);
  console.log('Dashboard: https://scale.creatorcoin.io/pool/' + pool.address);
}

main().catch(console.error);
```

Run it:
```bash
npx ts-node create-pool.ts
```

## Step 6: Make Your First Trade (1 min)

Create a file `first-trade.ts`:

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { ScaleAMM } from './sdk/ScaleAMM';

async function main() {
  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();

  // Airdrop SOL
  const airdrop = await connection.requestAirdrop(wallet.publicKey, 10 * 1e9);
  await connection.confirmTransaction(airdrop);

  const scale = new ScaleAMM(connection, wallet);

  // Your pool address from step 5
  const poolAddress = 'YOUR_POOL_ADDRESS_HERE';

  // Buy tokens with CRX
  const buyTx = await scale.buy(poolAddress, {
    crxAmount: 10,           // Spend 10 CRX
    slippage: 2.0,           // 2% slippage tolerance
  });

  console.log('✅ Buy transaction:', buyTx);

  // Check your balance
  const pool = await scale.getPool(poolAddress);
  console.log('Current price:', pool.price, 'CRX per token');
  console.log('Market cap:', pool.marketCapUsd, 'USD');
}

main().catch(console.error);
```

Run it:
```bash
npx ts-node first-trade.ts
```

## What's Next?

- **Learn the protocol:** Read [WHAT_IT_DOES.md](WHAT_IT_DOES.md)
- **Full SDK reference:** See [sdk/README.md](sdk/README.md)
- **Deploy to mainnet:** Follow [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
- **View examples:** Check `/sdk/examples.ts` for 7 working examples

## Troubleshooting

### Build fails: "error: could not compile `creator-amm-v2`"

**Solution:** Update Rust and dependencies
```bash
rustup update
cargo update
anchor build
```

### Test fails: "Error: Failed to get account info for address"

**Solution:** Your local validator isn't running. Anchor handles this automatically, but if you see this:
```bash
anchor test --skip-local-validator  # Uses devnet instead
```

### Airdrop fails: "Account not found"

**Solution:** The wallet doesn't exist on devnet yet. Create a transaction first:
```bash
solana transfer $(solana pubkey) 0.1 --allow-unfunded-recipient
```

### "No such file or directory" for deploy script

**Solution:** Make it executable
```bash
chmod +x scripts/deploy-devnet.sh
./scripts/deploy-devnet.sh
```

### Program doesn't exist after deploy

**Solution:** You deployed to the wrong cluster. Check:
```bash
solana config get  # Should show: RPC URL: https://api.devnet.solana.com

# If not devnet, fix it:
solana config set --url devnet
```

### Can't find ScaleAMM class

**Solution:** Build the TypeScript first
```bash
cd sdk
npx tsc
cd ..
```

## Common Questions

**Q: Can I test on localhost?**
A: Yes, use `anchor test` (runs a local validator automatically)

**Q: Do I need mainnet SOL?**
A: No - use devnet for development. Mainnet deployment is in DEPLOYMENT_CHECKLIST.md

**Q: How do I get a token mint?**
A: Use the Solana CLI: `spl-token create-token`

**Q: What if something breaks?**
A: Check the logs:
```bash
anchor test 2>&1 | head -100  # First 100 lines of error
```

## Getting Help

- **Discord:** [discord.gg/creator](https://discord.gg/creator)
- **Docs:** [docs.creatorcoin.io](https://docs.creatorcoin.io)
- **Issues:** [github.com/georgeklein/Scale-AMM/issues](https://github.com/georgeklein/Scale-AMM/issues)

---

**Ready to dive deeper?** Check out [WHAT_IT_DOES.md](WHAT_IT_DOES.md) for a complete protocol walkthrough.
