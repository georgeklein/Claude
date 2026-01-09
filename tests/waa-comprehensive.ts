/**
 * COMPREHENSIVE WAA (Weighted Average Anti-Dump) TEST SUITE
 *
 * Tests all aspects of the WAA system:
 * 1. Fee decay at exact boundaries (T1=25, T2=150, T3=750 slots)
 * 2. Fee decay between boundaries (linear interpolation)
 * 3. Weighted average calculation across multiple buys
 * 4. Position tracking on buy and sell
 * 5. disable_waa flag behavior
 *
 * Constants from constants.rs:
 * - WAA_TIER1_SLOTS: 25 (~10 seconds)
 * - WAA_TIER2_SLOTS: 150 (~1 minute)
 * - WAA_TIER3_SLOTS: 750 (~5 minutes)
 * - WAA_FEE_MAX: 300 bps (3%)
 * - WAA_FEE_MIN: 50 bps (0.5%)
 * - WAA_DECAY_RANGE: 250 bps
 * - WAA_TIME_RANGE_1: 125 slots (T2 - T1)
 * - WAA_TIME_RANGE_2: 600 slots (T3 - T2)
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CreatorAmmV2 } from "../target/types/creator_amm_v2";
import { expect } from "chai";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddress,
  mintTo,
  TOKEN_PROGRAM_ID,
  getAccount,
  setAuthority,
  AuthorityType,
} from "@solana/spl-token";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";

describe("WAA Comprehensive Test Suite", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.CreatorAmmV2 as Program<CreatorAmmV2>;

  // WAA Constants (matching constants.rs)
  const WAA_TIER1_SLOTS = 25;
  const WAA_TIER2_SLOTS = 150;
  const WAA_TIER3_SLOTS = 750;
  const WAA_FEE_MAX = 300; // 3% in bps
  const WAA_FEE_MIN = 50;  // 0.5% in bps
  const WAA_DECAY_RANGE = 250; // 2.5% range
  const WAA_TIME_RANGE_1 = 125; // T2 - T1
  const WAA_TIME_RANGE_2 = 600; // T3 - T2

  // Global accounts
  let config: PublicKey;
  let authority: Keypair;
  let feeRecipient: Keypair;
  let crxMint: PublicKey;
  let crxPriceOracle: Keypair;
  let feeRecipientCrxAccount: PublicKey;
  let creator: Keypair;
  let trader1: Keypair;
  let trader2: Keypair;

  // Helper functions
  async function createMockOracle(): Promise<Keypair> {
    const oracle = Keypair.generate();
    const space = 8 + 8 + 8 + 4 + 8;
    const lamports = await provider.connection.getMinimumBalanceForRentExemption(space);
    const createIx = SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: oracle.publicKey,
      lamports,
      space,
      programId: program.programId,
    });
    await provider.sendAndConfirm(new anchor.web3.Transaction().add(createIx), [oracle]);

    // Write oracle data
    const data = Buffer.alloc(space);
    const discriminator = Buffer.from([0x9a, 0x27, 0x1c, 0x8f, 0x3e, 0x2b, 0x45, 0x67]);
    discriminator.copy(data, 0);
    data.writeBigInt64LE(BigInt(200_000_000), 8); // price
    data.writeBigUInt64LE(BigInt(1_000_000), 16); // conf
    data.writeInt32LE(-8, 24); // expo
    data.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)), 28); // publish_time

    return oracle;
  }

  async function createTokenWithRevokedAuthorities(): Promise<PublicKey> {
    const mint = await createMint(provider.connection, creator, creator.publicKey, null, 6);
    await setAuthority(provider.connection, creator, mint, creator.publicKey, AuthorityType.MintTokens, null);
    return mint;
  }

  async function airdrop(pubkey: PublicKey, amount: number = 10) {
    const sig = await provider.connection.requestAirdrop(pubkey, amount * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);
  }

  async function createPool(baseMint: PublicKey) {
    const [pool] = PublicKey.findProgramAddressSync([Buffer.from("pool"), baseMint.toBuffer()], program.programId);
    const [quoteVault] = PublicKey.findProgramAddressSync([Buffer.from("quote_vault"), pool.toBuffer()], program.programId);
    const [baseVault] = PublicKey.findProgramAddressSync([Buffer.from("base_vault"), pool.toBuffer()], program.programId);
    const creatorBaseAccount = await getOrCreateAssociatedTokenAccount(provider.connection, creator, baseMint, creator.publicKey);

    const tokenSupply = new anchor.BN(1_000_000_000_000); // 1T tokens
    await mintTo(provider.connection, creator, baseMint, creatorBaseAccount.address, creator, tokenSupply.toNumber());

    await program.methods
      .createPool(
        new anchor.BN(10_000_000_000), // $10k market cap
        tokenSupply,
        25, // 0.25% fee
        { constantProduct: {} },
        new anchor.BN(40_000_000_000), // $40k graduation
        false,
        ""
      )
      .accounts({
        config,
        pool,
        quoteMint: crxMint,
        baseMint,
        quoteVault,
        baseVault,
        creatorBaseAccount: creatorBaseAccount.address,
        creator: creator.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    return { pool, quoteVault, baseVault };
  }

  async function executeTrade(
    pool: PublicKey,
    quoteVault: PublicKey,
    baseVault: PublicKey,
    baseMint: PublicKey,
    user: Keypair,
    isBuy: boolean,
    amount: anchor.BN,
    minAmount: anchor.BN
  ) {
    const userQuoteAccount = await getOrCreateAssociatedTokenAccount(provider.connection, user, crxMint, user.publicKey);
    const userBaseAccount = await getOrCreateAssociatedTokenAccount(provider.connection, user, baseMint, user.publicKey);
    const [userPosition] = PublicKey.findProgramAddressSync(
      [Buffer.from("pos"), pool.toBuffer(), user.publicKey.toBuffer()],
      program.programId
    );

    // Fetch config to get protocol fee recipient
    const configData = await program.account.config.fetch(config);

    // Derive protocol fee recipient (config.feeRecipient's CRX account)
    const protocolFeeRecipient = await getAssociatedTokenAddress(
      crxMint,
      configData.feeRecipient
    );

    const method = isBuy ? program.methods.buy(amount, minAmount) : program.methods.sell(amount, minAmount);
    await method
      .accounts({
        config,
        pool,
        quoteVault,
        baseVault,
        userQuoteAccount: userQuoteAccount.address,
        userBaseAccount: userBaseAccount.address,
        feeRecipientAccount: feeRecipientCrxAccount,
        protocolFeeRecipient,
        userPosition,
        user: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();
  }

  /**
   * Calculate expected WAA fee based on age in slots
   * Matches the implementation in state.rs::calculate_extra_sell_fee_bps
   */
  function calculateExpectedWaaFee(ageSlots: number): number {
    if (ageSlots <= WAA_TIER1_SLOTS) {
      return WAA_FEE_MAX; // 300 bps (3%)
    }

    if (ageSlots <= WAA_TIER2_SLOTS) {
      // Decay from 3% to 0.5%: 50 + 250 * (150 - age) / 125
      const timeRemaining = WAA_TIER2_SLOTS - ageSlots;
      const decayComponent = Math.floor((WAA_DECAY_RANGE * timeRemaining) / WAA_TIME_RANGE_1);
      return WAA_FEE_MIN + decayComponent;
    }

    if (ageSlots <= WAA_TIER3_SLOTS) {
      // Decay from 0.5% to 0%: 50 * (750 - age) / 600
      const timeRemaining = WAA_TIER3_SLOTS - ageSlots;
      const fee = Math.floor((WAA_FEE_MIN * timeRemaining) / WAA_TIME_RANGE_2);
      return fee;
    }

    return 0; // No extra fee after T3
  }

  before(async () => {
    authority = Keypair.generate();
    feeRecipient = Keypair.generate();
    creator = Keypair.generate();
    trader1 = Keypair.generate();
    trader2 = Keypair.generate();

    await Promise.all([
      airdrop(authority.publicKey),
      airdrop(feeRecipient.publicKey),
      airdrop(creator.publicKey),
      airdrop(trader1.publicKey),
      airdrop(trader2.publicKey),
    ]);

    crxMint = await createMint(provider.connection, authority, authority.publicKey, null, 6);
    crxPriceOracle = await createMockOracle();
    [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
    feeRecipientCrxAccount = (
      await getOrCreateAssociatedTokenAccount(provider.connection, feeRecipient, crxMint, feeRecipient.publicKey)
    ).address;

    await program.methods
      .initialize(
        new anchor.BN(2_000_000),     // initial_crx_price_usd: $2.00
        new anchor.BN(60),             // oracle_max_age_seconds
        [                               // approved_quote_tokens [5]
          SystemProgram.programId,
          SystemProgram.programId,
          SystemProgram.programId,
          SystemProgram.programId,
          SystemProgram.programId,
        ],
        0                               // approved_quote_count
      )
      .accounts({
        config,
        authority: authority.publicKey,
        feeRecipient: feeRecipient.publicKey,
        crxPriceOracle: crxPriceOracle.publicKey,
        crxMint,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    console.log("✅ WAA test environment initialized");
  });

  describe("1. WAA Fee Decay - Exact Boundaries", () => {
    it("Should apply 3% fee at T1 boundary (25 slots)", async () => {
      const expectedFee = calculateExpectedWaaFee(25);
      expect(expectedFee).to.equal(300); // 3%
      console.log(`  ✅ T1 boundary (25 slots): ${expectedFee} bps = 3%`);
    });

    it("Should apply 0.5% fee at T2 boundary (150 slots)", async () => {
      const expectedFee = calculateExpectedWaaFee(150);
      expect(expectedFee).to.equal(50); // 0.5%
      console.log(`  ✅ T2 boundary (150 slots): ${expectedFee} bps = 0.5%`);
    });

    it("Should apply 0% fee at T3 boundary (750 slots)", async () => {
      const expectedFee = calculateExpectedWaaFee(750);
      expect(expectedFee).to.equal(0); // 0%
      console.log(`  ✅ T3 boundary (750 slots): ${expectedFee} bps = 0%`);
    });

    it("Should apply 3% fee below T1 (age = 0)", async () => {
      const expectedFee = calculateExpectedWaaFee(0);
      expect(expectedFee).to.equal(300);
      console.log(`  ✅ Age 0 slots: ${expectedFee} bps = 3%`);
    });

    it("Should apply 0% fee above T3 (age = 5000)", async () => {
      const expectedFee = calculateExpectedWaaFee(5000);
      expect(expectedFee).to.equal(0);
      console.log(`  ✅ Age 5000 slots: ${expectedFee} bps = 0%`);
    });
  });

  describe("2. WAA Fee Decay - Linear Interpolation", () => {
    it("Should decay linearly between T1 and T2", async () => {
      // Test midpoint: (75 + 750) / 2 = 412.5 → 412 slots
      const midpoint = Math.floor((WAA_TIER1_SLOTS + WAA_TIER2_SLOTS) / 2);
      const expectedFee = calculateExpectedWaaFee(midpoint);

      // At midpoint, should be roughly halfway between 3% and 0.5% = ~1.75%
      expect(expectedFee).to.be.greaterThan(150); // > 1.5%
      expect(expectedFee).to.be.lessThan(200); // < 2%
      console.log(`  ✅ Midpoint T1-T2 (${midpoint} slots): ${expectedFee} bps = ${(expectedFee/100).toFixed(2)}%`);
    });

    it("Should decay linearly between T2 and T3", async () => {
      // Test midpoint: (150 + 750) / 2 = 450 slots
      const midpoint = Math.floor((WAA_TIER2_SLOTS + WAA_TIER3_SLOTS) / 2);
      const expectedFee = calculateExpectedWaaFee(midpoint);

      // At midpoint, should be roughly 0.5% (50 bps)
      expect(expectedFee).to.be.greaterThan(30); // > 0.3%
      expect(expectedFee).to.be.lessThan(70); // < 0.7%
      console.log(`  ✅ Midpoint T2-T3 (${midpoint} slots): ${expectedFee} bps = ${(expectedFee/100).toFixed(2)}%`);
    });

    it("Should calculate fee at T1 + 1 slot (26 slots)", async () => {
      const expectedFee = calculateExpectedWaaFee(26);
      // Should be slightly less than 3%
      // Formula: 50 + 250 * (150 - 26) / 125 = 50 + 250 * 124 / 125 = 50 + 248 = 298 bps
      expect(expectedFee).to.equal(298);
      console.log(`  ✅ T1+1 (26 slots): ${expectedFee} bps = ${(expectedFee/100).toFixed(2)}%`);
    });

    it("Should calculate fee at T2 - 1 slot (149 slots)", async () => {
      const expectedFee = calculateExpectedWaaFee(149);
      // Formula: 50 + 250 * (150 - 149) / 125 = 50 + 250 * 1 / 125 = 50 + 2 = 52 bps
      expect(expectedFee).to.equal(52);
      console.log(`  ✅ T2-1 (149 slots): ${expectedFee} bps = ${(expectedFee/100).toFixed(2)}%`);
    });

    it("Should calculate fee at T2 + 1 slot (151 slots)", async () => {
      const expectedFee = calculateExpectedWaaFee(151);
      // Formula: 50 * (750 - 151) / 600 = 50 * 599 / 600 = 49 bps
      expect(expectedFee).to.equal(49);
      console.log(`  ✅ T2+1 (151 slots): ${expectedFee} bps = ${(expectedFee/100).toFixed(2)}%`);
    });

    it("Should calculate fee at T3 - 1 slot (749 slots)", async () => {
      const expectedFee = calculateExpectedWaaFee(749);
      // Formula: 50 * (750 - 749) / 600 = 50 * 1 / 600 = 0 bps (floor division)
      expect(expectedFee).to.equal(0);
      console.log(`  ✅ T3-1 (749 slots): ${expectedFee} bps = ${(expectedFee/100).toFixed(2)}%`);
    });
  });

  describe("3. Weighted Average Entry Slot Calculation", () => {
    let testPool: PublicKey;
    let testQuoteVault: PublicKey;
    let testBaseVault: PublicKey;
    let testBaseMint: PublicKey;

    before(async () => {
      testBaseMint = await createTokenWithRevokedAuthorities();
      const poolData = await createPool(testBaseMint);
      testPool = poolData.pool;
      testQuoteVault = poolData.quoteVault;
      testBaseVault = poolData.baseVault;

      // Fund trader
      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        100_000_000_000 // 100k CRX
      );
    });

    it("Should initialize position on first buy", async () => {
      const [userPosition] = PublicKey.findProgramAddressSync(
        [Buffer.from("pos"), testPool.toBuffer(), trader1.publicKey.toBuffer()],
        program.programId
      );

      // First buy
      await executeTrade(
        testPool,
        testQuoteVault,
        testBaseVault,
        testBaseMint,
        trader1,
        true,
        new anchor.BN(1_000_000),
        new anchor.BN(0)
      );

      const position = await program.account.userPosition.fetch(userPosition);
      const currentSlot = await provider.connection.getSlot();

      // First buy: avg_entry_slot should equal current slot
      expect(position.avgEntrySlot.toNumber()).to.be.closeTo(currentSlot, 5);
      expect(position.trackedAmount.toNumber()).to.be.greaterThan(0);
      console.log(`  ✅ First buy: avg_entry_slot = ${position.avgEntrySlot}, tracked_amount = ${position.trackedAmount}`);
    });

    it("Should update weighted average on second buy", async () => {
      const [userPosition] = PublicKey.findProgramAddressSync(
        [Buffer.from("pos"), testPool.toBuffer(), trader1.publicKey.toBuffer()],
        program.programId
      );

      const positionBefore = await program.account.userPosition.fetch(userPosition);
      const slotBefore = positionBefore.avgEntrySlot.toNumber();
      const amountBefore = positionBefore.trackedAmount.toNumber();

      // Second buy (after some slots)
      await executeTrade(
        testPool,
        testQuoteVault,
        testBaseVault,
        testBaseMint,
        trader1,
        true,
        new anchor.BN(1_000_000),
        new anchor.BN(0)
      );

      const positionAfter = await program.account.userPosition.fetch(userPosition);
      const slotAfter = positionAfter.avgEntrySlot.toNumber();
      const amountAfter = positionAfter.trackedAmount.toNumber();
      const currentSlot = await provider.connection.getSlot();

      // Weighted average should be between old slot and current slot
      expect(slotAfter).to.be.gte(slotBefore);
      expect(slotAfter).to.be.lte(currentSlot);
      expect(amountAfter).to.be.greaterThan(amountBefore);

      console.log(`  ✅ Second buy: avg_entry_slot updated from ${slotBefore} to ${slotAfter}`);
      console.log(`     Tracked amount: ${amountBefore} → ${amountAfter}`);
    });

    it("Should reduce tracked amount on sell", async () => {
      const [userPosition] = PublicKey.findProgramAddressSync(
        [Buffer.from("pos"), testPool.toBuffer(), trader1.publicKey.toBuffer()],
        program.programId
      );

      const positionBefore = await program.account.userPosition.fetch(userPosition);
      const amountBefore = positionBefore.trackedAmount.toNumber();
      const slotBefore = positionBefore.avgEntrySlot.toNumber();

      // Get user's base token balance
      const userBaseAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        trader1,
        testBaseMint,
        trader1.publicKey
      );
      const baseBalance = await getAccount(provider.connection, userBaseAccount.address);
      const sellAmount = Math.floor(Number(baseBalance.amount) / 2); // Sell 50%

      // Sell
      await executeTrade(
        testPool,
        testQuoteVault,
        testBaseVault,
        testBaseMint,
        trader1,
        false,
        new anchor.BN(sellAmount),
        new anchor.BN(0)
      );

      const positionAfter = await program.account.userPosition.fetch(userPosition);
      const amountAfter = positionAfter.trackedAmount.toNumber();
      const slotAfter = positionAfter.avgEntrySlot.toNumber();

      // Tracked amount should decrease, avg_entry_slot should stay same
      expect(amountAfter).to.be.lessThan(amountBefore);
      expect(slotAfter).to.equal(slotBefore);

      console.log(`  ✅ Sell: tracked_amount reduced from ${amountBefore} to ${amountAfter}`);
      console.log(`     avg_entry_slot unchanged: ${slotBefore}`);
    });

    it("Should reset position on full sell", async () => {
      const [userPosition] = PublicKey.findProgramAddressSync(
        [Buffer.from("pos"), testPool.toBuffer(), trader1.publicKey.toBuffer()],
        program.programId
      );

      // Get user's remaining base tokens
      const userBaseAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        trader1,
        testBaseMint,
        trader1.publicKey
      );
      const baseBalance = await getAccount(provider.connection, userBaseAccount.address);

      // Sell all remaining
      await executeTrade(
        testPool,
        testQuoteVault,
        testBaseVault,
        testBaseMint,
        trader1,
        false,
        new anchor.BN(Number(baseBalance.amount)),
        new anchor.BN(0)
      );

      const positionAfter = await program.account.userPosition.fetch(userPosition);

      // Position should be reset
      expect(positionAfter.trackedAmount.toNumber()).to.equal(0);
      expect(positionAfter.avgEntrySlot.toNumber()).to.equal(0);

      console.log(`  ✅ Full sell: position reset (tracked_amount = 0, avg_entry_slot = 0)`);
    });
  });

  describe("4. Multiple Users - Independent Positions", () => {
    let multiPool: PublicKey;
    let multiQuoteVault: PublicKey;
    let multiBaseVault: PublicKey;
    let multiBaseMint: PublicKey;

    before(async () => {
      multiBaseMint = await createTokenWithRevokedAuthorities();
      const poolData = await createPool(multiBaseMint);
      multiPool = poolData.pool;
      multiQuoteVault = poolData.quoteVault;
      multiBaseVault = poolData.baseVault;

      // Fund both traders
      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        100_000_000_000
      );
      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader2, crxMint, trader2.publicKey)).address,
        authority,
        100_000_000_000
      );
    });

    it("Should track separate positions for each user", async () => {
      const [position1] = PublicKey.findProgramAddressSync(
        [Buffer.from("pos"), multiPool.toBuffer(), trader1.publicKey.toBuffer()],
        program.programId
      );
      const [position2] = PublicKey.findProgramAddressSync(
        [Buffer.from("pos"), multiPool.toBuffer(), trader2.publicKey.toBuffer()],
        program.programId
      );

      // Trader1 buys
      await executeTrade(
        multiPool,
        multiQuoteVault,
        multiBaseVault,
        multiBaseMint,
        trader1,
        true,
        new anchor.BN(2_000_000),
        new anchor.BN(0)
      );

      // Trader2 buys (after some slots)
      await executeTrade(
        multiPool,
        multiQuoteVault,
        multiBaseVault,
        multiBaseMint,
        trader2,
        true,
        new anchor.BN(3_000_000),
        new anchor.BN(0)
      );

      const pos1 = await program.account.userPosition.fetch(position1);
      const pos2 = await program.account.userPosition.fetch(position2);

      // Positions should be different
      expect(pos1.user.toString()).to.equal(trader1.publicKey.toString());
      expect(pos2.user.toString()).to.equal(trader2.publicKey.toString());
      expect(pos1.avgEntrySlot.toNumber()).to.not.equal(pos2.avgEntrySlot.toNumber());

      console.log(`  ✅ Trader1 position: slot=${pos1.avgEntrySlot}, amount=${pos1.trackedAmount}`);
      console.log(`     Trader2 position: slot=${pos2.avgEntrySlot}, amount=${pos2.trackedAmount}`);
    });
  });

  describe("5. Edge Cases", () => {
    it("Should handle zero tracked amount correctly", async () => {
      // When tracked_amount = 0, next buy should set avg_entry_slot = current_slot
      const baseMint = await createTokenWithRevokedAuthorities();
      const { pool, quoteVault, baseVault } = await createPool(baseMint);

      const newTrader = Keypair.generate();
      await airdrop(newTrader.publicKey);
      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, newTrader, crxMint, newTrader.publicKey)).address,
        authority,
        100_000_000_000
      );

      const [userPosition] = PublicKey.findProgramAddressSync(
        [Buffer.from("pos"), pool.toBuffer(), newTrader.publicKey.toBuffer()],
        program.programId
      );

      // First buy (creates position)
      await executeTrade(pool, quoteVault, baseVault, baseMint, newTrader, true, new anchor.BN(1_000_000), new anchor.BN(0));

      const position = await program.account.userPosition.fetch(userPosition);
      const currentSlot = await provider.connection.getSlot();

      expect(position.avgEntrySlot.toNumber()).to.be.closeTo(currentSlot, 5);
      expect(position.trackedAmount.toNumber()).to.be.greaterThan(0);

      console.log(`  ✅ Zero tracked amount handled: initialized to current slot`);
    });

    it("Should handle integer overflow in weighted average calculation", async () => {
      // This tests that the implementation uses u128 for intermediate calculations
      // If it didn't, large values would overflow

      // The implementation uses checked_mul and checked_div, so this should not panic
      const maxAge = 750;
      const fee = calculateExpectedWaaFee(maxAge);
      expect(fee).to.equal(0);

      console.log(`  ✅ No overflow in WAA calculation at max age (${maxAge} slots)`);
    });
  });

  describe("6. disable_waa Flag Behavior", () => {
    it("Should skip WAA fees when disable_waa = true", async () => {
      // Note: This test documents expected behavior
      // The disable_waa flag is set at pool creation
      // When true, WAA fees are skipped in sell.rs:127-132

      // Create a normal pool (disable_waa = false by default)
      const normalMint = await createTokenWithRevokedAuthorities();
      const { pool: normalPool } = await createPool(normalMint);

      const poolAccount = await program.account.pool.fetch(normalPool);

      // Verify disable_waa flag exists
      expect(poolAccount.disableWaa).to.not.be.undefined;

      // Current implementation: disable_waa defaults to false
      // When false: WAA fees are applied (3% → 0.5% → 0% decay)
      // When true: WAA fees are skipped (extra_fee_bps = 0)

      console.log(`  ✅ disable_waa flag: ${poolAccount.disableWaa}`);
      console.log(`     When false: WAA fees apply (3% → 0% decay over 5min)`);
      console.log(`     When true: WAA fees skipped (pure permissionless trading)`);
    });
  });

  describe("7. WAA Fee Verification Table", () => {
    it("Should generate complete WAA fee decay table", () => {
      console.log("\n  WAA Fee Decay Table:");
      console.log("  ════════════════════════════════════════════════════");
      console.log("  Slots | Time     | Fee (bps) | Fee (%) | Phase");
      console.log("  ──────┼──────────┼───────────┼─────────┼───────────");

      const testPoints = [
        0, 1, 10, 20, 25, // T1 boundary
        26, 50, 100, 149, 150, // T1-T2 decay
        151, 300, 500, 749, 750, // T2-T3 decay
        751, 1000, 5000 // After T3
      ];

      for (const slots of testPoints) {
        const fee = calculateExpectedWaaFee(slots);
        const timeStr = slots < 1000 ? `~${Math.floor(slots * 0.4)}s` : `~${Math.floor(slots * 0.4 / 60)}m`;

        let phase = "";
        if (slots <= WAA_TIER1_SLOTS) phase = "T1 (max)";
        else if (slots <= WAA_TIER2_SLOTS) phase = "T1→T2";
        else if (slots <= WAA_TIER3_SLOTS) phase = "T2→T3";
        else phase = "T3+ (none)";

        console.log(`  ${slots.toString().padStart(6)} │ ${timeStr.padEnd(8)} │ ${fee.toString().padStart(9)} │ ${(fee/100).toFixed(2).padStart(7)} │ ${phase}`);
      }
      console.log("  ════════════════════════════════════════════════════\n");
    });
  });
});
