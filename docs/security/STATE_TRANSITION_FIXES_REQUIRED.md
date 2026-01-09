# State Transition Security Fixes - Action Items

**Priority:** CRITICAL - Must be addressed before mainnet
**Estimated Effort:** 4-6 hours of development + testing
**Files to Modify:** 4 core files

---

## 🔴 CRITICAL FIX 1: Lock Graduation Threshold at Pool Creation

**Problem:** Authority can raise graduation threshold indefinitely, preventing pools from ever graduating.

**File:** `/home/user/Claude/programs/creator-amm-v2/src/state.rs`

**Changes Required:**

### 1. Add field to Pool struct (line 119):
```rust
pub graduation_threshold_crx: u64,         // Current threshold (can be updated by authority)
pub graduation_threshold_crx_locked: u64,  // 🆕 Locked at creation, used for actual graduation
```

### 2. Update Pool::LEN constant (line 155):
```rust
8 +  // graduation_threshold_crx
8 +  // graduation_threshold_crx_locked  🆕 Add 8 bytes
```

### 3. Modify check_phase_transition (line 202):
```rust
// OLD:
if self.real_quote_reserves >= self.graduation_threshold_crx {

// NEW:
if self.real_quote_reserves >= self.graduation_threshold_crx_locked {
```

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/create_pool.rs`

### 4. Set locked threshold at creation (line 204):
```rust
pool.graduation_threshold_crx = graduation_threshold_crx;
pool.graduation_threshold_crx_locked = graduation_threshold_crx;  // 🆕 Lock it
```

**Impact:**
- ✅ Authority can still update `graduation_threshold_crx` for display purposes
- ✅ But actual graduation uses `graduation_threshold_crx_locked` (immutable)
- ✅ Eliminates rug vector where authority prevents graduation

**Testing:**
```typescript
it("uses locked threshold for graduation even after authority update", async () => {
  // Create pool with 40k graduation threshold
  // Authority raises threshold to 100k
  // Pool graduates at original 40k locked value ✓
});
```

---

## 🔴 CRITICAL FIX 2: Add Graduated Timestamp (Prevents Re-Graduation)

**Problem:** No explicit guard preventing phase from being reset back to PreBonding.

**File:** `/home/user/Claude/programs/creator-amm-v2/src/state.rs`

**Changes Required:**

### 1. Add field to Pool struct (line 132):
```rust
pub last_price_update_slot: u64,
pub graduated_at_slot: u64,        // 🆕 0 = not graduated, >0 = graduated (immutable)
```

### 2. Update Pool::LEN (line 161):
```rust
8 +  // last_price_update_slot
8 +  // graduated_at_slot  🆕
```

### 3. Modify check_phase_transition (line 199):
```rust
pub fn check_phase_transition(&mut self, current_slot: u64) -> Result<bool> {
    // 🆕 EXPLICIT GUARD: Cannot transition if already graduated
    if self.graduated_at_slot > 0 {
        require!(
            matches!(self.current_phase, CurvePhase::Graduated),
            ErrorCode::InvalidPhaseState
        );
        return Ok(false); // Already graduated, no transition
    }

    match self.current_phase {
        CurvePhase::PreBonding => {
            if self.real_quote_reserves >= self.graduation_threshold_crx_locked {
                msg!("Pool graduated!");
                self.current_phase = CurvePhase::Graduated;
                self.graduated_at_slot = current_slot; // 🆕 LOCK graduation
                return Ok(true);
            }
        },
        CurvePhase::Graduated => {
            // Should never reach here due to graduated_at_slot check above
            return err!(ErrorCode::InvalidPhaseState);
        },
    }
    Ok(false)
}
```

### 4. Update all calls to check_phase_transition:

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/trade.rs`

