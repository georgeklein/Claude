# Scale AMM

<img width="335" height="149" alt="image" src="https://github.com/user-attachments/assets/679e0b5f-b379-42bb-a6a4-44417618292a" />


**Tokenize everything on Solana with $CRX**

Launch tokens at any USD market cap with zero upfront capital. Built to power the Creator platform and grow the $CRX ecosystem.

---

## What Can You Launch?

### Pool Types

1. **$CRX/SOL Pool** (Primary Liquidity)
   - Main liquidity pool for $CRX
   - Enables all TOKEN/$CRX swaps
   - Protocol revenue source (1% fees)

2. **TOKEN/$CRX Pools** (Bonding Curves)
   - Launch any SPL token with $CRX as quote
   - Set custom USD market cap targets
   - Automatic graduation to permanent AMM
   - Thousands of tokens can launch simultaneously

### Token Launch Options

**Market Cap Flexibility:**
- Launch at any USD market cap ($1k, $10k, $100k, etc.)
- Set custom graduation thresholds ($40k, $85k, $500k, etc.)
- Oracle keeps USD prices stable as $CRX price changes

**Fee Structures:**
- **0% creator fee** - Maximum growth
- **0.25% creator fee** - Competitive
- **1% creator fee** - Premium revenue

**Supply Options:**
- Bond any amount: 100k, 1M, 1B tokens
- Partial supply bonding supported
- Keep remainder for team/treasury

---

## Features

### Virtual Liquidity
Launch tokens without upfront capital. Oracle calculates virtual reserves based on your target USD market cap and current $CRX price.

**Example:**
```
Target: $10k market cap
CRX Price: $2
Virtual Reserves: 5,000 CRX

If CRX price drops to $1:
Virtual Reserves auto-adjust to 10,000 CRX
Market cap stays at $10k
```

### Automatic Graduation
Pools automatically convert to permanent AMM when TVL hits your threshold.

**What happens:**
- Virtual reserves → Real reserves
- Accumulated $CRX locked forever (deflationary)
- Constant product formula (x×y=k) takes over
- Trading continues indefinitely
- Creator can add more liquidity

### Anti-Sniper Protection
**WAA (Weighted Average Age) System:**
- First 100 slots (~60 seconds): Up to 10% penalty on sells
- Trade size limits: Max 5% of supply during launch
- Prevents bots from sniping and dumping
- Encourages longer holding times

### Oracle Integration
Real-time $CRX price feeds via Pyth Network:
- Automatic reserve adjustments
- USD-stable pricing
- 60-second staleness checks
- Confidence interval validation

### Two-Phase System

**Phase 1: Pre-Bonding**
- Virtual reserves (oracle-calculated)
- Accumulate real $CRX from trades
- Anti-sniper active
- Higher creator fees available

**Phase 2: Graduated**
- Real reserves (locked $CRX)
- Permanent AMM (x×y=k)
- Anti-sniper disabled
- Continues forever

---

## Benefits

### For Creator Platform
- **Launch thousands of tokens** with one protocol
- **No upfront capital** required per launch
- **$CRX as universal pair** - everything flows through $CRX
- **Deflationary pressure** - graduated pools lock $CRX permanently
- **AI-friendly** - simple SDK for automated launches

### For Token Creators
- **Zero capital to launch** - no need to provide liquidity
- **USD-stable pricing** - oracle adjusts for $CRX volatility
- **Earn fees in $CRX** - 0%, 0.25%, or 1% on all trades
- **Automatic AMM** - graduates to permanent liquidity
- **Anti-sniper built-in** - protects against bots

### For Traders
- **Trade any token with $CRX** - universal pair
- **Slippage protection** - user-defined tolerance
- **Transparent pricing** - oracle-based, no manipulation
- **Permanent liquidity** - graduated pools never disappear

### For $CRX Economy
- **All volume flows through $CRX** - SOL → CRX → TOKEN
- **Protocol fees in $CRX** - 1% on all trades
- **Deflationary mechanics** - $CRX locked in graduated pools
- **Network effects** - more tokens = more $CRX demand

---

## SDK Usage

### Installation

```bash
npm install @scale-amm/sdk @solana/web3.js
```

### Launch $CRX/SOL Pool (Primary Liquidity)

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { ScaleAMM } from '@scale-amm/sdk';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.fromSecretKey(yourSecretKey);
const scale = new ScaleAMM(connection, wallet);

// Create main $CRX/SOL liquidity pool
const crxPool = await scale.createPool({
  baseMint: CRX_MINT_ADDRESS,
  quoteMint: SOL_MINT_ADDRESS,
  supply: 10_000_000,              // 10M $CRX
  initialMarketCapUsd: 1_000_000,  // Launch at $1M
  graduationThresholdUsd: 5_000_000, // Graduate at $5M
});

