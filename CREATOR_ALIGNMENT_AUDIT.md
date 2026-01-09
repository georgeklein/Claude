# CREATOR ALIGNMENT AUDIT
## Scale AMM Protocol - Does It Serve Creator Goals?

**Date:** 2026-01-09
**Auditor:** Claude Code
**Severity:** CRITICAL MISALIGNMENT FOUND

---

## Executive Summary

**VERDICT: PROTOCOL DOES NOT SERVE CREATOR INTERESTS**

The Scale AMM protocol contains a **critical misalignment** between stated goals and actual implementation. While documentation claims creators earn revenue from their pools, **the code reveals that ALL fees go to a centralized protocol authority**, not to individual token creators.

**Key Finding:** The term "creator" is misleading. Token launchers receive ZERO revenue from their pools.

---

## 1. Who Is The "Creator"?

### Documentation Claims
- **README.md**: "Launch tokens at any USD market cap with zero upfront capital"
- **CLAUDE.md**: "Creator revenue: Custom % from TOKEN/CRX pools (in CRX)"
- **Pool struct**: Contains `creator: Pubkey` field

### Reality
The protocol has TWO distinct roles with confused terminology:

1. **Protocol Authority** (the real beneficiary)
   - Set in `initialize.rs` by DEPLOYER_PUBKEY
   - Controls: CRX price, graduation thresholds, fee recipient
   - Receives: ALL fees from ALL pools

2. **Token Launcher** (falsely called "creator")
   - Can: Create pools, choose fee tier (0%, 0.25%, 1%)
   - Cannot: Receive fees, control their pool, exit after graduation
   - Stored in: `pool.creator` (but has no special permissions)

**CRITICAL:** The `pool.creator` field is **purely cosmetic** - it has zero financial benefit or control.

---

## 2. Fee Flow Analysis

### What Documentation Claims
From CLAUDE.md:
> "Creator gets fee_bps of all trades"
> "Fee sent immediately (not accumulated)"
> "Protocol revenue: 1% fees from CRX/SOL pool (in CRX)"
> "Creator revenue: Custom % from TOKEN/CRX pools (in CRX)"

### What The Code Actually Does

**Buy transaction** (`buy.rs:188-198`):
```rust
// Transfer 1: Fee goes directly to creator (if any)
if fee_in_quote > 0 {
    trade::transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.user_quote_account,
        &ctx.accounts.fee_recipient_account,  // ← Goes to config.fee_recipient
        ctx.accounts.user.to_account_info(),
        fee_in_quote,
        None,
    )?;
}
```

**Sell transaction** (`sell.rs:213-223`):
```rust
// Transfer 3: Total fee (base + WAA) in QUOTE tokens from pool to creator
if total_fee_in_quote > 0 {
    trade::transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.quote_vault,
        &ctx.accounts.fee_recipient_account,  // ← Goes to config.fee_recipient
        pool.to_account_info(),
        total_fee_in_quote,
        Some(signer),
    )?;
}
```

**Fee recipient is validated against config** (`buy.rs:58-60`):
```rust
#[account(
    mut,
    constraint = fee_recipient_account.mint == pool.quote_mint @ ErrorCode::Unauthorized,
    constraint = fee_recipient_account.owner == config.fee_recipient @ ErrorCode::Unauthorized,
)]
pub fee_recipient_account: Account<'info, TokenAccount>,
```

**REALITY:** `config.fee_recipient` is set during `initialize()` to the protocol deployer's wallet, NOT to individual pool creators.

---

## 3. Economic Model: Who Benefits?

### Protocol Authority Benefits
- ✅ Receives 100% of all fees from all pools (0-1% per trade in CRX)
- ✅ Controls CRX price (affects all virtual reserves and graduation thresholds)
- ✅ Can adjust graduation thresholds per pool (can delay/prevent graduation)
- ✅ Zero capital required (creators deposit all tokens)
- ✅ Permanent income stream from graduated pools

