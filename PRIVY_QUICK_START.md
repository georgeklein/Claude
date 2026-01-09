# Privy Integration Quick Start Guide

**For developers implementing Privy wallet integration with Scale AMM**

---

## Installation

```bash
# Install Privy SDK
npm install @privy-io/react-auth @privy-io/wagmi-connector

# Install Scale AMM SDK (already installed)
# npm install @scale-amm/sdk
```

---

## 1. Setup Privy Provider (App.tsx)

```typescript
import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiConfig } from 'wagmi';

function App() {
  return (
    <PrivyProvider
      appId="your-privy-app-id"
      config={{
        loginMethods: ['email', 'google', 'twitter'],
        appearance: {
          theme: 'light',
          accentColor: '#676FFF',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets', // Auto-create wallet
        },
      }}
    >
      <YourApp />
    </PrivyProvider>
  );
}
```

---

## 2. Create Pool Component

```typescript
// components/CreatePool.tsx

import { useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';

const BACKEND_URL = 'http://localhost:3000'; // Your backend API
const SOLANA_RPC = 'https://api.devnet.solana.com';

export function CreatePool() {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const [creating, setCreating] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);

  const handleCreatePool = async () => {
    if (!authenticated || !wallets.length) return;

    setCreating(true);

    try {
      const wallet = wallets[0]; // Privy embedded wallet

      // 1. Request sponsored transaction from backend
      const response = await fetch(`${BACKEND_URL}/api/pool/create-sponsored`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPublicKey: wallet.address,
          params: {
            baseMint: 'YOUR_TOKEN_MINT',
            supply: 1_000_000,
            initialMarketCapUsd: 10_000,
            graduationThresholdUsd: 40_000,
          },
        }),
      });

      const { transaction: txBase64 } = await response.json();

      // 2. Sign transaction with Privy wallet
      const provider = await wallet.getEthereumProvider(); // For Solana, adjust
      // For Solana wallets:
      const signedTx = await wallet.signTransaction(txBase64);

      // 3. Submit signed transaction
      const submitResponse = await fetch(`${BACKEND_URL}/api/pool/submit-signed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedTransaction: signedTx }),
      });

      const { signature: sig } = await submitResponse.json();
      setSignature(sig);

      alert(`Pool created! Signature: ${sig}`);
    } catch (error) {
      console.error('Error:', error);
      alert(`Failed: ${error.message}`);
    } finally {
      setCreating(false);
    }
  };

  if (!authenticated) {
    return (
      <div>
        <h2>Connect Wallet</h2>
        <button onClick={login}>Login with Privy</button>
      </div>
    );
  }

  return (
    <div>
      <h2>Create Token Pool</h2>
      <p>Wallet: {wallets[0]?.address}</p>
      <p>Platform sponsors gas - you pay $0!</p>

      <button onClick={handleCreatePool} disabled={creating}>
        {creating ? 'Creating Pool...' : 'Create Pool (Free)'}
      </button>

      {signature && (
        <div>
          <h3>Success!</h3>
          <a href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}>
            View Transaction
          </a>
        </div>
      )}
    </div>
  );
}
```

---

## 3. Backend API (Express)

```typescript
// backend/server.ts

import express from 'express';
import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { FeeSponsor } from '@scale-amm/sdk';

const app = express();
app.use(express.json());

// Load sponsor wallet from environment
const sponsorWallet = Keypair.fromSecretKey(
  Buffer.from(process.env.SPONSOR_PRIVATE_KEY, 'base64')
);

const connection = new Connection('https://api.devnet.solana.com');
const feeSponsor = new FeeSponsor(connection, {
  publicKey: sponsorWallet.publicKey,
  payer: sponsorWallet,
});

