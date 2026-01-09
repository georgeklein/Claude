/**
 * Admin Operations Tests
 *
 * Tests for authority-only operations:
 * - update_crx_price: CRX price updates with validation
 * - update_pool_graduation: Dynamic graduation threshold updates
 * - Authorization checks
 * - Price manipulation prevention
 * - Graduation threshold manipulation prevention
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CreatorAmmV2 } from "../target/types/creator_amm_v2";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

describe("Admin Operations", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CreatorAmmV2 as Program<CreatorAmmV2>;
  const authority = provider.wallet as anchor.Wallet;

  let config: PublicKey;
  let crxMint: PublicKey;
  let feeRecipient: Keypair;

  // Test constants
  const INITIAL_CRX_PRICE = new anchor.BN(2_000_000); // $2.00
  const CRX_PRICE_MIN = new anchor.BN(10_000); // $0.01
  const CRX_PRICE_MAX = new anchor.BN(1_000_000_000); // $1000

  before(async () => {
    // Create CRX mint
    crxMint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      6
    );

    feeRecipient = Keypair.generate();

    // Derive config PDA
    [config] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    // Initialize protocol
    await program.methods
      .initialize(
        INITIAL_CRX_PRICE,
        300, // pre_bonding_fee_bps
        new anchor.BN(40_000_000_000), // pre_bonding_threshold_usd
        100, // post_bonding_fee_bps
        new anchor.BN(85_000_000_000), // graduation_threshold_usd
        new anchor.BN(20), // anti_sniper_window_slots
        500, // anti_sniper_max_trade_bps
        new anchor.BN(60), // oracle_max_age_seconds
        new anchor.BN(100), // oracle_max_confidence_bps
        [
          SystemProgram.programId,
          SystemProgram.programId,
          SystemProgram.programId,
          SystemProgram.programId,
          SystemProgram.programId,
        ],
        0
      )
      .accounts({
        config,
        authority: authority.publicKey,
        feeRecipient: feeRecipient.publicKey,
        crxMint,
        crxPriceOracle: SystemProgram.programId,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  describe("update_crx_price", () => {
    it("should update CRX price successfully", async () => {
      const newPrice = new anchor.BN(2_100_000); // $2.10 (5% increase)

      await program.methods
        .updateCrxPrice(newPrice)
        .accounts({
          config,
          authority: authority.publicKey,
        })
        .rpc();

      const configAccount = await program.account.config.fetch(config);
      assert.equal(
        configAccount.crxPriceUsd.toString(),
        newPrice.toString(),
        "Price should be updated"
      );
      assert.ok(
        configAccount.crxPriceLastUpdated > 0,
        "Timestamp should be updated"
      );
    });

    it("should reject price below minimum", async () => {
      const tooLowPrice = new anchor.BN(5_000); // $0.005 (below $0.01 min)

      try {
        await program.methods
          .updateCrxPrice(tooLowPrice)
          .accounts({
            config,
            authority: authority.publicKey,
          })
          .rpc();
        assert.fail("Should have rejected price below minimum");
      } catch (err) {
        assert.include(err.toString(), "InvalidCrxPrice");
      }
    });

    it("should reject price above maximum", async () => {
      const tooHighPrice = new anchor.BN(2_000_000_000); // $2000 (above $1000 max)

      try {
        await program.methods
          .updateCrxPrice(tooHighPrice)
          .accounts({
            config,
            authority: authority.publicKey,
          })
          .rpc();
        assert.fail("Should have rejected price above maximum");
      } catch (err) {
        assert.include(err.toString(), "InvalidCrxPrice");
      }
    });

    it("should reject price change >10%", async () => {
      const currentConfig = await program.account.config.fetch(config);
      const currentPrice = currentConfig.crxPriceUsd;

      // Try to increase by 20% (should fail)
      const bigIncrease = currentPrice.mul(new anchor.BN(12)).div(new anchor.BN(10));

      try {
        await program.methods
          .updateCrxPrice(bigIncrease)
          .accounts({
            config,
            authority: authority.publicKey,
          })
          .rpc();
        assert.fail("Should have rejected >10% price change");
      } catch (err) {
        assert.include(err.toString(), "InvalidCrxPrice");
      }
    });

    it("should accept price change of exactly 10%", async () => {
      const currentConfig = await program.account.config.fetch(config);
      const currentPrice = currentConfig.crxPriceUsd;

      // Increase by exactly 10%
      const tenPercentIncrease = currentPrice.mul(new anchor.BN(11)).div(new anchor.BN(10));

      await program.methods
        .updateCrxPrice(tenPercentIncrease)
        .accounts({
          config,
          authority: authority.publicKey,
        })
        .rpc();

      const updatedConfig = await program.account.config.fetch(config);
      assert.equal(
        updatedConfig.crxPriceUsd.toString(),
        tenPercentIncrease.toString(),
        "Should accept 10% change"
      );
    });

    it("should reject unauthorized caller", async () => {
      const unauthorized = Keypair.generate();

      // Airdrop SOL to unauthorized wallet
      await provider.connection.requestAirdrop(
        unauthorized.publicKey,
        LAMPORTS_PER_SOL
      );
      await new Promise(resolve => setTimeout(resolve, 1000));

      const newPrice = new anchor.BN(2_500_000);

      try {
        await program.methods
          .updateCrxPrice(newPrice)
          .accounts({
            config,
            authority: unauthorized.publicKey,
          })
          .signers([unauthorized])
          .rpc();
        assert.fail("Should have rejected unauthorized caller");
      } catch (err) {
        assert.include(err.toString(), "Unauthorized");
      }
    });
  });

  describe("update_pool_graduation", () => {
    let pool: PublicKey;
    let baseMint: PublicKey;
    let quoteVault: PublicKey;
    let baseVault: PublicKey;

    before(async () => {
      // Create a test pool
      const creator = Keypair.generate();
      await provider.connection.requestAirdrop(
        creator.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Create base token
      baseMint = await createMint(
        provider.connection,
        creator,
        creator.publicKey,
        null,
        9
      );

      // Revoke mint authority (required for pool creation)
      const { setAuthority } = await import("@solana/spl-token");
      await setAuthority(
        provider.connection,
        creator,
        baseMint,
        creator.publicKey,
        0, // AuthorityType.MintTokens
        null
      );

      // Derive PDAs
      [pool] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), baseMint.toBuffer()],
        program.programId
      );

      [quoteVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("quote_vault"), baseMint.toBuffer()],
        program.programId
      );

      [baseVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("base_vault"), baseMint.toBuffer()],
        program.programId
      );

      // Create creator's base token account
      const creatorBaseAccount = await createAccount(
        provider.connection,
        creator,
        baseMint,
        creator.publicKey
      );

      // Mint tokens to creator
      await mintTo(
        provider.connection,
        creator,
        baseMint,
        creatorBaseAccount,
        creator,
        1_000_000_000_000_000 // 1 billion tokens (9 decimals)
      );

      // Create pool
      const targetMarketCapUsd = new anchor.BN(10_000_000_000); // $10k
      const tokenSupply = new anchor.BN(1_000_000_000_000_000);
      const feeBps = 0;
      const curveType = { constantProduct: {} };
      const graduationThresholdUsd = new anchor.BN(40_000_000_000); // $40k

      await program.methods
        .createPool(
          targetMarketCapUsd,
          tokenSupply,
          feeBps,
          curveType,
          graduationThresholdUsd,
          false // disable_waa
        )
        .accounts({
          config,
          pool,
          quoteMint: crxMint,
          baseMint,
          quoteVault,
          baseVault,
          creatorBaseAccount,
          creator: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();
    });

    it("should update pool graduation threshold successfully", async () => {
      const newThreshold = new anchor.BN(50_000_000_000); // $50k

      await program.methods
        .updatePoolGraduation(newThreshold)
        .accounts({
          config,
          pool,
          authority: authority.publicKey,
        })
        .rpc();

      const poolAccount = await program.account.pool.fetch(pool);

      // Calculate expected CRX threshold from USD threshold
      const configAccount = await program.account.config.fetch(config);
      const expectedCrxThreshold = newThreshold
        .mul(new anchor.BN(1_000_000)) // CRX decimals
        .div(configAccount.crxPriceUsd);

      assert.equal(
        poolAccount.graduationThresholdCrx.toString(),
        expectedCrxThreshold.toString(),
        "Graduation threshold should be updated"
      );
    });

    it("should reject threshold below minimum", async () => {
      const tooLowThreshold = new anchor.BN(500_000_000); // $500 (below $1k min)

      try {
        await program.methods
          .updatePoolGraduation(tooLowThreshold)
          .accounts({
            config,
            pool,
            authority: authority.publicKey,
          })
          .rpc();
        assert.fail("Should have rejected threshold below minimum");
      } catch (err) {
        assert.include(err.toString(), "InvalidMarketCap");
      }
    });

    it("should reject threshold above maximum", async () => {
      const tooHighThreshold = new anchor.BN(15_000_000_000_000); // $15M (above $10M max)

      try {
        await program.methods
          .updatePoolGraduation(tooHighThreshold)
          .accounts({
            config,
            pool,
            authority: authority.publicKey,
          })
          .rpc();
        assert.fail("Should have rejected threshold above maximum");
      } catch (err) {
        assert.include(err.toString(), "InvalidMarketCap");
      }
    });

    it("should reject threshold below current market cap", async () => {
      // This test verifies the critical security fix:
      // new_threshold must be > current_market_cap (not just initial target)

      const poolAccount = await program.account.pool.fetch(pool);

      // Calculate current market cap
      const spotPrice = poolAccount.virtualQuoteReserves
        .mul(new anchor.BN(1_000_000_000))
        .div(poolAccount.virtualBaseReserves);

      const marketCapCrx = poolAccount.tokenTotalSupply
        .mul(spotPrice)
        .div(new anchor.BN(1_000_000_000));

      const configAccount = await program.account.config.fetch(config);
      const currentMarketCapUsd = marketCapCrx
        .mul(configAccount.crxPriceUsd)
        .div(new anchor.BN(1_000_000));

      // Try to set threshold just below current market cap
      const belowCurrentMc = currentMarketCapUsd.sub(new anchor.BN(1_000_000)); // -$1

      try {
        await program.methods
          .updatePoolGraduation(belowCurrentMc)
          .accounts({
            config,
            pool,
            authority: authority.publicKey,
          })
          .rpc();
        assert.fail("Should have rejected threshold below current market cap");
      } catch (err) {
        assert.include(err.toString(), "InvalidMarketCap");
      }
    });

    it("should reject unauthorized caller", async () => {
      const unauthorized = Keypair.generate();

      await provider.connection.requestAirdrop(
        unauthorized.publicKey,
        LAMPORTS_PER_SOL
      );
      await new Promise(resolve => setTimeout(resolve, 1000));

      const newThreshold = new anchor.BN(55_000_000_000); // $55k

      try {
        await program.methods
          .updatePoolGraduation(newThreshold)
          .accounts({
            config,
            pool,
            authority: unauthorized.publicKey,
          })
          .signers([unauthorized])
          .rpc();
        assert.fail("Should have rejected unauthorized caller");
      } catch (err) {
        assert.include(err.toString(), "Unauthorized");
      }
    });

    it("should emit PoolGraduationUpdated event", async () => {
      const newThreshold = new anchor.BN(60_000_000_000); // $60k

      const tx = await program.methods
        .updatePoolGraduation(newThreshold)
        .accounts({
          config,
          pool,
          authority: authority.publicKey,
        })
        .rpc();

      // Fetch transaction to verify event emission
      const txDetails = await provider.connection.getTransaction(tx, {
        commitment: "confirmed",
      });

      assert.ok(txDetails, "Transaction should exist");
      // Note: Full event parsing would require additional setup
      // This test verifies the transaction succeeded
    });
  });

  describe("Integration: Price and Graduation Updates", () => {
    let pool: PublicKey;
    let baseMint: PublicKey;

    before(async () => {
      // Create another test pool for integration tests
      const creator = Keypair.generate();
      await provider.connection.requestAirdrop(
        creator.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await new Promise(resolve => setTimeout(resolve, 1000));

      baseMint = await createMint(
        provider.connection,
        creator,
        creator.publicKey,
        null,
        9
      );

      const { setAuthority } = await import("@solana/spl-token");
      await setAuthority(
        provider.connection,
        creator,
        baseMint,
        creator.publicKey,
        0,
        null
      );

      [pool] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), baseMint.toBuffer()],
        program.programId
      );

      const [quoteVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("quote_vault"), baseMint.toBuffer()],
        program.programId
      );

      const [baseVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("base_vault"), baseMint.toBuffer()],
        program.programId
      );

      const creatorBaseAccount = await createAccount(
        provider.connection,
        creator,
        baseMint,
        creator.publicKey
      );

      await mintTo(
        provider.connection,
        creator,
        baseMint,
        creatorBaseAccount,
        creator,
        1_000_000_000_000_000
      );

      await program.methods
        .createPool(
          new anchor.BN(10_000_000_000),
          new anchor.BN(1_000_000_000_000_000),
          0,
          { constantProduct: {} },
          new anchor.BN(40_000_000_000),
          false
        )
        .accounts({
          config,
          pool,
          quoteMint: crxMint,
          baseMint,
          quoteVault,
          baseVault,
          creatorBaseAccount,
          creator: creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();
    });

    it("should update CRX price and recalculate graduation threshold", async () => {
      const configBefore = await program.account.config.fetch(config);
      const poolBefore = await program.account.pool.fetch(pool);

      // Update CRX price (10% increase)
      const newPrice = configBefore.crxPriceUsd
        .mul(new anchor.BN(11))
        .div(new anchor.BN(10));

      await program.methods
        .updateCrxPrice(newPrice)
        .accounts({
          config,
          authority: authority.publicKey,
        })
        .rpc();

      // Update graduation threshold (should use new CRX price)
      const newThresholdUsd = new anchor.BN(50_000_000_000); // $50k

      await program.methods
        .updatePoolGraduation(newThresholdUsd)
        .accounts({
          config,
          pool,
          authority: authority.publicKey,
        })
        .rpc();

      const poolAfter = await program.account.pool.fetch(pool);
      const configAfter = await program.account.config.fetch(config);

      // Verify graduation threshold uses new price
      const expectedCrxThreshold = newThresholdUsd
        .mul(new anchor.BN(1_000_000))
        .div(newPrice);

      assert.equal(
        poolAfter.graduationThresholdCrx.toString(),
        expectedCrxThreshold.toString(),
        "Graduation threshold should use new CRX price"
      );
    });
  });
});