Line 211:
```rust
// OLD:
let transitioned = pool.check_phase_transition()?;

// NEW:
let transitioned = pool.check_phase_transition(clock.slot)?;
```

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/create_pool.rs`

Line 206:
```rust
pool.created_at_slot = clock.slot;
pool.graduated_at_slot = 0;  // 🆕 Initialize to 0 (not graduated)
```

**Impact:**
- ✅ Explicit immutability of graduation state
- ✅ Compile-time prevention of re-graduation bugs
- ✅ Better event semantics (can emit exact graduation slot)

**Testing:**
```typescript
it("prevents any code from resetting graduated pool to PreBonding", async () => {
  // Graduate pool
  // Attempt to manually set phase back to PreBonding
  // Next transaction should fail with InvalidPhaseState ✓
});
```

---

## 🔴 CRITICAL FIX 3: Freeze Virtual Reserves on Graduation

**Problem:** Virtual reserves stay in state after graduation, creating maintenance hazards.

**File:** `/home/user/Claude/programs/creator-amm-v2/src/state.rs`

**Changes Required:**

### 1. Add field to Pool struct (line 105):
```rust
pub virtual_quote_reserves: u64,
pub virtual_base_reserves: u64,
pub virtual_reserves_frozen: bool,  // 🆕 True after graduation
```

### 2. Update Pool::LEN (line 149):
```rust
8 +  // virtual_quote_reserves
8 +  // virtual_base_reserves
1 +  // virtual_reserves_frozen  🆕
```

### 3. Modify check_phase_transition to freeze reserves (line 207):
```rust
if self.real_quote_reserves >= self.graduation_threshold_crx_locked {
    msg!("Pool graduated!");

    self.current_phase = CurvePhase::Graduated;
    self.graduated_at_slot = current_slot;

    // 🆕 FREEZE virtual reserves (semantic clarity + future safety)
    self.virtual_reserves_frozen = true;

    // 🆕 VALIDATE real reserves are sufficient
    require!(
        self.real_quote_reserves > 0 && self.real_base_reserves > 0,
        ErrorCode::InsufficientRealReservesForGraduation
    );

    return Ok(true);
}
```

### 4. Add defensive check to get_pricing_reserves (line 183):
```rust
pub fn get_pricing_reserves(&self) -> (u64, u64) {
    match self.current_phase {
        CurvePhase::PreBonding => {
            // 🆕 Defensive check
            require!(!self.virtual_reserves_frozen, ErrorCode::InvalidPhaseState);
            (self.virtual_quote_reserves, self.virtual_base_reserves)
        },
        CurvePhase::Graduated => {
            // 🆕 Defensive check
            require!(self.virtual_reserves_frozen, ErrorCode::InvalidPhaseState);
            (self.real_quote_reserves, self.real_base_reserves)
        },
    }
}
```

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/create_pool.rs`

Line 193:
```rust
pool.virtual_quote_reserves = virtual_quote_reserves;
pool.virtual_base_reserves = virtual_base_reserves;
pool.virtual_reserves_frozen = false;  // 🆕 Initialize to false
```

**File:** `/home/user/Claude/programs/creator-amm-v2/src/errors.rs`

Add new error:
```rust
#[msg("Pool phase state is invalid - possible re-graduation attempt")]
InvalidPhaseState,

#[msg("Insufficient real reserves to support graduated phase trading")]
InsufficientRealReservesForGraduation,
```

**Impact:**
- ✅ Clear semantic meaning (frozen = graduated)
- ✅ Prevents future bugs from using virtual reserves post-graduation
- ✅ Validates real reserves at transition time

**Testing:**
```typescript
it("freezes virtual reserves when pool graduates", async () => {
  // Graduate pool
  // Verify virtual_reserves_frozen = true
  // Verify get_pricing_reserves() returns real reserves ✓
});

it("fails if real reserves insufficient at graduation", async () => {
  // Manipulate state to have high real_quote but zero real_base
  // Attempt to trigger graduation
  // Should fail with InsufficientRealReservesForGraduation ✓
});
```

---

## 🟠 HIGH PRIORITY FIX: Add Defensive Phase Check in Trades

**Problem:** Race conditions during concurrent trades at graduation boundary.

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/buy.rs`

**Changes Required:**

### Line 90 (after clock fetch):
```rust
let pool = &mut ctx.accounts.pool;
let clock = Clock::get()?;

// 🆕 DEFENSIVE: Re-check phase consistency (protects against race conditions)
if pool.real_quote_reserves >= pool.graduation_threshold_crx_locked
    && pool.graduated_at_slot == 0 {
    // Another concurrent transaction may have graduated the pool
    // Force phase transition check before proceeding
    pool.check_phase_transition(clock.slot)?;
}
```

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/sell.rs`

