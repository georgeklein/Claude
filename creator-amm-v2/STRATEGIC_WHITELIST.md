# Two-Tier Quote Token Whitelist System

## Overview

The Creator AMM v2 implements a **two-tier quote token permissioning system** that balances openness with control, enabling strategic business development while maintaining protocol integrity.

---

## The Two-Tier Model

### Tier 1: Permissionless (CRX Pairs)
- **Who:** Anyone
- **Quote Token:** CRX only
- **Access:** Unrestricted
- **Use Case:** Community-driven launches, grassroots projects, fair launches

**Example:**
```
✅ DOGE/CRX - Anyone can create
✅ PEPE/CRX - Anyone can create
✅ BONK/CRX - Anyone can create
```

### Tier 2: Permissioned (Premium Pairs)
- **Who:** Whitelisted addresses only
- **Quote Tokens:** SOL, USDC, USDT, or custom tokens
- **Access:** Controlled by protocol authority
- **Use Case:** Premium launches, institutional partners, vetted teams

**Example:**
```
✅ DOGE/SOL - Only if creator is whitelisted
✅ PEPE/USDC - Only if creator is whitelisted
✅ BONK/USDT - Only if creator is whitelisted
```

---

## Technical Implementation

### 1. Config State (`state.rs`)

```rust
pub struct Config {
    // ... existing fields ...

    /// Fixed array of 5 slots for whitelisted quote tokens
    pub approved_quote_tokens: [Pubkey; 5],

    /// How many of the 5 slots are actually used (0-5)
    pub approved_quote_count: u8,
}
```

**Storage:**
- 160 bytes for array (32 bytes × 5 slots)
- 1 byte for count
- Total: 161 bytes added to Config account

### 2. Validation Logic (`create_pool.rs`)

```rust
let is_crx = quote_mint_key == config.crx_mint;
let is_approved = config.approved_quote_tokens[..config.approved_quote_count as usize]
    .contains(&quote_mint_key);

require!(
    is_crx || is_approved,
    ErrorCode::QuoteTokenNotApproved
);
```

**Logic:**
1. Check if quote token is CRX → Allow (Tier 1)
2. Check if quote token is in whitelist → Allow (Tier 2)
3. Otherwise → Reject with `QuoteTokenNotApproved`

### 3. Admin Control (`update_approved_quotes.rs`)

```rust
pub fn update_approved_quotes(
    ctx: Context<UpdateApprovedQuotes>,
    approved_quote_tokens: [Pubkey; 5],
    approved_quote_count: u8,
) -> Result<()>
```

**Security:**
- Only protocol authority can call
- Validates count ≤ 5
- No breaking changes to existing pools
- Logs all updates for transparency

---

## Deployment Strategy

### Phase 1: CRX-Only Launch (Weeks 1-4)
**Configuration:**
```javascript
approved_quote_tokens: [Pubkey::default(); 5]  // Empty whitelist
approved_quote_count: 0                         // No approved tokens
```

**Result:**
- Only CRX pairs allowed
- Pure decentralized fair launch
- Community-driven growth
- Build CRX utility and demand

### Phase 2: Add SOL (Month 2+)
**Configuration:**
```javascript
approved_quote_tokens: [
    SOL_MINT,
    Pubkey::default(),
    Pubkey::default(),
    Pubkey::default(),
    Pubkey::default()
]
approved_quote_count: 1  // SOL now enabled
```

**Result:**
- SOL pairs available for whitelisted creators
- Attracts institutional partners
- Larger TVL from SOL liquidity
- CRX remains permissionless baseline

### Phase 3: Full Suite (Month 6+)
**Configuration:**
```javascript
approved_quote_tokens: [
    SOL_MINT,
    USDC_MINT,
    USDT_MINT,
    Pubkey::default(),
    Pubkey::default()
]
approved_quote_count: 3  // SOL, USDC, USDT enabled
```

**Result:**
- Complete multi-quote support
- Maximum flexibility for partners
- Stablecoin pairs for risk-averse traders
- Two remaining slots for future tokens

---

## Business Logic: Why Two Tiers?

### Problem Without Whitelist
If all quote tokens were permissionless:
- Fragmented liquidity across random quote tokens
- Poor user experience (confusion)
- Diluted CRX utility
- No strategic control

