/**
 * Fee Sponsorship Module for Scale AMM
 *
 * Enables the platform to sponsor transaction fees for millions of token
 * creations, making pool creation effectively free for end users.
 *
 * Architecture:
 * - Platform maintains a hot wallet with SOL balance
 * - User signs transaction (authorizes action)
 * - Platform pays all transaction fees as fee payer
 * - User pays $0 in SOL
 *
 * @example
 * ```typescript
 * const sponsor = new FeeSponsor(connection, platformWallet);
 * const tx = await scale.createPoolTransaction(params);
 * const signature = await sponsor.sponsorAndSend(tx, userWallet.publicKey);
 * ```
 */

import {
  Connection,
  Transaction,
  PublicKey,
  Keypair,
  TransactionInstruction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
  VersionedTransaction,
  TransactionMessage,
} from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';

// ============================================================================
// TYPES
// ============================================================================

export interface SponsorshipConfig {
  /** Maximum compute units for optimization (default: 80,000 - optimized for Creator platform) */
  computeUnitLimit?: number;

  /** Priority fee in micro-lamports per compute unit (default: 0 - batch launches don't need speed) */
  priorityFeeMicroLamports?: number;

  /** Minimum sponsor balance threshold (default: 10 SOL) */
  minSponsorBalance?: number;

  /** Alert webhook URL when balance is low */
  lowBalanceWebhook?: string;
}

export interface SponsorshipMetrics {
  totalTransactionsSponsored: number;
  totalFeesSpent: number; // in lamports
  averageFeePerTransaction: number;
  currentSponsorBalance: number;
  lastSponsoredAt: Date;
}

// ============================================================================
// FEE SPONSOR CLASS
// ============================================================================

export class FeeSponsor {
  private connection: Connection;
  private sponsorWallet: Wallet;
  private config: Required<SponsorshipConfig>;
  private metrics: SponsorshipMetrics;

  constructor(
    connection: Connection,
    sponsorWallet: Wallet,
    config?: SponsorshipConfig
  ) {
    this.connection = connection;
    this.sponsorWallet = sponsorWallet;

    this.config = {
      computeUnitLimit: config?.computeUnitLimit || 80_000,  // Optimized for pool creation (was 200k)
      priorityFeeMicroLamports: config?.priorityFeeMicroLamports || 0,  // Zero priority for batch launches
      minSponsorBalance: config?.minSponsorBalance || 10_000_000_000, // 10 SOL
      lowBalanceWebhook: config?.lowBalanceWebhook || '',
    };

    this.metrics = {
      totalTransactionsSponsored: 0,
      totalFeesSpent: 0,
      averageFeePerTransaction: 0,
      currentSponsorBalance: 0,
      lastSponsoredAt: new Date(),
    };
  }

