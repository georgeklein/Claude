# Creator Platform Launch - Comprehensive QA Test Plan

**Version:** 1.0
**Date:** 2026-01-09
**Status:** Ready for Implementation
**Target:** Pre-Launch QA Coverage

---

## Executive Summary

This document defines the complete test plan for Creator platform launch, covering:
- Terminal (trading UI)
- Launchpad (token creation)
- Scale AMM (bonding curve protocol)
- Fee Sponsorship (millions of transactions)

**Goal:** 100% confidence in critical paths before mainnet launch.

---

## 1. Token Creation Flow (Critical Path - P0)

### 1.1 Happy Path Tests

#### TC-001: Standard Token Creation
**Priority:** P0
**Preconditions:** User has funded Privy wallet with SOL

**Test Steps:**
1. Navigate to Launchpad
2. Click "Create Coin"
3. Upload valid PNG image (< 5MB)
4. Enter name: "Test Token"
5. Enter ticker: "TEST"
6. Enter description: "Test token for QA"
7. Select creator fee: 1% (100 bps)
8. Set supply: 1,000,000,000 (default)
9. Set initial market cap: $10,000 (default)
10. Click "Preview Token"
11. Review all details in preview
12. Click "Create Token"
13. Privy wallet prompts for signature
14. Sign transaction
15. Wait for confirmation

**Expected Results:**
- ✅ Token created successfully on-chain
- ✅ Pool created with correct parameters
- ✅ Transaction sponsored (user pays $0 in SOL)
- ✅ Token appears in Terminal within 5 seconds
- ✅ Price displays correctly: ~$0.00001 per token
- ✅ Market cap shows $10,000
- ✅ Phase shows "PreBonding"
- ✅ Chart initializes with first data point
- ✅ User can immediately trade

**Actual Results:** _[To be filled during testing]_

**Pass/Fail:** _[To be determined]_

---

#### TC-002: Token Creation with Different Fee Tiers
**Priority:** P0

**Test Matrix:**
| Fee Tier | Expected BPS | Expected % |
|----------|--------------|------------|
| Free | 0 | 0% |
| Low | 25 | 0.25% |
| Standard | 100 | 1% |

**Test Steps:**
1. Create token with fee tier = Free
2. Verify pool.fee_bps = 0
3. Create token with fee tier = Low
4. Verify pool.fee_bps = 25
5. Create token with fee tier = Standard
6. Verify pool.fee_bps = 100

**Expected Results:**
- ✅ Each fee tier creates pool with correct fee_bps
- ✅ Creator receives correct % on subsequent trades

---

#### TC-003: Token Creation with Different Curve Types
**Priority:** P1

**Test Matrix:**
| Curve Type | Expected Behavior |
|------------|-------------------|
| ConstantProduct | Linear price growth (x×y=k) |
| Exponential | 1.5x steeper price growth |

**Test Steps:**
1. Create token with ConstantProduct curve
2. Buy 10k tokens, record price increase
3. Create token with Exponential curve
4. Buy 10k tokens, record price increase
5. Compare price impacts

**Expected Results:**
- ✅ Exponential curve reaches graduation ~33% faster
- ✅ Exponential price impact > ConstantProduct for same buy

---

### 1.2 Edge Case Tests

#### TC-004: Invalid Image Format
**Priority:** P1

**Test Steps:**
1. Attempt upload: test.gif
2. Attempt upload: test.svg
3. Attempt upload: test.bmp
4. Attempt upload: 10MB.png (too large)

**Expected Results:**
- ❌ GIF rejected: "Only PNG and JPG supported"
- ❌ SVG rejected: "Only PNG and JPG supported"
- ❌ BMP rejected: "Only PNG and JPG supported"
- ❌ 10MB rejected: "Image must be under 5MB"

---

#### TC-005: Duplicate Ticker
**Priority:** P1

**Test Steps:**
1. Create token with ticker "DUPE"
2. Attempt to create another token with ticker "DUPE"

**Expected Results:**
- ❌ Second creation fails: "Token with ticker DUPE already exists"
- ✅ User can choose different ticker and retry

---

#### TC-006: Invalid Characters in Name/Ticker
**Priority:** P1

**Test Cases:**
| Input | Field | Expected Result |
|-------|-------|-----------------|
| "Token🚀" | Name | ❌ Rejected: "No emojis allowed" |
| "TEST-123" | Ticker | ❌ Rejected: "Only A-Z, 0-9" |
| "a" | Ticker | ❌ Rejected: "Minimum 2 characters" |
| "TOOLONGTICKER" | Ticker | ❌ Rejected: "Maximum 10 characters" |
| "" | Name | ❌ Rejected: "Name required" |

---

#### TC-007: Creator Fee Out of Range
**Priority:** P1

**Test Steps:**
1. Attempt to set fee = -1%
2. Attempt to set fee = 2%
3. Attempt to set fee = 0.5%

**Expected Results:**
- ❌ -1% rejected: "Fee must be 0%, 0.25%, or 1%"
- ❌ 2% rejected: "Fee must be 0%, 0.25%, or 1%"
- ❌ 0.5% rejected: "Fee must be 0%, 0.25%, or 1%"

---

