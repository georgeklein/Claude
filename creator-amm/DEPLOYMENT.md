# Deployment Guide

## ⚠️ CRITICAL: Read This First

**DO NOT DEPLOY TO MAINNET WITHOUT:**
1. ✅ Professional security audit (minimum 2 independent auditors)
2. ✅ Comprehensive testing on devnet (minimum 2 weeks)
3. ✅ Bug bounty program established
4. ✅ Legal review completed
5. ✅ Insurance coverage secured
6. ✅ Emergency response plan documented

**Deploying unaudited smart contracts to mainnet can result in total loss of user funds.**

---

## Development Deployment (Devnet)

### Step 1: Configure Solana CLI

```bash
# Set to devnet
solana config set --url devnet

# Generate new keypair (or use existing)
solana-keygen new -o ~/.config/solana/devnet-deployer.json

# Set as default
solana config set --keypair ~/.config/solana/devnet-deployer.json

# Airdrop SOL for deployment
solana airdrop 2
```

### Step 2: Update Program ID

```bash
# Build to generate program ID
anchor build

# Get your program ID
solana address -k target/deploy/creator_amm-keypair.json

# Update in lib.rs and Anchor.toml with the new program ID
# Then rebuild
anchor build
```

### Step 3: Deploy to Devnet

```bash
# Deploy
anchor deploy --provider.cluster devnet

# Verify deployment
solana program show <PROGRAM_ID> --url devnet
```

### Step 4: Initialize the Program

Create `scripts/initialize-devnet.ts`:

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CreatorAmm } from "../target/types/creator_amm";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";