### Solution: Controlled Scarcity
**Tier 1 (CRX):**
- Open to everyone
- Drives CRX demand (all permissionless pairs use CRX)
- Builds protocol credibility through decentralization

**Tier 2 (SOL/USDC/USDT):**
- Premium positioning
- Attracts high-quality projects
- Generates partnership revenue
- Controls ecosystem growth

---

## Economic Incentives

### For Protocol
1. **CRX Demand:** Permissionless tier drives baseline demand
2. **Partnership Revenue:** Charge for whitelist access
3. **Quality Control:** Premium tokens attract serious projects
4. **Strategic Flexibility:** Can add/remove tokens dynamically

### For Creators
1. **CRX Tier:** Free, immediate, no approval needed
2. **Premium Tier:** Access to larger liquidity (SOL/USDC holders)
3. **Flexibility:** Choose best quote token for audience

### For Traders
1. **CRX Pairs:** Discover new projects, earn early gains
2. **Premium Pairs:** Trade with familiar assets (SOL/USDC)
3. **Safety:** Premium tier implies protocol endorsement

---

## Security Considerations

### ✅ Safe Operations
- Adding tokens to whitelist (non-breaking)
- Removing tokens (only affects new pools)
- Changing count (validated 0-5)

### ⚠️ Authority Controls
- Protocol authority has sole update power
- Use multisig for production deployments
- Emit events for transparency
- Existing pools never affected

### 🔒 Attack Vectors Mitigated
1. **Whitelist Spam:** Fixed 5-slot limit prevents bloat
2. **Unauthorized Tokens:** All new pools validated
3. **Config Manipulation:** PDA ensures single config
4. **Authority Hijack:** Deploy and initialize atomically

---

## Usage Examples

### Initialize with Empty Whitelist (CRX-Only)
```typescript
await program.methods
  .initialize(
    300,  // pre_bonding_fee_bps
    new BN(40_000_000_000),  // pre_bonding_threshold_usd
    100,  // post_bonding_fee_bps
    new BN(85_000_000_000),  // graduation_threshold_usd
    20,   // anti_sniper_window_slots
    500,  // anti_sniper_max_trade_bps
    60,   // oracle_max_age_seconds
    100,  // oracle_max_confidence_bps
    [
      PublicKey.default,  // Empty slot
      PublicKey.default,  // Empty slot
      PublicKey.default,  // Empty slot
      PublicKey.default,  // Empty slot
      PublicKey.default,  // Empty slot
    ],
    0  // approved_quote_count = 0 (none approved)
  )
  .rpc();
```

### Add SOL to Whitelist
```typescript
const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

await program.methods
  .updateApprovedQuotes(
    [
      SOL_MINT,
      PublicKey.default,
      PublicKey.default,
      PublicKey.default,
      PublicKey.default,
    ],
    1  // approved_quote_count = 1 (SOL approved)
  )
  .accounts({
    config: configPda,
    authority: authorityKeypair.publicKey,
  })
  .signers([authorityKeypair])
  .rpc();
```

### Add SOL + USDC + USDT
```typescript
const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDT_MINT = new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");

await program.methods
  .updateApprovedQuotes(
    [
      SOL_MINT,
      USDC_MINT,
      USDT_MINT,
      PublicKey.default,
      PublicKey.default,
    ],
    3  // approved_quote_count = 3 (SOL, USDC, USDT approved)
  )
  .accounts({
    config: configPda,
    authority: authorityKeypair.publicKey,
  })
  .signers([authorityKeypair])
  .rpc();
```

### Create Pool with CRX (Permissionless)
```typescript
await program.methods
  .createPool(
    new BN(10_000_000_000),  // $10k target MC
    new BN(1_000_000_000_000),  // 1M token supply
    25,  // 0.25% fee
    { constantProduct: {} },  // Curve type
    new BN(40_000_000_000)  // $40k graduation
  )
  .accounts({
    config: configPda,
    pool: poolPda,
    quoteMint: CRX_MINT,  // ✅ Always allowed
    baseMint: newTokenMint,
    // ... other accounts
  })
  .rpc();
```

