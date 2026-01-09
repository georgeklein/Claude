# 🔴 CRITICAL BUG: UserPosition PDA Seed Mismatch

**Status**: BLOCKING MAINNET
**Severity**: HIGH (SDK method completely broken)
**File**: `/home/user/Claude/sdk/ScaleAMM.ts:1082`

---

## THE BUG

The SDK uses the **WRONG** seed prefix for UserPosition PDA derivation:

**Rust Program (CORRECT):**
```rust
// buy.rs:68, sell.rs:66
seeds = [b"pos", pool.key().as_ref(), user.key().as_ref()]
```

**TypeScript SDK (WRONG):**
```typescript
// ScaleAMM.ts:1082
Buffer.from('user_position')  // ❌ Should be 'pos'
```

---

## IMPACT

### What This Breaks:
1. ✅ **On-chain program**: Works perfectly (bug is SDK-only)
2. ✅ **Tests**: All pass (they derive PDAs manually with correct seeds)
3. ❌ **SDK `getUserPosition()` method**: COMPLETELY BROKEN
   - Returns wrong address
   - Always returns `null` even when position exists
   - WAA fee information not available via SDK

### Who Is Affected:
- **Developers** using the SDK's `getUserPosition()` method
- **Frontend apps** trying to display WAA fee status
- **Users** seeing incorrect "no position" status

### Who Is NOT Affected:
- On-chain program execution (trades still work)
- Tests (they use correct seeds)
- Manual PDA derivations

---

## THE FIX

### Change Required:
```diff
  async getUserPosition(user: PublicKey, pool: PublicKey): Promise<UserPosition | null> {
    try {
      const [positionPda] = PublicKey.findProgramAddressSync(
        [
-         Buffer.from('user_position'),
+         Buffer.from('pos'),
          pool.toBuffer(),
          user.toBuffer(),
        ],
        this.programId
      );
```

**Line**: `sdk/ScaleAMM.ts:1082`
**Change**: `'user_position'` → `'pos'`

---

## WHY THIS WASN'T CAUGHT

### Test Coverage Gap:
```typescript
// ALL TESTS DO THIS (CORRECT):
const [userPosition] = PublicKey.findProgramAddressSync(
  [Buffer.from("pos"), pool.toBuffer(), user.toBuffer()],
  program.programId
);

// ONLY ONE TEST USES SDK METHOD:
// tests/platform-integration-tests.ts:449
const position = await scaleAMM.getUserPosition(trader1.publicKey, poolInfo.address);
```

### Why It Passes:
- That test expects `position` to exist
- But it probably **doesn't check the actual data**
- Or the test isn't run in CI

---

## VERIFICATION

Run this to confirm addresses don't match:

```typescript
import { PublicKey } from '@solana/web3.js';

const programId = new PublicKey('CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3');
const pool = new PublicKey('...');
const user = new PublicKey('...');

// What Rust program uses:
const [correctPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('pos'), pool.toBuffer(), user.toBuffer()],
  programId
);

// What SDK currently does:
const [wrongPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('user_position'), pool.toBuffer(), user.toBuffer()],
  programId
);

console.log('Correct:', correctPda.toBase58());
console.log('SDK returns:', wrongPda.toBase58());
console.log('Match?', correctPda.equals(wrongPda)); // false
```

---

## ACTION ITEMS

### Before Mainnet:
- [ ] Fix SDK line 1082: `'user_position'` → `'pos'`
- [ ] Add test that uses SDK method and validates data
- [ ] Verify fix with integration test
- [ ] Update any documentation mentioning `getUserPosition()`

### Recommended Test:
```typescript
it("SDK getUserPosition() returns correct data", async () => {
  // Buy tokens
  await scale.buy(pool, { crxAmount: 100 });

  // Fetch via SDK method
  const position = await scale.getUserPosition(user, pool);

  // Validate it exists and has correct data
  expect(position).to.not.be.null;
  expect(position.pool.equals(pool)).to.be.true;
  expect(position.user.equals(user)).to.be.true;
  expect(position.amount).to.be.greaterThan(0);
});
```

---

## PRIORITY

🔴 **CRITICAL - MUST FIX BEFORE MAINNET**

This is a developer-facing bug that will cause confusion and support requests. While the on-chain program is secure, the SDK is a key part of the developer experience.

**Estimated Fix Time**: 5 minutes
**Risk of Fix**: ZERO (single line change)
**Testing Required**: Add one test case

---

## RELATED FILES

**Bug Location**:
- `/home/user/Claude/sdk/ScaleAMM.ts:1082`

**Correct Reference**:
- `/home/user/Claude/programs/creator-amm-v2/src/instructions/buy.rs:68`
- `/home/user/Claude/programs/creator-amm-v2/src/instructions/sell.rs:66`

**Test Using Method**:
- `/home/user/Claude/tests/platform-integration-tests.ts:449`

**Full Audit**:
- `/home/user/Claude/SECURITY_AUDIT_PDA_VALIDATION.md`

---

**End of Critical Bug Report**
