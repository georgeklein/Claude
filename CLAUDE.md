# Scale AMM - Project Context

**AI assistant context for Scale AMM development**
Production Solana bonding curve protocol powering $CRX

Includes: Mission, tech stack, coding conventions, security requirements, git workflow

---

## 🎯 Project Mission

Build the most secure, efficient bonding curve AMM on Solana for token launches.
**Timeline:** 3-week sprint to mainnet
**Quality Standard:** Battle-tested, audit-ready, zero-compromise security

---

## 🏗️ Tech Stack

**Blockchain:**
- Solana (1.18)
- Anchor Framework 0.30.1
- Rust (Solana program)

**SDK:**
- TypeScript/JavaScript
- @solana/web3.js
- @coral-xyz/anchor

**Testing:**
- Anchor test framework
- Mocha/Chai

**Key Dependencies:**
- anchor-lang 0.30.1 (with init-if-needed feature)
- anchor-spl 0.30.1
- solana-program 1.18

---

## 📁 Repository Structure

```
/programs/creator-amm-v2/   # Solana program (Rust)
├── src/
│   ├── lib.rs              # Program entry point
│   ├── state.rs            # Config, Pool, UserPosition structs
│   ├── errors.rs           # Error codes
│   ├── events.rs           # On-chain events
│   ├── instructions/       # All program instructions
│   └── utils/              # Oracle, math helpers

/sdk/                       # TypeScript SDK
├── ScaleAMM.ts             # Main SDK class
├── ScaleUtils.ts           # Helper utilities
├── examples.ts             # 7 working examples

/tests/                     # Test suite
/scripts/                   # Deployment scripts
/simulations/               # Economic models
```

---

## ⚡ Common Commands

**IMPORTANT: Always use these exact commands**

### Building
```bash
anchor build          # Build Solana program
cargo check          # Quick compile check (when anchor fails)
```

### Testing
```bash
anchor test          # Run all tests
cargo test           # Run Rust unit tests only
```

### Development
```bash
npm install          # Install SDK dependencies
cargo update         # Update Rust dependencies
```

### Deployment
```bash
./scripts/deploy-devnet.sh    # Deploy to devnet
anchor deploy --provider.cluster devnet
```

---

## 🎨 Coding Conventions

### Rust (Solana Program)

**YOU MUST:**
- Use checked arithmetic EVERYWHERE (`checked_add`, `checked_mul`, `checked_div`)
- Use `saturating_mul` and `saturating_div` for WAA fee calculations
- Add `require!()` checks for all user inputs
- Validate vault balances after every state change
- Use explicit error codes (never `panic!` or unwrap in production code)
- Keep comments concise - explain WHY, not WHAT

**Naming:**
- Functions: `snake_case`
- Structs: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE`

**Logging:**
- Use `msg!()` for production-important events only
- NO emojis in log messages (removed for professionalism)
- Format: `msg!("Action completed: {} value", some_value);`

### TypeScript (SDK)

**YOU MUST:**
- Export all public types
- Use descriptive parameter names
- Handle errors gracefully with try/catch
- Provide clear error messages

**Naming:**
- Classes: `PascalCase` (e.g., `ScaleAMM`)
- Functions: `camelCase` (e.g., `createPool`)
- Constants: `SCREAMING_SNAKE_CASE`

---

## 🧪 Testing Philosophy

**Current State:** 368 tests implemented and passing
**Coverage:** Comprehensive test coverage across all critical paths

**Priority Order:**
1. **Critical security** (oracle, overflow, anti-sniper) - 30 tests
2. **High-priority** (graduation, math) - 20 tests
3. **Feature completeness** (multi-pool, phases) - 25 tests
4. **Attack simulations** (sandwich, MEV, flash loans) - 10+ tests

**Testing Rules:**
- Every bug fix MUST have a test that would have caught it
- Test edge cases, not just happy paths
- Use realistic values (no magic numbers like 999999)
- Test concurrent scenarios (multiple users, rapid trades)

---

## 🔒 Security Requirements

**NON-NEGOTIABLE:**

1. **All arithmetic is checked** - No overflows allowed
2. **Oracle validation** - Price freshness, confidence, bounds
3. **Slippage protection** - User-defined max acceptable slippage
4. **Vault security** - Post-trade balance validation
5. **Emergency pause** - Protocol can be stopped if needed
6. **No rugpull vectors** - Mint/freeze authority revoked

**Before ANY commit:**
- Run `cargo check` - must pass with 0 errors
- Review diff for unchecked arithmetic
- Ensure no new TODOs or FIXMEs in critical paths

---

## 🚀 Git Workflow

### Branch Strategy
- **Main branch:** Production-ready code only
- **Feature branches:** Named `feature/description` or `fix/bug-name`
- **Current sprint branch:** `claude/explain-codebase-*` (auto-generated)

### Commit Messages (REQUIRED FORMAT)
```
type(scope): Brief description