### Create Pool with SOL (Permissioned)
```typescript
await program.methods
  .createPool(
    new BN(10_000_000_000),  // $10k target MC
    new BN(1_000_000_000_000),  // 1M token supply
    25,  // 0.25% fee
    { constantProduct: {} },  // Curve type
    new BN(40_000_000_000)  // $40k graduation
  )
  .accounts({
    config: configPda,
    pool: poolPda,
    quoteMint: SOL_MINT,  // ✅ Only if whitelisted
    baseMint: newTokenMint,
    // ... other accounts
  })
  .rpc();
```

---

## Error Handling

### QuoteTokenNotApproved
```
Error: Quote token not approved - must be CRX (permissionless) or whitelisted token like SOL/USDC/USDT (permissioned)
```

**Cause:** Tried to create pool with non-CRX, non-whitelisted token

**Solution:**
1. Use CRX as quote token (always allowed)
2. Contact protocol team for whitelist access
3. Wait for public whitelist expansion

### InvalidQuoteTokenCount
```
Error: Invalid quote token count - must be between 0 and 5
```

**Cause:** `approved_quote_count` > 5

**Solution:** Set count to valid range (0-5)

---

## Migration from CRX-Only

### Backward Compatibility
**OLD CODE (CRX-only constraint):**
```rust
constraint = quote_mint.key() == config.crx_mint @ ErrorCode::MustUseCrxQuote
```

**NEW CODE (Two-tier validation):**
```rust
let is_crx = quote_mint_key == config.crx_mint;
let is_approved = config.approved_quote_tokens[..config.approved_quote_count as usize]
    .contains(&quote_mint_key);
require!(is_crx || is_approved, ErrorCode::QuoteTokenNotApproved);
```

### Existing Pools
- **No changes required**
- All existing CRX pools continue working
- Pool state unchanged
- No migration needed

### Client Updates
**Before (CRX-only):**
```typescript
const quoteMint = CRX_MINT;  // Hardcoded
```

**After (Two-tier):**
```typescript
const quoteMint = userWantsSOL ? SOL_MINT : CRX_MINT;  // Choice
```

---

## Monitoring & Analytics

### On-Chain Events
The `update_approved_quotes` instruction emits logs:
```
✅ Approved quote tokens updated by authority
   Active slots: 3/5
   [0] So11111111111111111111111111111111111111112
   [1] EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
   [2] Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB
```

### Metrics to Track
1. **CRX Pairs Created:** Measure Tier 1 adoption
2. **Premium Pairs Created:** Measure Tier 2 demand
3. **Quote Token Mix:** Which tokens are popular?
4. **Whitelist Changes:** How often does authority update?

---

## Future Enhancements

### Dynamic Slot Expansion
Current: Fixed 5 slots
Future: Could upgrade to 10+ slots with account reallocation

### Per-Creator Whitelist
Current: Global whitelist (any creator can use approved tokens)
Future: Could add per-creator permissions (Alice can use SOL, Bob cannot)

### Time-Locked Whitelist
Current: Instant add/remove
Future: Could add timelock for major changes (DAO governance)

### NFT-Gated Whitelist
Current: Protocol authority controls
Future: Could gate access via NFT ownership (decentralized whitelist)

---

## Conclusion

The two-tier whitelist system provides:

1. **Decentralization:** CRX pairs remain permissionless
2. **Control:** Premium pairs require approval
3. **Flexibility:** 5 slots for strategic tokens
4. **Scalability:** No breaking changes to add/remove tokens
5. **Revenue:** Partnership opportunities with premium tier

**Result:** Best of both worlds - open fair launches with CRX, controlled premium launches with SOL/USDC/USDT.

---

## Quick Reference

| Feature | Tier 1 (CRX) | Tier 2 (Premium) |
|---------|--------------|------------------|
| **Access** | Permissionless | Permissioned |
| **Quote Token** | CRX only | SOL/USDC/USDT |
| **Approval** | None needed | Protocol authority |
| **Use Case** | Fair launches | Premium launches |
| **Target** | Community | Institutions |
| **Revenue** | Protocol fees | Partnership fees |

**Default Deployment:** Start with `approved_quote_count = 0` (CRX-only), expand later.