#### TC-008: Insufficient SOL Balance
**Priority:** P0

**Test Steps:**
1. Drain user wallet to < 0.01 SOL
2. Attempt token creation
3. Platform sponsor wallet has sufficient balance

**Expected Results:**
- ✅ Creation succeeds (fees are sponsored)
- ✅ User pays $0 in SOL
- ✅ Sponsor wallet balance decreases by ~0.005 SOL

---

#### TC-009: Transaction Failure - Retry
**Priority:** P0

**Test Steps:**
1. Disconnect internet mid-transaction
2. Transaction fails
3. Reconnect internet
4. Click "Retry"

**Expected Results:**
- ❌ First attempt fails: "Network error"
- ✅ Retry button appears
- ✅ Second attempt succeeds
- ✅ No duplicate pool created

---

#### TC-010: Oracle Down
**Priority:** P0

**Test Steps:**
1. Mock oracle unavailable
2. Attempt token creation

**Expected Results:**
- ❌ Creation fails: "Price oracle unavailable"
- ✅ User sees clear error message
- ✅ Contact support button shown

---

#### TC-011: RPC Timeout
**Priority:** P1

**Test Steps:**
1. Simulate RPC delay (> 30 seconds)
2. Attempt token creation

**Expected Results:**
- ⏳ Loading indicator shows for duration
- ❌ After 30s: "Transaction timeout - please retry"
- ✅ Retry succeeds

---

## 2. Trading Flow (Critical Path - P0)

### 2.1 Buy Flow Tests

#### TC-020: Standard Buy Transaction
**Priority:** P0

**Test Steps:**
1. Navigate to token page in Terminal
2. Click "Buy"
3. Enter SOL amount: 1 SOL
4. View CRX conversion: ~500 CRX (example)
5. View expected TOKEN output: ~50,000 tokens
6. View price impact: 0.5%
7. Set slippage: 1% (default)
8. Click "Confirm Buy"
9. Privy wallet prompts signature
10. Sign transaction
11. Wait for confirmation

**Expected Results:**
- ✅ SOL → CRX swap executes (via Jupiter/Orca)
- ✅ CRX → TOKEN swap executes on Scale AMM
- ✅ Tokens appear in wallet within 5 seconds
- ✅ Chart updates with new price
- ✅ Volume increases by trade amount
- ✅ Holder count +1 (if first buy)
- ✅ User balance reflects new tokens

---

#### TC-021: Buy with Exact Slippage
**Priority:** P0

**Test Steps:**
1. Get quote: 1 SOL = 50,000 tokens
2. Set slippage: 0%
3. Price moves 0.1% during transaction
4. Transaction executes

**Expected Results:**
- ❌ Transaction fails: "Slippage tolerance exceeded"
- ✅ User can increase slippage and retry
- ✅ Retry with 1% slippage succeeds

---

#### TC-022: Buy During Anti-Sniper Window
**Priority:** P0

**Test Steps:**
1. Create new pool (slot 1000)
2. At slot 1010 (within 20-slot window)
3. Attempt buy of 100k tokens (10% of supply)

**Expected Results:**
- ❌ Transaction fails: "Anti-sniper protection active"
- ✅ Max allowed: 50k tokens (5% of supply)
- ✅ Buy of 40k tokens succeeds

---

#### TC-023: Buy After Anti-Sniper Window
**Priority:** P0

**Test Steps:**
1. Pool created at slot 1000
2. At slot 1025 (past 20-slot window)
3. Attempt buy of 100k tokens (10% of supply)

**Expected Results:**
- ✅ Transaction succeeds
- ✅ No anti-sniper restriction applied

---

#### TC-024: Multiple Sequential Buys
**Priority:** P1

**Test Steps:**
1. Buy 10k tokens at price P1
2. Buy 10k tokens at price P2
3. Buy 10k tokens at price P3
4. Verify price increases after each buy

**Expected Results:**
- ✅ P1 < P2 < P3 (price increases)
- ✅ Total tokens received = sum of all buys
- ✅ Pool reserves updated correctly
- ✅ Vault balances match reserves

---

### 2.2 Sell Flow Tests

#### TC-030: Standard Sell Transaction
**Priority:** P0

**Test Steps:**
1. User owns 50,000 tokens
2. Click "Sell"
3. Enter token amount: 25,000
4. View expected CRX output: ~250 CRX
5. View price impact: -0.5%
6. Set slippage: 1%
7. Confirm transaction

**Expected Results:**
- ✅ Tokens deducted from wallet
- ✅ CRX received in wallet
- ✅ Chart updates with new price (lower)
- ✅ Volume increases
- ✅ If full sell: holder count -1

---

#### TC-031: Sell with WAA Fee (< 30 seconds)
**Priority:** P0

**Test Steps:**
1. Buy 10k tokens at slot 1000
2. Sell 5k tokens at slot 1050 (50 slots later)
3. Age = 50 slots < T1 (75 slots)

**Expected Results:**
- ✅ Extra fee = 1000 bps (10%)
- ✅ Total fee = base_fee + 1000 bps
- ✅ User receives reduced CRX due to WAA fee
- ✅ Fee distributed to creator

---