### Token Launcher "Benefits"
- ❌ Receives ZERO fees from their pool
- ❌ Cannot control graduation threshold after creation
- ❌ Cannot withdraw tokens after deposit
- ❌ No special permissions on their pool
- ❌ No exit option after graduation
- ✅ Can choose fee tier (0%, 0.25%, 1%) - but this only affects USERS, not their revenue
- ✅ Can enable/disable WAA anti-dump

**Economic Reality:** Token launchers are **service users**, not revenue recipients. They pay SOL for rent and get zero financial return.

---

## 4. Token Launch Experience

### What Works Well
✅ **Zero capital launch**: Virtual reserves calculated from CRX price oracle
✅ **Easy pool creation**: 6 simple parameters
✅ **Flexible fee tiers**: 0%, 0.25%, or 1% options
✅ **Market cap targets**: Achievable ($10k-$1M initial, $40k-$10M graduation)
✅ **Anti-rugpull**: Mint/freeze authority must be revoked
✅ **Optional WAA**: Can disable anti-dump for pure permissionless trading

### Critical Issues
❌ **Misleading documentation**: Creators expect revenue but get nothing
❌ **No creator dashboard**: Token launchers can't track their pool's success
❌ **No revenue sharing**: All fees go to protocol
❌ **No post-graduation control**: Liquidity locked forever, creator has no stake
❌ **Centralized control**: Authority can manipulate graduation

---

## 5. Graduation Mechanism Analysis

### Benefits To Token Launcher
**NONE**

When a pool graduates:
- CRX accumulated in pool is locked forever
- Pricing switches from virtual to real reserves
- Pool becomes permanent AMM (x×y=k)
- Fees continue to flow to protocol authority forever

The token launcher receives:
- No CRX withdrawal
- No liquidity share
- No special NFT/token
- No voting rights
- No graduation bonus

### Benefits To Protocol Authority
- ✅ Permanent deflationary sink for CRX (locked in graduated pools)
- ✅ Ongoing fee revenue forever (0-1% per trade)
- ✅ Can raise graduation threshold to delay/prevent graduation
- ✅ Owns all accumulated liquidity

**VERDICT:** Graduation is a **one-way wealth transfer** from users to protocol authority. Token launchers are bystanders.

---

## 6. Protection Mechanisms: Who Are They Protecting?

### Anti-Sniper Protection
**Purpose:** Limit trade size in first ~8 seconds
**Protects:** Early buyers from getting sniped
**Creator benefit:** Indirect (healthier launch)
**Authority control:** Sets global parameters

### WAA (Weighted Average Age) Anti-Dump
**Purpose:** Time-decaying sell fees (10%→0% over 30 min)
**Protects:** Early buyers from immediate dumps
**Creator benefit:** Optional (can disable per pool)
**Authority control:** Receives all WAA fees

**Analysis:** Both mechanisms protect USERS, not creators. And all penalty fees go to the protocol authority.

### Graduation Threshold Updates
**From `update_pool_graduation.rs:31-38`:**
```rust
/// Update a pool's graduation threshold (Authority only)
///
/// Allows authority to dynamically adjust graduation thresholds based on:
/// - Market conditions
/// - Previous day's average price/volume
/// - Manual adjustments for specific pools
///
/// Can be automated with cron jobs to update daily based on metrics.
```

**CRITICAL VULNERABILITY:**
- Authority can raise thresholds to prevent graduation
- Token launchers have NO control over their pool's graduation
- Check in code (line 68): `new_graduation_threshold_usd > current_market_cap_usd`
- Authority can keep raising threshold as pool approaches graduation

**Example Attack:**
1. Pool at $39k market cap, threshold is $40k (close to graduation)
2. Authority updates threshold to $50k (still legal - above current MC)
3. Pool reaches $49k market cap
4. Authority updates threshold to $60k
5. Repeat forever → pool never graduates

**Reality:** While there's a safeguard that threshold must be above current MC, this can be gamed by raising it incrementally.

---

## 7. Trust Requirements