async function initialize() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CreatorAmm as Program<CreatorAmm>;

  // Create fee recipient
  const feeRecipient = Keypair.generate();

  // Derive config PDA
  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  // Initialize
  const tx = await program.methods
    .initialize(
      100,  // 1% protocol fee
      20,   // 20 slot anti-sniper window
      500   // 5% max trade during anti-sniper
    )
    .accounts({
      config,
      authority: provider.wallet.publicKey,
      feeRecipient: feeRecipient.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Initialized!");
  console.log("Transaction:", tx);
  console.log("Config:", config.toBase58());
  console.log("Fee Recipient:", feeRecipient.publicKey.toBase58());
  console.log("⚠️  Save the fee recipient keypair securely!");
}

initialize().catch(console.error);
```

Run:
```bash
npx ts-node scripts/initialize-devnet.ts
```

### Step 5: Create Test Pool

Create `scripts/create-test-pool.ts`:

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { CreatorAmm } from "../target/types/creator_amm";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
} from "@solana/spl-token";

async function createTestPool() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CreatorAmm as Program<CreatorAmm>;
  const wallet = provider.wallet as anchor.Wallet;

  // Create quote mint (simulating CRX)
  console.log("Creating quote mint...");
  const quoteMint = await createMint(
    provider.connection,
    wallet.payer,
    wallet.publicKey,
    null,
    9 // 9 decimals like SOL
  );
  console.log("Quote mint:", quoteMint.toBase58());

  // Create base mint (new token)
  console.log("Creating base mint...");
  const baseMint = await createMint(
    provider.connection,
    wallet.payer,
    wallet.publicKey,
    null,
    6 // 6 decimals
  );
  console.log("Base mint:", baseMint.toBase58());

  // Create creator's base token account
  const creatorBaseAccount = await createAccount(
    provider.connection,
    wallet.payer,
    baseMint,
    wallet.publicKey
  );

  // Mint tokens to creator
  const INITIAL_SUPPLY = new BN(1_000_000_000_000); // 1M tokens (with 6 decimals)
  await mintTo(
    provider.connection,
    wallet.payer,
    baseMint,
    creatorBaseAccount,
    wallet.publicKey,
    INITIAL_SUPPLY.toNumber()
  );

  // Derive PDAs
  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  const [pool] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("pool"),
      quoteMint.toBuffer(),
      baseMint.toBuffer(),
    ],
    program.programId
  );

  const [quoteVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("quote_vault"), pool.toBuffer()],
    program.programId
  );

  const [baseVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("base_vault"), pool.toBuffer()],
    program.programId
  );

  // Create pool
  console.log("Creating pool...");
  const tx = await program.methods
    .createPool(
      new BN(30_000_000_000),    // 30 quote tokens virtual
      new BN(1_000_000_000_000), // 1M base tokens virtual
      INITIAL_SUPPLY,             // Deposit all tokens
      new BN(85_000_000_000)     // 85 quote token graduation
    )
    .accounts({
      config,
      pool,
      quoteMint,
      baseMint,
      quoteVault,
      baseVault,
      creatorBaseAccount,
      creator: wallet.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("✅ Pool created!");
  console.log("Transaction:", tx);
  console.log("Pool:", pool.toBase58());
  console.log("Quote Mint:", quoteMint.toBase58());
  console.log("Base Mint:", baseMint.toBase58());
  console.log("\n📊 Pool Details:");
  console.log("Virtual reserves: 30 quote × 1M base");
  console.log("Initial price: 0.00003 quote per base token");
  console.log("Graduation threshold: 85 quote tokens");
}

createTestPool().catch(console.error);
```

Run:
```bash
npx ts-node scripts/create-test-pool.ts
```

---

## Production Deployment (Mainnet)

### ⚠️ PRE-DEPLOYMENT CHECKLIST

- [ ] **Security Audits Completed** (minimum 2)
  - [ ] Audit #1 by [Auditor Name]
  - [ ] Audit #2 by [Auditor Name]
  - [ ] All critical findings resolved
  - [ ] All high findings resolved
  - [ ] Medium findings reviewed and accepted/resolved

- [ ] **Testing Completed**
  - [ ] All unit tests passing
  - [ ] Integration tests on devnet (2+ weeks)
  - [ ] Fuzz testing completed
  - [ ] Economic model validated
  - [ ] Load testing completed

- [ ] **Legal & Compliance**
  - [ ] Legal review completed
  - [ ] Regulatory compliance verified
  - [ ] Terms of service finalized
  - [ ] Privacy policy finalized

- [ ] **Operations**
  - [ ] Bug bounty program live (Immunefi recommended)
  - [ ] Insurance coverage secured
  - [ ] Multi-sig treasury set up
  - [ ] Emergency response plan documented
  - [ ] Monitoring and alerting configured

- [ ] **Documentation**
  - [ ] User documentation complete
  - [ ] Developer documentation complete
  - [ ] Security best practices published
  - [ ] Audit reports published

### Deployment Steps

**Only proceed if ALL checklist items are complete.**

1. **Generate Production Keypair**

```bash
# On air-gapped machine
solana-keygen new -o ~/mainnet-deployer.json

# Transfer to deployment machine via secure method
```

2. **Fund Deployment Wallet**

```bash
# Deployment costs ~3-5 SOL
# Send SOL to deployment address
```

3. **Final Build Verification**

```bash
# Clean build
anchor clean
anchor build

# Verify program ID matches
cat Anchor.toml
cat programs/creator-amm/src/lib.rs
```

4. **Deploy to Mainnet**

```bash
solana config set --url mainnet-beta
solana config set --keypair ~/mainnet-deployer.json

# Deploy
anchor deploy --provider.cluster mainnet

# IMMEDIATELY verify
solana program show <PROGRAM_ID>
```

5. **Initialize with Multi-Sig**

Use a multi-sig wallet (Squads recommended) as authority.

```bash
# Initialize with 3/5 multi-sig as authority
# Set fee recipient to multi-sig treasury
```

6. **Staged Rollout**

**Week 1:** Invite-only with deposit limits
- Max 10 SOL per pool
- Max 5 pools total
- 24/7 monitoring

**Week 2-4:** Public beta with limits
- Max 100 SOL per pool
- Max 50 pools total
- Continue monitoring

**Month 2+:** Gradual limit increases
- Increase based on stability
- No issues for 30 days before increasing

### Post-Deployment Monitoring

1. **Set up alerts for:**
   - Unexpected state changes
   - Large transactions
   - Failed transactions spike
   - Unusual trading patterns

2. **Daily health checks:**
   - Verify pool states
   - Check vault balances
   - Review transaction logs
   - Monitor error rates

3. **Weekly reviews:**
   - Security incident review
   - Performance metrics
   - User feedback analysis
   - Bug bounty submissions

---

## Emergency Procedures

### If Exploit Detected

1. **Immediate Response (0-5 minutes)**
   - [ ] Alert security team
   - [ ] Document the exploit
   - [ ] Estimate funds at risk

2. **Short-term Response (5-30 minutes)**
   - [ ] Communicate with users (Discord/Twitter)
   - [ ] Contact auditors for emergency review
   - [ ] Prepare incident report

3. **Recovery (30+ minutes)**
   - [ ] Develop fix
   - [ ] Deploy patch if possible
   - [ ] Coordinate with affected users
   - [ ] File insurance claim if applicable

### Emergency Contacts

```
Security Lead: [Email/Phone]
Auditor 1:     [Email/Phone]
Auditor 2:     [Email/Phone]
Legal:         [Email/Phone]
Insurance:     [Email/Phone]
```

---

## Upgrade Path

Solana programs are **immutable by default**. To enable upgrades:

1. **Use Anchor's upgrade authority**
2. **Transfer to multi-sig**
3. **Document upgrade process**
4. **Test upgrades on devnet first**

```bash
# Set upgrade authority to multi-sig
solana program set-upgrade-authority \
  <PROGRAM_ID> \
  --new-upgrade-authority <MULTISIG_ADDRESS>
```

---

## Cost Estimates

### Devnet
- Deployment: FREE (airdropped SOL)
- Testing: FREE

### Mainnet
- Deployment: ~3-5 SOL ($300-500)
- Rent exemption: Included
- Audits: $60k-100k total
- Insurance: Varies
- Bug bounty: $50k-500k pool
- **Total pre-launch:** $110k-600k+

---

## Support

For deployment assistance:
- Discord: [Your Discord]
- Email: dev@yourplatform.com
- Docs: https://docs.yourplatform.com

**Remember: Security first. Speed second.**
