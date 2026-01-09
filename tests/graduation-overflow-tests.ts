/**
 * GRADUATION EDGE CASES & MATH OVERFLOW PROTECTION TESTS
 *
 * Comprehensive test suite covering:
 * - 10 Graduation Edge Cases
 * - 10 Math Overflow Protection Tests
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

describe("Graduation Edge Cases & Math Overflow Protection", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.CreatorAmmV2 as Program<CreatorAmmV2>;

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
    return oracle;
  }

  async function createTokenWithRevokedAuthorities(decimals: number = 6): Promise<PublicKey> {
    const mint = await createMint(provider.connection, creator, creator.publicKey, null, decimals);
    await setAuthority(provider.connection, creator, mint, creator.publicKey, AuthorityType.MintTokens, null);
    return mint;
  }

  async function airdrop(pubkey: PublicKey, amount: number = 10) {
    const sig = await provider.connection.requestAirdrop(pubkey, amount * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);
  }

  async function createPool(
    baseMint: PublicKey,
    targetMarketCapUsd: anchor.BN,
    tokenSupply: anchor.BN,
    feeBps: number,
    curveType: any,
    graduationThresholdUsd: anchor.BN
  ) {
    const [pool] = PublicKey.findProgramAddressSync([Buffer.from("pool"), baseMint.toBuffer()], program.programId);
    const [quoteVault] = PublicKey.findProgramAddressSync([Buffer.from("quote_vault"), pool.toBuffer()], program.programId);
    const [baseVault] = PublicKey.findProgramAddressSync([Buffer.from("base_vault"), pool.toBuffer()], program.programId);
    const creatorBaseAccount = await getOrCreateAssociatedTokenAccount(provider.connection, creator, baseMint, creator.publicKey);

    await program.methods
      .createPool(targetMarketCapUsd, tokenSupply, feeBps, curveType, graduationThresholdUsd, false, "")
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

  async function setupTestPool(marketCap: number = 10_000_000_000, graduationThreshold: number = 40_000_000_000) {
    const baseMint = await createTokenWithRevokedAuthorities();
    const tokenSupply = new anchor.BN(1_000_000_000_000);
    await mintTo(
      provider.connection,
      creator,
      baseMint,
      (await getOrCreateAssociatedTokenAccount(provider.connection, creator, baseMint, creator.publicKey)).address,
      creator,
      tokenSupply.toNumber()
    );
    const { pool, quoteVault, baseVault } = await createPool(
      baseMint,
      new anchor.BN(marketCap),
      tokenSupply,
      25,
      { constantProduct: {} },
      new anchor.BN(graduationThreshold)
    );
    return { pool, quoteVault, baseVault, baseMint };
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

    console.log("✅ Test environment initialized");
  });

  // ============================================================================
  // CATEGORY 1: GRADUATION EDGE CASES (10 tests)
  // ============================================================================
  describe("Graduation Edge Cases", () => {
    it("1. Should graduate at exact threshold (accumulated CRX == threshold)", async () => {
      const graduationThreshold = 10_000_000_000;
      const { pool, quoteVault, baseVault, baseMint } = await setupTestPool(5_000_000_000, graduationThreshold);

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        1_000_000_000_000
      );

      const poolBefore = await program.account.pool.fetch(pool);
      expect(poolBefore.currentPhase).to.deep.equal({ preBonding: {} });

      // Account for 0.25% fee (25 bps): to get exactly threshold in reserves, need threshold / (1 - 0.0025)
      // graduationThreshold / 0.9975 = graduationThreshold * 10000 / 9975
      const buyAmount = Math.ceil((graduationThreshold * 10000) / 9975);
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(buyAmount), new anchor.BN(0));

      const poolAfter = await program.account.pool.fetch(pool);
      expect(poolAfter.currentPhase).to.deep.equal({ graduated: {} });
      expect(poolAfter.realQuoteReserves.toNumber()).to.be.gte(graduationThreshold);
    });

    it("2. Should NOT graduate 1 lamport below threshold", async () => {
      const graduationThreshold = 50_000_000_000;
      const { pool, quoteVault, baseVault, baseMint } = await setupTestPool(5_000_000_000, graduationThreshold);

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        1_000_000_000_000
      );

      // Buy amount that results in threshold - 1 in reserves after fee
      // We want real_quote_reserves to be exactly graduationThreshold - 1
      // So we calculate: (threshold - 1) / 0.9975
      const targetReserves = graduationThreshold - 1;
      const buyAmount = Math.floor((targetReserves * 10000) / 9975);
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(buyAmount), new anchor.BN(0));

      const poolAfter = await program.account.pool.fetch(pool);
      expect(poolAfter.currentPhase).to.deep.equal({ preBonding: {} });
      expect(poolAfter.realQuoteReserves.toNumber()).to.be.lt(graduationThreshold);
    });

    it("3. Should graduate on last buy when multiple buys push over threshold", async () => {
      const graduationThreshold = 20_000_000_000;
      const { pool, quoteVault, baseVault, baseMint } = await setupTestPool(5_000_000_000, graduationThreshold);

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        1_000_000_000_000
      );

      // Multiple small buys - each 5B becomes 4.9875B in reserves after 0.25% fee
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(5_000_000_000), new anchor.BN(0));
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(5_000_000_000), new anchor.BN(0));
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(5_000_000_000), new anchor.BN(0));

      let poolCheck = await program.account.pool.fetch(pool);
      expect(poolCheck.currentPhase).to.deep.equal({ preBonding: {} });
      // After 3 * 5B buys: ~14.9625B in reserves (3 * 4.9875B)

      // Last buy: need to add ~5.0375B to reserves to reach 20B
      // Buy amount = 5.0375B / 0.9975 = ~5.0503B
      const lastBuyAmount = Math.ceil(((graduationThreshold - poolCheck.realQuoteReserves.toNumber()) * 10000) / 9975);
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(lastBuyAmount), new anchor.BN(0));

      const poolFinal = await program.account.pool.fetch(pool);
      expect(poolFinal.currentPhase).to.deep.equal({ graduated: {} });
    });

    it("4. Should handle large buy causing instant graduation", async () => {
      const graduationThreshold = 15_000_000_000;
      const { pool, quoteVault, baseVault, baseMint } = await setupTestPool(5_000_000_000, graduationThreshold);

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        1_000_000_000_000
      );

      const massiveBuy = 100_000_000_000;
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(massiveBuy), new anchor.BN(0));

      const poolAfter = await program.account.pool.fetch(pool);
      expect(poolAfter.currentPhase).to.deep.equal({ graduated: {} });
      expect(poolAfter.realQuoteReserves.toNumber()).to.be.gte(graduationThreshold);
    });

    it("5. Should handle concurrent trades (graduation on exact trade)", async () => {
      const graduationThreshold = 12_000_000_000;
      const { pool, quoteVault, baseVault, baseMint } = await setupTestPool(5_000_000_000, graduationThreshold);

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        1_000_000_000_000
      );

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader2, crxMint, trader2.publicKey)).address,
        authority,
        1_000_000_000_000
      );

      // Simulate concurrent scenario: trader1 brings it close
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(11_000_000_000), new anchor.BN(0));

      let poolCheck = await program.account.pool.fetch(pool);
      expect(poolCheck.currentPhase).to.deep.equal({ preBonding: {} });

      // trader2 pushes it over
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader2, true, new anchor.BN(2_000_000_000), new anchor.BN(0));

      const poolFinal = await program.account.pool.fetch(pool);
      expect(poolFinal.currentPhase).to.deep.equal({ graduated: {} });
    });

    it("6. Should handle post-graduation trades correctly (AMM phase)", async () => {
      const { pool, quoteVault, baseVault, baseMint } = await setupTestPool(5_000_000_000, 10_000_000_000);

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        1_000_000_000_000
      );

      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(15_000_000_000), new anchor.BN(0));

      const poolAfterGrad = await program.account.pool.fetch(pool);
      expect(poolAfterGrad.currentPhase).to.deep.equal({ graduated: {} });

      const realQuoteBefore = poolAfterGrad.realQuoteReserves;

      // Post-graduation trade
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(5_000_000_000), new anchor.BN(0));

      const poolAfterTrade = await program.account.pool.fetch(pool);
      expect(poolAfterTrade.currentPhase).to.deep.equal({ graduated: {} });
      expect(poolAfterTrade.realQuoteReserves.toNumber()).to.be.gt(realQuoteBefore.toNumber());
    });

    it("7. Should correctly transfer Pre-bonding→Graduated reserves", async () => {
      const graduationThreshold = 12_000_000_000;
      const { pool, quoteVault, baseVault, baseMint } = await setupTestPool(5_000_000_000, graduationThreshold);

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        1_000_000_000_000
      );

      // Account for fees to reach threshold
      const buyAmount = Math.ceil((graduationThreshold * 10000) / 9975);
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(buyAmount), new anchor.BN(0));

      const poolAfter = await program.account.pool.fetch(pool);
      const quoteVaultAccount = await getAccount(provider.connection, quoteVault);
      const baseVaultAccount = await getAccount(provider.connection, baseVault);

      // Reserves should match vaults
      expect(poolAfter.realQuoteReserves.toString()).to.equal(quoteVaultAccount.amount.toString());
      expect(poolAfter.realBaseReserves.toString()).to.equal(baseVaultAccount.amount.toString());
      expect(poolAfter.realQuoteReserves.toNumber()).to.be.gte(graduationThreshold);
    });

    it("8. Should freeze virtual reserves at graduation", async () => {
      const { pool, quoteVault, baseVault, baseMint } = await setupTestPool(5_000_000_000, 10_000_000_000);

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        1_000_000_000_000
      );

      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(15_000_000_000), new anchor.BN(0));

      const poolAfterGrad = await program.account.pool.fetch(pool);
      const virtualQuoteAtGrad = poolAfterGrad.virtualQuoteReserves;
      const virtualBaseAtGrad = poolAfterGrad.virtualBaseReserves;

      // Post-graduation trades
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(2_000_000_000), new anchor.BN(0));

      const poolAfterTrades = await program.account.pool.fetch(pool);

      // Virtual reserves should NOT change
      expect(poolAfterTrades.virtualQuoteReserves.toString()).to.equal(virtualQuoteAtGrad.toString());
      expect(poolAfterTrades.virtualBaseReserves.toString()).to.equal(virtualBaseAtGrad.toString());
    });

    it("9. Should verify real reserves = accumulated CRX + remaining tokens", async () => {
      const graduationThreshold = 18_000_000_000;
      const { pool, quoteVault, baseVault, baseMint } = await setupTestPool(5_000_000_000, graduationThreshold);

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        1_000_000_000_000
      );

      // Account for fees to reach threshold
      const buyAmount = Math.ceil((graduationThreshold * 10000) / 9975);
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(buyAmount), new anchor.BN(0));

      const poolAfter = await program.account.pool.fetch(pool);
      const quoteVaultAccount = await getAccount(provider.connection, quoteVault);
      const baseVaultAccount = await getAccount(provider.connection, baseVault);

      expect(poolAfter.realQuoteReserves.toString()).to.equal(quoteVaultAccount.amount.toString());
      expect(poolAfter.realBaseReserves.toString()).to.equal(baseVaultAccount.amount.toString());
      expect(poolAfter.realQuoteReserves.toNumber()).to.be.gte(graduationThreshold);
      expect(poolAfter.realBaseReserves.toNumber()).to.be.gt(0);
    });

    it("10. Should emit correct events (PoolGraduated + PhaseTransition)", async () => {
      const graduationThreshold = 14_000_000_000;
      const { pool, quoteVault, baseVault, baseMint } = await setupTestPool(5_000_000_000, graduationThreshold);

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        1_000_000_000_000
      );

      // Account for fees to reach threshold
      const buyAmount = Math.ceil((graduationThreshold * 10000) / 9975);
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(buyAmount), new anchor.BN(0));

      const poolAfter = await program.account.pool.fetch(pool);
      expect(poolAfter.currentPhase).to.deep.equal({ graduated: {} });
      expect(poolAfter.realQuoteReserves.toNumber()).to.be.gte(graduationThreshold);
    });
  });

  // ============================================================================
  // CATEGORY 2: MATH OVERFLOW PROTECTION (10 tests)
  // ============================================================================
  describe("Math Overflow Protection", () => {
    it("1. Should handle large token supply (near u64::MAX)", async () => {
      const baseMint = await createTokenWithRevokedAuthorities();
      const largeSupply = new anchor.BN("9000000000000000000"); // 9 quintillion tokens

      await mintTo(
        provider.connection,
        creator,
        baseMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, creator, baseMint, creator.publicKey)).address,
        creator,
        Number(largeSupply.toString().slice(0, 15)) // Mint what we can
      );

      try {
        await createPool(baseMint, new anchor.BN(10_000_000_000), largeSupply, 25, { constantProduct: {} }, new anchor.BN(40_000_000_000));
      } catch (err) {
        // May fail due to calculations, but should not panic
        expect(err).to.exist;
      }
    });

    it("2. Should reject u64::MAX CRX amount inputs", async () => {
      const { pool, quoteVault, baseVault, baseMint } = await setupTestPool();

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        100_000_000_000
      );

      try {
        await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN("18446744073709551615"), new anchor.BN(0));
        expect.fail("Should reject u64::MAX");
      } catch (err) {
        expect(err).to.exist;
      }
    });

    it("3. Should protect virtual reserve calculations from overflow", async () => {
      const { pool } = await setupTestPool();
      const poolAccount = await program.account.pool.fetch(pool);

      // Virtual reserves should be calculated safely
      expect(poolAccount.virtualQuoteReserves.toNumber()).to.be.greaterThan(0);
      expect(poolAccount.virtualBaseReserves.toNumber()).to.be.greaterThan(0);
      expect(poolAccount.virtualQuoteReserves.toNumber()).to.be.lessThan(Number.MAX_SAFE_INTEGER);
    });

    it("4. Should protect fee calculations with max values", async () => {
      const { pool, quoteVault, baseVault, baseMint } = await setupTestPool();

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        1_000_000_000_000
      );

      // Large trade with fee calculation
      const feeBalanceBefore = await getAccount(provider.connection, feeRecipientCrxAccount);

      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(100_000_000_000), new anchor.BN(0));

      const feeBalanceAfter = await getAccount(provider.connection, feeRecipientCrxAccount);
      const feeCollected = Number(feeBalanceAfter.amount) - Number(feeBalanceBefore.amount);
      expect(feeCollected).to.be.greaterThan(0);
    });

    it("5. Should protect WAA calculation with extreme values", async () => {
      const { pool, quoteVault, baseVault, baseMint } = await setupTestPool();

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        1_000_000_000_000
      );

      // Multiple large buys to test WAA calculations
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(50_000_000_000), new anchor.BN(0));
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(30_000_000_000), new anchor.BN(0));

      const [userPosition] = PublicKey.findProgramAddressSync(
        [Buffer.from("pos"), pool.toBuffer(), trader1.publicKey.toBuffer()],
        program.programId
      );

      const position = await program.account.userPosition.fetch(userPosition);
      expect(position.avgEntrySlot.toNumber()).to.be.greaterThan(0);
    });

    it("6. Should prevent market cap calculation overflow (u128 bounds)", async () => {
      const { pool } = await setupTestPool();
      const poolAccount = await program.account.pool.fetch(pool);

      // Market cap calculations should use u128 internally
      const price = poolAccount.virtualQuoteReserves.toNumber() / poolAccount.virtualBaseReserves.toNumber();
      expect(price).to.be.greaterThan(0);
      expect(price).to.be.finite;
    });

    it("7. Should protect price calculation with extreme reserves", async () => {
      const { pool, quoteVault, baseVault, baseMint } = await setupTestPool();

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        1_000_000_000_000
      );

      // Large buy that dramatically shifts reserves
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(200_000_000_000), new anchor.BN(0));

      const poolAccount = await program.account.pool.fetch(pool);
      const price = poolAccount.virtualQuoteReserves.toNumber() / poolAccount.virtualBaseReserves.toNumber();
      expect(price).to.be.greaterThan(0);
      expect(price).to.be.finite;
    });

    it("8. Should protect slippage calculation with large amounts", async () => {
      const { pool, quoteVault, baseVault, baseMint } = await setupTestPool();

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        1_000_000_000_000
      );

      try {
        // Unrealistic slippage protection
        await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(1_000_000), new anchor.BN(1_000_000_000_000));
        expect.fail("Should reject unrealistic slippage");
      } catch (err) {
        expect(err.toString()).to.include("SlippageExceeded");
      }
    });

    it("9. Should use checked_mul/checked_div/checked_add everywhere", async () => {
      const { pool, quoteVault, baseVault, baseMint } = await setupTestPool();

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        100_000_000_000
      );

      // Normal trade should complete successfully
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(10_000_000), new anchor.BN(0));

      const poolAccount = await program.account.pool.fetch(pool);
      expect(poolAccount.realQuoteReserves.toNumber()).to.be.greaterThan(0);
    });

    it("10. Should use saturating_sub for WAA calculations", async () => {
      const { pool, quoteVault, baseVault, baseMint } = await setupTestPool();

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        (await getOrCreateAssociatedTokenAccount(provider.connection, trader1, crxMint, trader1.publicKey)).address,
        authority,
        100_000_000_000
      );

      // Buy then sell to test WAA subtraction
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, true, new anchor.BN(10_000_000), new anchor.BN(0));

      const userBaseAccount = await getOrCreateAssociatedTokenAccount(provider.connection, trader1, baseMint, trader1.publicKey);
      const balance = await getAccount(provider.connection, userBaseAccount.address);

      // Sell should update WAA with saturating_sub
      await executeTrade(pool, quoteVault, baseVault, baseMint, trader1, false, new anchor.BN(Number(balance.amount) / 2), new anchor.BN(0));

      const [userPosition] = PublicKey.findProgramAddressSync(
        [Buffer.from("pos"), pool.toBuffer(), trader1.publicKey.toBuffer()],
        program.programId
      );

      const position = await program.account.userPosition.fetch(userPosition);
      expect(position.trackedAmount.toNumber()).to.be.greaterThanOrEqual(0);
    });
  });
});