#### TC-032: Sell with WAA Fee Decay (30s - 5min)
**Priority:** P0

**Test Steps:**
1. Buy at slot 1000
2. Sell at slot 1400 (400 slots later)
3. Age = 400 slots (between T1 and T2)

**Expected Results:**
- ✅ Extra fee calculated via linear decay
- ✅ Expected: ~566 bps (5.66%)
- ✅ Fee < 10% but > 1%

---

#### TC-033: Sell with WAA Fee (5-30 min)
**Priority:** P1

**Test Steps:**
1. Buy at slot 1000
2. Sell at slot 2500 (1500 slots later)
3. Age = 1500 slots (between T2 and T3)

**Expected Results:**
- ✅ Extra fee decays from 1% → 0%
- ✅ Expected: ~533 bps (0.53%)

---

#### TC-034: Sell After 30 Minutes (No WAA Fee)
**Priority:** P0

**Test Steps:**
1. Buy at slot 1000
2. Sell at slot 6000 (5000 slots later)
3. Age = 5000 slots > T3 (4500 slots)

**Expected Results:**
- ✅ Extra fee = 0 bps
- ✅ Only base fee applied
- ✅ Full holder treated fairly

---

#### TC-035: Partial Sell (WAA Tracking)
**Priority:** P1

**Test Steps:**
1. Buy 10k tokens → tracked_amount = 10k
2. Record avg_entry_slot
3. Sell 6k tokens
4. Check position state

**Expected Results:**
- ✅ tracked_amount = 4k (reduced)
- ✅ avg_entry_slot unchanged
- ✅ Next sell uses same WAA

---

#### TC-036: Full Sell (WAA Reset)
**Priority:** P1

**Test Steps:**
1. Buy 10k tokens
2. Sell all 10k tokens
3. Check position state
4. Buy 5k tokens again

**Expected Results:**
- ✅ tracked_amount = 0 after full sell
- ✅ avg_entry_slot = 0 (reset)
- ✅ Next buy starts fresh WAA

---

#### TC-037: Sell with Insufficient Balance
**Priority:** P0

**Test Steps:**
1. User owns 1000 tokens
2. Attempt sell of 5000 tokens

**Expected Results:**
- ❌ Transaction fails: "Insufficient token balance"
- ✅ Max sellable amount shown: 1000 tokens

---

### 2.3 Edge Case Trading Tests

#### TC-040: Front-Running Protection
**Priority:** P0

**Test Steps:**
1. User submits buy order
2. Bot detects pending transaction
3. Bot submits buy with higher priority fee
4. Both transactions execute

**Expected Results:**
- ✅ Bot's transaction executes first (higher fee)
- ✅ User's transaction executes second with updated price
- ✅ User's slippage protection triggers if price moved > tolerance
- ✅ Either both succeed or user's fails cleanly

---

#### TC-041: Sandwich Attack Attempt
**Priority:** P0

**Test Steps:**
1. Attacker buys before user's large buy
2. User's buy executes (price increases)
3. Attacker sells after user's buy

**Expected Results:**
- ✅ Attacker's profit limited by:
  - Anti-sniper limits (first 20 slots)
  - WAA fees (10% if selling < 30s)
  - Slippage costs
- ✅ Attack economically unfeasible

---

#### TC-042: Dust Trade Prevention
**Priority:** P1

**Test Steps:**
1. Attempt buy with 1 lamport CRX
2. Expected output: < 1000 lamports

**Expected Results:**
- ❌ Transaction fails: "Output amount too small"
- ✅ Minimum output enforced: 1000 lamports

---

#### TC-043: Max Trade Size (99% of Supply)
**Priority:** P1

**Test Steps:**
1. Pool with 1M token supply
2. Attempt buy that would output 990k tokens (99%)

**Expected Results:**
- ✅ Transaction succeeds (no overflow)
- ✅ Price impact: astronomical (99%+)
- ✅ Remaining liquidity: 10k tokens
- ✅ Pool still functional

---

## 3. Graduation Flow (Critical Path - P0)

### 3.1 Standard Graduation Tests

#### TC-050: Graduation at $40k Threshold
**Priority:** P0

**Test Steps:**
1. Create pool with $10k initial MC
2. Execute buys until real_quote_reserves = 39,500 CRX
3. Execute buy of 1000 CRX (pushes to 40,500)
4. Monitor phase transition

**Expected Results:**
- ✅ Pool phase transitions: PreBonding → Graduated
- ✅ PoolGraduated event emitted
- ✅ Pricing switches from virtual to real reserves
- ✅ Terminal shows "Graduated" badge
- ✅ Trading continues normally
- ✅ Creator fees still collected

---

#### TC-051: Graduation at Exact Threshold
**Priority:** P0

**Test Steps:**
1. Pool at 39,999,999,000 lamports (1 lamport below 40k)
2. Buy exact amount to hit 40,000,000,000 lamports

**Expected Results:**
- ✅ Graduation triggers at exact threshold
- ✅ No off-by-one error (>= vs >)

---

#### TC-052: No Price Discontinuity at Graduation
**Priority:** P0

**Test Steps:**
1. Pool near graduation (39,800 CRX)
2. Record price_before = P1
3. Execute buy that triggers graduation
4. Record price_after = P2
5. Calculate difference