### What Documentation Claims
**README.md line 100:**
> "### 4. Fully Permissionless
> **No centralized control** - No pause button, no kill switch, no admin backdoors. Once deployed, it runs forever."

### What The Code Reveals

**Centralized Control Points:**

1. **CRX Price Manipulation** (`update_crx_price.rs`)
   - Authority updates manually (no oracle)
   - Limited to 10% change per update (but can be called repeatedly)
   - Directly affects virtual reserves calculation
   - Can manipulate initial pool pricing

2. **Graduation Threshold Control** (`update_pool_graduation.rs`)
   - Authority can raise thresholds per pool
   - Can delay/prevent graduation indefinitely
   - No creator recourse

3. **Fee Recipient Control** (`initialize.rs`)
   - Set once at initialization
   - All pools MUST send fees here
   - No per-pool fee recipient option

4. **Quote Token Whitelist** (`update_approved_quotes.rs`)
   - Authority controls which tokens can be quote mints
   - CRX always allowed (Tier 1)
   - SOL/USDC/USDT require whitelist (Tier 2)

**VERDICT:** The claim "Fully Permissionless" is **FALSE**. The protocol is heavily centralized.

---

## 8. Competitive Analysis

### Pump.fun Model
- Creator: Receives % of trading fees
- Graduation: To Raydium DEX, creator gets LP tokens
- Trust: Centralized, but creator gets tangible benefit

### Pump.swap Model
- Creator: Can set custom fee recipient
- Graduation: Creator controls liquidity
- Trust: More creator-friendly

### Scale AMM Model
- Creator: Receives NOTHING
- Graduation: Protocol keeps all liquidity
- Trust: Centralized authority with no creator benefit

**COMPETITIVE POSITION:** Scale AMM is the WORST option for token creators.

---

## 9. What Makes Scale AMM "Unique"?

### Technical Innovation
✅ **Dynamic virtual liquidity**: Oracle-based reserve calculation
✅ **Zero-capital launch**: No upfront CRX required
✅ **USD-denominated targets**: Launch at specific market caps
✅ **Dual-phase bonding curve**: Virtual → Real reserves
✅ **Optional WAA**: Permissionless mode available

### Economic Model
❌ **ALL fees to protocol**: 100% extraction, 0% to creators
❌ **Permanent liquidity lock**: No creator ownership
❌ **Centralized price control**: Manual CRX price updates
❌ **Graduation manipulation**: Authority can prevent graduation

**VERDICT:** Technically innovative, economically extractive.

---

## 10. Critical Terminology Issues

### Misleading Variable Names

**In `state.rs`:**
```rust
pub struct Pool {
    /// Pool creator
    pub creator: Pubkey,
    // ...
}
```

**In `buy.rs` and `sell.rs` comments:**
```rust
// Transfer 1: Fee goes directly to creator (if any)
```

**REALITY:** This is NOT the pool creator. It's `config.fee_recipient` (protocol authority).

**Recommendation:** Rename to reflect reality:
- `pool.creator` → `pool.launcher` (no financial benefit)
- `config.fee_recipient` → `config.protocol_treasury`
- Comments should say "protocol" not "creator"

---

## 11. Documentation Contradictions

### CLAUDE.md Line 111-113 Claims:
```markdown
### Economic Model
- **Two-hop swaps:** SOL → CRX → Token (all volume through CRX/SOL pool)
- **Protocol revenue:** 1% fees from CRX/SOL pool (in CRX)
- **Creator revenue:** Custom % from TOKEN/CRX pools (in CRX)
```

**REALITY:** There is NO creator revenue. This is completely false.

### README.md Line 228-230:
```markdown
**Fee Tiers:**
- `0` → Free (0%) - Maximum growth, no creator fees
- `25` → Low (0.25%) - Balanced growth + income
- `100` → Premium (1%) - Maximum creator revenue
```

**REALITY:** All three tiers send 100% of fees to protocol. "Creator revenue" is ZERO regardless of tier.

---

## 12. Recommendations For Creator Success

### Immediate (Critical)

