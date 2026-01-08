# Creator AMM - Virtual Liquidity Bonding Curve

A Solana program implementing a virtual liquidity AMM with bonding curve mechanics, designed for the Creator platform. Supports any SPL token as the quote currency (SOL, CRX, USDC, etc.) with one-sided liquidity provision.

## 🌟 Key Features

### ✅ Virtual Liquidity
- **Launch tokens with ZERO quote token required**
- Only deposit the base token you're launching
- Virtual reserves determine initial pricing via bonding curve
- Similar to Pump.fun model but with custom quote token support

### ✅ Any Quote Token
- Launch CRX/SOL pools (SOL as quote)
- Launch TOKEN/CRX pools (CRX as quote)
- Support for any SPL token as quote currency
- Perfect for multi-tier launchpad platforms

### ✅ Anti-Sniper Protection
- Configurable time window after pool creation
- Trade size limits during anti-sniper period
- Protects genuine users from bot front-running
- Automatic deactivation after window expires

### ✅ Security First
- Overflow protection on all math operations
- Slippage protection on all swaps
- PDA-based access control
- Comprehensive input validation

### ✅ Fee Mechanism
- Configurable protocol fees (in basis points)
- Automatic fee collection to protocol wallet
- Transparent fee structure
- Revenue generation for platform

## 🏗️ Architecture

### Bonding Curve Formula

```
Constant Product: x * y = k

Price = virtual_quote_reserves / virtual_base_reserves
Output = (input * output_reserve) / (input_reserve + input)
```

### Virtual vs Real Reserves

- **Virtual Reserves**: Used for pricing calculations (bonding curve)
- **Real Reserves**: Actual tokens in the pool vaults

Example:
```
Virtual: 30 SOL × 1B tokens
Real: 0 SOL × 1B tokens (at creation)

Initial price: 0.00000003 SOL per token
```

## 📦 Project Structure

```
creator-amm/
├── programs/creator-amm/src/
│   ├── lib.rs                 # Main program entry
│   ├── state.rs               # Account structures
│   ├── errors.rs              # Custom error codes
│   └── instructions/
│       ├── initialize.rs      # Initialize global config
│       ├── create_pool.rs     # Create bonding curve pool
│       ├── buy.rs             # Buy tokens (quote → base)
│       └── sell.rs            # Sell tokens (base → quote)
├── tests/
│   └── creator-amm.test.ts    # Comprehensive test suite
└── README.md                   # This file
```

## 🚀 Getting Started

### Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install latest
avm use latest

# Install Node.js dependencies
npm install
```

### Build

```bash
anchor build
```

### Test

```bash
anchor test
```

### Deploy

```bash
# Devnet
anchor deploy --provider.cluster devnet