**Expected Results:**
- ✅ |P2 - P1| / P1 < 1%
- ✅ No arbitrage opportunity at graduation
- ✅ Smooth price transition

---

#### TC-053: Multiple Trades at Graduation
**Priority:** P0

**Test Steps:**
1. Pool at 39,700 CRX
2. User A buys 300 CRX (triggers graduation)
3. User B buys 200 CRX (same slot)
4. Both transactions execute

**Expected Results:**
- ✅ First transaction triggers graduation
- ✅ Second transaction uses Graduated phase reserves
- ✅ Both transactions succeed
- ✅ No reserve corruption

---

### 3.2 Post-Graduation Tests

#### TC-060: Trading After Graduation
**Priority:** P0

**Test Steps:**
1. Graduate pool
2. Execute 10 random buys
3. Execute 10 random sells
4. Verify pool stability

**Expected Results:**
- ✅ All trades execute successfully
- ✅ Price follows x×y=k curve
- ✅ Reserves always positive
- ✅ Vault balances = reserves

---

#### TC-061: Anti-Sniper Disabled After Graduation
**Priority:** P0

**Test Steps:**
1. Pool graduates at slot 1000
2. At slot 1005 (< 20 slot window)
3. Attempt buy of 500k tokens (50% of supply)

**Expected Results:**
- ✅ Transaction succeeds
- ✅ No anti-sniper restriction (only applies to PreBonding)

---

#### TC-062: WAA Fees Continue After Graduation
**Priority:** P1

**Test Steps:**
1. Buy tokens in PreBonding phase
2. Pool graduates
3. Sell tokens < 30 seconds after buy

**Expected Results:**
- ✅ WAA fee still applies
- ✅ User position tracks across phases

---

## 4. Fee Sponsorship (High Volume - P0)

### 4.1 Sponsorship Functionality

#### TC-070: Sponsored Pool Creation
**Priority:** P0

**Test Steps:**
1. User with 0 SOL balance
2. Create token
3. Monitor sponsor wallet

**Expected Results:**
- ✅ Creation succeeds
- ✅ User pays $0
- ✅ Sponsor wallet decreases by ~0.005 SOL

---

#### TC-071: Sponsor Balance Monitoring
**Priority:** P0

**Test Steps:**
1. Set sponsor min balance = 10 SOL
2. Drain sponsor to 9 SOL
3. Attempt pool creation

**Expected Results:**
- ❌ Creation fails: "Insufficient sponsor balance"
- ✅ Alert sent to ops team
- ✅ User sees friendly error message

---

#### TC-072: Batch Pool Creation (100 pools/hour)
**Priority:** P0

**Test Steps:**
1. Simulate 100 users creating pools
2. Monitor:
   - Success rate
   - Sponsor wallet balance
   - Transaction times
   - RPC rate limits

**Expected Results:**
- ✅ Success rate > 95%
- ✅ Avg creation time < 5 seconds
- ✅ No RPC throttling
- ✅ Sponsor balance tracking accurate

---

#### TC-073: High Volume (1000 pools/day)
**Priority:** P0

**Test Steps:**
1. Simulate 1000 pool creations over 24 hours
2. Sustained rate: ~42 pools/hour
3. Monitor system stability

**Expected Results:**
- ✅ All creations succeed
- ✅ No database bottlenecks
- ✅ No memory leaks
- ✅ Sponsor wallet balance accurate

---

#### TC-074: Sponsorship Cost Estimation
**Priority:** P1

**Test Steps:**
1. Create 100 pools
2. Record actual costs
3. Compare to estimates

**Expected Results:**
- ✅ Estimated: ~0.005 SOL per pool
- ✅ Actual: within 10% of estimate
- ✅ Cost breakdown accurate:
  - Transaction fee: ~0.000005 SOL
  - Pool account rent: ~0.002 SOL
  - Vault rent (2x): ~0.003 SOL

---

## 5. Platform Integration Tests (P1)

### 5.1 Terminal Display Tests

#### TC-080: Pool List Display
**Priority:** P1

**Test Steps:**
1. Navigate to Terminal
2. View pool list

**Expected Results:**
- ✅ All pools visible
- ✅ Sorted by volume (default)
- ✅ Real-time price updates
- ✅ Volume tracking accurate
- ✅ Holder counts correct
- ✅ Images load properly

---

#### TC-081: Real-Time Price Updates
**Priority:** P1

**Test Steps:**
1. Open pool page
2. Execute buy in another browser
3. Monitor chart update

**Expected Results:**
- ✅ Chart updates within 1 second
- ✅ Price reflects new trade
- ✅ Volume increases
- ✅ WebSocket connection stable

---

#### TC-082: Chart Rendering
**Priority:** P1

**Test Steps:**
1. View pool with 100+ trades
2. Zoom in/out on chart
3. Switch timeframes (1h, 24h, 7d)

**Expected Results:**
- ✅ Chart renders smoothly
- ✅ Zoom functions work
- ✅ Timeframe switches correct
- ✅ No missing data points

---

### 5.2 Mobile Responsiveness

