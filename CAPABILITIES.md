# Scale AMM - What It Can Do

**Simple bullet-point reference**

---

## 🎯 Core Capabilities

### 1. Launch Tokens with $0 Upfront Capital

**What it does:**
- Launch a token at any USD market cap ($1k to $1M)
- No CRX required upfront
- Immediate trading enabled

**How it works:**
- Oracle fetches CRX price (e.g., $0.10)
- Calculates virtual reserves: `target_usd / crx_price × supply`
- Example: $10k launch = 100k virtual CRX / 1M tokens
- Virtual reserves stay FIXED (prices determined by x×y=k curve)

**What happens:**
1. Creator deposits all tokens into pool vault
2. Pool starts in PreBonding phase
3. Users can immediately buy/sell
4. Real CRX accumulates from 0 → graduation threshold

---

### 2. Two Bonding Curve Types

**What it does:**
- Constant Product (Uniswap-style): `y = (x × Y) / (X + x)`
- Exponential (faster): `y = (x × Y) / (X + 1.5x)` - reaches graduation 33% faster

**How it works:**
- Creator chooses curve at pool creation
- Curve determines price impact for each trade
- Same curve used throughout pool lifetime

**What happens:**
- Constant Product: Balanced, predictable growth
- Exponential: Steeper price increases, faster graduation

---

### 3. Anti-Sniper Protection (Two Layers)

**What it does:**
- Prevents instant buy-dump attacks
- Protects early buyers from whales

**How it works:**

**Layer 1: Trade Size Limit (first ~8 seconds)**
- First 20 slots (8 seconds) after pool creation
- Max trade size: 5% of supply per transaction
- Prevents whale from buying entire supply

**Layer 2: WAA (Weighted Average Age) Fees**
- Tracks when you bought tokens (weighted average)
- Extra sell fees decay over time:
  - 0-30 sec: +10% fee
  - 30 sec-5 min: +10% → +1% (linear decay)
  - 5 min-30 min: +1% → 0% (linear decay)
  - 30+ min: 0% extra fee

**What happens:**
1. User buys 5,000 tokens at slot 1000
2. `user_position.avg_entry_slot = 1000`
3. User tries to sell at slot 1050 (20 seconds later)
4. Extra fee: 10% + base fee (e.g., 1%) = 11% total
5. Sniper loses money on quick dump

---

### 4. Automatic Graduation to Permanent AMM

**What it does:**
- Transitions pool from virtual → real liquidity
- Becomes permanent Uniswap-style AMM
- Locks liquidity forever

**How it works:**
- Graduation threshold set at creation (e.g., $40k in CRX)
- Converted to CRX amount: `$40k / $0.10 = 400k CRX`
- Real CRX accumulates from trades
- When `real_crx_reserves >= threshold` → GRADUATE

**What happens:**
1. **PreBonding phase:** Pool uses virtual reserves for pricing
2. **Graduation triggered:** Real CRX hits threshold
3. **Switch:** Pricing now uses real reserves
4. **Graduated phase:** Permanent AMM (never goes back)
5. **Anti-sniper disabled:** Trade size limits removed
6. **WAA still active:** Still protects against dumps

---

### 5. Three Fee Tiers (Creator Choice)

**What it does:**
- Creator chooses fee structure at launch
- Fees go to creator forever

**How it works:**
- **0 bps (0%):** No fees, maximum growth
- **25 bps (0.25%):** Balanced
- **100 bps (1%):** Premium revenue

**What happens:**
- Fee extracted BEFORE swap (preserves x×y=k)
- Example: User buys with 1000 CRX, 1% fee
  - Fee: 10 CRX → creator
  - Swap: 990 CRX → pool
- Creator earns forever (PreBonding + Graduated)

---

### 6. Oracle-Based USD Targeting

**What it does:**
- Maintains USD-denominated launch targets
- Adjusts for CRX price changes at creation

**How it works:**
- Integrates Pyth oracle for CRX/USD price
- Validates: freshness (<60s), confidence (<1%), exponent bounds
- Calculates virtual reserves based on live CRX price
- Caches price for market cap calculations

**What happens:**
1. Pool created: "$10k target" with CRX at $0.10
2. Virtual reserves: 100k CRX calculated
3. CRX doubles to $0.20 later
4. Pool value now $20k (natural appreciation) ✅
5. Virtual reserves stay 100k CRX (fixed)