# Mainnet (ONLY after professional security audit)
anchor deploy --provider.cluster mainnet
```

## 📖 Usage Examples

### 1. Initialize the AMM

```typescript
await program.methods
  .initialize(
    100,          // 1% protocol fee
    20,           // 20 slot anti-sniper window (~8 seconds)
    500           // 5% max trade size during anti-sniper
  )
  .accounts({
    config,
    authority: wallet.publicKey,
    feeRecipient: feeWallet.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

### 2. Create a Pool (Launch a Token)

```typescript
await program.methods
  .createPool(
    new BN(30_000_000_000),      // 30 SOL virtual quote
    new BN(1_000_000_000_000),   // 1B token virtual base
    new BN(1_000_000_000_000),   // 1B token initial deposit
    new BN(85_000_000_000)       // 85 SOL graduation threshold
  )
  .accounts({
    config,
    pool,
    quoteMint,                    // CRX token mint
    baseMint,                     // Your new token mint
    quoteVault,
    baseVault,
    creatorBaseAccount,
    creator: wallet.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

### 3. Buy Tokens

```typescript
await program.methods
  .buy(
    new BN(1_000_000_000),   // 1 quote token
    new BN(30_000_000)       // Min base tokens (slippage protection)
  )
  .accounts({
    config,
    pool,
    quoteVault,
    baseVault,
    userQuoteAccount,
    userBaseAccount,
    feeRecipientAccount,
    user: wallet.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
```

### 4. Sell Tokens

```typescript
await program.methods
  .sell(
    new BN(50_000_000),      // 50 base tokens
    new BN(900_000)          // Min quote tokens (slippage protection)
  )
  .accounts({
    config,
    pool,
    quoteVault,
    baseVault,
    userQuoteAccount,
    userBaseAccount,
    feeRecipientAccount,
    user: wallet.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
```

## 🎯 Use Cases

### Creator Platform Architecture

```
Day 1: Launch $CRX
  └─ Create CRX/SOL pool (SOL as quote)
     └─ Users buy CRX with SOL

Day 2+: Launchpad Opens
  └─ Project A launches TOKEN_A/CRX pool (CRX as quote)
  └─ Project B launches TOKEN_B/CRX pool (CRX as quote)
  └─ Project C launches TOKEN_C/CRX pool (CRX as quote)
```

**Benefits:**
- No upfront liquidity needed for projects
- CRX becomes the denomination standard
- Platform captures fees on all trades
- Projects graduate to DEX at threshold

## ⚠️ Security Considerations

### Before Mainnet Deployment

**CRITICAL: This code MUST be professionally audited before handling real funds.**

Required security measures:
1. ✅ **Multiple independent security audits** ($30k-50k each)
2. ✅ **Formal verification** of math operations
3. ✅ **Extensive fuzzing** and property-based testing
4. ✅ **Bug bounty program** on Immunefi
5. ✅ **Staged rollout** with deposit limits
6. ✅ **Emergency pause mechanism** (consider adding)
7. ✅ **Insurance coverage** for potential exploits

### Known Limitations

1. **No graduation mechanism** - Pool doesn't auto-migrate to DEX yet
2. **No LP tokens** - Creator receives all graduation liquidity
3. **No multi-hop routing** - Single pool swaps only
4. **Fixed bonding curve** - Constant product only (no custom curves)

### Attack Vectors to Consider

- ☑️ Integer overflow/underflow (mitigated with checked math)
- ☑️ Reentrancy (mitigated with Anchor's account validation)
- ☑️ Front-running (mitigated with anti-sniper + slippage protection)
- ☑️ Price manipulation (mitigated with bonding curve mechanics)
- ⚠️ Economic exploits (requires thorough analysis)
- ⚠️ MEV attacks (requires additional protection)

## 🔧 Configuration

### Protocol Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `protocol_fee_bps` | 100 (1%) | Fee taken on each trade |
| `anti_sniper_window` | 20 slots | Anti-bot protection duration |
| `anti_sniper_max_trade_bps` | 500 (5%) | Max trade size during window |
| `virtual_quote_reserves` | Varies | Initial quote reserve for pricing |
| `virtual_base_reserves` | Varies | Initial base reserve for pricing |
| `graduation_threshold` | Varies | Quote tokens needed to graduate |

### Recommended Settings

**For CRX/SOL Launch:**
- Virtual quote: 30 SOL (30_000_000_000)
- Virtual base: 1B CRX tokens
- Graduation: 85 SOL
- Fee: 1% (100 bps)

**For TOKEN/CRX Launchpad:**
- Virtual quote: 5000 CRX
- Virtual base: 1M TOKEN
- Graduation: 10000 CRX
- Fee: 2% (200 bps)

## 🧪 Testing

Run the full test suite:

```bash
anchor test
```

Tests cover:
- ✅ Config initialization
- ✅ Pool creation
- ✅ Buy operations
- ✅ Sell operations
- ✅ Anti-sniper enforcement
- ✅ Slippage protection
- ✅ Fee calculations
- ✅ Reserve updates

## 📊 Math Verification

### Buy Example
```
Initial: 30 SOL × 1B tokens
User buys with: 1 SOL
Fee: 1% = 0.01 SOL to protocol

Output = (0.99 * 1B) / (30 + 0.99) = 31,961,722 tokens
New reserves: 30.99 SOL × 968,038,278 tokens
```

### Sell Example
```
Current: 30.99 SOL × 968,038,278 tokens
User sells: 31,961,722 tokens

Output = (31,961,722 * 30.99) / (968,038,278 + 31,961,722) = 0.99 SOL
Fee: 1% = 0.0099 SOL to protocol
User receives: 0.9801 SOL
```

## 🚨 Emergency Procedures

If you discover a vulnerability:

1. **DO NOT** disclose publicly
2. **Email** security@yourplatform.com
3. **Include** detailed exploit description
4. **Wait** for confirmation before disclosure
5. **Eligible** for bug bounty rewards

## 📄 License

MIT License - See LICENSE file for details

## 🙏 Acknowledgments

- Inspired by Pump.fun's virtual liquidity model
- Bonding curve math from Uniswap V2
- Built with Anchor framework by Coral

---

## ⚠️ FINAL WARNING

**THIS IS UNAUDITED CODE**

Do not deploy to mainnet without:
- Professional security audits (minimum 2)
- Extensive testing on devnet
- Bug bounty program
- Legal review
- Insurance coverage

**Smart contract bugs can result in permanent loss of all user funds.**

For production deployment, hire experienced Solana developers and security auditors.

---

Built for the Creator platform 🚀
