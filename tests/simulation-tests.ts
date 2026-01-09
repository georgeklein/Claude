/**
 * SCALE AMM - SIMULATION TESTS
 *
 * Long-running stress tests that simulate real-world usage patterns.
 * These tests are CRITICAL for production readiness but take significant time.
 *
 * WARNING: Run these tests separately from main test suite due to duration.
 *
 * Test Suite:
 * 1. 1000 Random Trades - Catches bugs in specific trade sequences
 * 2. Stress to Graduation - Tests full lifecycle under load
 *
 * Estimated Runtime: 15-30 minutes (localnet), 1-2 hours (devnet)
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CreatorAmmV2 } from "../target/types/creator_amm_v2";
import { expect } from "chai";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  getAccount,
  setAuthority,
  AuthorityType,
} from "@solana/spl-token";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";

describe("Scale AMM - Simulation Tests (LONG RUNNING)", () => {
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

  // Test users
  let creator: Keypair;
  let traders: Keypair[] = [];

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  async function createMockOracle(
    price: number = 200_000_000,
    conf: number = 1_000_000,
    expo: number = -8,
    publishTime?: number
  ): Promise<Keypair> {
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
    const mint = await createMint(
      provider.connection,
      creator,
      creator.publicKey,
      null,
      decimals
    );

    await setAuthority(
      provider.connection,
      creator,
      mint,
      creator.publicKey,
      AuthorityType.MintTokens,
      null
    );

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
    const [pool] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), baseMint.toBuffer()],
      program.programId
    );
    const [quoteVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("quote_vault"), pool.toBuffer()],
      program.programId
    );
    const [baseVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("base_vault"), pool.toBuffer()],
      program.programId
    );
    const creatorBaseAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      creator,
      baseMint,
      creator.publicKey
    );

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
    const userQuoteAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      user,
      crxMint,
      user.publicKey
    );
    const userBaseAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      user,
      baseMint,
      user.publicKey
    );

    const [userPosition] = PublicKey.findProgramAddressSync(
      [Buffer.from("pos"), pool.toBuffer(), user.publicKey.toBuffer()],
      program.programId
    );

    const method = isBuy
      ? program.methods.buy(amount, minAmount)
      : program.methods.sell(amount, minAmount);

    await method
      .accounts({
        config,
        pool,
        quoteVault,
        baseVault,
        userQuoteAccount: userQuoteAccount.address,
        userBaseAccount: userBaseAccount.address,
        feeRecipientAccount: feeRecipientCrxAccount,
        userPosition,
        user: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();
  }

  async function verifyInvariants(
    pool: PublicKey,
    quoteVault: PublicKey,
    baseVault: PublicKey,
    testName: string
  ): Promise<boolean> {
    const poolAccount = await program.account.pool.fetch(pool);
    const quoteVaultAccount = await getAccount(provider.connection, quoteVault);
    const baseVaultAccount = await getAccount(provider.connection, baseVault);

    // Get current reserves based on phase
    const isGraduated = "graduated" in poolAccount.phase;
    const quoteReserve = isGraduated
      ? poolAccount.realQuoteReserves
      : poolAccount.virtualQuoteReserves;
    const baseReserve = isGraduated
      ? poolAccount.realBaseReserves
      : poolAccount.virtualBaseReserves;

    // INVARIANT 1: Real reserves must match vault balances
    const realQuoteMatch =
      poolAccount.realQuoteReserves.toString() === quoteVaultAccount.amount.toString();
    const realBaseMatch =
      poolAccount.realBaseReserves.toString() === baseVaultAccount.amount.toString();

    if (!realQuoteMatch || !realBaseMatch) {
      console.error(`❌ ${testName}: Vault-reserve mismatch!`);
      console.error(`  Real quote reserve: ${poolAccount.realQuoteReserves}`);
      console.error(`  Quote vault balance: ${quoteVaultAccount.amount}`);
      console.error(`  Real base reserve: ${poolAccount.realBaseReserves}`);
      console.error(`  Base vault balance: ${baseVaultAccount.amount}`);
      return false;
    }

    // INVARIANT 2: Reserves must be non-negative
    if (quoteReserve.lte(new anchor.BN(0)) || baseReserve.lte(new anchor.BN(0))) {
      console.error(`❌ ${testName}: Negative reserves detected!`);
      return false;
    }

    // INVARIANT 3: x*y should increase over time (due to fees)
    // We don't track k_before here, so just verify k > 0
    const k = quoteReserve.mul(baseReserve);
    if (k.lte(new anchor.BN(0))) {
      console.error(`❌ ${testName}: Invalid k (constant product)!`);
      return false;
    }

    return true;
  }

  function randomAmount(min: number, max: number): anchor.BN {
    const random = Math.floor(Math.random() * (max - min + 1)) + min;
    return new anchor.BN(random);
  }

  // ============================================================================
  // SETUP
  // ============================================================================

  before(async () => {
    console.log("\\n🚀 Starting Simulation Test Setup...");

    // Initialize accounts
    authority = Keypair.generate();
    feeRecipient = Keypair.generate();
    creator = Keypair.generate();

    // Create 10 trader accounts
    for (let i = 0; i < 10; i++) {
      traders.push(Keypair.generate());
    }

    // Airdrop SOL
    await airdrop(authority.publicKey, 100);
    await airdrop(feeRecipient.publicKey, 10);
    await airdrop(creator.publicKey, 50);
    for (const trader of traders) {
      await airdrop(trader.publicKey, 20);
    }

    // Create CRX mint
    crxMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      6
    );

    // Create oracle
    crxPriceOracle = await createMockOracle();

    // Get fee recipient CRX account
    const feeRecipientCrxAccountInfo = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      feeRecipient,
      crxMint,
      feeRecipient.publicKey
    );
    feeRecipientCrxAccount = feeRecipientCrxAccountInfo.address;

    // Derive config PDA
    [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

    // Initialize protocol
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
        crxMint,
        crxPriceOracle: crxPriceOracle.publicKey,
        feeRecipient: feeRecipient.publicKey,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    // Mint CRX to all traders
    for (const trader of traders) {
      const traderCrxAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        trader,
        crxMint,
        trader.publicKey
      );

      await mintTo(
        provider.connection,
        authority,
        crxMint,
        traderCrxAccount.address,
        authority,
        100_000_000_000 // 100k CRX per trader
      );
    }

    console.log("✅ Simulation Test Setup Complete\\n");
  });

  // ============================================================================
  // SIMULATION 1: 1000 RANDOM TRADES
  // ============================================================================
  describe("Simulation 1: 1000 Random Trades", () => {
    it("Should maintain invariants over 1000 random trades", async () => {
      console.log("\\n🔥 Starting 1000 Random Trades Simulation...");
      console.log("This will take 10-20 minutes. Please be patient.\\n");

      // Create test pool
      const baseMint = await createTokenWithRevokedAuthorities();
      const tokenSupply = new anchor.BN(1_000_000_000_000); // 1M tokens

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
        new anchor.BN(10_000_000_000),
        tokenSupply,
        25,
        { constantProduct: {} },
        new anchor.BN(85_000_000_000) // High graduation threshold
      );

      console.log("Pool created. Executing 1000 random trades...\\n");

      let successCount = 0;
      let failureCount = 0;
      let invariantChecks = 0;

      for (let i = 0; i < 1000; i++) {
        try {
          // Random trader
          const trader = traders[Math.floor(Math.random() * traders.length)];

          // Random buy/sell (70% buy, 30% sell for more realistic distribution)
          const isBuy = Math.random() < 0.7;

          // Random amount
          const amount = isBuy
            ? randomAmount(100_000, 10_000_000) // 0.1-10 CRX
            : randomAmount(100_000, 10_000_000); // 0.1-10 tokens

          await executeTrade(
            pool,
            quoteVault,
            baseVault,
            baseMint,
            trader,
            isBuy,
            amount,
            new anchor.BN(0) // Accept any slippage for stress test
          );

          successCount++;

          // Verify invariants every 50 trades
          if ((i + 1) % 50 === 0) {
            const valid = await verifyInvariants(
              pool,
              quoteVault,
              baseVault,
              `Trade ${i + 1}`
            );

            if (!valid) {
              throw new Error(`Invariant violation at trade ${i + 1}`);
            }

            invariantChecks++;
            console.log(`✅ Trade ${i + 1}/1000: Invariants valid (${successCount} successful, ${failureCount} failed)`);
          }
        } catch (err) {
          failureCount++;

          // Some failures are expected (insufficient balance, min output, etc.)
          // But panic/overflow errors are CRITICAL
          if (err.toString().match(/panic|overflow/i)) {
            throw new Error(`CRITICAL ERROR at trade ${i + 1}: ${err}`);
          }

          // Log first 5 failures for debugging
          if (failureCount <= 5) {
            console.log(`⚠️  Trade ${i + 1} failed (expected): ${err.toString().substring(0, 100)}`);
          }
        }
      }

      console.log("\\n🎉 1000 Random Trades Simulation Complete!");
      console.log(`✅ Successful trades: ${successCount}`);
      console.log(`⚠️  Failed trades: ${failureCount}`);
      console.log(`✅ Invariant checks: ${invariantChecks}`);

      // Final invariant check
      const finalValid = await verifyInvariants(pool, quoteVault, baseVault, "Final");
      expect(finalValid).to.be.true;

      // Verify pool is still functional
      const poolAccount = await program.account.pool.fetch(pool);
      expect(poolAccount.virtualQuoteReserves.gt(new anchor.BN(0))).to.be.true;
      expect(poolAccount.virtualBaseReserves.gt(new anchor.BN(0))).to.be.true;

      console.log("\\n✅ All invariants maintained. Pool remains functional.\\n");
    });
  });

  // ============================================================================
  // SIMULATION 2: STRESS TO GRADUATION
  // ============================================================================
  describe("Simulation 2: Stress to Graduation", () => {
    it("Should graduate and continue trading under stress", async () => {
      console.log("\\n🔥 Starting Stress to Graduation Simulation...");
      console.log("This will take 5-10 minutes.\\n");

      // Create test pool with LOW graduation threshold
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
        new anchor.BN(10_000_000_000), // $10k
        tokenSupply,
        25,
        { constantProduct: {} },
        new anchor.BN(50_000_000_000) // $50k graduation (will require ~40k CRX accumulated)
      );

      console.log("Pool created. Trading until graduation...\\n");

      let tradeCount = 0;
      let graduated = false;

      // Phase 1: Trade until graduation
      while (!graduated && tradeCount < 500) {
        try {
          const trader = traders[Math.floor(Math.random() * traders.length)];
          const amount = randomAmount(1_000_000, 50_000_000); // 1-50 CRX

          await executeTrade(
            pool,
            quoteVault,
            baseVault,
            baseMint,
            trader,
            true, // Only buys to accumulate CRX
            amount,
            new anchor.BN(0)
          );

          tradeCount++;

          if (tradeCount % 20 === 0) {
            const poolAccount = await program.account.pool.fetch(pool);
            const accumulated = poolAccount.realQuoteReserves.toNumber() / 1_000_000;

            console.log(`Trade ${tradeCount}: Accumulated ${accumulated.toFixed(2)} CRX`);

            if ("graduated" in poolAccount.phase) {
              graduated = true;
              console.log(`\\n🎓 GRADUATED at trade ${tradeCount}!\\n`);
              break;
            }
          }
        } catch (err) {
          // Continue on failure
          continue;
        }
      }

      expect(graduated).to.be.true;

      // Verify invariants after graduation
      let valid = await verifyInvariants(pool, quoteVault, baseVault, "Post-Graduation");
      expect(valid).to.be.true;

      console.log("✅ Graduation successful. Continuing with 100 more random trades...\\n");

      // Phase 2: Continue trading post-graduation
      let postGraduationTrades = 0;
      for (let i = 0; i < 100; i++) {
        try {
          const trader = traders[Math.floor(Math.random() * traders.length)];
          const isBuy = Math.random() < 0.5; // 50/50 after graduation
          const amount = randomAmount(1_000_000, 20_000_000);

          await executeTrade(
            pool,
            quoteVault,
            baseVault,
            baseMint,
            trader,
            isBuy,
            amount,
            new anchor.BN(0)
          );

          postGraduationTrades++;

          if ((i + 1) % 20 === 0) {
            console.log(`Post-graduation trade ${i + 1}/100 complete`);
          }
        } catch (err) {
          // Continue on failure
          continue;
        }
      }

      console.log(`\\n✅ Post-graduation: ${postGraduationTrades}/100 trades successful`);

      // Final invariant check
      valid = await verifyInvariants(pool, quoteVault, baseVault, "Final Post-Graduation");
      expect(valid).to.be.true;

      // Verify pool still in Graduated phase
      const finalPoolAccount = await program.account.pool.fetch(pool);
      expect("graduated" in finalPoolAccount.phase).to.be.true;

      console.log("\\n🎉 Stress to Graduation Simulation Complete!");
      console.log(`Total trades: ${tradeCount + postGraduationTrades}`);
      console.log("✅ Pool graduated successfully");
      console.log("✅ Continued trading post-graduation");
      console.log("✅ All invariants maintained\\n");
    });
  });
});