#### TC-090: Mobile - Token Creation
**Priority:** P1
**Devices:** iPhone 13, Samsung Galaxy S21, iPad

**Test Steps:**
1. Create token on mobile
2. All TC-001 steps

**Expected Results:**
- ✅ UI adapts to screen size
- ✅ Image upload works
- ✅ Form inputs accessible
- ✅ Transaction signing smooth

---

#### TC-091: Mobile - Trading
**Priority:** P1

**Test Steps:**
1. Execute buy on mobile
2. Execute sell on mobile

**Expected Results:**
- ✅ Buy/sell buttons accessible
- ✅ Input fields usable
- ✅ Charts visible
- ✅ Wallet connects properly

---

### 5.3 Wallet Integration

#### TC-100: Privy Wallet Connect
**Priority:** P0

**Test Steps:**
1. First-time user visits platform
2. Click "Connect Wallet"
3. Create Privy account

**Expected Results:**
- ✅ Privy modal opens
- ✅ Email/social login works
- ✅ Wallet auto-created
- ✅ Balance displayed

---

#### TC-101: Wallet Disconnect/Reconnect
**Priority:** P1

**Test Steps:**
1. Connect wallet
2. Disconnect
3. Reconnect

**Expected Results:**
- ✅ Disconnect clears session
- ✅ Reconnect restores state
- ✅ No duplicate accounts

---

## 6. Security Tests (P0)

### 6.1 Rugpull Prevention

#### TC-110: Mint Authority Validation
**Priority:** P0

**Test Steps:**
1. Create token without revoking mint authority
2. Attempt pool creation

**Expected Results:**
- ❌ Pool creation fails: "Mint authority must be revoked"
- ✅ User prompted to revoke authority

---

#### TC-111: Freeze Authority Validation
**Priority:** P0

**Test Steps:**
1. Create token with freeze authority
2. Attempt pool creation

**Expected Results:**
- ❌ Pool creation fails: "Freeze authority must be revoked"

---

### 6.2 Oracle Security

#### TC-120: Stale Oracle Price
**Priority:** P0

**Test Steps:**
1. Mock oracle with timestamp 65 seconds old
2. Attempt pool creation

**Expected Results:**
- ❌ Creation fails: "Oracle price stale"

---

#### TC-121: Oracle Confidence Too Wide
**Priority:** P0

**Test Steps:**
1. Mock oracle with confidence = 2.5% of price
2. Max allowed = 1%
3. Attempt trade

**Expected Results:**
- ❌ Trade fails: "Oracle confidence too low"

---

#### TC-122: Oracle Price Out of Bounds
**Priority:** P0

**Test Cases:**
| Price (USD) | Expected Result |
|-------------|-----------------|
| $0.005 | ❌ "CRX price out of bounds" |
| $0.01 | ✅ Accepted (min) |
| $1000 | ✅ Accepted (max) |
| $2000 | ❌ "CRX price out of bounds" |

---

### 6.3 Slippage Protection

#### TC-130: Buy Slippage Exceeded
**Priority:** P0

**Test Steps:**
1. Get quote: 100 CRX = 10k tokens
2. Set slippage: 0.5%
3. Price moves 1% before execution

**Expected Results:**
- ❌ Transaction reverted: "Slippage tolerance exceeded"
- ✅ User funds safe (no loss)

---

#### TC-131: Sell Slippage Exceeded
**Priority:** P0

**Test Steps:**
1. Get quote: 10k tokens = 100 CRX
2. Set slippage: 0.5%
3. Large buy moves price 2% before sell

**Expected Results:**
- ❌ Transaction reverted: "Slippage tolerance exceeded"

---

### 6.4 Math Overflow Protection

#### TC-140: Max Input Protection
**Priority:** P0

**Test Steps:**
1. Attempt buy with quote_amount = u64::MAX

**Expected Results:**
- ❌ Transaction fails: "Math overflow"
- ✅ No state corruption

---

#### TC-141: Checked Arithmetic Validation
**Priority:** P0

**Test Steps:**
1. Code review: verify all arithmetic uses checked_*
2. Search for unwrap() calls
3. Search for panic!() calls

**Expected Results:**
- ✅ All arithmetic checked
- ✅ No unwrap() in production code
- ✅ No panic!() in production code

---

## 7. Error Handling Tests (P1)

### 7.1 Network Errors

#### TC-150: RPC Connection Lost
**Priority:** P1

**Test Steps:**
1. Start transaction
2. Kill RPC connection mid-flight
3. Restore connection

**Expected Results:**
- ❌ Transaction fails gracefully
- ✅ Error message: "Network error - please retry"
- ✅ Retry button appears
- ✅ Retry succeeds

---

#### TC-151: Slow RPC Response
**Priority:** P1

**Test Steps:**
1. Simulate 10-second RPC delay
2. Submit transaction

**Expected Results:**
- ⏳ Loading indicator shows
- ✅ Transaction eventually succeeds
- ✅ No timeout before 30 seconds

---

### 7.2 User Errors

#### TC-160: Insufficient Balance
**Priority:** P0

**Test Steps:**
1. User has 0.5 SOL
2. Attempt buy requiring 1 SOL

