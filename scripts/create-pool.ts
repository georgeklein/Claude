#!/usr/bin/env ts-node

/**
 * Scale AMM - Pool Creation Script
 *
 * Creates a new token pool using the Scale SDK.
 * Protocol must already be deployed (run deploy-amm.ts first).
 *
 * PREREQUISITES:
 * 1. Scale AMM protocol deployed on target network
 * 2. Wallet keypair exists and is funded (0.1+ SOL)
 * 3. Token mint exists with revoked mint/freeze authority
 * 4. Creator holds the full token supply
 *
 * Usage:
 *   npm run create:pool:devnet
 *   npm run create:pool:mainnet
 *
 * Or directly:
 *   ts-node scripts/create-pool.ts <CLUSTER> <TOKEN_MINT> <SUPPLY> <INITIAL_MCAP_USD> <GRADUATION_USD>
 *
 * Example:
 *   ts-node scripts/create-pool.ts devnet \
 *     So11111111111111111111111111111111111111112 \
 *     1000000 \
 *     10000 \
 *     40000
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ScaleAMM } from "../sdk/ScaleAMM";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import * as fs from "fs";

// Cluster configurations
const CLUSTERS: Record<string, { rpcUrl: string }> = {
  devnet: {
    rpcUrl: process.env.DEVNET_RPC_URL || "https://api.devnet.solana.com",
  },
  testnet: {
    rpcUrl: process.env.TESTNET_RPC_URL || "https://api.testnet.solana.com",
  },
  mainnet: {
    rpcUrl: process.env.MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com",
  },
};

class PoolCreator {
  private connection: Connection;
  private wallet: Wallet;
  private scale: ScaleAMM;
  private cluster: string;

  constructor(cluster: string) {
    console.log(`\n🏊 Scale AMM Pool Creator`);
    console.log(`📍 Cluster: ${cluster}`);
    console.log(`⏰ Time: ${new Date().toISOString()}\n`);

    this.cluster = cluster;

    // Load configuration
    const config = CLUSTERS[cluster];
    if (!config) {
      throw new Error(`Unknown cluster: ${cluster}. Use devnet, testnet, or mainnet.`);
    }

    // Setup connection and wallet
    this.connection = new Connection(config.rpcUrl, "confirmed");
    this.wallet = new Wallet(this.loadKeypair());

    // Initialize Scale SDK
    const provider = new AnchorProvider(this.connection, this.wallet, { commitment: "confirmed" });
    this.scale = new ScaleAMM(this.connection, this.wallet, provider);

    console.log(`✅ Configuration loaded`);
    console.log(`   Creator: ${this.wallet.publicKey.toBase58()}`);
    console.log(`   RPC: ${config.rpcUrl}\n`);
  }

  private loadKeypair(): Keypair {
    const keypairPath = (process.env.DEPLOYER_KEYPAIR || "~/.config/solana/id.json")
      .replace("~", process.env.HOME || "");

    if (!fs.existsSync(keypairPath)) {
      throw new Error(
        `Creator keypair not found at: ${keypairPath}\n\n` +
        `Generate a keypair: solana-keygen new\n` +
        `Or set DEPLOYER_KEYPAIR in .env`
      );
    }

    const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
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
        `   Wallet: ${this.wallet.publicKey.toBase58()}`
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
    // - Mint authority is revoked (required for security)
    // - Freeze authority is revoked (required for security)
    // - Token is valid SPL token (not Token-2022)

    console.log(`✅ Token verified\n`);
  }

  async createPool(
    baseMint: PublicKey,
    supply: number,
    initialMarketCapUsd: number,
    graduationThresholdUsd: number,
    options: {
      feeBps?: number;
      curveType?: "ConstantProduct" | "Exponential";
      disableWaa?: boolean;
      metadataUri?: string;
    } = {}
  ): Promise<string> {
    console.log(`🏗️  Creating pool...`);
    console.log(`   Token: ${baseMint.toBase58()}`);
    console.log(`   Supply: ${supply.toLocaleString()}`);
    console.log(`   Initial Market Cap: $${initialMarketCapUsd.toLocaleString()}`);
    console.log(`   Graduation Threshold: $${graduationThresholdUsd.toLocaleString()}`);
    console.log(`   Creator Fee: ${(options.feeBps ?? 0) / 100}%`);
    console.log(`   Curve Type: ${options.curveType ?? "ConstantProduct"}`);
    console.log(`   WAA Enabled: ${!(options.disableWaa ?? true)}`);
    if (options.metadataUri) {
      console.log(`   Metadata URI: ${options.metadataUri}`);
    }
    console.log();

    // Create pool using SDK
    const pool = await this.scale.createPool({
      baseMint,
      supply,
      initialMarketCapUsd,
      graduationThresholdUsd,
      feeBps: options.feeBps ?? 0,
      curveType: options.curveType ?? "ConstantProduct",
      disableWaa: options.disableWaa ?? true, // Default: WAA disabled (opt-in)
      metadataUri: options.metadataUri ?? "",
    });

    console.log(`✅ Pool created successfully`);
    console.log(`   Pool Address: ${pool.address.toBase58()}`);
    console.log(`   Phase: ${pool.phase}`);
    console.log(`   Virtual Reserves: ${pool.virtualReserves?.quote.toLocaleString()} CRX\n`);

    return pool.address.toBase58();
  }

  async run(
    baseMint: PublicKey,
    supply: number,
    initialMarketCapUsd: number,
    graduationThresholdUsd: number,
    options?: {
      feeBps?: number;
      curveType?: "ConstantProduct" | "Exponential";
      disableWaa?: boolean;
      metadataUri?: string;
    }
  ): Promise<void> {
    try {
      await this.checkBalance();
      await this.verifyToken(baseMint);
      const poolAddress = await this.createPool(
        baseMint,
        supply,
        initialMarketCapUsd,
        graduationThresholdUsd,
        options
      );

      console.log(`✨ ════════════════════════════════════════════ ✨`);
      console.log(`✨                                              ✨`);
      console.log(`✨  🎉 POOL CREATED!                            ✨`);
      console.log(`✨                                              ✨`);
      console.log(`✨  Pool: ${poolAddress.padEnd(44)} ✨`);
      console.log(`✨  Token: ${baseMint.toBase58().padEnd(44)} ✨`);
      console.log(`✨  Network: ${this.cluster.padEnd(13)}                ✨`);
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
  const tokenMintStr = process.argv[3];
  const supply = process.argv[4] ? parseFloat(process.argv[4]) : 1_000_000;
  const initialMarketCap = process.argv[5] ? parseFloat(process.argv[5]) : 10_000; // $10k
  const graduationThreshold = process.argv[6] ? parseFloat(process.argv[6]) : 40_000; // $40k

  if (!tokenMintStr) {
    console.error("Error: TOKEN_MINT is required");
    console.error("\nUsage: ts-node scripts/create-pool.ts [cluster] <TOKEN_MINT> [supply] [initial_mcap_usd] [graduation_threshold_usd]");
    console.error("\nExample:");
    console.error("  ts-node scripts/create-pool.ts devnet So11111111111111111111111111111111111111112 1000000 10000 40000");
    process.exit(1);
  }

  const tokenMint = new PublicKey(tokenMintStr);

  // Optional: Parse advanced options from env
  const options = {
    feeBps: process.env.CREATOR_FEE_BPS ? parseInt(process.env.CREATOR_FEE_BPS) : 0,
    curveType: (process.env.CURVE_TYPE as "ConstantProduct" | "Exponential") ?? "ConstantProduct",
    disableWaa: process.env.DISABLE_WAA !== "false", // Default: disabled
    metadataUri: process.env.METADATA_URI ?? "",
  };

  const creator = new PoolCreator(cluster);
  await creator.run(tokenMint, supply, initialMarketCap, graduationThreshold, options);
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