**1. Implement Per-Pool Fee Recipient**
```rust
pub struct Pool {
    pub creator: Pubkey,              // Token launcher
    pub fee_recipient: Pubkey,         // Where fees go (creator's choice)
    pub protocol_fee_bps: u16,         // Protocol cut (e.g., 10% of total)
    pub creator_fee_bps: u16,          // Creator cut (e.g., 90% of total)
    // ...
}
```

**2. Split Fee Distribution**
```rust
// Example: 1% total fee, 90% to creator, 10% to protocol
let total_fee = calculate_fee(amount, 100); // 1% = 100 bps
let protocol_cut = total_fee * 10 / 100;    // 10% of fee
let creator_cut = total_fee * 90 / 100;     // 90% of fee

// Transfer to creator
transfer(pool.fee_recipient, creator_cut);

// Transfer to protocol
transfer(config.protocol_treasury, protocol_cut);
```

**3. Graduation Ownership**
```rust
pub struct Pool {
    pub graduation_type: GraduationType,
}

pub enum GraduationType {
    /// Liquidity locked forever, creator gets nothing
    Locked,

    /// Creator receives LP NFT representing liquidity
    CreatorOwned,

    /// Split: X% to creator, Y% burned
    Split { creator_bps: u16 },
}
```

### Short-term (High Priority)

**4. Fix Documentation**
- Remove ALL claims of "creator revenue"
- Clarify that fees go to protocol
- Explain that `pool.creator` is cosmetic only
- Change "Fully permissionless" to "Permissionless trading with protocol controls"

**5. Add Creator Dashboard**
- Track pools created by wallet
- Show volume/users/graduation progress
- Provide analytics for marketing

**6. Remove Graduation Manipulation**
```rust
// Add to pool creation
pub graduation_threshold_crx: u64,      // Set at creation
pub graduation_threshold_locked: bool,  // If true, authority cannot update
```

**7. Limit CRX Price Control**
```rust
// Require oracle validation before manual override
pub last_oracle_price: u64,
pub manual_price_deviation_bps: u16,  // Max 5% deviation from oracle

// Or: Fully remove manual updates, use oracle only
```

### Long-term (Strategic)

**8. Multi-Tier Revenue Model**
```
Free Tier (0%):
- Protocol fee: 0%
- Creator fee: 0%
- Use case: Community tokens, airdrops

Standard Tier (0.25%):
- Protocol fee: 0.025% (10% of total)
- Creator fee: 0.225% (90% of total)
- Use case: Most launches

Premium Tier (1%):
- Protocol fee: 0.1% (10% of total)
- Creator fee: 0.9% (90% of total)
- Use case: High-quality projects
```

**9. Graduation Options**
Allow creators to choose at pool creation:
- **Locked**: CRX locked forever, creator gets nothing (current model)
- **LP NFT**: Creator receives NFT representing liquidity share
- **Withdrawable**: Creator can withdraw % after vesting period

**10. Decentralization Roadmap**
- Replace manual CRX price updates with Pyth/Switchboard oracle
- Remove `update_pool_graduation` instruction (set at creation only)
- Add governance for protocol parameters (DAO)
- Implement timelock for admin actions

---

## 13. Alternative: "Platform Fee" Model

If the goal is to extract platform fees (not empower creators), be transparent:

**Rename Everything:**
- "Creator" → "Token Launcher"
- "Pool fee" → "Platform fee"
- "Fee recipient" → "Platform treasury"

**Document Honestly:**
- "Launch tokens on our platform for a fee"
- "Platform charges 0-1% on trades"
- "Launchers receive no revenue"
- "Liquidity locked in platform after graduation"

**Competitive Position:**
- "We're the cheapest platform (0% option available)"
- "Zero upfront capital required"
- "Fixed market cap targeting"

**This model is viable**, but you can't call it "creator-friendly" or "permissionless."

---

## 14. Security Risks From Misalignment

