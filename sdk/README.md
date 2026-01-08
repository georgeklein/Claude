# Scale AMM SDK

**TypeScript SDK for integrating Scale AMM into your Solana applications**

The SDK provides a simple, TypeScript-first interface for interacting with Scale AMM bonding curve pools.

---

## Purpose

Enable developers to:
- Launch $CRX/SOL pools (primary liquidity)
- Launch TOKEN/$CRX pools (custom token bonding curves)
- Trade tokens (buy/sell)
- Query pool state
- Listen for on-chain events
- Build AI-powered token launch tools

---

## Quick Start

```typescript
import { ScaleAMM } from '@scale-amm/sdk';

const scale = new ScaleAMM(connection, wallet);

// Launch a token
const pool = await scale.createPool({
  baseMint: tokenMint,
  supply: 1_000_000,
  initialMarketCapUsd: 10_000,
  graduationThresholdUsd: 85_000,
});

// Trade
await scale.buy(pool.address, { crxAmount: 100 });
await scale.sell(pool.address, { tokenAmount: 5000 });
```

---

## API

### Protocol
- `initialize(config)` - Initialize protocol (one-time, admin only)
- `getConfig()` - Get protocol configuration

### Pool Operations
- `createPool(params)` - Create new bonding curve pool
- `getPool(baseMint)` - Query pool state
- `getAllPools(limit, offset)` - Get all pools with pagination
- `getPoolsByCreator(creator)` - Get pools by creator address
- `getPrice(pool)` - Get current pool price

### Trading
- `buy(pool, params)` - Buy tokens with $CRX
- `sell(pool, params)` - Sell tokens for $CRX
- `estimateBuy(pool, amount)` - Estimate buy without executing
- `estimateSell(pool, amount)` - Estimate sell without executing

### User Data
- `getUserPosition(user, pool)` - Get user WAA position and fee state

### Events
- `onTrade(pool, callback)` - Listen for trades
- `onGraduation(pool, callback)` - Listen for pool graduation
- `onConfigInitialized(callback)` - Listen for protocol initialization
- `onPhaseTransition(pool, callback)` - Listen for phase changes
- `removeListener(id)` - Remove event listener

### Utilities
- `ScaleUtils.usdToMicroUsd()` - Convert USD to on-chain format
- `ScaleUtils.findPoolAddress()` - Derive pool PDA
- `ScaleUtils.formatPrice()` - Format prices for display

### Admin Utilities (AdminUtils class)
- `getProtocolStats()` - Protocol-wide analytics (volume, pools, creators)
- `getGraduationAlerts(threshold)` - Pools approaching graduation
- `detectAnomalies()` - Detect suspicious activity or issues
- `checkOracleHealth()` - Verify oracle is functioning
- `getPoolMetrics(pool)` - Detailed pool metrics
- `getTopCreators(limit)` - Top creators by volume
- `validatePoolReserves(pool)` - Verify reserve integrity

---

## Error Handling

```typescript
import { ScaleError, ErrorCode } from '@scale-amm/sdk';

try {
  await scale.buy(pool, { crxAmount: 100 });
} catch (error) {
  if (error instanceof ScaleError) {
    console.error('Error:', error.code, '-', error.message);
  }
}
```

**Common Errors:**
- `SLIPPAGE_EXCEEDED` - Price moved beyond tolerance
- `INSUFFICIENT_BALANCE` - Not enough tokens/CRX
- `ANTI_SNIPER_ACTIVE` - Trade too large during launch
- `POOL_NOT_FOUND` - Pool doesn't exist

---

## Examples

See `examples.ts` for complete working examples:
- Create pool
- Buy/sell tokens
- Query pool info
- Estimate trades
- Event listeners
- Batch launching (1000s of tokens)

---

## Use Cases

**Creator Platform (Primary):**
- Launch thousands of custom TOKEN/$CRX pools
- AI-powered token launches
- Automated pool management
- Event-driven integrations

**AI Builders:**
- Build bots that create tokens automatically
- Monitor and react to market events
- Execute complex trading strategies

---

## Requirements

- Node.js 16+
- @solana/web3.js ^1.87.0
- TypeScript 4.9+ (optional but recommended)

---

## License

MIT
