#!/usr/bin/env ts-node

/**
 * Scale AMM - Protocol Deployment Script
 *
 * Deploys and initializes the Scale AMM protocol using the SDK.
 * This is a ONE-TIME operation per network.
 *
 * After deployment, use create-pool.ts to create individual token pools.
 *
 * PREREQUISITES:
 * 1. Wallet keypair must exist (default: ~/.config/solana/id.json)
 * 2. Wallet must be funded with SOL (devnet: 2+ SOL, mainnet: 5+ SOL)
 * 3. Environment variables configured in .env file
 *
 * Usage:
 *   npm run deploy:amm:devnet
 *   npm run deploy:amm:testnet
 *   npm run deploy:amm:mainnet
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ScaleAMM } from "../sdk/ScaleAMM";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

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

class DeploymentManager {
  private connection: Connection;
  private wallet: Wallet;
  private scale: ScaleAMM;
  private cluster: string;

  constructor(cluster: string) {
    console.log(`\n🚀 Scale AMM Deployment Manager`);
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
    console.log(`   Deployer: ${this.wallet.publicKey.toBase58()}`);
    console.log(`   RPC: ${config.rpcUrl}\n`);
  }

  private loadKeypair(): Keypair {
    const keypairPath = (process.env.DEPLOYER_KEYPAIR || "~/.config/solana/id.json")
      .replace("~", process.env.HOME || "");

    if (!fs.existsSync(keypairPath)) {
      throw new Error(
        `Deployer keypair not found at: ${keypairPath}\n\n` +
        `Generate a keypair: solana-keygen new\n` +
        `Or set DEPLOYER_KEYPAIR in .env`
      );
    }

    const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
  }

  async checkBalance(): Promise<void> {
    console.log(`💰 Checking deployer balance...`);

    const balance = await this.connection.getBalance(this.wallet.publicKey);
    const balanceSol = balance / LAMPORTS_PER_SOL;

    console.log(`   Balance: ${balanceSol.toFixed(4)} SOL`);

    const requiredSol = this.cluster === "mainnet" ? 5 : 2;
    if (balanceSol < requiredSol) {
      const fundingInstructions = this.cluster === "devnet"
        ? "\n   Get devnet SOL: solana airdrop 2 --url devnet"
        : this.cluster === "testnet"
        ? "\n   Get testnet SOL: solana airdrop 2 --url testnet"
        : "\n   Purchase mainnet SOL and send to your wallet";

      throw new Error(
        `Insufficient balance!\n` +
        `   Required: ${requiredSol} SOL\n` +
        `   Current: ${balanceSol.toFixed(4)} SOL\n` +
        fundingInstructions
      );
    }

    console.log(`✅ Sufficient balance\n`);
  }

  async buildProgram(): Promise<void> {
    console.log(`🔨 Building program...`);

    try {
      await execAsync("anchor build");
      console.log(`✅ Build complete\n`);

      // Check binary size
      const binaryPath = "target/deploy/creator_amm_v2.so";
      if (!fs.existsSync(binaryPath)) {
        throw new Error("Program binary not found after build");
      }

      const stats = fs.statSync(binaryPath);
      console.log(`   Binary size: ${(stats.size / 1024).toFixed(2)} KB\n`);
    } catch (error: any) {
      throw new Error(`Build failed: ${error.message}`);
    }
  }

  async deployProgram(): Promise<void> {
    console.log(`📤 Deploying program to ${this.cluster}...`);
    console.log(`   This may take 2-3 minutes...\n`);

    try {
      const clusterArg = this.cluster === "mainnet" ? "mainnet-beta" : this.cluster;
      const command = `anchor deploy --provider.cluster ${clusterArg}`;
      const { stdout } = await execAsync(command);

      console.log(stdout);
      console.log(`✅ Program deployed successfully\n`);
    } catch (error: any) {
      throw new Error(`Deployment failed: ${error.message}`);
    }
  }

  async initialize(): Promise<string> {
    console.log(`⚙️  Initializing protocol configuration...`);

    // Load required environment variables
    const feeRecipient = process.env.FEE_RECIPIENT_ADDRESS;
    const crxMint = process.env.CRX_MINT_ADDRESS;
    const crxPriceOracle = process.env.CRX_PRICE_ORACLE_ADDRESS;
    const initialCrxPriceUsd = parseFloat(process.env.INITIAL_CRX_PRICE_USD || "0.1");

    if (!feeRecipient || !crxMint || !crxPriceOracle) {
      throw new Error(
        "Missing required environment variables:\n" +
        "  FEE_RECIPIENT_ADDRESS\n" +
        "  CRX_MINT_ADDRESS\n" +
        "  CRX_PRICE_ORACLE_ADDRESS\n" +
        "  INITIAL_CRX_PRICE_USD (optional, default: 0.1)\n\n" +
        "Set these in your .env file"
      );
    }

    // Parse approved quote tokens
    const quoteTokensStr = process.env.APPROVED_QUOTE_TOKENS || "";
    const approvedQuoteTokens = quoteTokensStr
      .split(",")
      .filter((s) => s.trim())
      .map((s) => new PublicKey(s.trim()));

    console.log(`\n   Protocol Parameters:`);
    console.log(`   - Initial CRX price: $${initialCrxPriceUsd}`);
    console.log(`   - Oracle max age: 60 seconds`);
    console.log(`   - Approved quote tokens: ${approvedQuoteTokens.length}\n`);

    // Check if already initialized
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      this.scale.programId
    );

    try {
      const configAccount = await this.connection.getAccountInfo(configPda);
      if (configAccount) {
        console.log(`⚠️  Config already initialized at ${configPda.toBase58()}`);
        console.log(`   Skipping initialization\n`);
        return configPda.toBase58();
      }
    } catch (error) {
      // Account doesn't exist, proceed
    }

    // Initialize using SDK
    const tx = await this.scale.initialize({
      crxMint: new PublicKey(crxMint),
      crxPriceOracle: new PublicKey(crxPriceOracle),
      feeRecipient: new PublicKey(feeRecipient),
      initialCrxPriceUsd,
      oracleMaxAgeSeconds: 60,
      approvedQuoteTokens,
    });

    console.log(`✅ Configuration initialized`);
    console.log(`   Transaction: ${tx}`);
    console.log(`   Config PDA: ${configPda.toBase58()}\n`);

    return configPda.toBase58();
  }

  async verify(configPda: string): Promise<void> {
    console.log(`🔍 Verifying deployment...\n`);

    // Verify program
    const programAccount = await this.connection.getAccountInfo(this.scale.programId);
    if (programAccount) {
      console.log(`✅ Program verified: ${this.scale.programId.toBase58()}`);
    } else {
      console.log(`❌ Program not found: ${this.scale.programId.toBase58()}`);
    }

    // Verify config
    const configAccount = await this.connection.getAccountInfo(new PublicKey(configPda));
    if (configAccount) {
      console.log(`✅ Config verified: ${configPda}`);
    } else {
      console.log(`❌ Config not found: ${configPda}`);
    }

    console.log();
  }

  async run(): Promise<void> {
    try {
      await this.checkBalance();
      await this.buildProgram();
      await this.deployProgram();

      // Wait for deployment to settle
      console.log(`⏳ Waiting for deployment to settle...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.log();

      const configPda = await this.initialize();
      await this.verify(configPda);

      console.log(`✨ ════════════════════════════════════════════ ✨`);
      console.log(`✨                                              ✨`);
      console.log(`✨  🎉 DEPLOYMENT COMPLETE!                     ✨`);
      console.log(`✨                                              ✨`);
      console.log(`✨  Scale AMM is now live on ${this.cluster.padEnd(13)} ✨`);
      console.log(`✨                                              ✨`);
      console.log(`✨  Program ID: ${this.scale.programId.toBase58()}        `);
      console.log(`✨  Config PDA: ${configPda.padEnd(44)}        `);
      console.log(`✨                                              ✨`);
      console.log(`✨ ════════════════════════════════════════════ ✨\n`);
    } catch (error: any) {
      console.error(`\n❌ Deployment failed: ${error.message}\n`);
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  const cluster = process.argv[2] || process.env.CLUSTER || "devnet";

  if (!["devnet", "testnet", "mainnet"].includes(cluster)) {
    console.error("Usage: ts-node scripts/deploy-amm.ts [devnet|testnet|mainnet]");
    process.exit(1);
  }

  const manager = new DeploymentManager(cluster);
  await manager.run();
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