### Creator Exploitation
**Risk:** Launchers create tokens expecting revenue, get nothing
**Impact:** Reputation damage, legal liability, failed launches
**Likelihood:** HIGH (documentation actively misleads)

### Graduation Manipulation
**Risk:** Authority delays graduation to extract more fees
**Impact:** User distrust, token launcher anger
**Likelihood:** MEDIUM (requires malicious authority)

### Fee Extraction
**Risk:** All value flows to single centralized entity
**Impact:** Platform seen as extractive rent-seeker
**Likelihood:** HIGH (this is the current design)

### Regulatory Risk
**Risk:** Centralized fee collection flagged as securities violation
**Impact:** SEC enforcement, shutdown
**Likelihood:** MEDIUM-HIGH (depends on jurisdiction)

---

## 15. Comparison: Claims vs Reality

| Claim (Documentation) | Reality (Code) | Severity |
|----------------------|---------------|----------|
| "Creator revenue" | Protocol gets 100% | CRITICAL |
| "Fully permissionless" | Authority controls price & graduation | HIGH |
| "No admin backdoors" | Authority has 3 admin instructions | HIGH |
| "Fee goes to creator" | Fee goes to config.fee_recipient | CRITICAL |
| "Deflationary CRX" | True (locked in graduated pools) | ✓ Accurate |
| "Zero capital launch" | True (virtual reserves) | ✓ Accurate |
| "Anti-rugpull protection" | True (mint authority revoked) | ✓ Accurate |

**Accuracy Score: 3/7 (43%)**

---

## 16. Final Verdict

### Does Scale AMM Serve Creator Goals?

**NO.**

### Breakdown

**Technical Innovation:** 9/10
The protocol is technically excellent:
- Elegant virtual reserve calculation
- Secure arithmetic (checked everywhere)
- CEI pattern (reentrancy-safe)
- Efficient compute usage
- Clean architecture

**Creator Alignment:** 1/10
The protocol actively HARMS creators:
- No revenue from their pools
- No control after creation
- Misleading documentation
- No exit option
- All value captured by protocol

**Trust Model:** 2/10
- Claims "permissionless" but heavily centralized
- Authority can manipulate graduation
- Manual CRX price updates (not oracle-based)
- No creator recourse

**Competitive Position:** 3/10
- Technically superior to competitors
- Economically inferior to competitors
- Worst creator value proposition

**Overall Score: 3.75/10**

---

## 17. Recommended Actions (Priority Order)

### CRITICAL (Fix Before Mainnet)

1. **Update Documentation** - Remove all claims of creator revenue
2. **Rename Variables** - `creator` → `launcher`, add actual `fee_recipient` to Pool
3. **Implement Fee Splitting** - Allow creators to receive their share
4. **Fix Graduation Control** - Lock thresholds at creation OR remove authority control

### HIGH (Fix Within 1 Week)

5. **Add Graduation Ownership** - Creators should own liquidity after graduation
6. **Oracle-Based Pricing** - Remove manual CRX price updates
7. **Creator Dashboard** - Show analytics for launched pools

### MEDIUM (Fix Within 1 Month)

8. **Multi-tier Revenue** - Protocol + Creator split
9. **Decentralization Plan** - Reduce authority powers
10. **Legal Review** - Ensure compliance with securities laws

---

## 18. Alternative Path: Embrace The Model

If you want to keep the current extractive model:

**1. Be Transparent**
- "Platform fee: 0-1% goes to us"
- "Launch for free, we take fees"
- "No creator revenue"

**2. Justify The Value**
- "We maintain the platform"
- "We provide liquidity bootstrapping"
- "Cheaper than pump.fun"

**3. Add Creator Benefits**
- Verified badge on platform
- Analytics dashboard
- Marketing support
- Featured listings

**4. Reduce Centralization**
- Use oracle for CRX price
- Lock graduation thresholds
- Transparent fee usage

This model can work, but requires honesty.

---

## 19. Questions For Stakeholders

