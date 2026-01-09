/**
 * Test Helper Functions
 *
 * Centralized helpers for test setup and common operations.
 * This ensures all tests use the correct parameter signatures.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

// Constants matching the program
export const INITIAL_CRX_PRICE = new anchor.BN(100_000); // $0.10 with 6 decimals
export const ORACLE_MAX_AGE = new anchor.BN(60); // 60 seconds

/**
 * Initialize the Scale AMM protocol with correct parameters
 *
 * Current signature (4 parameters):
 * - initial_crx_price_usd: u64
 * - oracle_max_age_seconds: i64
 * - approved_quote_tokens: [Pubkey; 5]
 * - approved_quote_count: u8
 */
export async function initializeProtocol(
  program: Program,
  authority: Keypair,
  feeRecipient: Keypair,
  crxMint: PublicKey,
  crxPriceOracle: PublicKey,
  approvedQuoteTokens: PublicKey[] = []
) {
  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  // Pad approved quote tokens to 5 elements
  const paddedTokens: PublicKey[] = [...approvedQuoteTokens];
  while (paddedTokens.length < 5) {
    paddedTokens.push(SystemProgram.programId);
  }

  await program.methods
    .initialize(
      INITIAL_CRX_PRICE,          // initial_crx_price_usd
      ORACLE_MAX_AGE,             // oracle_max_age_seconds
      paddedTokens,               // approved_quote_tokens [5]
      approvedQuoteTokens.length  // approved_quote_count
    )
    .accounts({
      config,
      authority: authority.publicKey,
      feeRecipient: feeRecipient.publicKey,
      crxPriceOracle,
      crxMint,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();

  return config;
}

/**
 * Create a pool with correct parameters
 *
 * Current signature (7 parameters):
 * - target_market_cap_usd: u64
 * - token_supply: u64
 * - fee_bps: u16
 * - curve_type: CurveType
 * - graduation_threshold_usd: u64
 * - disable_waa: bool
 * - metadata_uri: String
 */
export async function createTestPool(
  program: Program,
  creator: Keypair,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  config: PublicKey,
  crxPriceOracle: PublicKey,
  options: {
    initialMarketCapUsd?: number;
    tokenSupply?: number;
    feeBps?: number;
    curveType?: any;
    graduationThresholdUsd?: number;
    disableWaa?: boolean;
    metadataUri?: string;
  } = {}
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

  // Get creator's token account
  const creatorBaseAccount = await getOrCreateAssociatedTokenAccount(
    program.provider.connection,
    creator,
    baseMint,
    creator.publicKey
  );

  // Default values
  const initialMarketCapUsd = options.initialMarketCapUsd ?? 10_000_000_000; // $10k
  const tokenSupply = options.tokenSupply ?? 1_000_000_000_000; // 1M tokens with 6 decimals
  const feeBps = options.feeBps ?? 0;
  const curveType = options.curveType ?? { constantProduct: {} };
  const graduationThresholdUsd = options.graduationThresholdUsd ?? 40_000_000_000; // $40k
  const disableWaa = options.disableWaa ?? true; // Default: WAA disabled (opt-in)
  const metadataUri = options.metadataUri ?? "";

  await program.methods
    .createPool(
      new anchor.BN(initialMarketCapUsd),
      new anchor.BN(tokenSupply),
      feeBps,
      curveType,
      new anchor.BN(graduationThresholdUsd),
      disableWaa,
      metadataUri
    )
    .accounts({
      config,
      pool,
      quoteMint,
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

/**
 * Setup test tokens (mint and fund accounts)
 */
export async function setupTestTokens(
  connection: anchor.web3.Connection,
  payer: Keypair,
  decimals: number = 6
) {
  const { createMint } = await import("@solana/spl-token");

  const mint = await createMint(
    connection,
    payer,
    payer.publicKey,
    payer.publicKey,
    decimals
  );

  return mint;
}

/**
 * Mint tokens to an account
 */
export async function mintTokensTo(
  connection: anchor.web3.Connection,
  payer: Keypair,
  mint: PublicKey,
  destination: PublicKey,
  amount: number | bigint
) {
  await mintTo(
    connection,
    payer,
    mint,
    destination,
    payer,
    BigInt(amount)
  );
}

/**
 * Get or create associated token account
 */
export async function getOrCreateATA(
  connection: anchor.web3.Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey
) {
  const account = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    owner
  );
  return account.address;
}

/**
 * Wait for a certain number of slots (for WAA testing)
 */
export async function waitSlots(connection: anchor.web3.Connection, slots: number) {
  const startSlot = await connection.getSlot();
  while ((await connection.getSlot()) < startSlot + slots) {
    await new Promise(resolve => setTimeout(resolve, 400)); // ~400ms per slot
  }
}

/**
 * Constants for testing
 */
export const TEST_CONSTANTS = {
  // Market caps (USD with 6 decimals)
  MARKET_CAP_10K: 10_000_000_000,
  MARKET_CAP_40K: 40_000_000_000,
  MARKET_CAP_100K: 100_000_000_000,

  // Token supply (1M tokens with 6 decimals)
  TOKEN_SUPPLY_1M: 1_000_000_000_000,
  TOKEN_SUPPLY_10M: 10_000_000_000_000,

  // Fees
  FEE_FREE: 0,
  FEE_LOW: 25,    // 0.25%
  FEE_STANDARD: 100, // 1%

  // WAA thresholds (in slots, ~400ms per slot)
  WAA_TIER1: 25,   // 10 seconds
  WAA_TIER2: 150,  // 1 minute
  WAA_TIER3: 750,  // 5 minutes

  // WAA fees (basis points)
  WAA_FEE_MAX: 300, // 3%
  WAA_FEE_MIN: 50,  // 0.5%
};