console.log('$CRX/SOL pool created:', crxPool.address);
```

### Launch TOKEN/$CRX Pool (Custom Token)

```typescript
// Launch a custom token bonding curve
const tokenPool = await scale.createPool({
  baseMint: YOUR_TOKEN_MINT,
  quoteMint: CRX_MINT_ADDRESS,
  supply: 1_000_000,               // 1M tokens
  initialMarketCapUsd: 10_000,     // Launch at $10k
  graduationThresholdUsd: 85_000,  // Graduate at $85k
  creatorFeeBps: 100,              // 1% creator fee
});

console.log('Token pool created:', tokenPool.address);
```

### Trade Tokens

```typescript
// Buy tokens with $CRX
const buyResult = await scale.buy(tokenPool.address, {
  crxAmount: 100,         // Spend 100 $CRX
  slippage: 1.0,          // 1% slippage tolerance
});

console.log('Bought:', buyResult.tokensReceived, 'tokens');

// Sell tokens for $CRX
const sellResult = await scale.sell(tokenPool.address, {
  tokenAmount: 5000,      // Sell 5000 tokens
  slippage: 1.0,
});

console.log('Received:', sellResult.crxReceived, '$CRX');
```

### Monitor Pool Status

```typescript
// Get current pool state
const pool = await scale.getPool(tokenPool.address);

console.log('Price:', pool.price, '$CRX per token');
console.log('Market Cap:', pool.marketCapUsd, 'USD');
console.log('Phase:', pool.phase); // 'PreBonding' or 'Graduated'
console.log('Graduation Progress:', (pool.graduationProgress * 100).toFixed(1), '%');
console.log('Liquidity:', pool.liquidityCrx, '$CRX');
```

### Listen for Events

```typescript
// Listen for all trades on a pool
scale.onTrade(tokenPool.address, (trade) => {
  console.log(`${trade.direction}: ${trade.user.toString().slice(0, 8)}...`);
  console.log(`  ${trade.tokenAmount} tokens for ${trade.crxAmount} $CRX`);
});

// Listen for graduation
scale.onGraduation(tokenPool.address, (event) => {
  console.log('Pool graduated at $', event.marketCapUsd);
  console.log('$CRX locked:', event.totalCrxLocked);
});
```

### Launch Thousands of Tokens (AI-Powered)

```typescript
// Automated token launches for Creator platform
const tokenConfigs = [
  { name: 'Token A', supply: 1_000_000, mcap: 10_000 },
  { name: 'Token B', supply: 500_000, mcap: 5_000 },
  { name: 'Token C', supply: 2_000_000, mcap: 20_000 },
  // ... thousands more
];

// Launch all concurrently
const pools = await Promise.allSettled(
  tokenConfigs.map(config =>
    scale.createPool({
      baseMint: config.mint,
      quoteMint: CRX_MINT_ADDRESS,
      supply: config.supply,
      initialMarketCapUsd: config.mcap,
      graduationThresholdUsd: config.mcap * 8.5,
      creatorFeeBps: 100,
    })
  )
);

console.log(`Launched ${pools.filter(p => p.status === 'fulfilled').length} pools`);
```

---

## Pool Economics

### $CRX Flow
```
User wants to buy TOKEN:
  1. Swap SOL → $CRX (on DEX)
  2. Buy TOKEN with $CRX (Scale AMM)
  3. Protocol earns 1% fee in $CRX
  4. Creator earns custom % fee in $CRX

User wants to sell TOKEN:
  1. Sell TOKEN for $CRX (Scale AMM)
  2. Swap $CRX → SOL (on DEX)
  3. Protocol earns 1% fee in $CRX
  4. Creator earns custom % fee in $CRX (+ WAA penalty if early)
```

### Deflationary Mechanics
```
Pre-Bonding Phase:
  - Trades accumulate $CRX in vault
  - Virtual reserves calculate pricing
  - No $CRX locked yet

Graduation:
  - All accumulated $CRX → Real reserves
  - $CRX locked in pool forever
  - Cannot be withdrawn

Result:
  - Every graduated pool removes $CRX from circulation
  - 1000s of graduated pools = massive $CRX deflation
  - Permanent buy pressure on $CRX
```

---

## Use Cases

### Creator Platform (Primary)
- Launch community tokens for different projects
- AI-generated token concepts
- Event-based token launches
- Automated pool management
- Custom integrations with Creator features

### AI-Powered Launches
- Train AI to launch tokens based on trends
- Automated market making strategies
- Event-driven token creation
- Batch launching (1000s of tokens)

### Community Tokens
- DAO governance tokens
- Community engagement tokens
- Project-specific utility tokens
- NFT collection tokens

---

## Documentation

- **[GETTING_STARTED.md](GETTING_STARTED.md)** - 5-minute setup guide
- **[sdk/README.md](sdk/README.md)** - Complete API reference
- **[WHAT_IT_DOES.md](WHAT_IT_DOES.md)** - Protocol deep dive
- **[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)** - Pre-mainnet requirements

---

## Development

```bash
# Clone and install
git clone https://github.com/georgeklein/Scale-AMM.git
cd Scale-AMM
npm install

# Build Solana program
anchor build

# Run tests (179 tests)
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

---

## License

Apache-2.0

---

**Built for Creator. Powered by $CRX.**