**For Protocol Authority:**
1. Is the current fee model (100% to protocol) intentional?
2. Was documentation about "creator revenue" a mistake or misleading?
3. Are you willing to share fees with token launchers?
4. What prevents you from manipulating graduation thresholds?

**For Token Launchers:**
1. Did you expect to receive revenue from your pool?
2. Are you satisfied with zero financial benefit?
3. Would you prefer ownership of graduated liquidity?
4. Would you use a competitor with better terms?

**For Users:**
1. Do you care if creators get revenue?
2. Are you concerned about centralized control?
3. Would you trade on a more decentralized platform?

---

## 20. Conclusion

**Scale AMM is a technically brilliant protocol with a fundamentally broken economic model.**

The core issue: **terminology fraud**. The protocol uses "creator" to mean "person who launches a token," but gives them ZERO creator benefits (revenue, control, ownership).

**Path Forward:**

**Option A: Align With Creators (Recommended)**
- Share fees with token launchers (90/10 split)
- Give creators ownership of graduated liquidity
- Remove centralized graduation control
- Become the creator-first bonding curve platform

**Option B: Embrace Platform Model**
- Fix documentation to be honest
- Position as low-cost launchpad service
- Add non-financial creator benefits
- Compete on features, not ideology

**Option C: Do Nothing (Not Recommended)**
- Continue misleading creators
- Extract maximum value
- Risk regulatory action
- Damage reputation
- Lose to competitors

---

## Appendix A: Code Evidence

### Fee Flow (Buy Transaction)
**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/buy.rs:188-198`

```rust
// Transfer 1: Fee goes directly to creator (if any)
if fee_in_quote > 0 {
    trade::transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.user_quote_account,
        &ctx.accounts.fee_recipient_account,  // ← config.fee_recipient, NOT pool.creator
        ctx.accounts.user.to_account_info(),
        fee_in_quote,
        None,
    )?;
}
```

### Fee Recipient Validation
**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/buy.rs:56-61`

```rust
/// Protocol fee recipient's quote token account
#[account(
    mut,
    constraint = fee_recipient_account.mint == pool.quote_mint @ ErrorCode::Unauthorized,
    constraint = fee_recipient_account.owner == config.fee_recipient @ ErrorCode::Unauthorized,
)]
pub fee_recipient_account: Account<'info, TokenAccount>,
```

### Config Initialization
**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/initialize.rs:102`

```rust
config.fee_recipient = ctx.accounts.fee_recipient.key();
```

**Result:** All fees flow to the address set during one-time initialization (protocol deployer).

---

## Appendix B: Graduation Threshold Manipulation

**File:** `/home/user/Claude/programs/creator-amm-v2/src/instructions/update_pool_graduation.rs:63-70`

```rust
// CRITICAL: Validate new threshold is higher than CURRENT market cap (not just initial target)
// This prevents authority from indefinitely delaying graduation by raising threshold
// as the pool grows closer to graduation
let current_market_cap_usd = pool.get_market_cap_usd()?;
require!(
    new_graduation_threshold_usd > current_market_cap_usd,
    ErrorCode::InvalidMarketCap
);
```

**Analysis:**
- Check only requires threshold > current MC
- Authority can call this repeatedly
- Each time, raise threshold above current price
- Pool can NEVER graduate if authority is malicious

**Example:**
```
Creation:     MC = $10k, Threshold = $40k
After growth: MC = $38k, Threshold = $40k
Authority:    Update threshold to $45k (legal, > $38k)
After growth: MC = $43k, Threshold = $45k
Authority:    Update threshold to $50k (legal, > $43k)
... repeat forever
```

---

**END OF AUDIT**

**Recommendation:** DO NOT deploy to mainnet until creator alignment issues are resolved.

**Next Steps:**
1. Stakeholder meeting to discuss findings
2. Decision on economic model (creator-first vs platform-first)
3. Code + documentation updates
4. Re-audit after changes
5. Legal review
6. Mainnet deployment

**Contact:** Claude Code (AI Auditor)
**Report Version:** 1.0
**Status:** BLOCKED FOR MAINNET