Same change at line 86.

**Impact:**
- ✅ Eliminates race condition where pool has graduated reserves but phase=PreBonding
- ✅ Ensures consistent pricing even with concurrent trades
- ✅ Minimal performance cost (~500 CU for one extra check)

---

## 📝 ERROR CODES TO ADD

**File:** `/home/user/Claude/programs/creator-amm-v2/src/errors.rs`

```rust
#[msg("Pool phase state is invalid - possible state corruption")]
InvalidPhaseState,

#[msg("Insufficient real reserves to support graduated phase trading")]
InsufficientRealReservesForGraduation,

#[msg("Pool already graduated - cannot transition again")]
AlreadyGraduated,

#[msg("Threshold increase exceeds maximum allowed (50% per update)")]
ThresholdIncreaseExceedsLimit,  // Optional - if implementing rate limit

#[msg("Virtual reserves are too large - possible calculation error")]
VirtualReservesTooLarge,  // Optional - if implementing bounds check
```

---

## 🧪 TEST CASES TO ADD

**File:** `/home/user/Claude/tests/state-transition-security.ts` (new file)

```typescript
describe("State Transition Security", () => {

  describe("Graduation Threshold Lock", () => {
    it("locks graduation threshold in CRX at pool creation", async () => {
      const pool = await createPool({ graduationThresholdUsd: 40_000 });
      const initialThresholdCrx = pool.graduationThresholdCrxLocked;

      // Change CRX price
      await updateCrxPrice(1.0); // Down from $2.00

      // Verify locked threshold unchanged
      const poolAfter = await fetchPool();
      expect(poolAfter.graduationThresholdCrxLocked).to.equal(initialThresholdCrx);
    });

    it("graduates using locked threshold not current threshold", async () => {
      const pool = await createPool({ graduationThresholdUsd: 40_000 });

      // Authority raises displayed threshold to 100k
      await updatePoolGraduation(100_000);

      // Buy up to original 40k locked value
      await buyUntilReserves(20_000); // In CRX

      // Pool should graduate (locked threshold was 20k CRX @ $2.00 price)
      const poolAfter = await fetchPool();
      expect(poolAfter.currentPhase).to.equal("Graduated");
      expect(poolAfter.graduatedAtSlot).to.be.greaterThan(0);
    });
  });

  describe("Re-Graduation Prevention", () => {
    it("prevents re-graduation of already graduated pool", async () => {
      const pool = await createPoolAndGraduate();

      // Try to manually reset phase (should fail at next transaction)
      // This simulates a future bug in code
      try {
        // Any transaction that calls check_phase_transition
        await buy(100);
        expect.fail("Should have failed");
      } catch (err) {
        expect(err.code).to.equal("InvalidPhaseState");
      }
    });

    it("sets graduated_at_slot exactly when threshold crossed", async () => {
      const pool = await createPool();
      const slotBefore = await getSlot();

      await graduatePool();

      const poolAfter = await fetchPool();
      expect(poolAfter.graduatedAtSlot).to.be.at.least(slotBefore);
      expect(poolAfter.graduatedAtSlot).to.be.at.most(slotBefore + 5);
    });
  });

  describe("Virtual Reserve Freezing", () => {
    it("freezes virtual reserves when pool graduates", async () => {
      const pool = await createPool();
      expect(pool.virtualReservesFrozen).to.be.false;

      await graduatePool();

      const poolAfter = await fetchPool();
      expect(poolAfter.virtualReservesFrozen).to.be.true;
      expect(poolAfter.currentPhase).to.equal("Graduated");
    });

    it("fails if attempting to use virtual reserves post-graduation", async () => {
      await graduatePool();

      // Any internal code trying to access virtual reserves should fail
      // This is tested via the defensive checks in get_pricing_reserves()

      // Normal trades should work (using real reserves)
      await buy(100); // Should succeed
    });

    it("validates real reserves are sufficient at graduation", async () => {
      // This test would require manipulating internal state
      // (not normally possible, but tests defensive programming)

      // Mock scenario: real_quote high, but real_base = 0
      // Attempt graduation -> should fail
    });
  });

  describe("Race Condition Protection", () => {
    it("handles concurrent trades during graduation block", async () => {
      const pool = await setupNearGraduation(); // 99.9% to threshold

      // Send 2 transactions simultaneously
      const [tx1, tx2] = await Promise.allSettled([
        buy(100), // Would cross threshold
        buy(100), // Also would cross threshold
      ]);

      // Both should succeed
      expect(tx1.status).to.equal("fulfilled");
      expect(tx2.status).to.equal("fulfilled");

      // But only ONE graduation event
      const events = await fetchGraduationEvents();
      expect(events.length).to.equal(1);

      // Pool should be graduated
      const poolAfter = await fetchPool();
      expect(poolAfter.currentPhase).to.equal("Graduated");
    });

    it("defensive phase check catches stale state", async () => {
      // Setup: Pool at 99.9% to graduation
      // TX-A graduates pool in slot N
      // TX-B starts in slot N+1 with stale pre-graduation state
      // TX-B should detect state change and re-check phase

      // This is implicitly tested by the defensive check at trade start
    });
  });

  describe("Edge Cases", () => {
    it("graduates exactly at threshold (not above)", async () => {
      const pool = await createPool();
      const threshold = pool.graduationThresholdCrxLocked;

      await buyExactAmount(threshold); // Exact amount

      const poolAfter = await fetchPool();
      expect(poolAfter.currentPhase).to.equal("Graduated");
      expect(poolAfter.realQuoteReserves).to.equal(threshold);
    });

    it("graduates with overshoot (large buy crosses threshold)", async () => {
      const pool = await setupNearGraduation(); // 39,500 / 40,000

      await buy(10_000); // Large buy, overshoots by 9,500

      const poolAfter = await fetchPool();
      expect(poolAfter.currentPhase).to.equal("Graduated");
      expect(poolAfter.realQuoteReserves).to.be.greaterThan(40_000);

      // Should emit warning about overshoot (check logs)
    });
  });
});
```

