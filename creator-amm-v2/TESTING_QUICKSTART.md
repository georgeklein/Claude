# Testing Quick Start Guide

## Prerequisites

Make sure you have the following installed:
```bash
# Check versions
solana --version        # Should be 1.17+
anchor --version        # Should be 0.29+
node --version          # Should be 18+
```

## Installation & Setup

### 1. Install Dependencies
```bash
cd /home/user/Claude/creator-amm-v2
npm install
```

### 2. Build the Program
```bash
anchor build
```

This generates:
- `/home/user/Claude/creator-amm-v2/target/deploy/creator_amm_v2.so`
- `/home/user/Claude/creator-amm-v2/target/types/creator_amm_v2.ts`
- `/home/user/Claude/creator-amm-v2/target/idl/creator_amm_v2.json`

### 3. Run Tests
```bash
anchor test
```

Expected output:
```
Creator AMM v2 - Comprehensive Test Suite
  ✓ Test environment initialized

  1. Pool Creation Tests
    ✓ Should create pool with ConstantProduct curve
    ✓ Should create pool with Exponential curve
    ✓ Should reject Custom curve (not implemented)
    ... (39 total tests)

  39 passing (45s)
```

## Running Specific Tests

### Run Single Test Category
```bash
# Pool creation tests only
anchor test --grep "Pool Creation Tests"

# Buy instruction tests only
anchor test --grep "Buy Instruction Tests"

# Graduation tests only
anchor test --grep "Graduation Tests"
```

### Run Single Test
```bash
anchor test --grep "Should create pool with ConstantProduct curve"
```

### Skip Slow Tests
```bash
anchor test --grep "Edge Cases" --invert
```

## Troubleshooting

### Issue: "Program not deployed"
**Solution:**
```bash
anchor build
solana-test-validator &  # Start local validator
anchor deploy
```

### Issue: "Insufficient funds"
**Solution:** The tests auto-airdrop SOL, but if you see this error:
```bash
solana airdrop 10 $(solana address)
```

### Issue: "Oracle account not found"
**Solution:** The tests create mock oracles. If this fails, check:
```typescript
// In comprehensive.ts, verify createMockOracle() function
async function createMockOracle(price: number): Promise<Keypair>
```

### Issue: "Type not found: CreatorAmmV2"
**Solution:**
```bash
anchor build  # This generates TypeScript types
```

### Issue: "Mint authority not revoked"
**Solution:** This is expected - the test verifies this error occurs. Check test logic:
```typescript
it("Should reject if mint authority not revoked", async () => {
  // This test SHOULD fail with MintAuthorityNotRevoked
})
```

## Known Limitations

### 1. Mock Oracle
The tests use a simplified mock oracle. For production testing:
```typescript
// TODO: Replace with real Pyth oracle
// See: https://docs.pyth.network/
```

### 2. Anti-Sniper Timing
Anti-sniper tests may be non-deterministic due to slot timing:
```bash
# If anti-sniper tests fail, increase window:
config.anti_sniper_window_slots = 100  # Increase from 20
```

### 3. CRX Token
Tests create a mock CRX token. For devnet testing:
```typescript
// Replace with actual CRX mint
const crxMint = new PublicKey("CRX_MINT_ADDRESS_HERE");
```

## Test Structure Overview

```
tests/comprehensive.ts
├── Setup (before)
│   ├── Create authority keypairs
│   ├── Create CRX mint
│   ├── Create mock oracle
│   └── Initialize config
│
├── 1. Pool Creation Tests (10 tests)
│   ├── Valid curve types
│   ├── Fee tiers
│   └── Validation errors
│
├── 2. Buy Instruction Tests (6 tests)
│   ├── Normal buys
│   ├── Slippage protection
│   └── Error cases
│
├── 3. Sell Instruction Tests (5 tests)
│   ├── Normal sells
│   ├── Slippage protection
│   └── Error cases
│
├── 4. Graduation Tests (5 tests)
│   ├── Phase transition
│   ├── Fee changes
│   └── Invariant maintenance
│
├── 5. Edge Cases (5 tests)
│   ├── Boundary values
│   ├── Large trades
│   └── Sequential trades
│
├── 6. Curve Math Tests (5 tests)
│   ├── ConstantProduct pricing
│   ├── Exponential pricing
│   └── Price movements
│
└── 7. Invariant Tests (4 tests)
    ├── x*y=k maintenance
    ├── Vault synchronization
    └── Fee accounting
```

## Helper Functions Reference

### Pool Setup
```typescript
// Create pool
const { pool, quoteVault, baseVault } = await createPool(
  baseMint,
  new anchor.BN(10_000_000_000),  // $10k market cap
  tokenSupply,
  25,                              // 0.25% fee
  { constantProduct: {} },         // Curve type
  new anchor.BN(40_000_000_000)    // $40k graduation
);
```

### Execute Buy
```typescript
await executeBuy(
  pool,
  quoteVault,
  baseVault,
  baseMint,
  trader,
  new anchor.BN(1_000_000),  // 1 CRX
  new anchor.BN(0)           // No slippage limit
);
```

### Execute Sell
```typescript
await executeSell(
  pool,
  quoteVault,
  baseVault,
  baseMint,
  trader,
  new anchor.BN(1_000_000),  // 1 token
  new anchor.BN(0)           // No slippage limit
);
```

### Verify Invariants
```typescript
// Check x*y=k maintained
await verifyInvariant(pool, "PreBonding");

// Check vaults match reserves
await verifyVaultBalances(pool, quoteVault, baseVault);
```

## Performance Tips

### Speed Up Tests
```bash
# Use --detach to run validator in background
anchor test --detach

# Skip build if code unchanged
anchor test --skip-build

# Run in parallel (experimental)
anchor test --parallel
```

### Reduce Log Spam
```bash
# Minimal output
anchor test -- --reporter min

# Only show failures
anchor test -- --reporter tap | grep -A5 "not ok"
```

## Continuous Integration

### GitHub Actions Example
```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: ./.github/actions/setup-anchor@v1
      - run: anchor build
      - run: anchor test
```

### Pre-commit Hook
```bash
# .git/hooks/pre-commit
#!/bin/bash
anchor test --skip-build || exit 1
```

## Next Steps

After tests pass:
1. ✅ Review TEST_COVERAGE_REPORT.md for gaps
2. ✅ Add oracle integration tests
3. ✅ Deploy to devnet
4. ✅ Run manual testing checklist
5. ✅ Schedule security audit

## Support

If tests fail unexpectedly:
1. Check Anchor version: `anchor --version` (should be 0.29+)
2. Clear build cache: `anchor clean && anchor build`
3. Restart test validator: `pkill solana-test-validator && solana-test-validator`
4. Check logs: `~/.config/solana/test-validator.log`

For questions:
- Review code comments in `/home/user/Claude/creator-amm-v2/tests/comprehensive.ts`
- Check program code in `/home/user/Claude/creator-amm-v2/programs/creator-amm-v2/src/`
- Read documentation in `/home/user/Claude/creator-amm-v2/README.md`
