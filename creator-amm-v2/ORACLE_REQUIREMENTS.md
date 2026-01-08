# Oracle Requirements for Self-Hosted CRX

## Current Implementation

The protocol uses a **simplified oracle structure** at `src/utils/oracle.rs` that is **appropriate for self-hosted CRX** where you control the price feed.

## Oracle Account Structure

```rust
pub struct PythPriceFeed {
    pub price: i64,           // Price value (e.g., 200 for $2.00 with expo=-2)
    pub conf: u64,            // Confidence interval (lower is better)
    pub expo: i32,            // Price exponent (e.g., -2 means divide by 100)
    pub publish_time: i64,    // Unix timestamp of last update
}
```

## Requirements for Your Self-Hosted Oracle

### 1. **Price Updates**
- Keep `publish_time` fresh (within 60 seconds default)
- Update whenever CRX price changes significantly
- Price format: `price * 10^expo` (e.g., `price=200, expo=-2` = $2.00)

### 2. **Confidence Interval**
- Set `conf` to a reasonable value relative to price
- Default max: 1% (100 bps) confidence deviation
- Lower confidence = more precise price = better for users

### 3. **Price Bounds** (from create_pool.rs)
- Minimum CRX price: $0.001 (1_000 with 6 decimals)
- Maximum CRX price: $100,000 (100_000_000_000 with 6 decimals)
- Sanity check prevents extreme values

### 4. **Access Control**
Since you control the oracle:
- Ensure only authorized updater can modify the oracle account
- Use proper account ownership (your program authority)
- Consider multisig for production oracle updates

## Example Price Calculations

### CRX at $2.00:
```
price = 200
expo = -2
publish_time = 1704067200 (current unix timestamp)
conf = 1  (very low uncertainty)

Final price: 200 * 10^(-2) = 2.00
Normalized to 6 decimals: 2_000_000
```

### CRX at $0.50:
```
price = 50
expo = -2
publish_time = 1704067200
conf = 1

Final price: 50 * 10^(-2) = 0.50
Normalized to 6 decimals: 500_000
```

### CRX at $123.45:
```
price = 12345
expo = -2
publish_time = 1704067200
conf = 123  (1% confidence)

Final price: 12345 * 10^(-2) = 123.45
Normalized to 6 decimals: 123_450_000
```

## Security Considerations for Self-Hosted Oracle

### ✅ **You're Safe From:**
- Pyth oracle manipulation (you control the feed)
- Third-party oracle attacks
- Oracle provider downtime

### ⚠️ **You Must Ensure:**
1. **Price Accuracy**: Your oracle reflects true CRX/SOL market price
2. **Freshness**: Update within max_age_seconds (default 60s)
3. **Access Control**: Only your authorized account can update
4. **High Availability**: Oracle stays online during pool creation

## Deployment Checklist

Before mainnet launch:

- [ ] Deploy oracle account with proper authority
- [ ] Set up automated price update bot
- [ ] Test price staleness reversion (>60s old)
- [ ] Test confidence interval reversion (>1%)
- [ ] Verify only your authority can update oracle
- [ ] Monitor oracle health and uptime
- [ ] Set up alerting for oracle failures

## Alternative: Full Pyth Integration

If you want to use Pyth's official oracle instead, see `PATH_TO_5_STAR.md` section 1 for full integration code using `pyth-solana-receiver-sdk`.

**Pros of Pyth:**
- Cryptographic verification
- Decentralized price feeds
- Industry standard

**Pros of Self-Hosted (Current):**
- You control CRX price (you own 80% of supply)
- No external dependencies
- Simpler implementation
- No Pyth fees

## Recommended Approach

Since you're launching CRX and own 80% of the supply, **the self-hosted oracle is appropriate** as long as you:

1. Keep it updated with accurate CRX/SOL pricing from your pool
2. Ensure high availability
3. Use proper access controls

The simplified oracle avoids the complexity of Pyth SDK while giving you full control over the CRX price feed.
