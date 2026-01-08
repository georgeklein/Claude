# ⚠️  CRITICAL DEPLOYER_PUBKEY WARNING

**#1 blocker for mainnet - prevents front-running attack on protocol initialization**

## 🚨 DO NOT DEPLOY TO MAINNET WITHOUT FIXING THIS

**File:** `programs/creator-amm-v2/src/instructions/initialize.rs:23`

**Current Value:** `"11111111111111111111111111111111"` (PLACEHOLDER)

**Risk:** Anyone can call `initialize()` and take over the entire protocol.

---

## How to Fix

### Step 1: Get Your Wallet Address
```bash
solana address
```

### Step 2: Update initialize.rs

Open `programs/creator-amm-v2/src/instructions/initialize.rs` and change line 23:

```rust
// ❌ BEFORE (DANGEROUS):
pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("11111111111111111111111111111111");

// ✅ AFTER (YOUR ACTUAL WALLET):
pub const DEPLOYER_PUBKEY: Pubkey = pubkey!("YourActualWalletAddressHere");
```

### Step 3: Rebuild
```bash
anchor build
```

### Step 4: Verify
```bash
grep "11111111111111111111111111111111" programs/creator-amm-v2/src/instructions/initialize.rs
# Should return NO results
```

---

## What Happens if You Don't Fix This?

**Attack Scenario:**
1. You deploy to mainnet with placeholder DEPLOYER_PUBKEY
2. Attacker sees the deployment
3. Attacker calls `initialize()` before you do
4. Attacker becomes the protocol authority
5. Attacker controls all fees, can pause protocol, etc.
6. **Your protocol is bricked**

---

## Checklist Before Mainnet Deploy

- [ ] Update DEPLOYER_PUBKEY with your actual wallet address
- [ ] Rebuild: `anchor build`
- [ ] Verify no placeholder: `grep "1111111" programs/creator-amm-v2/src/instructions/initialize.rs` returns nothing
- [ ] Deploy to devnet first
- [ ] Test initialization on devnet
- [ ] Only then deploy to mainnet

---

**THIS IS THE #1 BLOCKER TO MAINNET DEPLOYMENT**
