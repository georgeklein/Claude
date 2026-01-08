# Quick Start Guide

Get your virtual liquidity AMM running in minutes.

## 🚀 5-Minute Setup

### 1. Prerequisites

```bash
# Check installations
anchor --version  # Should be 0.29.0+
solana --version  # Should be 1.17+
node --version    # Should be 18+
```

Don't have these? See [full installation guide](DEPLOYMENT.md).

### 2. Clone & Build

```bash
cd creator-amm
npm install
anchor build
```

### 3. Run Tests

```bash
anchor test
```

You should see all tests passing ✅

---

## 🎯 Your First Pool

### Scenario: Launch $TOKEN with virtual CRX liquidity

#### Step 1: Set up your environment

```typescript
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";

// Connect to devnet
const connection = new anchor.web3.Connection(
  "https://api.devnet.solana.com"
);

// Your wallet
const wallet = anchor.Wallet.local();
const provider = new anchor.AnchorProvider(connection, wallet, {});
const program = anchor.workspace.CreatorAmm;
```

#### Step 2: Initialize the AMM (one-time)

```typescript
const [config] = PublicKey.findProgramAddressSync(
  [Buffer.from("config")],
  program.programId
);

await program.methods
  .initialize(
    100,  // 1% fee
    20,   // 20 slot anti-sniper (~8 seconds)
    500   // 5% max trade during anti-sniper
  )
  .accounts({
    config,
    authority: wallet.publicKey,
    feeRecipient: feeWallet.publicKey,
  })
  .rpc();
```

#### Step 3: Create your token pool

```typescript
// Your token details
const quoteMint = CRX_MINT;           // CRX token address
const baseMint = YOUR_NEW_TOKEN_MINT; // Your token address

// Calculate PDAs
const [pool] = PublicKey.findProgramAddressSync(
  [Buffer.from("pool"), quoteMint.toBuffer(), baseMint.toBuffer()],
  program.programId
);

// Create pool with virtual liquidity
await program.methods
  .createPool(
    new BN(5_000_000_000),     // 5,000 CRX virtual quote
    new BN(1_000_000_000_000), // 1M tokens virtual base
    new BN(1_000_000_000_000), // Deposit 1M tokens
    new BN(10_000_000_000)     // Graduate at 10,000 CRX
  )
  .accounts({
    config,
    pool,
    quoteMint,
    baseMint,
    // ... other accounts
  })
  .rpc();
```

**You just launched a token with ZERO CRX required! 🎉**

#### Step 4: Users can now trade

```typescript
// Buy tokens
await program.methods
  .buy(
    new BN(100_000_000),  // Pay 100 CRX
    new BN(18_000_000)    // Expect at least 18,000 tokens (5% slippage)
  )
  .accounts({
    config,
    pool,
    // ... accounts
  })
  .rpc();

// Sell tokens
await program.methods
  .sell(
    new BN(50_000_000),   // Sell 50,000 tokens
    new BN(95_000_000)    // Expect at least 95 CRX (5% slippage)
  )
  .accounts({
    config,
    pool,
    // ... accounts
  })
  .rpc();
```

---

## 📊 Understanding Virtual Liquidity

### Traditional AMM (e.g., Raydium)
```
❌ Need BOTH tokens:
   - Deposit: 5,000 CRX + 1M TOKEN
   - Cost: 5,000 CRX worth of capital
```

### Virtual Liquidity (Creator AMM)
```
✅ Need ONE token:
   - Deposit: 1M TOKEN only
   - Cost: $0 in CRX
   - Virtual reserves set the price!
```

### How Pricing Works

```
Initial State:
  Virtual: 5,000 CRX × 1M TOKEN
  Real: 0 CRX × 1M TOKEN

Price = Virtual CRX / Virtual TOKEN
      = 5,000 / 1,000,000
      = 0.005 CRX per TOKEN

After 100 CRX buy:
  Virtual: 5,100 CRX × 980,392 TOKEN
  Real: 100 CRX × 980,392 TOKEN

New price = 5,100 / 980,392 = 0.0052 CRX per TOKEN
(Price went up!)
```

---

## 🎨 Common Configurations

### For CRX Token Launch (Day 1)

```typescript
{
  quoteMint: WRAPPED_SOL,           // Use wrapped SOL
  baseMint: CRX_MINT,
  virtualQuote: 30 SOL,             // 30_000_000_000
  virtualBase: 1B CRX,              // 1_000_000_000_000_000
  graduation: 85 SOL,               // 85_000_000_000
  fee: 100 bps (1%)
}

// Initial price: 0.00000003 SOL per CRX
```

### For Launchpad Tokens (Day 2+)