**Expected Results:**
- ❌ Transaction fails: "Insufficient SOL balance"
- ✅ Required amount shown: "Need 1 SOL (you have 0.5)"

---

#### TC-161: Wrong Token Account
**Priority:** P1

**Test Steps:**
1. User passes incorrect token account
2. Attempt trade

**Expected Results:**
- ❌ Transaction fails: "Invalid token account"
- ✅ Clear error message

---

### 7.3 Support Contact

#### TC-170: Error Contact Flow
**Priority:** P1

**Test Steps:**
1. Trigger any error
2. Click "Contact Support"

**Expected Results:**
- ✅ Modal opens with:
  - Error details
  - Transaction signature
  - User wallet address
  - Contact form / Discord link

---

## 8. Performance Benchmarks

### 8.1 Latency Targets

| Operation | Target | Acceptable | Unacceptable |
|-----------|--------|------------|--------------|
| Pool creation | < 3s | < 5s | > 5s |
| Buy transaction | < 2s | < 3s | > 3s |
| Sell transaction | < 2s | < 3s | > 3s |
| Page load (Terminal) | < 1s | < 2s | > 2s |
| Chart update | < 500ms | < 1s | > 1s |
| Pool list load | < 500ms | < 1s | > 1s |
| Search results | < 300ms | < 500ms | > 500ms |

**Test Methodology:**
- Measure P50, P95, P99 latencies
- Test from multiple geographic locations
- Test during peak load
- Test with slow (3G) connections

---

### 8.2 Throughput Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Pool creations/hour | 100 | Sustained |
| Trades/minute | 1000 | Across all pools |
| Concurrent users | 1000 | Terminal page views |
| WebSocket connections | 1000 | Real-time updates |

---

## 9. Load Testing Strategy

### 9.1 Ramp-Up Test

**Objective:** Identify breaking point

**Test Plan:**
1. Start: 10 concurrent users
2. Ramp: +10 users every minute
3. Duration: Until failure or 1000 users
4. Monitor:
   - Response times
   - Error rates
   - CPU/memory usage
   - Database connections
   - RPC rate limits

**Success Criteria:**
- ✅ System stable at 1000 concurrent users
- ✅ P95 latency < 5s at peak load
- ✅ Error rate < 1% at peak load

---

### 9.2 Sustained Load Test

**Objective:** Verify stability over time

**Test Plan:**
1. Load: 500 concurrent users
2. Duration: 4 hours
3. Operations:
   - 10 pool creations/minute
   - 100 trades/minute
   - 1000 page views/minute

**Success Criteria:**
- ✅ No memory leaks
- ✅ No database deadlocks
- ✅ Response times stable (no degradation)
- ✅ Zero downtime

---

### 9.3 Spike Test

**Objective:** Handle sudden traffic bursts

**Test Plan:**
1. Baseline: 100 users
2. Spike: Jump to 1000 users instantly
3. Duration: 5 minutes at peak
4. Return: Drop to 100 users

**Success Criteria:**
- ✅ System handles spike gracefully
- ✅ Auto-scaling triggers (if applicable)
- ✅ No cascading failures
- ✅ Recovery after spike < 1 minute

---

### 9.4 Stress Test (Fee Sponsorship)

**Objective:** Validate millions of sponsored transactions

**Test Plan:**
1. Scenario: Viral launch day
2. Load: 1000 pool creations/hour
3. Duration: 24 hours
4. Monitor sponsor wallet balance

**Calculations:**
- Cost per pool: ~0.005 SOL
- 1000 pools/hour × 24 hours = 24,000 pools
- Total cost: 24,000 × 0.005 = 120 SOL
- Sponsor wallet needs: 150 SOL (buffer)

**Success Criteria:**
- ✅ All 24k pools created successfully
- ✅ Sponsor balance tracked accurately
- ✅ Low balance alerts triggered at 20 SOL
- ✅ No failed transactions due to insufficient funds

---

## 10. Launch Criteria (Go/No-Go Decision)

### 10.1 Critical Path (Must Pass - P0)

**All of these MUST be ✅ before launch:**

#### Protocol Security
- [ ] All arithmetic uses checked_* operations
- [ ] No unwrap() or panic!() in production code
- [ ] Oracle validation working (staleness, confidence, bounds)
- [ ] Slippage protection enforced
- [ ] Mint/freeze authority validation working
- [ ] Anti-sniper limits enforced correctly
- [ ] WAA fees calculated correctly
- [ ] Graduation triggers at exact threshold
- [ ] No price discontinuity at graduation

#### Core Functionality
- [ ] Token creation works (100 test cases)
- [ ] Buy transactions work (all edge cases)
- [ ] Sell transactions work (all edge cases)
- [ ] Fee sponsorship works (100 pools tested)
- [ ] Real-time updates work (Terminal)
- [ ] Mobile responsive (iOS + Android)
- [ ] Wallet integration works (Privy)

#### Performance
- [ ] Pool creation < 5s (P95)
- [ ] Trade execution < 3s (P95)
- [ ] Page load < 2s (P95)
- [ ] System stable at 1000 concurrent users
- [ ] Sustained load test passed (4 hours)