---

## 📋 DEPLOYMENT CHECKLIST

Before deploying these fixes to mainnet:

- [ ] **1. Implement all 3 critical fixes** (threshold lock, graduated timestamp, virtual freeze)
- [ ] **2. Add defensive phase check** in buy.rs and sell.rs
- [ ] **3. Add new error codes** to errors.rs
- [ ] **4. Update Pool::LEN** calculation (add 17 bytes total)
- [ ] **5. Run full test suite** (all existing tests must pass)
- [ ] **6. Add new test file** `state-transition-security.ts` with 15+ tests
- [ ] **7. Deploy to devnet** and run 1000+ test transactions
- [ ] **8. Simulate race conditions** (concurrent trades during graduation)
- [ ] **9. Test authority manipulation** (verify locked values don't change)
- [ ] **10. Code review** by second developer
- [ ] **11. Update documentation** (CLAUDE.md, README.md)
- [ ] **12. Re-run security audit** after changes

---

## ⏱️ ESTIMATED TIMELINE

- **Day 1 (4 hours):** Implement fixes in state.rs, create_pool.rs, trade.rs
- **Day 2 (3 hours):** Add error codes, update all callsites, update Pool::LEN
- **Day 3 (4 hours):** Write and run test suite (15 tests)
- **Day 4 (2 hours):** Devnet deployment and stress testing
- **Day 5 (1 hour):** Code review and documentation updates

**Total:** ~14 hours of work over 5 days

---

## 🎯 ACCEPTANCE CRITERIA

Fixes are complete when:

1. ✅ Authority cannot prevent graduation by raising thresholds
2. ✅ Graduation uses locked CRX value (set at creation)
3. ✅ Phase cannot be reset from Graduated to PreBonding
4. ✅ Virtual reserves are frozen (not accessible) after graduation
5. ✅ Concurrent trades during graduation handled correctly
6. ✅ All new tests pass (15+ state transition tests)
7. ✅ No regression in existing tests
8. ✅ Devnet stress test (1000+ transactions) runs without errors

---

**Status:** DRAFT
**Next Action:** Review with team, then implement fixes
**Target Completion:** Before mainnet launch (Day 21)