**Note:** Pools are CRX-denominated, not USD-pegged after creation

---

### 7. Slippage Protection

**What it does:**
- Prevents trades when price moves too much
- User sets acceptable slippage

**How it works:**
- User provides `min_output_amount` for buys
- User provides `min_quote_amount` for sells
- Transaction reverts if output < minimum

**What happens:**
1. User wants 10k tokens, max 1% slippage
2. Sets `min_output_amount = 9,900 tokens`
3. If only 9,800 tokens available → TRANSACTION FAILS
4. User protected from sandwich attacks

---

### 8. Two-Tier Quote Token System

**What it does:**
- Allows CRX pairs (permissionless)
- Allows SOL/USDC pairs (permissioned)

**How it works:**

**Tier 1 - Permissionless (CRX):**
- Anyone can create TOKEN/CRX pool
- No approval needed

**Tier 2 - Permissioned (SOL, USDC, USDT):**
- Must be in whitelist (max 5 tokens)
- Authority approves quote tokens
- Prevents spam pools

**What happens:**
- User tries to create pool with BONK as quote → REJECTED
- User tries to create pool with CRX as quote → ALLOWED
- User tries to create pool with SOL as quote (if whitelisted) → ALLOWED

---

### 9. Rugpull Protection

**What it does:**
- Prevents token creator from inflating supply
- Prevents token creator from freezing user tokens

**How it works:**
- At pool creation, checks:
  - `base_mint.mint_authority == None` (must be revoked)
  - `base_mint.freeze_authority == None` (must be revoked)
- If either exists → pool creation FAILS

**What happens:**
1. Creator tries to launch token with mint authority
2. Pool creation reverts with `MintAuthorityNotRevoked`
3. Creator must revoke authorities first
4. Then pool creation succeeds
5. Creator CANNOT mint more tokens or freeze wallets

---

## 🔄 Complete Trade Flow Examples

### Example 1: Buying Tokens

**User action:** Buy with 1000 CRX (1% pool fee, 5 min hold time)

**Step-by-step:**
1. ✅ Check protocol not paused
2. ✅ Check anti-sniper (if within 20 slots of creation)
3. 💰 Extract fee: 10 CRX → creator
4. 💱 Swap: 990 CRX → pool
5. 📊 Calculate output: `output = (990 × base_reserve) / (quote_reserve + 990)`
6. ✅ Check slippage: `output >= min_base_amount`
7. 📝 Update reserves (virtual + real in PreBonding)
8. 📍 Update user position: `avg_entry_slot = current_slot`
9. 💸 Transfer CRX from user → pool
10. 💸 Transfer tokens from pool → user
11. 🎓 Check graduation: `real_crx >= threshold`?
12. ✅ Validate: `real_reserves == vault_balance`
13. 📢 Emit `TradeExecuted` event

**Result:**
- User gets ~9,500 tokens (after price impact)
- Pool now has 990 more CRX
- Creator earned 10 CRX fee
- User's position tracks entry slot

---

### Example 2: Selling Tokens

**User action:** Sell 5000 tokens (1% pool fee, held 5 min)

**Step-by-step:**
1. ✅ Check protocol not paused
2. ✅ Check anti-sniper (if within 20 slots)
3. 📊 Calculate output: `output = (5000 × quote_reserve) / (base_reserve + 5000)`
4. 💰 Extract base fee: 1% of output → creator
5. ⏰ Calculate WAA fee: 5 min hold = ~1% extra
6. 💰 Extract WAA fee: 1% of output → creator
7. 💵 Final output: `output - base_fee - waa_fee`
8. ✅ Check slippage: `final_output >= min_quote_amount`
9. 📝 Update reserves (virtual + real in PreBonding)
10. 📍 Update user position: `tracked_amount -= 5000`
11. 💸 Transfer tokens from user → pool
12. 💸 Transfer CRX from pool → user
13. 💸 Transfer fees from pool → creator
14. 🎓 Check graduation (less likely on sell)
15. ✅ Validate: `real_reserves == vault_balance`
16. 📢 Emit `TradeExecuted` event

