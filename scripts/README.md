# Scripts

**Deployment and utility scripts for Scale AMM**

---

## Deployment Scripts

### `deploy-devnet.sh`
Deploy Scale AMM to Solana devnet for testing.

```bash
./scripts/deploy-devnet.sh
```

**What it does:**
1. Sets Solana CLI to devnet
2. Airdrops SOL for deployment
3. Builds program with `anchor build`
4. Deploys to devnet
5. Outputs program ID

### `deploy-mainnet.sh`
Deploy Scale AMM to Solana mainnet.

**⚠️  CRITICAL:** Update DEPLOYER_PUBKEY before running!

```bash
./scripts/deploy-mainnet.sh
```

**Checklist before mainnet:**
- [ ] DEPLOYER_PUBKEY updated in `initialize.rs`
- [ ] All 179 tests passing
- [ ] CU usage <50k per trade
- [ ] Professional audit complete
- [ ] 72-hour devnet soak test (10,000+ trades)
- [ ] Verifiable build published

---

## Testing Scripts

### `run-critical-tests.sh`
Run critical security tests only.

```bash
./scripts/run-critical-tests.sh
```

Runs: Oracle, WAA, anti-sniper, concurrent tests.

### `run-all-tests.sh`
Run complete test suite (179 tests).

```bash
./scripts/run-all-tests.sh
```

---

## Utility Scripts

### `check-deployer-pubkey.sh`
Verify DEPLOYER_PUBKEY is not placeholder.

```bash
./scripts/check-deployer-pubkey.sh
```

**Checks for:** `"11111111111111111111111111111111"`

**Exit codes:**
- 0: DEPLOYER_PUBKEY is set correctly
- 1: DEPLOYER_PUBKEY is still placeholder (BLOCKER)

### `compute-units.sh`
Measure compute unit usage for trades.

```bash
./scripts/compute-units.sh
```

**Reports:**
- Buy CU usage
- Sell CU usage
- Average CU per trade
- Target: <50k CU

---

## Purpose

Automate deployment and testing workflows:
- Simplify devnet/mainnet deployment
- Validate critical requirements before mainnet
- Monitor compute unit usage
- Ensure security checks pass
