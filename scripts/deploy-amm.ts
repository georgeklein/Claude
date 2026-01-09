#!/usr/bin/env ts-node

/**
 * Scale AMM - Protocol Deployment Script
 *
 * Deploys the Scale AMM protocol and initializes global configuration.
 * This is a ONE-TIME operation per network.
 *
 * After deployment, use create-pool.ts to create individual token pools.
 *
 * PREREQUISITES:
 * 1. Wallet keypair must already exist (default: ~/.config/solana/id.json)
 * 2. Wallet must be funded with SOL:
 *    - Devnet: 2+ SOL (get from faucet: solana airdrop 2 --url devnet)
 *    - Testnet: 2+ SOL (get from faucet: solana airdrop 2 --url testnet)
 *    - Mainnet: 5+ SOL (purchase and send to wallet)
 * 3. Environment variables configured in .env file
 *
 * Usage:
 *   npm run deploy:amm:devnet
 *   npm run deploy:amm:testnet
 *   npm run deploy:amm:mainnet
 *
 * Or directly:
 *   ts-node scripts/deploy-amm.ts devnet
 *   ts-node scripts/deploy-amm.ts mainnet
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(exec);

// Configuration
interface DeploymentConfig {
  cluster: "devnet" | "testnet" | "mainnet-beta";
  rpcUrl: string;
  programId: string;
  feeRecipient: PublicKey;
  crxMint: PublicKey;
  crxPriceOracle: PublicKey;
  deployerKeypair: string;
}

interface ProtocolParams {
  preBondingFeeBps: number;
  preBondingThresholdUsd: anchor.BN;
  postBondingFeeBps: number;
  graduationThresholdUsd: anchor.BN;
  antiSniperWindowSlots: anchor.BN;
  antiSniperMaxTradeBps: number;
  oracleMaxAgeSeconds: anchor.BN;
  approvedQuoteTokens: PublicKey[];
  approvedQuoteCount: number;
}

const CONFIGS: Record<string, Partial<DeploymentConfig>> = {
  devnet: {
    cluster: "devnet",
    rpcUrl: process.env.DEVNET_RPC_URL || "https://api.devnet.solana.com",
    programId: "CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3",
  },
  testnet: {
    cluster: "testnet",
    rpcUrl: process.env.TESTNET_RPC_URL || "https://api.testnet.solana.com",
    programId: "CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3",
  },
  mainnet: {
    cluster: "mainnet-beta",
    rpcUrl: process.env.MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com",
    programId: "CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3",
  },
};

// Default protocol parameters
const DEFAULT_PARAMS: ProtocolParams = {
  preBondingFeeBps: 300,  // 3%
  preBondingThresholdUsd: new anchor.BN(40_000_000_000),  // $40k
  postBondingFeeBps: 100,  // 1%
  graduationThresholdUsd: new anchor.BN(85_000_000_000),  // $85k
  antiSniperWindowSlots: new anchor.BN(20),  // ~8 seconds
  antiSniperMaxTradeBps: 500,  // 5%
  oracleMaxAgeSeconds: new anchor.BN(60),  // 60 seconds
  approvedQuoteTokens: [],  // Will be filled from env
  approvedQuoteCount: 0,
};

class DeploymentManager {
  private config: DeploymentConfig;
  private params: ProtocolParams;
  private connection: Connection;
  private wallet: Wallet;
  private provider: AnchorProvider;

  constructor(cluster: string) {
    console.log(`\n🚀 Scale AMM Deployment Manager`);
    console.log(`📍 Cluster: ${cluster}`);
    console.log(`⏰ Time: ${new Date().toISOString()}\n`);

    // Load configuration
    this.config = this.loadConfig(cluster);
    this.params = this.loadParams();

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

    console.log(`✅ Configuration loaded`);
    console.log(`   Deployer: ${this.wallet.publicKey.toBase58()}`);
    console.log(`   RPC: ${this.config.rpcUrl}\n`);
  }

  private loadConfig(cluster: string): DeploymentConfig {
    const baseConfig = CONFIGS[cluster];
    if (!baseConfig) {
      throw new Error(`Unknown cluster: ${cluster}. Use devnet, testnet, or mainnet.`);
    }

    // Load from environment variables
    const feeRecipient = process.env.FEE_RECIPIENT_ADDRESS;
    const crxMint = process.env.CRX_MINT_ADDRESS;
    const crxPriceOracle = process.env.CRX_PRICE_ORACLE_ADDRESS;

    if (!feeRecipient || !crxMint || !crxPriceOracle) {
      throw new Error(
        "Missing required environment variables:\n" +
        "  FEE_RECIPIENT_ADDRESS\n" +
        "  CRX_MINT_ADDRESS\n" +
        "  CRX_PRICE_ORACLE_ADDRESS\n\n" +
        "Set these in your .env file or export them."
      );
    }

    return {
      ...baseConfig,
      feeRecipient: new PublicKey(feeRecipient),
      crxMint: new PublicKey(crxMint),
      crxPriceOracle: new PublicKey(crxPriceOracle),
      deployerKeypair: process.env.DEPLOYER_KEYPAIR || "~/.config/solana/id.json",
    } as DeploymentConfig;
  }

  private loadParams(): ProtocolParams {
    const params = { ...DEFAULT_PARAMS };

    // Load approved quote tokens
    const quoteTokensStr = process.env.APPROVED_QUOTE_TOKENS || "";
    const quoteTokens = quoteTokensStr
      .split(",")
      .filter((s) => s.trim())
      .map((s) => new PublicKey(s.trim()));

    // Always include CRX as first approved quote token
    params.approvedQuoteTokens = [
      this.config.crxMint,
      ...quoteTokens,
    ];

    // Pad to 5 tokens
    while (params.approvedQuoteTokens.length < 5) {
      params.approvedQuoteTokens.push(PublicKey.default);
    }

    params.approvedQuoteCount = quoteTokens.length + 1; // +1 for CRX

    return params;
  }

  private loadDeployerKey(): Keypair {
    const keypairPath = this.config.deployerKeypair.replace("~", process.env.HOME || "");

    if (!fs.existsSync(keypairPath)) {
      throw new Error(
        `Deployer keypair not found at: ${keypairPath}\n\n` +
        `Please ensure your Solana wallet is configured:\n` +
        `  1. Generate a keypair: solana-keygen new\n` +
        `  2. Or specify path in .env: DEPLOYER_KEYPAIR=/path/to/keypair.json\n` +
        `  3. Fund the wallet with SOL before deploying\n`
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

    // Required SOL for deployment
    const requiredSol = this.config.cluster === "mainnet-beta" ? 5 : 2;

    if (balanceSol < requiredSol) {
      const fundingInstructions = this.config.cluster === "devnet"
        ? "\n   Get devnet SOL: solana airdrop 2 --url devnet"
        : this.config.cluster === "testnet"
        ? "\n   Get testnet SOL: solana airdrop 2 --url testnet"
        : "\n   Purchase mainnet SOL and send to your wallet";

      throw new Error(
        `Insufficient balance!\n` +
        `   Required: ${requiredSol} SOL\n` +
        `   Current: ${balanceSol.toFixed(4)} SOL\n` +
        `   Wallet: ${this.wallet.publicKey.toBase58()}\n` +
        fundingInstructions
      );
    }

    console.log(`✅ Sufficient balance\n`);
  }

  async buildProgram(): Promise<void> {
    console.log(`🔨 Building program...`);

    try {
      const { stdout, stderr } = await execAsync("anchor build");
      console.log(`✅ Build complete\n`);

      // Check if binary exists
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
    console.log(`📤 Deploying program to ${this.config.cluster}...`);
    console.log(`   This may take 2-3 minutes...\n`);

    try {
      const command = `anchor deploy --provider.cluster ${this.config.cluster}`;
      const { stdout, stderr } = await execAsync(command, {
        env: { ...process.env, ANCHOR_WALLET: this.config.deployerKeypair },
      });

      console.log(stdout);
      console.log(`✅ Program deployed successfully`);
      console.log(`   Program ID: ${this.config.programId}\n`);
    } catch (error: any) {
      throw new Error(`Deployment failed: ${error.message}`);
    }
  }

  async initializeConfig(): Promise<PublicKey> {
    console.log(`⚙️  Initializing protocol configuration...`);

    // Load program IDL
    const idlPath = path.join(process.cwd(), "target/idl/creator_amm_v2.json");
    if (!fs.existsSync(idlPath)) {
      throw new Error("IDL not found. Run 'anchor build' first.");
    }

    const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
    const programId = new PublicKey(this.config.programId);
    const program = new Program(idl, programId, this.provider);

    // Derive config PDA
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      programId
    );

    console.log(`   Config PDA: ${configPda.toBase58()}`);

    // Check if already initialized
    try {
      const configAccount = await this.connection.getAccountInfo(configPda);
      if (configAccount) {
        console.log(`⚠️  Config already initialized`);
        console.log(`   Skipping initialization\n`);
        return configPda;
      }
    } catch (error) {
      // Account doesn't exist, proceed with initialization
    }

    console.log(`\n   Protocol Parameters:`);
    console.log(`   - Pre-bonding fee: ${this.params.preBondingFeeBps / 100}%`);
    console.log(`   - Pre-bonding threshold: $${this.params.preBondingThresholdUsd.toNumber() / 1_000_000}`);
    console.log(`   - Post-bonding fee: ${this.params.postBondingFeeBps / 100}%`);
    console.log(`   - Graduation threshold: $${this.params.graduationThresholdUsd.toNumber() / 1_000_000}`);
    console.log(`   - Anti-sniper window: ${this.params.antiSniperWindowSlots.toNumber()} slots`);
    console.log(`   - Anti-sniper max trade: ${this.params.antiSniperMaxTradeBps / 100}%`);
    console.log(`   - Oracle max age: ${this.params.oracleMaxAgeSeconds.toNumber()}s`);
    console.log(`   - Approved quote tokens: ${this.params.approvedQuoteCount}\n`);

    try {
      const tx = await program.methods
        .initialize(
          this.params.preBondingFeeBps,
          this.params.preBondingThresholdUsd,
          this.params.postBondingFeeBps,
          this.params.graduationThresholdUsd,
          this.params.antiSniperWindowSlots,
          this.params.antiSniperMaxTradeBps,
          this.params.oracleMaxAgeSeconds,
          this.params.approvedQuoteTokens,
          this.params.approvedQuoteCount
        )
        .accounts({
          config: configPda,
          authority: this.wallet.publicKey,
          feeRecipient: this.config.feeRecipient,
          crxPriceOracle: this.config.crxPriceOracle,
          crxMint: this.config.crxMint,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log(`✅ Configuration initialized`);
      console.log(`   Transaction: ${tx}\n`);

      return configPda;
    } catch (error: any) {
      throw new Error(`Initialization failed: ${error.message}`);
    }
  }

  async verify(configPda: PublicKey): Promise<void> {
    console.log(`🔍 Verifying deployment...\n`);

    // Verify program
    const programId = new PublicKey(this.config.programId);
    const programAccount = await this.connection.getAccountInfo(programId);
    if (programAccount) {
      console.log(`✅ Program verified: ${programId.toBase58()}`);
    } else {
      console.log(`❌ Program not found: ${programId.toBase58()}`);
    }

    // Verify config
    const configAccount = await this.connection.getAccountInfo(configPda);
    if (configAccount) {
      console.log(`✅ Config verified: ${configPda.toBase58()}`);
    } else {
      console.log(`❌ Config not found: ${configPda.toBase58()}`);
    }

    // Verify CRX mint
    const crxAccount = await this.connection.getAccountInfo(this.config.crxMint);
    if (crxAccount) {
      console.log(`✅ CRX mint verified: ${this.config.crxMint.toBase58()}`);
    } else {
      console.log(`⚠️  CRX mint not found: ${this.config.crxMint.toBase58()}`);
    }

    console.log();
  }

  async generateReport(configPda: PublicKey): Promise<void> {
    const report = {
      timestamp: new Date().toISOString(),
      cluster: this.config.cluster,
      programId: this.config.programId,
      configPda: configPda.toBase58(),
      deployer: this.wallet.publicKey.toBase58(),
      feeRecipient: this.config.feeRecipient.toBase58(),
      crxMint: this.config.crxMint.toBase58(),
      crxPriceOracle: this.config.crxPriceOracle.toBase58(),
      parameters: {
        preBondingFeeBps: this.params.preBondingFeeBps,
        preBondingThresholdUsd: this.params.preBondingThresholdUsd.toString(),
        postBondingFeeBps: this.params.postBondingFeeBps,
        graduationThresholdUsd: this.params.graduationThresholdUsd.toString(),
        antiSniperWindowSlots: this.params.antiSniperWindowSlots.toString(),
        antiSniperMaxTradeBps: this.params.antiSniperMaxTradeBps,
        oracleMaxAgeSeconds: this.params.oracleMaxAgeSeconds.toString(),
        approvedQuoteTokens: this.params.approvedQuoteTokens.map((t) => t.toBase58()),
        approvedQuoteCount: this.params.approvedQuoteCount,
      },
    };

    const reportPath = `deployment-${this.config.cluster}-${Date.now()}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`📄 Deployment report saved: ${reportPath}\n`);
  }

  async run(): Promise<void> {
    try {
      await this.checkBalance();
      await this.buildProgram();
      await this.deployProgram();

      // Wait 5 seconds for deployment to settle
      console.log(`⏳ Waiting for deployment to settle...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.log();

      const configPda = await this.initializeConfig();
      await this.verify(configPda);
      await this.generateReport(configPda);

      console.log(`✨ ════════════════════════════════════════════ ✨`);
      console.log(`✨                                              ✨`);
      console.log(`✨  🎉 DEPLOYMENT COMPLETE!                     ✨`);
      console.log(`✨                                              ✨`);
      console.log(`✨  Scale AMM is now live on ${this.config.cluster.padEnd(13)} ✨`);
      console.log(`✨                                              ✨`);
      console.log(`✨  Program ID: ${this.config.programId}        `);
      console.log(`✨  Config PDA: ${configPda.toBase58()}        `);
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
    console.error("Usage: ts-node scripts/deploy.ts [devnet|testnet|mainnet]");
    process.exit(1);
  }

  const manager = new DeploymentManager(cluster);
  await manager.run();
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
