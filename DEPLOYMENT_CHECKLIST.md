# Scale AMM - Deployment Checklist

## 🚨 CRITICAL: Before ANY Deployment

### 1. Update DEPLOYER_PUBKEY (BLOCKER)
**File:** `programs/creator-amm-v2/src/instructions/initialize.rs:10`

**Current:**
```rust
pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("11111111111111111111111111111111");
```

**Must Change To:**
```rust
pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("YOUR_ACTUAL_WALLET_PUBLIC_KEY");
```

**Why This Matters:**
- Without this, ANYONE can call `initialize()` and become the protocol authority
- This is a **front-running attack vector**
- Once initialized by wrong person, protocol is bricked (can't re-initialize)

**How To Get Your Public Key:**
```bash
solana address
# or
solana-keygen pubkey ~/.config/solana/id.json
```

---

### 2. Test Suite Complete
- [ ] All 103 tests implemented
- [ ] 100% code coverage verified
- [ ] All tests passing
- [ ] Attack simulation tests passing

---

### 3. Security Audit Complete
- [ ] No unchecked arithmetic
- [ ] All `require!()` checks present
- [ ] Oracle validation working
- [ ] Vault security verified
- [ ] Emergency pause tested
- [ ] Run `/security` command - zero CRITICAL/HIGH findings

---

### 4. Performance Optimized
- [ ] Compute units <50k per trade
- [ ] buy.rs + sell.rs consolidated (optional)
- [ ] No unnecessary account loads
- [ ] Efficient math operations

---

### 5. Devnet Testing Complete
- [ ] Deployed to devnet successfully
- [ ] 72-hour soak test completed
- [ ] 10,000+ trades executed
- [ ] Zero exploits or crashes
- [ ] Emergency pause mechanism tested
- [ ] Oracle integration stable

---

### 6. Configuration Verified
```rust
// Check these values in initialize.rs handler
pre_bonding_fee_bps: 100,           // 1%
pre_bonding_threshold_usd: 40_000,  // $40k
post_bonding_fee_bps: 100,          // 1%
graduation_threshold_usd: 85_000,   // $85k
anti_sniper_window_slots: 100,      // ~40 seconds
anti_sniper_max_trade_bps: 500,     // 5%
oracle_max_age_seconds: 60,         // 1 minute
oracle_max_confidence_bps: 100,     // 1%
```

Are these correct for mainnet? ⬜ YES / ⬜ NO

---

### 7. Documentation Updated
- [ ] README.md reflects mainnet state
- [ ] WHAT_IT_DOES.md is accurate
- [ ] SDK README has correct RPC endpoints
- [ ] Deployment scripts updated for mainnet

---

### 8. Monitoring Ready
- [ ] RPC endpoint monitoring
- [ ] Protocol health dashboard
- [ ] Alert system for failures
- [ ] Incident response plan documented

---

### 9. Multisig Setup (Recommended)
- [ ] Protocol authority → Multisig wallet
- [ ] Fee recipient → Multisig or treasury
- [ ] Multiple signers for critical operations
- [ ] Key backup procedures documented

---

### 10. Final Build
```bash
# Clean build for mainnet
anchor clean
anchor build --verifiable
anchor deploy --provider.cluster mainnet-beta
```

- [ ] Verifiable build generated
- [ ] Program hash verified
- [ ] Deployment transaction successful
- [ ] Program ID documented

---

## 🚀 Post-Deployment

### Immediately After Deploy:
1. **Call `initialize()` within 1 minute** (before front-runners)
2. Verify config state on-chain
3. Create first CRX/SOL pool
4. Test buy/sell with small amounts
5. Monitor for 24 hours before announcing

### First 24 Hours:
- Watch for exploits
- Monitor transaction success rate
- Check oracle feeds
- Verify fees collecting correctly
- Test emergency pause if needed

### First Week:
- Gradual TVL increase
- Community testing
- Bug bounty program active
- Support monitoring 24/7

---

## ❌ DO NOT Deploy If:
- DEPLOYER_PUBKEY still has placeholder value
- Any tests failing
- Unchecked arithmetic exists
- Devnet soak test incomplete
- Compute units >50k per trade
- Security audit incomplete

---

## ✅ Ready for Mainnet When:
- All checkboxes above are checked
- Team has reviewed and approved
- Legal/compliance cleared (if applicable)
- Community has been notified
- Support team is ready

---

**Last Updated:** 2026-01-08
**Status:** ⏳ Preparing for deployment (Day 1 of 21)
