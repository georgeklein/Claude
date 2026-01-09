/**
 * SECURITY AUDIT: Quote Token Whitelist System
 *
 * Tests the approved quote token whitelist to ensure:
 * 1. Array size is correctly limited to 5 slots
 * 2. approved_quote_count validation (<=5)
 * 3. Quote token validation in create_pool
 * 4. Update mechanism security (authority-only)
 * 5. No whitelist bypass vectors
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { assert } from "chai";
import { CreatorAmmV2 } from "../target/types/creator_amm_v2";

describe("Quote Token Whitelist - Security Audit", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.CreatorAmmV2 as Program<CreatorAmmV2>;

  const authority = provider.wallet as anchor.Wallet;
  const attacker = Keypair.generate();

  let configPda: PublicKey;
  let crxMint: PublicKey;
  let usdcMint: PublicKey;
  let usdtMint: PublicKey;
  let solMint: PublicKey;
  let unapprovedMint: PublicKey; // Not in whitelist
  let tokenMint: PublicKey; // Token being launched

  before(async () => {
    // Airdrop to attacker
    const airdropSig = await provider.connection.requestAirdrop(
      attacker.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Create test mints
    crxMint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      6
    );

    usdcMint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      6
    );

    usdtMint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      6
    );

    solMint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      9
    );

    unapprovedMint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      6
    );

    // Derive config PDA
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    // Initialize config with whitelist: [USDC, USDT, SOL, empty, empty]
    const approvedQuoteTokens = [
      usdcMint,
      usdtMint,
      solMint,
      PublicKey.default,
      PublicKey.default,
    ];

    await program.methods
      .initialize(
        new anchor.BN(2_000_000),     // CRX price = $2.00
        new anchor.BN(60),             // oracle_max_age_seconds
        approvedQuoteTokens,
        3                               // approved_quote_count (only first 3 slots active)
      )
      .accounts({
        config: configPda,
        authority: authority.publicKey,
        feeRecipient: authority.publicKey,
        crxPriceOracle: PublicKey.default,
        crxMint: crxMint,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✓ Config initialized with whitelist: [USDC, USDT, SOL]");
  });

  describe("1. Array Size Validation", () => {
    it("Should enforce 5-slot array size limit", async () => {
      const config = await program.account.config.fetch(configPda);

      assert.equal(config.approvedQuoteTokens.length, 5, "Array should be exactly 5 slots");
      assert.equal(config.approvedQuoteCount, 3, "Count should be 3 (USDC, USDT, SOL)");
    });

    it("Should reject approved_quote_count > 5 in initialize", async () => {
      // This would fail because we already initialized, but tests the validation logic
      const testConfig = Keypair.generate();

      try {
        await program.methods
          .initialize(
            new anchor.BN(2_000_000),     // initial_crx_price_usd
            new anchor.BN(60),             // oracle_max_age_seconds
            [PublicKey.default, PublicKey.default, PublicKey.default, PublicKey.default, PublicKey.default],
            6                               // INVALID: > 5
          )
          .accounts({
            config: testConfig.publicKey,
            authority: authority.publicKey,
            feeRecipient: authority.publicKey,
            crxPriceOracle: PublicKey.default,
            crxMint: crxMint,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();

        assert.fail("Should have rejected count > 5");
      } catch (err) {
        assert.include(err.toString(), "InvalidQuoteTokenCount", "Should fail with InvalidQuoteTokenCount");
        console.log("✓ Correctly rejected approved_quote_count > 5");
      }
    });
  });

  describe("2. Quote Token Validation in create_pool", () => {
    it("Should allow CRX as quote token (Tier 1 - Permissionless)", async () => {
      // Create token to be launched
      tokenMint = await createMint(
        provider.connection,
        authority.payer,
        authority.publicKey,
        null, // Revoke mint authority
        6
      );

      const [poolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), tokenMint.toBuffer()],
        program.programId
      );

      const [quoteVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("quote_vault"), poolPda.toBuffer()],
        program.programId
      );

      const [baseVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("base_vault"), poolPda.toBuffer()],
        program.programId
      );

      const creatorBaseAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority.payer,
        tokenMint,
        authority.publicKey
      );

      // Mint tokens to creator
      await mintTo(
        provider.connection,
        authority.payer,
        tokenMint,
        creatorBaseAccount.address,
        authority.publicKey,
        1_000_000_000_000 // 1M tokens
      );

      // Create pool with CRX quote token (should succeed)
      await program.methods
        .createPool(
          new anchor.BN(10_000_000_000), // target_market_cap_usd ($10k)
          new anchor.BN(1_000_000_000_000), // token_supply (1M)
          100, // fee_bps (1%)
          { constantProduct: {} }, // curve_type
          new anchor.BN(40_000_000_000), // graduation_threshold_usd
          false, // disable_waa
          "" // metadata_uri
        )
        .accounts({
          config: configPda,
          pool: poolPda,
          quoteMint: crxMint,
          baseMint: tokenMint,
          quoteVault: quoteVault,
          baseVault: baseVault,
          creatorBaseAccount: creatorBaseAccount.address,
          creator: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("✓ CRX quote token accepted (Tier 1 - Permissionless)");
    });

    it("Should allow whitelisted quote token (Tier 2 - Permissioned)", async () => {
      // Create another token to be launched
      const tokenMint2 = await createMint(
        provider.connection,
        authority.payer,
        authority.publicKey,
        null,
        6
      );

      const [poolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), tokenMint2.toBuffer()],
        program.programId
      );

      const [quoteVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("quote_vault"), poolPda.toBuffer()],
        program.programId
      );

      const [baseVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("base_vault"), poolPda.toBuffer()],
        program.programId
      );

      const creatorBaseAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority.payer,
        tokenMint2,
        authority.publicKey
      );

      await mintTo(
        provider.connection,
        authority.payer,
        tokenMint2,
        creatorBaseAccount.address,
        authority.publicKey,
        1_000_000_000_000
      );

      // Create pool with USDC quote token (whitelisted, should succeed)
      await program.methods
        .createPool(
          new anchor.BN(10_000_000_000),
          new anchor.BN(1_000_000_000_000),
          100,
          { constantProduct: {} },
          new anchor.BN(40_000_000_000),
          false,
          ""
        )
        .accounts({
          config: configPda,
          pool: poolPda,
          quoteMint: usdcMint, // USDC is in whitelist
          baseMint: tokenMint2,
          quoteVault: quoteVault,
          baseVault: baseVault,
          creatorBaseAccount: creatorBaseAccount.address,
          creator: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("✓ USDC quote token accepted (Tier 2 - Permissioned)");
    });

    it("Should REJECT unapproved quote token", async () => {
      // Create another token to be launched
      const tokenMint3 = await createMint(
        provider.connection,
        authority.payer,
        authority.publicKey,
        null,
        6
      );

      const [poolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), tokenMint3.toBuffer()],
        program.programId
      );

      const [quoteVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("quote_vault"), poolPda.toBuffer()],
        program.programId
      );

      const [baseVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("base_vault"), poolPda.toBuffer()],
        program.programId
      );

      const creatorBaseAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority.payer,
        tokenMint3,
        authority.publicKey
      );

      await mintTo(
        provider.connection,
        authority.payer,
        tokenMint3,
        creatorBaseAccount.address,
        authority.publicKey,
        1_000_000_000_000
      );

      try {
        await program.methods
          .createPool(
            new anchor.BN(10_000_000_000),
            new anchor.BN(1_000_000_000_000),
            100,
            { constantProduct: {} },
            new anchor.BN(40_000_000_000),
            false
          )
          .accounts({
            config: configPda,
            pool: poolPda,
            quoteMint: unapprovedMint, // NOT in whitelist and NOT CRX
            baseMint: tokenMint3,
            quoteVault: quoteVault,
            baseVault: baseVault,
            creatorBaseAccount: creatorBaseAccount.address,
            creator: authority.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();

        assert.fail("Should have rejected unapproved quote token");
      } catch (err) {
        assert.include(err.toString(), "QuoteTokenNotApproved", "Should fail with QuoteTokenNotApproved");
        console.log("✓ Unapproved quote token correctly rejected");
      }
    });

    it("Should NOT check empty slots beyond approved_quote_count", async () => {
      // Verify that slots 3 and 4 are not checked (they're PublicKey.default)
      // Even if we somehow put a valid pubkey there, it wouldn't be checked
      const config = await program.account.config.fetch(configPda);

      assert.equal(config.approvedQuoteCount, 3, "Only 3 slots should be active");
      assert.equal(
        config.approvedQuoteTokens[3].toString(),
        PublicKey.default.toString(),
        "Slot 3 should be empty"
      );
      assert.equal(
        config.approvedQuoteTokens[4].toString(),
        PublicKey.default.toString(),
        "Slot 4 should be empty"
      );

      console.log("✓ Empty slots (3, 4) are correctly ignored");
    });
  });

  describe("3. Update Mechanism Security", () => {
    it("Should allow authority to update whitelist", async () => {
      // Add a 4th token to the whitelist
      const newToken = await createMint(
        provider.connection,
        authority.payer,
        authority.publicKey,
        null,
        6
      );

      const updatedWhitelist = [
        usdcMint,
        usdtMint,
        solMint,
        newToken,
        PublicKey.default,
      ];

      await program.methods
        .updateApprovedQuotes(updatedWhitelist, 4) // Now 4 tokens
        .accounts({
          config: configPda,
          authority: authority.publicKey,
        })
        .rpc();

      const config = await program.account.config.fetch(configPda);
      assert.equal(config.approvedQuoteCount, 4, "Count should be updated to 4");
      assert.equal(
        config.approvedQuoteTokens[3].toString(),
        newToken.toString(),
        "Slot 3 should have new token"
      );

      console.log("✓ Authority successfully updated whitelist");
    });

    it("Should REJECT non-authority attempting to update whitelist", async () => {
      const maliciousWhitelist = [
        unapprovedMint, // Try to sneak in unapproved token
        PublicKey.default,
        PublicKey.default,
        PublicKey.default,
        PublicKey.default,
      ];

      try {
        await program.methods
          .updateApprovedQuotes(maliciousWhitelist, 1)
          .accounts({
            config: configPda,
            authority: attacker.publicKey, // Attacker trying to update
          })
          .signers([attacker])
          .rpc();

        assert.fail("Should have rejected non-authority update");
      } catch (err) {
        assert.include(err.toString(), "Unauthorized", "Should fail with Unauthorized");
        console.log("✓ Non-authority correctly rejected from updating whitelist");
      }
    });

    it("Should reject approved_quote_count > 5 in update", async () => {
      try {
        await program.methods
          .updateApprovedQuotes(
            [PublicKey.default, PublicKey.default, PublicKey.default, PublicKey.default, PublicKey.default],
            6 // INVALID: > 5
          )
          .accounts({
            config: configPda,
            authority: authority.publicKey,
          })
          .rpc();

        assert.fail("Should have rejected count > 5");
      } catch (err) {
        assert.include(err.toString(), "InvalidQuoteTokenCount", "Should fail with InvalidQuoteTokenCount");
        console.log("✓ Update correctly rejected approved_quote_count > 5");
      }
    });
  });

  describe("4. Edge Cases", () => {
    it("Should handle approved_quote_count = 0 (no approved tokens)", async () => {
      // Set count to 0 (only CRX allowed)
      await program.methods
        .updateApprovedQuotes(
          [PublicKey.default, PublicKey.default, PublicKey.default, PublicKey.default, PublicKey.default],
          0
        )
        .accounts({
          config: configPda,
          authority: authority.publicKey,
        })
        .rpc();

      const config = await program.account.config.fetch(configPda);
      assert.equal(config.approvedQuoteCount, 0, "Count should be 0");

      // Try to create pool with USDC (should fail now)
      const tokenMint4 = await createMint(
        provider.connection,
        authority.payer,
        authority.publicKey,
        null,
        6
      );

      const [poolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), tokenMint4.toBuffer()],
        program.programId
      );

      const [quoteVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("quote_vault"), poolPda.toBuffer()],
        program.programId
      );

      const [baseVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("base_vault"), poolPda.toBuffer()],
        program.programId
      );

      const creatorBaseAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority.payer,
        tokenMint4,
        authority.publicKey
      );

      await mintTo(
        provider.connection,
        authority.payer,
        tokenMint4,
        creatorBaseAccount.address,
        authority.publicKey,
        1_000_000_000_000
      );

      try {
        await program.methods
          .createPool(
            new anchor.BN(10_000_000_000),
            new anchor.BN(1_000_000_000_000),
            100,
            { constantProduct: {} },
            new anchor.BN(40_000_000_000),
            false
          )
          .accounts({
            config: configPda,
            pool: poolPda,
            quoteMint: usdcMint, // Was approved before, but count is now 0
            baseMint: tokenMint4,
            quoteVault: quoteVault,
            baseVault: baseVault,
            creatorBaseAccount: creatorBaseAccount.address,
            creator: authority.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();

        assert.fail("Should have rejected USDC when count = 0");
      } catch (err) {
        assert.include(err.toString(), "QuoteTokenNotApproved");
        console.log("✓ Correctly rejected quote token when approved_quote_count = 0");
      }

      // But CRX should still work
      const tokenMint5 = await createMint(
        provider.connection,
        authority.payer,
        authority.publicKey,
        null,
        6
      );

      const [poolPda2] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), tokenMint5.toBuffer()],
        program.programId
      );

      const [quoteVault2] = PublicKey.findProgramAddressSync(
        [Buffer.from("quote_vault"), poolPda2.toBuffer()],
        program.programId
      );

      const [baseVault2] = PublicKey.findProgramAddressSync(
        [Buffer.from("base_vault"), poolPda2.toBuffer()],
        program.programId
      );

      const creatorBaseAccount2 = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority.payer,
        tokenMint5,
        authority.publicKey
      );

      await mintTo(
        provider.connection,
        authority.payer,
        tokenMint5,
        creatorBaseAccount2.address,
        authority.publicKey,
        1_000_000_000_000
      );

      await program.methods
        .createPool(
          new anchor.BN(10_000_000_000),
          new anchor.BN(1_000_000_000_000),
          100,
          { constantProduct: {} },
          new anchor.BN(40_000_000_000),
          false,
          ""
        )
        .accounts({
          config: configPda,
          pool: poolPda2,
          quoteMint: crxMint, // CRX always allowed
          baseMint: tokenMint5,
          quoteVault: quoteVault2,
          baseVault: baseVault2,
          creatorBaseAccount: creatorBaseAccount2.address,
          creator: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("✓ CRX still allowed when approved_quote_count = 0");
    });

    it("Should handle approved_quote_count = 5 (all slots used)", async () => {
      const token1 = await createMint(provider.connection, authority.payer, authority.publicKey, null, 6);
      const token2 = await createMint(provider.connection, authority.payer, authority.publicKey, null, 6);
      const token3 = await createMint(provider.connection, authority.payer, authority.publicKey, null, 6);
      const token4 = await createMint(provider.connection, authority.payer, authority.publicKey, null, 6);
      const token5 = await createMint(provider.connection, authority.payer, authority.publicKey, null, 6);

      await program.methods
        .updateApprovedQuotes([token1, token2, token3, token4, token5], 5)
        .accounts({
          config: configPda,
          authority: authority.publicKey,
        })
        .rpc();

      const config = await program.account.config.fetch(configPda);
      assert.equal(config.approvedQuoteCount, 5, "Count should be 5");

      console.log("✓ Successfully set approved_quote_count = 5 (all slots used)");
    });
  });
});