Examples:
feat(oracle): Add exponent bounds check (-12 to 6)
fix(waa): Use saturating arithmetic in fee calculation
refactor(buy): Remove emoji from production logs
docs(readme): Add WHAT_IT_DOES.md explanation
test(graduation): Add edge case for exact threshold
```

**Types:** feat, fix, refactor, docs, test, chore
**Scopes:** oracle, waa, buy, sell, graduation, state, tests, etc.

**Micro-commits preferred** - One logical change per commit

### Pre-Commit Checklist
- [ ] Code compiles (`cargo check` passes)
- [ ] No new `unwrap()` or `panic!()` calls
- [ ] All arithmetic is checked
- [ ] Tests pass (if applicable)
- [ ] Commit message follows format

---

## 🎯 Protocol-Specific Knowledge

### Core Innovation: Dynamic Virtual Liquidity
- Launch tokens at specific USD market caps without inflating $CRX supply
- Oracle-based reserve calculation: `virtual_reserves = (target_mcap_usd / crx_price_usd) × supply`
- Transitions to real liquidity at graduation

### Economic Model
- **Two-hop swaps:** SOL → CRX → Token (all volume through CRX/SOL pool)
- **Protocol revenue:** 1% fees from CRX/SOL pool (in CRX)
- **Creator revenue:** Custom % from TOKEN/CRX pools (in CRX)
- **Deflationary CRX:** Trapped in graduated pools + holders holding

### Phase Lifecycle
1. **PreBonding:** Virtual reserves, accumulate real CRX, anti-sniper active
2. **Graduated:** Real reserves, permanent AMM (x×y=k), continues forever

### Critical Files (Read Before Modifying)
- `state.rs` - All data structures
- `errors.rs` - Error code definitions
- `utils/oracle.rs` - CRX price feeds, virtual reserve calculation
- `instructions/buy.rs` & `sell.rs` - Trading logic (consolidate these later)
- `instructions/initialize.rs` - **IMPORTANT:** Update DEPLOYER_PUBKEY before deploy!

---

## ⚠️ Known Issues & Quirks

### Before Mainnet Deploy
- [ ] **CRITICAL:** Update `DEPLOYER_PUBKEY` in `initialize.rs:23` (currently placeholder)
- [ ] Run 72-hour devnet soak test (10,000+ trades)
- [ ] All 368 tests passing
- [ ] Optimize compute units (target: <50k per trade, currently ~100k)

### Development Notes
- `anchor build` may fail → use `cargo check` instead
- Program folder is `creator-amm-v2` but protocol is "Scale AMM" (legacy naming)
- Test files import `CreatorAmmV2` type (legacy, works fine)

---

## 📚 Documentation

**For users/developers:**
- `README.md` - Quick start, installation, basic usage
- `WHAT_IT_DOES.md` - Complete protocol explanation (read this first!)
- `sdk/README.md` - SDK API reference

**For Claude:**
- This file (`CLAUDE.md`) - Project context and conventions
- Use `#` key during sessions to suggest improvements

---

## 🧠 AI Assistant Guidelines

### When writing code:
- **ALWAYS** read the file before editing
- Use `checked_*` arithmetic - NO exceptions
- Follow commit message format exactly
- Create micro-commits (one change per commit)
- NO emojis in code/logs (removed for professionalism)

### When fixing bugs:
1. Understand root cause first
2. Write a test that reproduces the bug
3. Fix the bug
4. Verify test now passes
5. Commit fix + test together

### When refactoring:
- Preserve ALL functionality unless explicitly approved
- Ask before deleting anything that might be a feature
- Consolidate code only when it reduces complexity
- Keep commit scope small and reviewable

### Branding:
- Protocol: "Scale AMM" (NOT "Creator AMM")
- Token: "$CRX" (always with $)
- Platform: "Creator" (the terminal/wallet/ecosystem powered by Scale)

---

## 🎯 Current Sprint Status

**Progress:**
- ✅ Fixed 9 critical security bugs
- ✅ Removed dead code (saves 56 bytes per account)
- ✅ 368 tests implemented and passing
- ✅ All branding updated to Scale AMM
- ✅ All dependencies updated to latest (Anchor 0.30.1, Solana 1.18)

**Next 2 Weeks:**
- Week 2: Implement tests, optimize compute, consolidate code
- Week 3: Devnet deployment, 72hr soak test, mainnet launch

**Mainnet Goal:** Day 21 (no external audit - Claude is sole auditor)

---

## 💡 Pro Tips

1. **Use TodoWrite tool** - Track multi-step tasks, mark progress
2. **Micro-commits** - Easier to review, revert, and understand
3. **Read before edit** - Always Read tool before Edit/Write
4. **Test edge cases** - Zero values, max values, overflow scenarios
5. **Check git status** - Commit frequently, keep working tree clean

---

**Last Updated:** 2026-01-08
**Maintained By:** Human + AI pair programming
**Iteration:** V2 (following Anthropic best practices)