#### Monitoring
- [ ] Error tracking enabled (Sentry/Datadog)
- [ ] Sponsor wallet monitoring active
- [ ] Low balance alerts working
- [ ] Transaction success rate tracking
- [ ] RPC health monitoring

#### Documentation
- [ ] User guide published
- [ ] API documentation complete
- [ ] Support contact available
- [ ] Known issues documented

---

### 10.2 High Priority (Strongly Recommended - P1)

**Should have most of these ✅:**

- [ ] Advanced edge cases tested (50+ scenarios)
- [ ] Load testing completed (spike + stress)
- [ ] Mobile testing on 5+ devices
- [ ] Cross-browser testing (Chrome, Safari, Firefox)
- [ ] Graduation under load tested
- [ ] Concurrent trading stress tested
- [ ] Math overflow edge cases tested
- [ ] Oracle failure scenarios tested
- [ ] Network failure recovery tested

---

### 10.3 Nice to Have (Can Launch Without - P2)

- [ ] Property-based testing (fuzzing)
- [ ] Chaos engineering (random failures)
- [ ] Multi-region latency testing
- [ ] Accessibility testing (WCAG)
- [ ] SEO optimization
- [ ] Social sharing features

---

## 11. Test Automation Strategy

### 11.1 Unit Tests (Existing)

**Status:** ✅ 263/263 tests passing

**Coverage:**
- State management (Pool, Config, UserPosition)
- Bonding curve math (ConstantProduct, Exponential)
- Fee calculations (base fees, WAA fees)
- Oracle validation
- Reserve updates
- Phase transitions

**Tool:** Anchor test framework (Rust + TypeScript)

---

### 11.2 Integration Tests (To Implement)

**Priority:** P0

**Test Suite: Token Creation**
- Create pool with all fee tiers
- Create pool with all curve types
- Verify on-chain state matches input
- Test fee sponsorship flow

**Test Suite: Trading**
- End-to-end buy flow
- End-to-end sell flow
- Multi-user concurrent trading
- WAA fee calculations
- Anti-sniper enforcement

**Test Suite: Graduation**
- Standard graduation flow
- Graduation under load
- Post-graduation trading

**Tool:** Playwright + Custom Solana SDK

---

### 11.3 E2E Tests (To Implement)

**Priority:** P0

**User Journeys:**
1. New user creates token → trades → graduates pool
2. Buyer finds token → buys → sells → checks profit
3. Creator launches 10 tokens → monitors fees
4. Mobile user creates token → trades on phone

**Tool:** Playwright + Real devnet deployment

---

### 11.4 Load Tests (To Implement)

**Priority:** P0

**Tools:**
- k6 or Artillery (load generation)
- Grafana (monitoring)
- Custom Solana transaction simulator

**Test Scenarios:**
- Ramp-up test (10 → 1000 users)
- Sustained load test (500 users, 4 hours)
- Spike test (100 → 1000 → 100 users)
- Stress test (1000 pools/hour, 24 hours)

---

## 12. Test Execution Timeline

### Phase 1: Critical Path Testing (Week 1)
**Dates:** Jan 10-17, 2026

**Focus:** P0 tests only
- Token creation (TC-001 to TC-011)
- Trading buy/sell (TC-020 to TC-037)
- Graduation (TC-050 to TC-062)
- Fee sponsorship basics (TC-070 to TC-074)

**Goal:** ✅ All P0 tests passing

---

### Phase 2: Security & Edge Cases (Week 2)
**Dates:** Jan 17-24, 2026

**Focus:** P0 security + P1 edge cases
- Security tests (TC-110 to TC-141)
- Edge case trading (TC-040 to TC-043)
- Error handling (TC-150 to TC-170)
- Mobile testing (TC-090 to TC-091)

**Goal:** ✅ 95% of P1 tests passing

---

### Phase 3: Load Testing (Week 3)
**Dates:** Jan 24-31, 2026

**Focus:** Performance & scale
- Performance benchmarks
- Load testing (all scenarios)
- Stress testing (fee sponsorship)
- 72-hour soak test (devnet)

**Goal:** ✅ System stable under production load

---

### Phase 4: Launch Preparation (Week 4)
**Dates:** Jan 31 - Feb 7, 2026

**Focus:** Final validation
- Mainnet smoke tests
- Monitoring setup
- Runbook preparation
- Go/No-Go decision

**Launch Date:** Feb 7, 2026 (tentative)

---

## 13. Test Reporting

### 13.1 Daily Test Summary

**Format:**
```
Date: 2026-01-10
Tests Run: 45
Tests Passed: 42
Tests Failed: 3
Test Coverage: 85%

Failures:
- TC-031: WAA fee calculation off by 1 bps (MINOR)
- TC-072: Batch creation failed at 87 pools (MAJOR)
- TC-130: Slippage protection not triggering (CRITICAL)

Blockers:
- TC-072: RPC rate limiting needs investigation
- TC-130: Smart contract bug in slippage check

Next Actions:
- Fix slippage protection bug (ETA: 2 hours)
- Investigate RPC limits with provider (ETA: 1 day)
```

---

### 13.2 Weekly Test Report

**Sections:**
1. Executive Summary
2. Tests Executed (by category)
3. Pass/Fail Rates
4. Critical Issues
5. Performance Metrics
6. Risk Assessment
7. Go/No-Go Recommendation