**Result:**
- User gets ~950 CRX (after fees + price impact)
- Pool now has 950 less CRX
- Creator earned ~50 CRX in fees (base + WAA)
- User's tracked amount reduced

---

### Example 3: Pool Graduation

**Trigger:** Real CRX hits 400k threshold

**What happens:**
1. ⚡ `check_phase_transition()` called after trade
2. ✅ Check: `real_quote_reserves (400,100) >= threshold (400,000)`
3. 🎓 Set `current_phase = Graduated`
4. 🔒 Virtual reserves FROZEN (no longer used)
5. 📊 Pricing now uses REAL reserves
6. 🚫 Anti-sniper protection DISABLED
7. ✅ WAA fees STILL ACTIVE
8. 📢 Emit `PoolGraduated` event with stats
9. 📢 Emit `PhaseTransition` event
10. 💎 Pool becomes permanent AMM (never goes back)

**Result:**
- Pool is now a permanent Uniswap-style AMM
- Liquidity locked forever (400k CRX + remaining tokens)
- Creator continues earning fees forever
- No graduation reversal possible

---

## 📊 Reserve Management

### PreBonding Phase

**Virtual Reserves:**
- Purpose: Determine trade prices
- Calculated: Once at creation
- Updated: Every trade (add buys, subtract sells)
- Used for: Bonding curve calculations

**Real Reserves:**
- Purpose: Track graduation progress + vault contents
- Starts: 0 CRX, full token supply
- Updated: Every trade (mirrors virtual changes)
- Used for: Graduation check, vault validation

**Both update identically during PreBonding**

---

### Graduated Phase

**Virtual Reserves:**
- Purpose: None (historical record only)
- Updated: Never (frozen at graduation)
- Used for: Nothing

**Real Reserves:**
- Purpose: Determine trade prices + vault contents
- Updated: Every trade
- Used for: All pricing calculations

**Only real reserves matter after graduation**

---

## 🎯 Market Cap Calculations

**Formula:**
```
Price = quote_reserves / base_reserves
Market Cap (CRX) = price × total_supply
Market Cap (USD) = mc_crx × crx_price_usd
```

**Example:**
- Reserves: 120k CRX / 800k tokens
- Price: 0.15 CRX per token
- MC (CRX): 0.15 × 1M = 150k CRX
- MC (USD): 150k × $0.10 = $15k

**Market cap floats with CRX price** (pools are CRX-denominated)

---

## 🔒 Security Features

✅ **Checked Arithmetic** - All math uses `checked_add/mul/div` (no overflows)
✅ **CEI Pattern** - State updates before external calls (no reentrancy)
✅ **Oracle Validation** - Freshness, confidence, exponent checks
✅ **Vault Validation** - Post-trade balance checks (reserves = vault)
✅ **Rugpull Prevention** - Mint/freeze authorities must be revoked
✅ **Slippage Protection** - User-defined minimum outputs
✅ **Anti-Sniper** - Size limits + WAA fees
✅ **PDA Security** - Deterministic account derivation
✅ **Permissionless** - No centralized pause or kill switch

---

## 📈 Economic Model

**CRX Flow:**
- SOL → CRX (via CRX/SOL pool)
- CRX → TOKEN (via TOKEN/CRX bonding curve)
- All volume flows through CRX
- CRX accumulates in graduated pools (deflationary)

**Fee Distribution:**
- CRX/SOL pool: 1% to protocol
- TOKEN/CRX pools: 0/0.25/1% to creator
- WAA extra fees: 0-10% to creator (anti-dumping)

**CRX Supply:**
- Starts circulating
- Locks in graduated pools (permanent)
- Becomes deflationary over time

---

## 🚀 Pool Lifecycle Summary

```
1. CREATION
   ↓ Creator deposits tokens, sets parameters

2. PRE-BONDING
   ↓ Virtual reserves for pricing
   ↓ Real CRX accumulates: 0 → threshold
   ↓ Anti-sniper active (first 20 slots)
   ↓ WAA fees active

3. GRADUATION (when real CRX >= threshold)
   ↓ Switch to real reserve pricing
   ↓ Disable anti-sniper
   ↓ Keep WAA fees

4. GRADUATED
   ↓ Permanent AMM
   ↓ Liquidity locked forever
   ↓ Creator fees forever
   ↓ Never goes back
```

---

**That's everything the AMM can do!**
