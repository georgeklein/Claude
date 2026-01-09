# Deploy Scale AMM - Quick Guide

**Get live in 10 minutes**

---

## Prerequisites

```bash
# Install dependencies
npm install

# Check Solana CLI
solana --version  # Need 1.17+
anchor --version  # Need 0.29.0+
```

---

## Step 1: Update DEPLOYER_PUBKEY ⚠️ **CRITICAL**

**File:** `programs/creator-amm-v2/src/instructions/initialize.rs:23`

```rust
// Change this line:
pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("11111111111111111111111111111111");

// To your wallet:
pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("YOUR_WALLET_ADDRESS");
```

Get your address:
```bash
solana address
```

**Why:** Anyone can hijack protocol if you don't update this first!

---

## Step 2: Build & Deploy

### Devnet (Testing)
```bash
# Build
anchor build

# Deploy
anchor deploy --provider.cluster devnet

# Save program ID
echo "PROGRAM_ID=$(solana address -k target/deploy/creator_amm_v2-keypair.json)" >> .env
```

### Mainnet (Production)
```bash
# Build with optimizations
anchor build --verifiable

# Deploy
anchor deploy --provider.cluster mainnet

# Verify deployment
solana program show <PROGRAM_ID> --url mainnet
```

---

## Step 3: Initialize Protocol (ONE TIME ONLY)

```typescript
import { ScaleAMM } from './sdk/ScaleAMM';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.devnet.solana.com');
const deployerWallet = Keypair.fromSecretKey(/* your key */);

const scaleAmm = new ScaleAMM(connection, deployerWallet);

await scaleAmm.initialize({
  crxMint: new PublicKey('YOUR_CRX_MINT'),
  crxPriceOracle: new PublicKey('YOUR_PYTH_ORACLE'),
  feeRecipient: deployerWallet.publicKey,
});

console.log('✅ Protocol initialized!');
```

**Required accounts:**
- CRX token mint (must exist)
- Pyth oracle account for CRX price
- Fee recipient wallet

---

## Step 4: Create Your First Pool

```typescript
const pool = await scaleAmm.createPool({
  baseMint: myTokenMint,
  supply: 1_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 40_000,
});

console.log('Pool address:', pool.address);
console.log('Trade URL:', pool.url);
```

---

## Environment Variables

Create `.env`:

```bash
# Network
SOLANA_RPC_URL=https://api.devnet.solana.com
ANCHOR_WALLET=~/.config/solana/id.json

# Program
PROGRAM_ID=YOUR_DEPLOYED_PROGRAM_ID

# Protocol
CRX_MINT=YOUR_CRX_MINT_ADDRESS
CRX_ORACLE=YOUR_PYTH_ORACLE_ADDRESS
FEE_RECIPIENT=YOUR_FEE_WALLET

# Fee Sponsorship (optional)
SPONSOR_WALLET=YOUR_SPONSOR_WALLET_SECRET_KEY
```

---

## Verification Checklist

- [ ] DEPLOYER_PUBKEY updated to your wallet
- [ ] Program deployed successfully
- [ ] `initialize()` called (check: `solana account <CONFIG_PDA>`)
- [ ] CRX oracle is valid and updating
- [ ] Test pool created successfully
- [ ] Test buy/sell transactions work
- [ ] All 263 tests passing: `anchor test`

---

## Common Issues

### "Access violation" error when creating pool
**Fix:** You forgot to call `initialize()` first. Config account doesn't exist.

### "Unauthorized" error on initialize
**Fix:** DEPLOYER_PUBKEY doesn't match your wallet. Update it and redeploy.

### "Oracle price stale"
**Fix:** Use a Pyth oracle that's actively updating (check: pyth.network)

### "Insufficient funds"
**Fix:** Need SOL for rent (0.003 SOL per pool). Airdrop: `solana airdrop 1`

---

## Production Checklist

Before mainnet:
- [ ] Run full test suite: `anchor test` (263 tests must pass)
- [ ] Test on devnet for 72 hours with real users
- [ ] Fund sponsor wallet with 100+ SOL (if using fee sponsorship)
- [ ] Set up monitoring (Sentry, Datadog, etc.)
- [ ] Configure backup RPC endpoints
- [ ] Document emergency pause procedure
- [ ] Have rollback plan ready

---

## Quick Commands

```bash
# Check deployment
solana program show <PROGRAM_ID>

# Get config PDA
anchor idl type -t Config

# Check if initialized
solana account <CONFIG_PDA>

# Monitor logs
solana logs <PROGRAM_ID>

# Run tests
anchor test

# Build optimized
anchor build --verifiable
```

---

## Next Steps

1. **Frontend Integration:** See `sdk/examples.ts` for trading UI examples
2. **Fee Sponsorship:** Check `sdk/FeeSponsorship.ts` for gasless pools
3. **Monitoring:** Set up alerts for sponsor balance, RPC health, tx success rate

---

**Support:** See `README.md` for full documentation
**Tests:** All 263 tests in `/tests` directory
**SDK:** Full SDK in `/sdk` directory
