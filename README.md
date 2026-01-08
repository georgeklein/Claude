# Scale AMM

**Production-ready bonding curve protocol for Solana token launches.**

Scale AMM is an automated market maker for token launches featuring dynamic virtual liquidity, dual-phase bonding curves, and oracle-based price discovery.

## Features

- **Dynamic Virtual Liquidity** - Launch tokens at specific USD market caps with oracle-adjusted reserves
- **Dual-Phase Bonding Curve** - Automatic graduation from virtual to real liquidity AMM
- **Oracle Integration** - Real-time CRX price feeds via Pyth
- **Anti-Sniper Protection** - Time and size-based limits during launch
- **Configurable Fees** - Fee structures for pre-bonding and post-graduation phases
- **Vault Security** - Post-trade reserve validation and checked arithmetic

## Quick Start

### Installation

```bash
# Clone repository
git clone https://github.com/georgeklein/Scale-AMM.git
cd Scale-AMM

# Install dependencies
npm install

# Build program
anchor build

# Run tests
anchor test
```

### Launch a Token (TypeScript SDK)

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { ScaleAMM } from '@scale-amm/sdk';

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = Keypair.fromSecretKey(yourSecret);
const scale = new ScaleAMM(connection, wallet);

// Create pool
const pool = await scale.createPool({
  baseMint: yourTokenMint,
  supply: 1_000_000,                    // 1M tokens
  initialMarketCapUsd: 10_000,          // Launch at $10k
  graduationThresholdUsd: 40_000,       // Graduate at $40k
});

console.log('Pool created:', pool.url);
```

### Trade Tokens

```typescript
// Buy tokens
const result = await scale.buy(poolAddress, {
  crxAmount: 100,      // Spend 100 CRX
  slippage: 1.0,       // 1% slippage tolerance
});

// Sell tokens
await scale.sell(poolAddress, {
  tokenAmount: 1000,   // Sell 1000 tokens
  slippage: 1.0,
});
```

## Architecture

### Phase 1: Pre-Bonding (Virtual Liquidity)
- Virtual reserves calculated from target market cap
- Higher fees (default: 1%)
- Anti-sniper protection active
- Accumulates real CRX until graduation

### Phase 2: Graduated (Real Liquidity)
- Pure constant product (x*y=k) AMM
- Lower fees (default: 1%)
- Anti-sniper protection disabled
- Continues trading with real reserves

## Program Instructions

1. **initialize** - Initialize global protocol configuration (admin only)
2. **create_pool** - Create new token bonding curve pool
3. **buy** - Buy tokens with CRX
4. **sell** - Sell tokens for CRX
5. **update_approved_quotes** - Update whitelist of approved quote tokens (admin only)

## SDK Documentation

See [sdk/README.md](sdk/README.md) for complete SDK documentation, or [sdk/QUICKSTART.md](sdk/QUICKSTART.md) for copy-paste templates.

### Key SDK Features

- **Zero boilerplate** - No PDA math or ATA management
- **Human-readable** - Use USD and token amounts
- **Type-safe** - Full TypeScript support
- **Error-friendly** - Clear error messages
- **Real-time** - Event listeners for trades and graduations

## Testing

```bash
# Run full test suite (39 tests)
anchor test

# Run specific test
anchor test --skip-build -- --test-name "buy_tokens"
```

Tests cover:
- Pool creation and initialization
- Buy and sell operations
- Phase transitions and graduation
- Fee calculations
- Anti-sniper protection
- Slippage protection
- Edge cases and error conditions

## Security Features

- Checked arithmetic operations (no overflows)
- Slippage protection on all trades
- Anti-sniper protection during launch window
- Post-trade vault validation
- Oracle staleness and confidence checks
- Mint and freeze authority validation

## Configuration

Global configuration parameters:

```typescript
{
  preBondingFeeBps: 100,           // 1% fee before graduation
  preBondingThresholdUsd: 40_000,  // $40k to graduate
  postBondingFeeBps: 100,          // 1% fee after graduation
  graduationThresholdUsd: 85_000,  // $85k graduation threshold
  antiSniperWindowSlots: 100,      // 100 slots (~40s)
  antiSniperMaxTradeBps: 500,      // 5% max trade during anti-sniper
  oracleMaxAgeSeconds: 60,         // Price must be <60s old
  oracleMaxConfidenceBps: 100,     // Max 1% confidence interval
  approvedQuoteTokens: [...],      // Whitelist (CRX + 4 others)
}
```

## Events

The program emits comprehensive events for indexing:

- `ConfigInitialized` - Protocol configuration
- `PoolCreated` - New pool creation
- `TradeExecuted` - Buy/sell trades
- `PhaseTransition` - PreBonding → Graduated
- `PoolGraduated` - Graduation milestone reached

## License

MIT License - see [LICENSE](LICENSE) for details.

## Status

✅ Production-ready code
✅ Comprehensive test coverage (39 tests)
✅ Security hardened
✅ Well documented

**Recommendation:** Deploy to devnet for integration testing, then schedule professional security audit before mainnet launch.

## Support

For questions or issues, please open a GitHub issue.
