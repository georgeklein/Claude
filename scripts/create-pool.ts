#!/usr/bin/env ts-node

/**
 * Scale AMM - Pool Creation Script
 *
 * Creates a new token pool on an already-deployed Scale AMM protocol.
 * Can be used for any token pair (CRX/SOL, CRX/TOKEN, etc.)
 *
 * PREREQUISITES:
 * 1. Scale AMM protocol must already be deployed (run deploy-amm.ts first)
 * 2. Wallet keypair must exist and be funded
 * 3. Token mint must exist and have revoked mint authority
 * 4. Environment variables configured in .env file
 *
 * Usage:
 *   npm run create:pool:devnet
 *   npm run create:pool:mainnet
 *
 * Or directly:
 *   ts-node scripts/create-pool.ts devnet <TOKEN_MINT> <SUPPLY> <INITIAL_MCAP_USD> <GRADUATION_THRESHOLD_USD>
 *
 * Example:
 *   ts-node scripts/create-pool.ts devnet \
 *     So11111111111111111111111111111111111111112 \
 *     1000000 \
 *     10000 \
 *     40000
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// Configuration
interface PoolConfig {
  cluster: "devnet" | "testnet" | "mainnet-beta";
  rpcUrl: string;
  programId: PublicKey;
  deployerKeypair: string;
}

interface PoolParams {
  baseMint: PublicKey;
  supply: anchor.BN;
  initialMarketCapUsd: anchor.BN;
  graduationThresholdUsd: anchor.BN;
  creatorFeeBps: number;
  curveType: number; // 0 = ConstantProduct, 1 = Exponential
  disableWaa: boolean;
}

const CONFIGS: Record<string, Partial<PoolConfig>> = {
  devnet: {
    cluster: "devnet",
    rpcUrl: process.env.DEVNET_RPC_URL || "https://api.devnet.solana.com",
  },
  testnet: {
    cluster: "testnet",
    rpcUrl: process.env.TESTNET_RPC_URL || "https://api.testnet.solana.com",
  },
  mainnet: {
    cluster: "mainnet-beta",
    rpcUrl: process.env.MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com",
  },
};

const PROGRAM_ID = new PublicKey("CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3");

class PoolCreator {
  private config: PoolConfig;
  private connection: Connection;
  private wallet: Wallet;
  private provider: AnchorProvider;
  private program: Program;

  constructor(cluster: string) {
    console.log(`\n🏊 Scale AMM Pool Creator`);
    console.log(`📍 Cluster: ${cluster}`);
    console.log(`⏰ Time: ${new Date().toISOString()}\n`);

    // Load configuration
    this.config = this.loadConfig(cluster);

    // Setup connection and wallet
    this.connection = new Connection(this.config.rpcUrl, "confirmed");
    const deployerKey = this.loadDeployerKey();
    this.wallet = new Wallet(deployerKey);

    // Setup provider
    this.provider = new AnchorProvider(
      this.connection,
      this.wallet,
      { commitment: "confirmed" }
    );
    anchor.setProvider(this.provider);

    // Load program
    this.program = this.loadProgram();

    console.log(`✅ Configuration loaded`);
    console.log(`   Creator: ${this.wallet.publicKey.toBase58()}`);
    console.log(`   Program: ${this.config.programId.toBase58()}`);
    console.log(`   RPC: ${this.config.rpcUrl}\n`);
  }

  private loadConfig(cluster: string): PoolConfig {
    const baseConfig = CONFIGS[cluster];
    if (!baseConfig) {
      throw new Error(`Unknown cluster: ${cluster}. Use devnet, testnet, or mainnet.`);
    }

    return {
      ...baseConfig,
      programId: PROGRAM_ID,
      deployerKeypair: process.env.DEPLOYER_KEYPAIR || "~/.config/solana/id.json",
    } as PoolConfig;
  }

  private loadDeployerKey(): Keypair {
    const keypairPath = this.config.deployerKeypair.replace("~", process.env.HOME || "");

    if (!fs.existsSync(keypairPath)) {
      throw new Error(
        `Deployer keypair not found at: ${keypairPath}\n\n` +
        `Please ensure your Solana wallet is configured:\n` +
        `  1. Generate a keypair: solana-keygen new\n` +
        `  2. Or specify path in .env: DEPLOYER_KEYPAIR=/path/to/keypair.json\n` +
        `  3. Fund the wallet with SOL before creating pools\n`
      );
    }

    const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
  }

  private loadProgram(): Program {
    const idlPath = path.join(process.cwd(), "target/idl/creator_amm_v2.json");
    if (!fs.existsSync(idlPath)) {
      throw new Error(
        "IDL not found. Run 'anchor build' first or ensure the program is deployed."
      );
    }

    const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
    return new Program(idl, this.config.programId, this.provider);
  }

  async checkBalance(): Promise<void> {
    console.log(`💰 Checking creator balance...`);

    const balance = await this.connection.getBalance(this.wallet.publicKey);
    const balanceSol = balance / LAMPORTS_PER_SOL;

    console.log(`   Balance: ${balanceSol.toFixed(4)} SOL`);

    const requiredSol = 0.1; // Pool creation costs ~0.02 SOL
    if (balanceSol < requiredSol) {
      throw new Error(
        `Insufficient balance!\n` +
        `   Required: ${requiredSol} SOL\n` +
        `   Current: ${balanceSol.toFixed(4)} SOL\n` +
        `   Wallet: ${this.wallet.publicKey.toBase58()}\n`
      );
    }

    console.log(`✅ Sufficient balance\n`);
  }

  async verifyToken(tokenMint: PublicKey): Promise<void> {
    console.log(`🔍 Verifying token mint...`);
    console.log(`   Token: ${tokenMint.toBase58()}`);

    const mintInfo = await this.connection.getAccountInfo(tokenMint);
    if (!mintInfo) {
      throw new Error(`Token mint not found: ${tokenMint.toBase58()}`);
    }

    // TODO: Add checks for:
    // - Mint authority is revoked
    // - Freeze authority is revoked
    // - Token is valid SPL token

    console.log(`✅ Token verified\n`);
  }

  async createPool(params: PoolParams): Promise<PublicKey> {
    console.log(`🏗️  Creating pool...`);
    console.log(`   Token: ${params.baseMint.toBase58()}`);
    console.log(`   Supply: ${params.supply.toString()}`);
    console.log(`   Initial Market Cap: $${params.initialMarketCapUsd.toNumber() / 1_000_000}`);
    console.log(`   Graduation Threshold: $${params.graduationThresholdUsd.toNumber() / 1_000_000}`);
    console.log(`   Creator Fee: ${params.creatorFeeBps / 100}%`);
    console.log(`   Curve Type: ${params.curveType === 0 ? "ConstantProduct" : "Exponential"}`);
    console.log(`   WAA Enabled: ${!params.disableWaa}\n`);

    // Derive pool PDA
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), params.baseMint.toBuffer()],
      this.config.programId
    );

    // Derive config PDA
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      this.config.programId
    );

    // Get quote mint from config
    const configAccount = await this.program.account.config.fetch(configPda);
    const quoteMint = configAccount.crxMint;

    console.log(`   Pool PDA: ${poolPda.toBase58()}`);
    console.log(`   Quote Mint: ${quoteMint.toBase58()}\n`);

    // Derive vault addresses
    const quoteVault = await getAssociatedTokenAddress(
      quoteMint,
      poolPda,
      true // allowOwnerOffCurve
    );

    const baseVault = await getAssociatedTokenAddress(
      params.baseMint,
      poolPda,
      true
    );

    // Creator's base token account (must have the supply)
    const creatorBaseAccount = await getAssociatedTokenAddress(
      params.baseMint,
      this.wallet.publicKey
    );

    try {
      const tx = await this.program.methods
        .createPool(
          params.initialMarketCapUsd,
          params.supply,
          params.creatorFeeBps,
          params.curveType,
          params.graduationThresholdUsd,
          params.disableWaa
        )
        .accounts({
          pool: poolPda,
          config: configPda,
          baseMint: params.baseMint,
          quoteMint: quoteMint,
          quoteVault: quoteVault,
          baseVault: baseVault,
          creator: this.wallet.publicKey,
          creatorBaseAccount: creatorBaseAccount,
          crxPriceOracle: configAccount.crxPriceOracle,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          // Removed: rent sysvar (Anchor 0.29+ handles rent exemption automatically)
        })
        .rpc();

      console.log(`✅ Pool created successfully`);
      console.log(`   Transaction: ${tx}`);
      console.log(`   Pool Address: ${poolPda.toBase58()}\n`);

      return poolPda;
    } catch (error: any) {
      throw new Error(`Pool creation failed: ${error.message}`);
    }
  }

  async verifyPool(poolAddress: PublicKey): Promise<void> {
    console.log(`🔍 Verifying pool...`);

    const poolAccount = await this.program.account.pool.fetch(poolAddress);

    console.log(`   Phase: ${Object.keys(poolAccount.currentPhase)[0]}`);
    console.log(`   Virtual Quote Reserves: ${poolAccount.virtualQuoteReserves.toString()}`);
    console.log(`   Virtual Base Reserves: ${poolAccount.virtualBaseReserves.toString()}`);
    console.log(`   Real Quote Reserves: ${poolAccount.realQuoteReserves.toString()}`);
    console.log(`   Real Base Reserves: ${poolAccount.realBaseReserves.toString()}`);
    console.log(`   Creator: ${poolAccount.creator.toBase58()}`);
    console.log(`   Created At Slot: ${poolAccount.createdAtSlot.toString()}\n`);

    console.log(`✅ Pool verified\n`);
  }

  async run(params: PoolParams): Promise<void> {
    try {
      await this.checkBalance();
      await this.verifyToken(params.baseMint);
      const poolAddress = await this.createPool(params);
      await this.verifyPool(poolAddress);

      console.log(`✨ ════════════════════════════════════════════ ✨`);
      console.log(`✨                                              ✨`);
      console.log(`✨  🎉 POOL CREATED!                            ✨`);
      console.log(`✨                                              ✨`);
      console.log(`✨  Pool Address: ${poolAddress.toBase58().padEnd(44)} ✨`);
      console.log(`✨  Token: ${params.baseMint.toBase58().padEnd(44)}       ✨`);
      console.log(`✨  Network: ${this.config.cluster.padEnd(13)}                ✨`);
      console.log(`✨                                              ✨`);
      console.log(`✨ ════════════════════════════════════════════ ✨\n`);
    } catch (error: any) {
      console.error(`\n❌ Pool creation failed: ${error.message}\n`);
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  const cluster = process.argv[2] || process.env.CLUSTER || "devnet";

  if (!["devnet", "testnet", "mainnet"].includes(cluster)) {
    console.error("Usage: ts-node scripts/create-pool.ts [devnet|testnet|mainnet] <TOKEN_MINT> <SUPPLY> <INITIAL_MCAP> <GRADUATION_THRESHOLD>");
    console.error("\nExample:");
    console.error("  ts-node scripts/create-pool.ts devnet So11111111111111111111111111111111111111112 1000000 10000 40000");
    process.exit(1);
  }

  // Parse pool parameters from command line or use defaults
  const tokenMint = process.argv[3] ? new PublicKey(process.argv[3]) : null;
  const supply = process.argv[4] ? new anchor.BN(process.argv[4]) : new anchor.BN(1_000_000);
  const initialMarketCap = process.argv[5] ? new anchor.BN(parseInt(process.argv[5]) * 1_000_000) : new anchor.BN(10_000_000_000); // $10k
  const graduationThreshold = process.argv[6] ? new anchor.BN(parseInt(process.argv[6]) * 1_000_000) : new anchor.BN(40_000_000_000); // $40k

  if (!tokenMint) {
    console.error("Error: TOKEN_MINT is required");
    console.error("\nUsage: ts-node scripts/create-pool.ts [cluster] <TOKEN_MINT> [supply] [initial_mcap_usd] [graduation_threshold_usd]");
    console.error("\nExample:");
    console.error("  ts-node scripts/create-pool.ts devnet So11111111111111111111111111111111111111112 1000000 10000 40000");
    process.exit(1);
  }

  const params: PoolParams = {
    baseMint: tokenMint,
    supply: supply,
    initialMarketCapUsd: initialMarketCap,
    graduationThresholdUsd: graduationThreshold,
    creatorFeeBps: 100, // 1% default
    curveType: 0, // ConstantProduct
    disableWaa: false, // Enable WAA by default
  };

  const creator = new PoolCreator(cluster);
  await creator.run(params);
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