// Create sponsored transaction
app.post('/api/pool/create-sponsored', async (req, res) => {
  try {
    const { userPublicKey, params } = req.body;

    // Build pool creation instruction
    const scale = new ScaleAMM(connection, {
      publicKey: sponsorWallet.publicKey,
      payer: sponsorWallet,
    });

    const poolInstruction = await scale.createPoolInstruction(params);

    // Create sponsored transaction
    const tx = await feeSponsor.createSponsoredTransaction(
      [poolInstruction],
      new PublicKey(userPublicKey)
    );

    // Serialize for frontend
    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    res.json({
      transaction: serialized.toString('base64'),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit signed transaction
app.post('/api/pool/submit-signed', async (req, res) => {
  try {
    const { signedTransaction } = req.body;

    const tx = Transaction.from(Buffer.from(signedTransaction, 'base64'));
    const signature = await feeSponsor.submitSponsoredTransaction(tx);

    res.json({ signature });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
```

---

## 4. Environment Variables

```bash
# .env

# Privy
PRIVY_APP_ID=your_privy_app_id_here
PRIVY_APP_SECRET=your_privy_app_secret_here

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
SPONSOR_PRIVATE_KEY=base64_encoded_keypair_here

# Scale AMM
SCALE_PROGRAM_ID=CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3
```

---

## 5. User Flow

```
1. User clicks "Create Pool"
   ↓
2. Privy checks authentication
   - If not logged in: Show login popup (email/social)
   - If logged in: Continue
   ↓
3. Frontend requests sponsored TX from backend
   ↓
4. Backend builds transaction with platform as fee payer
   ↓
5. Privy popup: "Approve pool creation?"
   - Shows: Create pool for TOKEN
   - Cost: Free (sponsored)
   - User clicks "Approve"
   ↓
6. Signed transaction sent to backend
   ↓
7. Backend submits to Solana
   ↓
8. Success! Pool created, user paid $0
```

---

## 6. Cost Breakdown

| Item | Cost | Who Pays |
|------|------|----------|
| Transaction fee | $0.0000025 | Platform |
| Pool account rent | $0.0015 | Platform |
| Token vaults rent | $0.0012 | Platform |
| **TOTAL** | **$0.003** | **Platform** |
| **User cost** | **$0** | **Free!** |

---

## 7. Testing Checklist

- [ ] User can login with email/Google/Twitter
- [ ] Embedded wallet auto-created on first login
- [ ] "Create Pool" button shows wallet address
- [ ] Clicking "Create Pool" triggers Privy popup
- [ ] User approves transaction in popup
- [ ] Transaction confirms on Solana
- [ ] Pool appears in explorer
- [ ] User paid $0 in fees
- [ ] Platform sponsor wallet balance decreased by $0.003

---

## 8. Common Issues

**Issue 1: Privy popup doesn't appear**
```typescript
// Solution: Check Privy provider is wrapping your app
<PrivyProvider appId="...">
  <App />
</PrivyProvider>
```

**Issue 2: "Invalid transaction" error**
```typescript
// Solution: Ensure sponsor wallet signs first
const tx = await feeSponsor.createSponsoredTransaction(...);
// tx.partialSign(sponsorWallet) already called internally
```

**Issue 3: Transaction fails with "insufficient funds"**
```bash
# Solution: Check sponsor wallet has SOL
solana balance SPONSOR_WALLET_ADDRESS
# Should have at least 1 SOL
```

**Issue 4: Privy wallet not detected**
```typescript
// Solution: Wait for wallets to load
const { wallets, ready } = useWallets();

if (!ready) {
  return <div>Loading wallets...</div>;
}
```

---

## 9. Production Checklist

Before mainnet:

- [ ] Update `DEPLOYER_PUBKEY` in `/home/user/Claude/programs/creator-amm-v2/src/instructions/initialize.rs`
- [ ] Deploy Scale AMM program to mainnet
- [ ] Fund sponsor wallet with 100+ SOL
- [ ] Set up monitoring for sponsor wallet balance
- [ ] Add webhook alerts for low balance
- [ ] Implement rate limiting (10 pools/min per user)
- [ ] Add user pool limits (1000 pools max per wallet)
- [ ] Test on devnet/testnet first
- [ ] Get Privy approved for production

---

## 10. Next Steps

**Option A: Basic Integration (2 days)**
- Implement code above
- Test with 10 users
- Launch on devnet

**Option B: Advanced (1 week)**
- Add session keys (batch operations)
- Mobile optimization
- Transaction batching
- Analytics dashboard

**Option C: Full Platform (2 weeks)**
- Backend API with database
- User dashboard
- Pool management UI
- Mobile app

---

**Questions? See full review in `/home/user/Claude/PRIVY_INTEGRATION_REVIEW.md`**