**Distribution:** Engineering team, Product, Leadership

---

### 13.3 Launch Readiness Report

**Final report before mainnet launch:**

**Checklist:**
- [ ] All P0 tests passed (100%)
- [ ] 95%+ P1 tests passed
- [ ] Load testing completed
- [ ] Security audit passed
- [ ] Monitoring configured
- [ ] Runbook prepared
- [ ] Rollback plan documented
- [ ] Support team trained

**Go/No-Go Decision:**
- ✅ GO: Launch on schedule
- ❌ NO-GO: Delay launch, address blockers

---

## 14. Rollback & Contingency Plans

### 14.1 Rollback Criteria

**Immediate rollback if:**
- Critical security vulnerability discovered
- Sponsor wallet drained unexpectedly
- > 10% transaction failure rate
- Data corruption detected
- Systematic loss of user funds

**Rollback Process:**
1. Pause new pool creations (feature flag)
2. Allow existing trades to settle
3. Deploy hotfix to testnet
4. Validate fix
5. Deploy to mainnet
6. Resume operations

---

### 14.2 Degraded Mode Operations

**If issues occur, fall back to:**

**Level 1 (Minor Issues):**
- Disable fee sponsorship (users pay own fees)
- Disable real-time updates (polling instead)
- Rate limit pool creations

**Level 2 (Moderate Issues):**
- Pause new pool creations
- Allow existing pools to trade
- Display maintenance banner

**Level 3 (Critical Issues):**
- Emergency pause all operations
- Display "Under Maintenance" page
- Investigate and fix critical issue

---

## 15. Definitions & Standards

### 15.1 Test Priority Levels

**P0 (Critical):**
- Must pass before launch
- Core functionality or security
- User-facing critical paths
- Example: Token creation, trading, graduation

**P1 (High):**
- Should pass before launch
- Important features or edge cases
- Can launch with documented workarounds
- Example: Mobile responsiveness, error handling

**P2 (Medium):**
- Nice to have
- Can launch without
- Can be tested post-launch
- Example: Advanced analytics, social features

---

### 15.2 Test Result States

| State | Symbol | Meaning |
|-------|--------|---------|
| Pass | ✅ | Test passed, meets acceptance criteria |
| Fail | ❌ | Test failed, does not meet criteria |
| Blocked | 🚫 | Cannot execute due to dependency |
| Skip | ⏭️ | Intentionally skipped (documented) |
| WIP | ⏳ | Test in progress |

---

### 15.3 Bug Severity Levels

**Critical:**
- Loss of funds
- Security vulnerability
- Complete system failure
- Example: Sponsor wallet drained

**Major:**
- Core feature broken
- Significant user impact
- No workaround available
- Example: Pool creation fails 50% of time

**Minor:**
- Edge case issue
- Minor user inconvenience
- Workaround available
- Example: Chart doesn't update on slow connection

**Trivial:**
- Cosmetic issue
- No functional impact
- Example: Button color slightly off

---

## Appendix A: Test Data Requirements

### A.1 Test Wallets
- 10 funded wallets (devnet)
- Balance: 100 SOL each
- Used for: Multi-user concurrent testing

### A.2 Test Tokens
- 20 pre-created tokens (various market caps)
- Tickers: TEST001 to TEST020
- Used for: Trading simulations

### A.3 Test Pools
- 5 PreBonding pools (different phases)
- 5 Graduated pools (different liquidity)
- Used for: State transition testing

### A.4 Mock Oracle
- Configurable price feeds
- Adjustable timestamp/confidence
- Used for: Oracle failure scenarios

---

## Appendix B: Tools & Infrastructure

### B.1 Testing Tools
- **Anchor Test Framework:** Rust/TS unit tests
- **Playwright:** E2E browser automation
- **k6:** Load testing
- **Jest:** Frontend unit tests
- **Cypress:** Alternative E2E testing

### B.2 Monitoring Tools
- **Sentry:** Error tracking
- **Grafana:** Metrics dashboard
- **PagerDuty:** On-call alerts
- **Datadog:** APM & infrastructure monitoring

### B.3 CI/CD
- **GitHub Actions:** Automated test runs
- **Trunk-based development:** Single main branch
- **Feature flags:** Gradual rollout

---

## Appendix C: Contact Information

### C.1 Test Team
- **QA Lead:** [Name] - qa-lead@creator.com
- **Automation Engineer:** [Name] - automation@creator.com
- **Performance Engineer:** [Name] - perf@creator.com

### C.2 Escalation Path
1. QA Lead (response: 1 hour)
2. Engineering Manager (response: 30 min)
3. CTO (response: immediate)

### C.3 Launch Command Center
- **Slack Channel:** #creator-launch
- **War Room:** Zoom link (24/7 during launch)
- **Status Page:** status.creator.com

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-09 | QA Team | Initial comprehensive test plan |

---

**END OF TEST PLAN**

**Next Steps:**
1. Review and approve test plan
2. Set up test infrastructure
3. Begin Phase 1 testing (Week 1)
4. Daily standup at 9am to review progress
5. Go/No-Go decision: Jan 31, 2026