```typescript
{
  quoteMint: CRX_MINT,
  baseMint: NEW_TOKEN_MINT,
  virtualQuote: 5,000 CRX,          // 5_000_000_000
  virtualBase: 1M TOKEN,            // 1_000_000_000_000
  graduation: 10,000 CRX,           // 10_000_000_000
  fee: 200 bps (2%)
}

// Initial price: 0.005 CRX per TOKEN
```

### For High-Value Tokens

```typescript
{
  quoteMint: CRX_MINT,
  baseMint: PREMIUM_TOKEN_MINT,
  virtualQuote: 100,000 CRX,
  virtualBase: 10,000 TOKEN,        // Low supply
  graduation: 200,000 CRX,
  fee: 300 bps (3%)
}

// Initial price: 10 CRX per TOKEN
```

---

## 🔧 Helpful Calculators

### Calculate Initial Price

```typescript
function getInitialPrice(virtualQuote: number, virtualBase: number): number {
  return virtualQuote / virtualBase;
}

// Example:
getInitialPrice(5000, 1_000_000);  // 0.005 CRX per token
```

### Calculate Expected Output

```typescript
function calculateOutput(
  amountIn: number,
  reserveIn: number,
  reserveOut: number,
  feeBps: number = 100
): number {
  const amountInWithFee = amountIn * (10000 - feeBps) / 10000;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn + amountInWithFee;
  return numerator / denominator;
}

// Example: Buy with 100 CRX
calculateOutput(
  100,      // Amount in
  5000,     // CRX reserve
  1000000,  // TOKEN reserve
  100       // 1% fee
);
// Returns: ~19,415 tokens
```

### Calculate Slippage

```typescript
function calculateSlippage(expected: number, minimum: number): number {
  return ((expected - minimum) / expected) * 100;
}

// Example: 5% slippage
const expected = 19415;
const minimum = expected * 0.95;  // 18,444
```

---

## 🐛 Troubleshooting

### "Insufficient funds" error
```bash
# Get more devnet SOL
solana airdrop 2 --url devnet
```

### "Account not found" error
```bash
# Rebuild and redeploy
anchor clean
anchor build
anchor deploy --provider.cluster devnet
```

### "Slippage exceeded" error
```typescript
// Increase slippage tolerance
const minOutput = expectedOutput * 0.90;  // 10% slippage
```

### Tests failing
```bash
# Kill any running validators
pkill -9 solana-test-validator

# Restart tests
anchor test
```

---

## 📚 Next Steps

1. **Read the full docs**: [README.md](README.md)
2. **Review security**: [SECURITY.md](SECURITY.md)
3. **Deploy safely**: [DEPLOYMENT.md](DEPLOYMENT.md)
4. **Study the code**: Start with `src/lib.rs`

---

## 💡 Pro Tips

### Tip 1: Use the Right Decimals

Match your virtual reserves to your token decimals:

```typescript
// SOL has 9 decimals
30 SOL = 30_000_000_000

// Your token has 6 decimals
1M tokens = 1_000_000_000_000

// CRX has 9 decimals
5000 CRX = 5_000_000_000_000
```

### Tip 2: Set Realistic Graduation

```typescript
// Too low: Graduates immediately, no bonding curve benefit
graduation: 100 CRX  // ❌

// Too high: Never graduates, stuck in bonding curve forever
graduation: 1_000_000 CRX  // ❌

// Just right: Achievable but meaningful
graduation: 10_000 CRX  // ✅
```

### Tip 3: Test Price Impact

```typescript
// Always check price impact before launch
const supply = 1_000_000;
const virtualReserve = 5_000;

// Small buy (100 CRX)
const smallImpact = (100 / virtualReserve) * 100;  // 2%

// Large buy (1000 CRX)
const largeImpact = (1000 / virtualReserve) * 100; // 20%

// Adjust reserves if impact too high
```

### Tip 4: Monitor Your Pool

```typescript
// Get pool state
const poolData = await program.account.pool.fetch(poolAddress);

console.log({
  virtualQuote: poolData.virtualQuoteReserves.toString(),
  virtualBase: poolData.virtualBaseReserves.toString(),
  realQuote: poolData.realQuoteReserves.toString(),
  realBase: poolData.realBaseReserves.toString(),
  volume: poolData.totalQuoteVolume.toString(),
  graduated: poolData.graduated,
});
```

---

## 🎓 Learn by Example

Check out the test file for complete examples:
- [tests/creator-amm.test.ts](tests/creator-amm.test.ts)

It shows:
- ✅ How to initialize the AMM
- ✅ How to create a pool
- ✅ How to buy tokens
- ✅ How to sell tokens
- ✅ How to handle errors

---

## 🆘 Get Help

- **GitHub Issues**: Report bugs
- **Discord**: Ask questions
- **Docs**: Full documentation
- **Tests**: Working examples

---

**Happy launching! 🚀**

Remember to test thoroughly on devnet before any mainnet deployment.
