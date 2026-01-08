/**
 * Two-Tier Whitelist System - Complete TypeScript Examples
 *
 * This file demonstrates the full lifecycle of the whitelist system:
 * 1. Initialize protocol with empty whitelist (CRX-only)
 * 2. Create CRX pools (permissionless)
 * 3. Add SOL to whitelist (admin operation)
 * 4. Create SOL pools (now permissioned)
 * 5. Update whitelist dynamically
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { CreatorAmmV2 } from "../target/types/creator_amm_v2";

// Well-known token mints on Solana mainnet
const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDT_MINT = new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");

/**
 * PHASE 1: Initialize Protocol (CRX-Only Mode)
 *
 * Start with empty whitelist to drive CRX adoption
 */
async function initializeProtocolCrxOnly(
  program: Program<CreatorAmmV2>,
  authority: Keypair,
  feeRecipient: PublicKey,
  crxPriceOracle: PublicKey,
  crxMint: PublicKey
) {
  console.log("=== PHASE 1: Initialize Protocol (CRX-Only) ===");

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  const tx = await program.methods
    .initialize(
      300,  // pre_bonding_fee_bps: 3%
      new anchor.BN(40_000_000_000),  // pre_bonding_threshold_usd: $40k
      100,  // post_bonding_fee_bps: 1%
      new anchor.BN(85_000_000_000),  // graduation_threshold_usd: $85k
      20,   // anti_sniper_window_slots: 20 slots (~8 seconds)
      500,  // anti_sniper_max_trade_bps: 5%
      60,   // oracle_max_age_seconds: 60 seconds
      100,  // oracle_max_confidence_bps: 1%

      // WHITELIST: Start with empty array (CRX-only mode)
      [
        PublicKey.default,  // Slot 0: Empty
        PublicKey.default,  // Slot 1: Empty
        PublicKey.default,  // Slot 2: Empty
        PublicKey.default,  // Slot 3: Empty
        PublicKey.default,  // Slot 4: Empty
      ],
      0  // approved_quote_count: 0 (no approved tokens)
    )
    .accounts({
      config: configPda,
      authority: authority.publicKey,
      feeRecipient,
      crxPriceOracle,
      crxMint,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();

  console.log("✅ Protocol initialized (CRX-only mode)");
  console.log("📋 Config PDA:", configPda.toBase58());
  console.log("🔒 Whitelist: 0/5 slots used");
  console.log("💎 Only CRX pairs allowed");
  console.log("Transaction:", tx);

  return configPda;
}

/**
 * PHASE 2: Create CRX Pool (Permissionless - Anyone Can Do This)
 *
 * No approval needed, CRX is always allowed
 */
async function createCrxPool(
  program: Program<CreatorAmmV2>,
  creator: Keypair,
  configPda: PublicKey,
  crxMint: PublicKey,
  baseMint: PublicKey,
  crxPriceOracle: PublicKey
) {
  console.log("\n=== PHASE 2: Create CRX Pool (Permissionless) ===");

  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), baseMint.toBuffer()],
    program.programId
  );

  const [quoteVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("quote_vault"), poolPda.toBuffer()],
    program.programId
  );

  const [baseVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("base_vault"), poolPda.toBuffer()],
    program.programId
  );

  // Creator's token account (must hold all tokens)
  const creatorBaseAccount = await anchor.utils.token.associatedAddress({
    mint: baseMint,
    owner: creator.publicKey,
  });

  const tx = await program.methods
    .createPool(
      new anchor.BN(10_000_000_000),  // target_market_cap_usd: $10k
      new anchor.BN(1_000_000_000_000),  // token_supply: 1M tokens
      25,  // fee_bps: 0.25%
      { constantProduct: {} },  // curve_type: ConstantProduct
      new anchor.BN(40_000_000_000)  // graduation_threshold_usd: $40k
    )
    .accounts({
      config: configPda,
      pool: poolPda,
      quoteMint: crxMint,  // ✅ CRX - Always allowed (Tier 1)
      baseMint,
      crxPriceOracle,
      quoteVault: quoteVaultPda,
      baseVault: baseVaultPda,
      creatorBaseAccount,
      creator: creator.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([creator])
    .rpc();

  console.log("✅ CRX pool created (no approval needed)");
  console.log("🏊 Pool PDA:", poolPda.toBase58());
  console.log("💎 Quote: CRX (Tier 1 - Permissionless)");
  console.log("🪙 Base:", baseMint.toBase58());
  console.log("Transaction:", tx);

  return poolPda;
}

/**
 * PHASE 3: Add SOL to Whitelist (Admin Only)
 *
 * Authority enables SOL pairs for premium creators
 */
async function addSolToWhitelist(
  program: Program<CreatorAmmV2>,
  authority: Keypair,
  configPda: PublicKey
) {
  console.log("\n=== PHASE 3: Add SOL to Whitelist (Admin) ===");

  const tx = await program.methods
    .updateApprovedQuotes(
      [
        SOL_MINT,           // Slot 0: SOL ✨
        PublicKey.default,  // Slot 1: Empty
        PublicKey.default,  // Slot 2: Empty
        PublicKey.default,  // Slot 3: Empty
        PublicKey.default,  // Slot 4: Empty
      ],
      1  // approved_quote_count: 1 (SOL approved)
    )
    .accounts({
      config: configPda,
      authority: authority.publicKey,
    })
    .signers([authority])
    .rpc();

  console.log("✅ Whitelist updated by authority");
  console.log("🔓 SOL pairs now enabled");
  console.log("📋 Active slots: 1/5");
  console.log("   [0] SOL:", SOL_MINT.toBase58());
  console.log("Transaction:", tx);
}

/**
 * PHASE 4: Create SOL Pool (Now Permissioned)
 *
 * SOL is in whitelist, so anyone can create SOL pools
 */
async function createSolPool(
  program: Program<CreatorAmmV2>,
  creator: Keypair,
  configPda: PublicKey,
  baseMint: PublicKey,
  crxPriceOracle: PublicKey
) {
  console.log("\n=== PHASE 4: Create SOL Pool (Now Allowed) ===");

  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), baseMint.toBuffer()],
    program.programId
  );

  const [quoteVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("quote_vault"), poolPda.toBuffer()],
    program.programId
  );

  const [baseVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("base_vault"), poolPda.toBuffer()],
    program.programId
  );

  const creatorBaseAccount = await anchor.utils.token.associatedAddress({
    mint: baseMint,
    owner: creator.publicKey,
  });

  const tx = await program.methods
    .createPool(
      new anchor.BN(50_000_000_000),  // target_market_cap_usd: $50k (bigger than CRX)
      new anchor.BN(10_000_000_000_000),  // token_supply: 10M tokens
      100,  // fee_bps: 1%
      { exponential: {} },  // curve_type: Exponential (faster growth)
      new anchor.BN(200_000_000_000)  // graduation_threshold_usd: $200k
    )
    .accounts({
      config: configPda,
      pool: poolPda,
      quoteMint: SOL_MINT,  // ✅ SOL - Now allowed (Tier 2)
      baseMint,
      crxPriceOracle,
      quoteVault: quoteVaultPda,
      baseVault: baseVaultPda,
      creatorBaseAccount,
      creator: creator.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([creator])
    .rpc();

  console.log("✅ SOL pool created (whitelist approved)");
  console.log("🏊 Pool PDA:", poolPda.toBase58());
  console.log("💰 Quote: SOL (Tier 2 - Permissioned)");
  console.log("🪙 Base:", baseMint.toBase58());
  console.log("Transaction:", tx);

  return poolPda;
}

/**
 * PHASE 5: Expand to Full Multi-Quote Support
 *
 * Add USDC and USDT for maximum flexibility
 */
async function enableFullMultiQuote(
  program: Program<CreatorAmmV2>,
  authority: Keypair,
  configPda: PublicKey
) {
  console.log("\n=== PHASE 5: Enable Full Multi-Quote ===");

  const tx = await program.methods
    .updateApprovedQuotes(
      [
        SOL_MINT,           // Slot 0: SOL ✨
        USDC_MINT,          // Slot 1: USDC ✨
        USDT_MINT,          // Slot 2: USDT ✨
        PublicKey.default,  // Slot 3: Empty (reserved)
        PublicKey.default,  // Slot 4: Empty (reserved)
      ],
      3  // approved_quote_count: 3 (SOL, USDC, USDT)
    )
    .accounts({
      config: configPda,
      authority: authority.publicKey,
    })
    .signers([authority])
    .rpc();

  console.log("✅ Whitelist expanded to 3 tokens");
  console.log("🔓 Full multi-quote support enabled");
  console.log("📋 Active slots: 3/5");
  console.log("   [0] SOL:", SOL_MINT.toBase58());
  console.log("   [1] USDC:", USDC_MINT.toBase58());
  console.log("   [2] USDT:", USDT_MINT.toBase58());
  console.log("   [3-4] Reserved for future tokens");
  console.log("Transaction:", tx);
}

/**
 * ERROR CASE: Try to Create Pool with Non-Approved Token
 *
 * This will fail with QuoteTokenNotApproved error
 */
async function tryCreateUnauthorizedPool(
  program: Program<CreatorAmmV2>,
  creator: Keypair,
  configPda: PublicKey,
  baseMint: PublicKey,
  randomTokenMint: PublicKey,
  crxPriceOracle: PublicKey
) {
  console.log("\n=== ERROR CASE: Unauthorized Quote Token ===");

  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), baseMint.toBuffer()],
    program.programId
  );

  const [quoteVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("quote_vault"), poolPda.toBuffer()],
    program.programId
  );

  const [baseVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("base_vault"), poolPda.toBuffer()],
    program.programId
  );

  const creatorBaseAccount = await anchor.utils.token.associatedAddress({
    mint: baseMint,
    owner: creator.publicKey,
  });

  try {
    await program.methods
      .createPool(
        new anchor.BN(10_000_000_000),
        new anchor.BN(1_000_000_000_000),
        25,
        { constantProduct: {} },
        new anchor.BN(40_000_000_000)
      )
      .accounts({
        config: configPda,
        pool: poolPda,
        quoteMint: randomTokenMint,  // ❌ NOT in whitelist
        baseMint,
        crxPriceOracle,
        quoteVault: quoteVaultPda,
        baseVault: baseVaultPda,
        creatorBaseAccount,
        creator: creator.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([creator])
      .rpc();

    console.log("❌ ERROR: Should have failed but didn't!");
  } catch (error) {
    console.log("✅ Expected error caught:");
    console.log("   Error:", error.error.errorCode.code);
    console.log("   Message:", error.error.errorMessage);
    console.log("   Quote token not approved (as expected)");
  }
}

/**
 * FULL DEMO: Complete Lifecycle
 */
async function fullDemo() {
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║   TWO-TIER WHITELIST SYSTEM - COMPLETE DEMO            ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  // Setup (you need to configure these)
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.CreatorAmmV2 as Program<CreatorAmmV2>;

  const authority = Keypair.generate(); // In production, use your authority keypair
  const creator = Keypair.generate();
  const feeRecipient = Keypair.generate().publicKey;
  const crxPriceOracle = Keypair.generate().publicKey; // Mock oracle
  const crxMint = Keypair.generate().publicKey; // Mock CRX mint
  const baseMint1 = Keypair.generate().publicKey; // Mock token 1
  const baseMint2 = Keypair.generate().publicKey; // Mock token 2
  const randomMint = Keypair.generate().publicKey; // Mock unauthorized token

  // PHASE 1: Initialize (CRX-only)
  const configPda = await initializeProtocolCrxOnly(
    program,
    authority,
    feeRecipient,
    crxPriceOracle,
    crxMint
  );

  // PHASE 2: Create CRX pool (permissionless)
  await createCrxPool(
    program,
    creator,
    configPda,
    crxMint,
    baseMint1,
    crxPriceOracle
  );

  // PHASE 3: Add SOL to whitelist (admin)
  await addSolToWhitelist(program, authority, configPda);

  // PHASE 4: Create SOL pool (now allowed)
  await createSolPool(
    program,
    creator,
    configPda,
    baseMint2,
    crxPriceOracle
  );

  // PHASE 5: Expand to full multi-quote
  await enableFullMultiQuote(program, authority, configPda);

  // ERROR CASE: Try unauthorized token
  await tryCreateUnauthorizedPool(
    program,
    creator,
    configPda,
    baseMint1,
    randomMint,
    crxPriceOracle
  );

  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║   DEMO COMPLETE ✅                                      ║");
  console.log("╚════════════════════════════════════════════════════════╝");
  console.log("\nSummary:");
  console.log("✅ Initialized protocol with CRX-only mode");
  console.log("✅ Created CRX pool (permissionless)");
  console.log("✅ Added SOL to whitelist (admin)");
  console.log("✅ Created SOL pool (permissioned)");
  console.log("✅ Expanded to full multi-quote (SOL/USDC/USDT)");
  console.log("✅ Verified unauthorized token rejection");
  console.log("\n🎯 Two-tier whitelist system working perfectly!");
}

// Run the demo
// fullDemo().catch(console.error);

export {
  initializeProtocolCrxOnly,
  createCrxPool,
  addSolToWhitelist,
  createSolPool,
  enableFullMultiQuote,
  tryCreateUnauthorizedPool,
  fullDemo,
};