  /**
   * Sponsor a transaction: user authorizes, platform pays fees
   *
   * @param instructions Transaction instructions
   * @param userPublicKey User's public key (signs transaction)
   * @param userSignature Optional pre-signed transaction from user
   *
   * @example
   * ```typescript
   * const ix = await scale.createPoolInstruction(params);
   * const sig = await sponsor.sponsorTransaction([ix], userWallet.publicKey);
   * console.log('Pool created with sponsored fees:', sig);
   * ```
   */
  async sponsorTransaction(
    instructions: TransactionInstruction[],
    userPublicKey: PublicKey,
    userSignature?: Buffer
  ): Promise<string> {
    // Check sponsor balance
    await this.checkSponsorBalance();

    // Add compute budget instructions for optimization
    const computeIx = [
      ComputeBudgetProgram.setComputeUnitLimit({
        units: this.config.computeUnitLimit,
      }),
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: this.config.priorityFeeMicroLamports,
      }),
    ];

    // Create transaction with sponsor as fee payer
    const transaction = new Transaction();
    transaction.feePayer = this.sponsorWallet.publicKey; // SPONSOR PAYS
    transaction.add(...computeIx, ...instructions);

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    // Sign with sponsor wallet
    transaction.partialSign(this.sponsorWallet.payer);

    // TODO: User must also sign if they're a required signer
    // In practice, user signs on client side and sends signature

    // Send transaction
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.sponsorWallet.payer],
      {
        commitment: 'confirmed',
        maxRetries: 3,
      }
    );

    // Update metrics
    await this.updateMetrics(signature);

    return signature;
  }

  /**
   * Create sponsored transaction for user to sign
   *
   * User flow:
   * 1. Platform creates transaction with sponsor as fee payer
   * 2. User signs transaction on client side
   * 3. Platform receives signed transaction and submits
   *
   * @example
   * ```typescript
   * // Backend
   * const tx = await sponsor.createSponsoredTransaction(instructions, userPubkey);
   * const serialized = tx.serialize({ requireAllSignatures: false });
   * res.json({ transaction: serialized.toString('base64') });
   *
   * // Frontend
   * const tx = Transaction.from(Buffer.from(base64Tx, 'base64'));
   * await wallet.signTransaction(tx);
   * const signed = tx.serialize();
   * await fetch('/api/submit', { body: signed });
   * ```
   */
  async createSponsoredTransaction(
    instructions: TransactionInstruction[],
    userPublicKey: PublicKey
  ): Promise<Transaction> {
    // Check sponsor balance
    await this.checkSponsorBalance();

    // Add compute budget optimizations
    const computeIx = [
      ComputeBudgetProgram.setComputeUnitLimit({
        units: this.config.computeUnitLimit,
      }),
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: this.config.priorityFeeMicroLamports,
      }),
    ];

    // Create transaction
    const transaction = new Transaction();
    transaction.feePayer = this.sponsorWallet.publicKey; // SPONSOR PAYS
    transaction.add(...computeIx, ...instructions);

    // Get recent blockhash
    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    // Sponsor signs first
    transaction.partialSign(this.sponsorWallet.payer);

    return transaction;
  }

  /**
   * Submit user-signed sponsored transaction
   *
   * @param signedTransaction Fully signed transaction from user
   *
   * @example
   * ```typescript
   * const signature = await sponsor.submitSponsoredTransaction(userSignedTx);
   * ```
   */
  async submitSponsoredTransaction(signedTransaction: Transaction): Promise<string> {
    // Verify sponsor is fee payer
    if (!signedTransaction.feePayer?.equals(this.sponsorWallet.publicKey)) {
      throw new Error('Invalid transaction: sponsor is not fee payer');
    }

    // Send transaction
    const signature = await sendAndConfirmTransaction(
      this.connection,
      signedTransaction,
      [], // Already signed
      {
        commitment: 'confirmed',
        maxRetries: 3,
        skipPreflight: false,
      }
    );

    // Update metrics
    await this.updateMetrics(signature);

    return signature;
  }

  /**
   * Check sponsor wallet balance and alert if low
   */
  private async checkSponsorBalance(): Promise<void> {
    const balance = await this.connection.getBalance(this.sponsorWallet.publicKey);
    this.metrics.currentSponsorBalance = balance;

    if (balance < this.config.minSponsorBalance) {
      const message = `⚠️ Sponsor wallet balance low: ${balance / 1e9} SOL (min: ${this.config.minSponsorBalance / 1e9} SOL)`;

      console.error(message);

      // Send webhook alert if configured
      if (this.config.lowBalanceWebhook) {
        await this.sendLowBalanceAlert(balance);
      }

      throw new Error(`Insufficient sponsor balance: ${balance / 1e9} SOL`);
    }
  }

  /**
   * Send low balance alert to webhook
   */
  private async sendLowBalanceAlert(balance: number): Promise<void> {
    try {
      await fetch(this.config.lowBalanceWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert: 'sponsor_balance_low',
          balance: balance / 1e9,
          minBalance: this.config.minSponsorBalance / 1e9,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error('Failed to send low balance alert:', error);
    }
  }

  /**
   * Update sponsorship metrics
   */
  private async updateMetrics(signature: string): Promise<void> {
    try {
      // Get transaction details
      const txDetails = await this.connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (txDetails) {
        const fee = txDetails.meta?.fee || 5000; // Default 0.000005 SOL

        this.metrics.totalTransactionsSponsored++;
        this.metrics.totalFeesSpent += fee;
        this.metrics.averageFeePerTransaction =
          this.metrics.totalFeesSpent / this.metrics.totalTransactionsSponsored;
        this.metrics.lastSponsoredAt = new Date();
      }
    } catch (error) {
      console.error('Failed to update metrics:', error);
    }
  }

  /**
   * Get sponsorship metrics
   *
   * @example
   * ```typescript
   * const metrics = sponsor.getMetrics();
   * console.log('Sponsored transactions:', metrics.totalTransactionsSponsored);
   * console.log('Total fees spent:', metrics.totalFeesSpent / 1e9, 'SOL');
   * ```
   */
  getMetrics(): SponsorshipMetrics {
    return { ...this.metrics };
  }

  /**
   * Estimate cost for N pool creations
   *
   * @param poolCount Number of pools to create
   *
   * @example
   * ```typescript
   * const cost = await sponsor.estimateCost(1_000_000);
   * console.log('Cost for 1M pools:', cost.totalSol, 'SOL');
   * console.log('Per pool:', cost.perPoolSol, 'SOL');
   * ```
   */
  async estimateCost(
    poolCount: number
  ): Promise<{ totalSol: number; perPoolSol: number; breakdown: any }> {
    // Base transaction fee: ~0.000005 SOL
    const baseFee = 5000; // lamports

    // Priority fee
    const priorityFee = (this.config.computeUnitLimit * this.config.priorityFeeMicroLamports) / 1e6;

    // Rent for Pool account (307 bytes)
    const poolRent = await this.connection.getMinimumBalanceForRentExemption(307);

    // Rent for token accounts (2x ATA: quote vault + base vault)
    const ataRent = await this.connection.getMinimumBalanceForRentExemption(165);
    const totalAtaRent = ataRent * 2;

    // Total per pool
    const perPoolLamports = baseFee + priorityFee + poolRent + totalAtaRent;
    const perPoolSol = perPoolLamports / 1e9;

    // Total for N pools
    const totalSol = (perPoolLamports * poolCount) / 1e9;

    return {
      totalSol,
      perPoolSol,
      breakdown: {
        transactionFee: baseFee / 1e9,
        priorityFee: priorityFee / 1e9,
        poolAccountRent: poolRent / 1e9,
        vaultAccountsRent: totalAtaRent / 1e9,
        perPool: perPoolSol,
        totalForCount: totalSol,
      },
    };
  }

  /**
   * Get sponsor wallet public key
   */
  getSponsorPublicKey(): PublicKey {
    return this.sponsorWallet.publicKey;
  }
}

// ============================================================================
// BATCH SPONSORSHIP (Optimize for multiple pools)
// ============================================================================

export class BatchFeeSponsor extends FeeSponsor {
  /**
   * Sponsor multiple pool creations in batches
   *
   * Note: Solana transaction size limit is ~1232 bytes, so batching
   * is limited to ~5-10 pools per transaction depending on complexity.
   *
   * @example
   * ```typescript
   * const poolParams = [params1, params2, params3];
   * const signatures = await batchSponsor.sponsorBatch(poolParams, userPubkey);
   * ```
   */
  async sponsorBatch(
    instructionBatches: TransactionInstruction[][],
    userPublicKey: PublicKey
  ): Promise<string[]> {
    const signatures: string[] = [];

    for (const instructions of instructionBatches) {
      const sig = await this.sponsorTransaction(instructions, userPublicKey);
      signatures.push(sig);
    }

    return signatures;
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default FeeSponsor;
