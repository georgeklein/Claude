/**
 * Scale AMM TypeScript SDK
 *
 * Dead-simple SDK for integrating Scale AMM in <10 lines of code.
 * Hides all complexity: PDA derivation, account management, conversions.
 *
 * @example
 * ```typescript
 * const scale = new ScaleAMM(connection, wallet);
 * const result = await scale.buy(poolAddress, { crxAmount: 100, slippage: 1.0 });
 * console.log('Bought:', result.tokensReceived, 'tokens');
 * ```
 */

import { Connection, PublicKey, TransactionSignature, ComputeBudgetProgram } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { CreatorAmmV2 } from './types/creator_amm_v2';
import { IDL } from './types/creator_amm_v2';
import { ScaleError, translateAnchorError } from './errors';

// ============================================================================
// INTERNAL TYPES (TypeScript Type Safety)
// ============================================================================

/** Parsed mint account info from getParsedAccountInfo */
interface ParsedMintInfo {
  decimals: number;
  mintAuthority: string | null;
  supply: string;
  isInitialized: boolean;
  freezeAuthority: string | null;
}

/** Pool account data from on-chain fetch */
interface PoolData {
  baseMint: PublicKey;
  quoteMint: PublicKey;
  creator: PublicKey;
  quoteVault: PublicKey;
  baseVault: PublicKey;

  virtualQuoteReserves: BN;
  virtualBaseReserves: BN;
  realQuoteReserves: BN;
  realBaseReserves: BN;

  currentPhase: { preBonding: {} } | { graduated: {} };
  curveType: { constantProduct: {} } | { exponential: {} };

  feeBps: number;
  graduationThresholdCrx: BN;
  targetMarketCapUsd: BN;
  lastCrxPriceUsd: BN;
  tokenTotalSupply: BN;
  totalQuoteVolume: BN;
  createdAtSlot: BN;
  disableWaa: boolean;
  metadataUri: string;
}

/** Transaction confirmation configuration */
interface ConfirmationConfig {
  maxRetries?: number;          // Default: 4
  baseDelayMs?: number;          // Default: 2000 (2 seconds)
  maxDelayMs?: number;           // Default: 16000 (16 seconds)
  commitment?: 'processed' | 'confirmed' | 'finalized'; // Default: 'confirmed'
}

// ============================================================================
// TYPES
// ============================================================================

export interface InitializeConfig {
  crxMint: PublicKey;
  crxPriceOracle: PublicKey;           // Kept for backward compat, not used
  feeRecipient: PublicKey;
  initialCrxPriceUsd: number;          // e.g., 2.0 for $2.00 per CRX

  // Optional with defaults
  oracleMaxAgeSeconds?: number;        // Default: 60 seconds
  oracleMaxConfidenceBps?: number;     // Default: 100 bps (1%)
  approvedQuoteTokens?: PublicKey[];   // Whitelisted quote tokens (SOL, USDC, etc.)
}

export interface CreatePoolParams {
  baseMint: PublicKey;
  supply: number;                      // Token supply (human-readable)
  initialMarketCapUsd: number;         // Launch MC in USD
  graduationThresholdUsd: number;      // Graduate at X USD
  metadataUri?: string;                // Arweave/IPFS URI (max 64 chars, default: empty string)

  // Optional
  feeBps?: number;                     // Fee in basis points (default: 0, Creator uses 0/25/100 presets)
  curveType?: 'ConstantProduct' | 'Exponential'; // default: ConstantProduct
  disableWaa?: boolean;                // If true, skip WAA anti-dump fees (default: true - opt-in)
}

export interface BuyParams {
  crxAmount: number;                   // CRX to spend
  slippage?: number;                   // % slippage (default: 0.5)
  minTokens?: number;                  // Alternative to slippage
  priorityFee?: number;                // Micro-lamports per CU (e.g., 10000 = 0.00001 SOL per CU)
  computeUnits?: number;               // Compute unit limit (default: 200000)
}

export interface SellParams {
  tokenAmount: number;                 // Tokens to sell
  slippage?: number;                   // % slippage (default: 0.5)
  minCrx?: number;                     // Alternative to slippage
  priorityFee?: number;                // Micro-lamports per CU
  computeUnits?: number;               // Compute unit limit (default: 200000)
}

export interface PoolInfo {
  address: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  creator: PublicKey;

  phase: 'PreBonding' | 'Graduated';
  curveType: 'ConstantProduct' | 'Exponential';

  price: number;                       // CRX per token
  marketCapUsd: number;                // Current MC in USD
  liquidityCrx: number;                // CRX in pool
  liquidityTokens: number;             // Tokens in pool

  volumeCrx: number;                   // Total volume
  feeBps: number;                      // Current fee

  graduationThresholdCrx: number;      // CRX needed to graduate
  graduationProgress: number;          // % progress (0-100)

  initialPrice: number;                // Launch price
  targetMarketCapUsd: number;          // Initial target MC

  metadataUri: string;                 // Arweave/IPFS URI for pool metadata

  createdAt: Date;
  url: string;                         // Frontend URL to trade
}

export interface TradeResult {
  signature: string;

  // Trade details
  crxSpent?: number;                   // For buys
  tokensReceived?: number;             // For buys
  tokensSold?: number;                 // For sells
  crxReceived?: number;                // For sells

  fee: number;                         // Fee paid in CRX
  newPrice: number;                    // Price after trade
  priceImpact: number;                 // % price change

  // Phase transition (if occurred)
  graduated?: boolean;
  newPhase?: 'PreBonding' | 'Graduated';
}

export interface EstimateResult {
  output: number;                      // Tokens (buy) or CRX (sell)
  fee: number;                         // Fee in CRX
  priceImpact: number;                 // % change
  newPrice: number;                    // Price after trade
}

export interface PriceInfo {
  price: number;                       // CRX per token
  marketCapUsd: number;                // Current MC
  liquidityCrx: number;                // CRX liquidity
  phase: 'PreBonding' | 'Graduated';
}

export interface TradeEvent {
  pool: PublicKey;
  trader: PublicKey;
  isBuy: boolean;
  amount: number;                      // Tokens traded
  price: number;                       // Price at trade
  marketCapUsd: number;                // MC after trade
  timestamp: Date;
  signature: string;
}

export interface GraduationEvent {
  pool: PublicKey;
  baseMint: PublicKey;
  creator: PublicKey;

  crxAccumulated: number;
  marketCapUsd: number;
  finalPrice: number;

  totalVolume: number;
  totalFees: number;
  slotsToGraduate: number;

  timestamp: Date;
}

export interface ConfigInfo {
  address: PublicKey;
  authority: PublicKey;
  feeRecipient: PublicKey;
  crxMint: PublicKey;
  crxPriceOracle: PublicKey;
  crxPriceUsd: number;
  crxPriceLastUpdated: number;

  oracleMaxAgeSeconds: number;
  oracleMaxConfidenceBps: number;

  approvedQuoteTokens: PublicKey[];
  approvedQuoteCount: number;

  protocolFeeBps: number;                // Protocol fee in basis points (0-1000 = 0-10%)
}

export interface UserPosition {
  pool: PublicKey;
  user: PublicKey;
  weightedAverageEntrySlot: number;  // WAA slot for fee calculations
  amount: number;                     // Amount tracked for WAA
  currentSlot: number;                // Current slot for time calculation
  waaAge: number;                     // Age in slots (currentSlot - waaSlot)
  waaAgeSeconds: number;              // Age in seconds (~400ms per slot)
  hasWaaFee: boolean;                 // If true, selling within 30min window
}

export interface ConfigInitializedEvent {
  authority: PublicKey;
  feeRecipient: PublicKey;
  crxMint: PublicKey;
  crxPriceOracle: PublicKey;
  timestamp: Date;
}

export interface PhaseTransitionEvent {
  pool: PublicKey;
  baseMint: PublicKey;
  fromPhase: 'PreBonding' | 'Graduated';
  toPhase: 'PreBonding' | 'Graduated';
  slot: number;
  timestamp: Date;
}

// ============================================================================
// MAIN SDK CLASS
// ============================================================================

export class ScaleAMM {
  private connection: Connection;
  private wallet: Wallet;
  private program: Program<CreatorAmmV2>;
  private programId: PublicKey;
  private listeners: Map<number, number>; // listenerId -> subscriptionId
  private nextListenerId: number;

  constructor(
    connection: Connection,
    wallet: Wallet,
    programId?: PublicKey
  ) {
    this.connection = connection;
    this.wallet = wallet;
    this.programId = programId || new PublicKey('CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3');

    // Setup Anchor provider
    const provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    });

    // Initialize program
    this.program = new Program<CreatorAmmV2>(IDL, this.programId, provider);
    this.listeners = new Map();
    this.nextListenerId = 1;
  }

  // ==========================================================================
  // TRANSACTION HELPERS (Confirmation & Retry)
  // ==========================================================================

  /**
   * Confirm transaction with exponential backoff retry
   * Retries on network failures up to 4 times (2s, 4s, 8s, 16s delays)
   *
   * @internal
   */
  private async confirmTransactionWithRetry(
    signature: TransactionSignature,
    config?: ConfirmationConfig
  ): Promise<void> {
    const maxRetries = config?.maxRetries ?? 4;
    const baseDelayMs = config?.baseDelayMs ?? 2000;
    const maxDelayMs = config?.maxDelayMs ?? 16000;
    const commitment = config?.commitment ?? 'confirmed';

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const confirmation = await this.connection.confirmTransaction(
          signature,
          commitment
        );

        if (confirmation.value.err) {
          throw new ScaleError(
            'TRANSACTION_FAILED',
            `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
          );
        }

        // Success!
        return;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on transaction errors (only network errors)
        if (error instanceof ScaleError && error.code === 'TRANSACTION_FAILED') {
          throw error;
        }

        // If this was the last attempt, throw
        if (attempt === maxRetries) {
          break;
        }

        // Calculate delay with exponential backoff
        const delayMs = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // All retries exhausted
    throw new ScaleError(
      'CONFIRMATION_TIMEOUT',
      `Failed to confirm transaction after ${maxRetries + 1} attempts: ${lastError?.message}`
    );
  }

  /**
   * Get mint decimals from parsed account info
   *
   * @internal
   */
  private async getMintDecimals(mint: PublicKey): Promise<number> {
    const mintInfo = await this.connection.getParsedAccountInfo(mint);

    if (!mintInfo.value || !('parsed' in mintInfo.value.data)) {
      throw new ScaleError('INVALID_MINT', `Failed to parse mint account: ${mint.toBase58()}`);
    }

    const parsedData = mintInfo.value.data as { parsed: { info: ParsedMintInfo } };
    return parsedData.parsed.info.decimals;
  }

  /**
   * Get or create all required token accounts for a trade
   * Consolidates duplicate token account logic from buy/sell methods
   *
   * @internal
   */
  private async getTradeAccounts(
    poolData: PoolData,
    configData: any
  ): Promise<{
    userQuoteAccount: PublicKey;
    userBaseAccount: PublicKey;
    feeRecipientAccount: PublicKey;
    protocolFeeRecipient: PublicKey;
  }> {
    // Get/create user quote account (CRX)
    const userQuoteAccount = await getOrCreateAssociatedTokenAccount(
      this.connection,
      this.wallet.payer,
      poolData.quoteMint,
      this.wallet.publicKey
    );

    // Get/create user base account (token)
    const userBaseAccount = await getOrCreateAssociatedTokenAccount(
      this.connection,
      this.wallet.payer,
      poolData.baseMint,
      this.wallet.publicKey
    );

    // Get/create fee recipient account (creator fees)
    const feeRecipientAccount = await getOrCreateAssociatedTokenAccount(
      this.connection,
      this.wallet.payer,
      poolData.quoteMint,
      poolData.creator
    );

    // Get/create protocol fee recipient account (protocol fees)
    const protocolFeeRecipient = await getOrCreateAssociatedTokenAccount(
      this.connection,
      this.wallet.payer,
      poolData.quoteMint,
      configData.feeRecipient
    );

    return {
      userQuoteAccount: userQuoteAccount.address,
      userBaseAccount: userBaseAccount.address,
      feeRecipientAccount: feeRecipientAccount.address,
      protocolFeeRecipient: protocolFeeRecipient.address,
    };
  }

  // ==========================================================================
  // PROTOCOL SETUP (Admin Only)
  // ==========================================================================

  /**
   * Initialize the Scale AMM protocol (one-time, admin only)
   *
   * @example
   * ```typescript
   * await scale.initialize({
   *   crxMint: new PublicKey('CRX...'),
   *   crxPriceOracle: new PublicKey('ORACLE...'),
   *   feeRecipient: wallet.publicKey,
   * });
   * ```
   */
  async initialize(config: InitializeConfig): Promise<string> {
    try {
      // Apply defaults
      const oracleMaxAgeSeconds = config.oracleMaxAgeSeconds ?? 60;
      const oracleMaxConfidenceBps = config.oracleMaxConfidenceBps ?? 100;

      // Derive config PDA
      const [configPda] = this.deriveConfigPda();

      // Convert USD to micro-USD (6 decimals)
      const initialCrxPriceMicro = new BN(config.initialCrxPriceUsd * 1_000_000);

      // Setup approved quote tokens (default: empty array for CRX-only)
      const approvedQuoteTokens = config.approvedQuoteTokens ?? [];
      const paddedTokens = [...approvedQuoteTokens];
      while (paddedTokens.length < 5) {
        paddedTokens.push(PublicKey.default);
      }

      // Execute initialize
      const tx = await this.program.methods
        .initialize(
          initialCrxPriceMicro,
          new BN(oracleMaxAgeSeconds),
          new BN(oracleMaxConfidenceBps),
          paddedTokens,
          approvedQuoteTokens.length
        )
        .accounts({
          config: configPda,
          authority: this.wallet.publicKey,
          feeRecipient: config.feeRecipient,
          crxPriceOracle: config.crxPriceOracle,
          crxMint: config.crxMint,
          systemProgram: PublicKey.default, // Will be auto-filled by Anchor
        })
        .rpc();

      return tx;
    } catch (error) {
      throw translateAnchorError(error);
    }
  }

  /**
   * Update approved quote token whitelist (admin only)
   *
   * @example
   * ```typescript
   * await scale.updateApprovedQuotes([solMint, usdcMint, usdtMint]);
   * ```
   */
  async updateApprovedQuotes(tokens: PublicKey[]): Promise<string> {
    try {
      if (tokens.length > 5) {
        throw new ScaleError('INVALID_QUOTE_TOKEN_COUNT', 'Maximum 5 approved quote tokens');
      }

      // Pad array to 5 elements
      const approvedQuoteTokens = [...tokens];
      while (approvedQuoteTokens.length < 5) {
        approvedQuoteTokens.push(PublicKey.default);
      }

      const [configPda] = this.deriveConfigPda();

      const tx = await this.program.methods
        .updateApprovedQuotes(approvedQuoteTokens, tokens.length)
        .accounts({
          config: configPda,
          authority: this.wallet.publicKey,
        })
        .rpc();

      return tx;
    } catch (error) {
      throw translateAnchorError(error);
    }
  }

  /**
   * Update CRX price in USD (admin only)
   *
   * Use this to update the CRX price that pools use for virtual reserve calculations.
   * Can be automated with a cron job to keep prices current.
   *
   * @example
   * ```typescript
   * // Manual update
   * await scale.updateCrxPrice(2.15); // Update to $2.15
   *
   * // Automated with cron
   * setInterval(async () => {
   *   const price = await fetchCrxPriceFromAPI();
   *   await scale.updateCrxPrice(price);
   * }, 3600000); // Update hourly
   * ```
   */
  async updateCrxPrice(newPriceUsd: number): Promise<string> {
    try {
      // Validate price is reasonable ($0.01 to $1000)
      if (newPriceUsd < 0.01 || newPriceUsd > 1000) {
        throw new ScaleError('INVALID_CRX_PRICE', 'Price must be between $0.01 and $1000');
      }

      const [configPda] = this.deriveConfigPda();
      const priceWithDecimals = new BN(newPriceUsd * 1_000_000);

      const tx = await this.program.methods
        .updateCrxPrice(priceWithDecimals)
        .accounts({
          config: configPda,
          authority: this.wallet.publicKey,
        })
        .rpc();

      return tx;
    } catch (error) {
      throw translateAnchorError(error);
    }
  }

  /**
   * Update pool graduation threshold (admin only)
   *
   * Allows authority to dynamically adjust graduation thresholds for specific pools.
   * Can be automated with cron jobs to update daily based on metrics.
   *
   * @example
   * ```typescript
   * // Manual update
   * await scale.updatePoolGraduation(poolAddress, 50_000); // Update to $50k
   *
   * // Automated daily updates based on metrics
   * setInterval(async () => {
   *   const pools = await scale.getAllPools();
   *   for (const pool of pools) {
   *     const avgPrice = await getYesterdayAvgPrice(pool.baseMint);
   *     const newThreshold = calculateDynamicThreshold(avgPrice);
   *     await scale.updatePoolGraduation(pool.address, newThreshold);
   *   }
   * }, 86400000); // Daily
   * ```
   */
  async updatePoolGraduation(poolAddress: PublicKey, newGraduationThresholdUsd: number): Promise<string> {
    try {
      // Validate threshold is reasonable
      if (newGraduationThresholdUsd < 1_000 || newGraduationThresholdUsd > 10_000_000) {
        throw new ScaleError('INVALID_GRADUATION_THRESHOLD', 'Threshold must be between $1,000 and $10,000,000');
      }

      const [configPda] = this.deriveConfigPda();
      const thresholdWithDecimals = new BN(newGraduationThresholdUsd * 1_000_000);

      const tx = await this.program.methods
        .updatePoolGraduation(thresholdWithDecimals)
        .accounts({
          config: configPda,
          pool: poolAddress,
          authority: this.wallet.publicKey,
        })
        .rpc();

      return tx;
    } catch (error) {
      throw translateAnchorError(error);
    }
  }

  /**
   * Update protocol fee (admin only)
   *
   * Allows authority to adjust the global protocol fee applied to all pools.
   * Fee is retroactive - affects all existing pools immediately.
   * Fees go to config.feeRecipient for CRX deflation/treasury management.
   *
   * @param newProtocolFeeBps - Fee in basis points (0-1000 = 0-10%)
   *
   * @example
   * ```typescript
   * // Enable 0.1% protocol fee (10 bps)
   * await scale.updateProtocolFee(10);
   *
   * // Disable protocol fee
   * await scale.updateProtocolFee(0);
   *
   * // Set 1% protocol fee (100 bps)
   * await scale.updateProtocolFee(100);
   * ```
   */
  async updateProtocolFee(newProtocolFeeBps: number): Promise<string> {
    try {
      // Validate fee is within bounds (0-1000 bps = 0-10%)
      if (newProtocolFeeBps < 0 || newProtocolFeeBps > 1000) {
        throw new ScaleError('INVALID_FEE', 'Protocol fee must be between 0 and 1000 bps (0-10%)');
      }

      const [configPda] = this.deriveConfigPda();

      const tx = await this.program.methods
        .updateProtocolFee(newProtocolFeeBps)
        .accounts({
          config: configPda,
          authority: this.wallet.publicKey,
        })
        .rpc();

      return tx;
    } catch (error) {
      throw translateAnchorError(error);
    }
  }

  /**
   * Update protocol authority (admin only)
   *
   * Transfer control to a new authority wallet. This is irreversible.
   * Only the current authority can call this.
   *
   * Use cases:
   * - Upgrade to multisig (e.g., Squads)
   * - Transfer to DAO governance
   * - Rotate compromised keys
   *
   * @param newAuthority - New authority public key
   *
   * @example
   * ```typescript
   * // Transfer to multisig
   * const squadsMultisig = new PublicKey('SQUADS...');
   * await scale.updateAuthority(squadsMultisig);
   *
   * // Transfer to DAO
   * const daoAuthority = new PublicKey('DAO...');
   * await scale.updateAuthority(daoAuthority);
   * ```
   */
  async updateAuthority(newAuthority: PublicKey): Promise<string> {
    try {
      // Validate new authority is not default pubkey
      if (newAuthority.equals(PublicKey.default)) {
        throw new ScaleError('INVALID_AUTHORITY', 'New authority cannot be default pubkey');
      }

      const [configPda] = this.deriveConfigPda();

      // Fetch current config to check if authority is changing
      const configData = await this.program.account.config.fetch(configPda);
      if (newAuthority.equals(configData.authority)) {
        throw new ScaleError('INVALID_AUTHORITY', 'New authority must be different from current authority');
      }

      const tx = await this.program.methods
        .updateAuthority(newAuthority)
        .accounts({
          config: configPda,
          authority: this.wallet.publicKey,
        })
        .rpc();

      return tx;
    } catch (error) {
      throw translateAnchorError(error);
    }
  }

  /**
   * Update WAA (Weighted Average Age) anti-dump configuration (admin only)
   *
   * Allows authority to adjust time windows and fees for the WAA anti-dump system.
   * Changes are retroactive - affect all pools with WAA enabled immediately.
   *
   * @param config - WAA configuration parameters
   *
   * @example
   * ```typescript
   * // Disable WAA entirely (set fees to 0)
   * await scale.updateWaaConfig({
   *   tier1Slots: 25,
   *   tier2Slots: 150,
   *   tier3Slots: 750,
   *   feeMaxBps: 0,
   *   feeMinBps: 0,
   * });
   *
   * // Adjust WAA configuration (current defaults shown)
   * await scale.updateWaaConfig({
   *   tier1Slots: 25,      // 10 seconds
   *   tier2Slots: 150,     // 1 minute
   *   tier3Slots: 750,     // 5 minutes
   *   feeMaxBps: 300,      // 3%
   *   feeMinBps: 50,       // 0.5%
   * });
   * ```
   */
  async updateWaaConfig(config: {
    tier1Slots: number;
    tier2Slots: number;
    tier3Slots: number;
    feeMaxBps: number;
    feeMinBps: number;
  }): Promise<string> {
    try {
      // Validate tier ordering
      if (config.tier1Slots >= config.tier2Slots || config.tier2Slots >= config.tier3Slots) {
        throw new ScaleError('INVALID_FEE', 'WAA tiers must be ordered: T1 < T2 < T3');
      }

      // Validate fee range (0-1000 bps = 0-10%)
      if (config.feeMaxBps < 0 || config.feeMaxBps > 1000) {
        throw new ScaleError('INVALID_FEE', 'WAA max fee must be between 0 and 1000 bps (0-10%)');
      }

      if (config.feeMinBps < 0 || config.feeMinBps > config.feeMaxBps) {
        throw new ScaleError('INVALID_FEE', 'WAA min fee must be between 0 and max fee');
      }

      const [configPda] = this.deriveConfigPda();

      const tx = await this.program.methods
        .updateWaaConfig(
          config.tier1Slots,
          config.tier2Slots,
          config.tier3Slots,
          config.feeMaxBps,
          config.feeMinBps
        )
        .accounts({
          config: configPda,
          authority: this.wallet.publicKey,
        })
        .rpc();

      return tx;
    } catch (error) {
      throw translateAnchorError(error);
    }
  }

  // ==========================================================================
  // CREATOR OPERATIONS
  // ==========================================================================

  /**
   * Create a new bonding curve pool
   *
   * @example
   * ```typescript
   * const pool = await scale.createPool({
   *   baseMint: myTokenMint,
   *   supply: 1_000_000,
   *   initialMarketCapUsd: 10_000,
   *   graduationThresholdUsd: 40_000,
   * });
   * console.log('Pool created:', pool.address);
   * ```
   */
  async createPool(params: CreatePoolParams): Promise<PoolInfo> {
    try {
      // Apply defaults
      const feeBps = params.feeBps ?? 0;
      const curveType = params.curveType ?? 'ConstantProduct';
      const disableWaa = params.disableWaa ?? true;  // Default: WAA disabled (opt-in)
      const metadataUri = params.metadataUri ?? '';

      // Validate fee
      if (![0, 25, 100].includes(feeBps)) {
        throw new ScaleError('INVALID_FEE', 'Fee must be 0, 25, or 100 bps');
      }

      // Validate metadata URI
      if (metadataUri.length > 64) {
        throw new ScaleError('INVALID_METADATA', 'Metadata URI must be 64 characters or less');
      }

      // Get token decimals
      const decimals = await this.getMintDecimals(params.baseMint);

      // Convert human-readable to on-chain format
      const tokenSupply = new BN(params.supply * Math.pow(10, decimals));
      const targetMarketCapUsd = new BN(params.initialMarketCapUsd * 1_000_000);
      const graduationThresholdUsd = new BN(params.graduationThresholdUsd * 1_000_000);

      // Derive PDAs
      const [configPda] = this.deriveConfigPda();
      const [poolPda] = this.derivePoolPda(params.baseMint);
      const [quoteVaultPda] = this.deriveQuoteVaultPda(poolPda);
      const [baseVaultPda] = this.deriveBaseVaultPda(poolPda);

      // Fetch config to get CRX mint
      const configData = await this.program.account.config.fetch(configPda);

      // Get creator's base token account
      const creatorBaseAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.wallet.payer,
        params.baseMint,
        this.wallet.publicKey
      );

      // Map curve type to enum
      const curveTypeEnum = curveType === 'Exponential'
        ? { exponential: {} }
        : { constantProduct: {} };

      // Execute create_pool
      const tx = await this.program.methods
        .createPool(
          targetMarketCapUsd,
          tokenSupply,
          feeBps,
          curveTypeEnum,
          graduationThresholdUsd,
          disableWaa,
          metadataUri
        )
        .accounts({
          config: configPda,
          pool: poolPda,
          quoteMint: configData.crxMint,
          baseMint: params.baseMint,
          quoteVault: quoteVaultPda,
          baseVault: baseVaultPda,
          creatorBaseAccount: creatorBaseAccount.address,
          creator: this.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: PublicKey.default,
        })
        .rpc();

      // Fetch pool state and return info
      return await this.getPool(params.baseMint);
    } catch (error) {
      throw translateAnchorError(error);
    }
  }

  // ==========================================================================
  // TRADER OPERATIONS
  // ==========================================================================

  /**
   * Buy tokens with CRX
   *
   * @example
   * ```typescript
   * const result = await scale.buy(poolAddress, {
   *   crxAmount: 100,
   *   slippage: 1.0,
   * });
   * console.log('Bought:', result.tokensReceived, 'tokens');
   * ```
   */
  async buy(pool: PublicKey, params: BuyParams): Promise<TradeResult> {
    try {
      const slippage = params.slippage ?? 0.5;

      // Fetch pool state
      const poolData = await this.program.account.pool.fetch(pool) as PoolData;

      // Get token decimals
      const quoteDecimals = await this.getMintDecimals(poolData.quoteMint);
      const baseDecimals = await this.getMintDecimals(poolData.baseMint);

      // Convert CRX to lamports
      const quoteAmount = new BN(params.crxAmount * Math.pow(10, quoteDecimals));

      // Estimate output for slippage calculation
      let minBaseAmount: BN;
      if (params.minTokens !== undefined) {
        minBaseAmount = new BN(params.minTokens * Math.pow(10, baseDecimals));
      } else {
        const estimated = await this.estimateBuyInternal(poolData, params.crxAmount);
        minBaseAmount = new BN(estimated.output * (1 - slippage / 100) * Math.pow(10, baseDecimals));
      }

      // Derive PDAs
      const [configPda] = this.deriveConfigPda();
      const [quoteVaultPda] = this.deriveQuoteVaultPda(pool);
      const [baseVaultPda] = this.deriveBaseVaultPda(pool);

      // Fetch config and get all required token accounts
      const configData = await this.program.account.config.fetch(configPda);
      const accounts = await this.getTradeAccounts(poolData, configData);

      // Build transaction with priority fees if specified
      const tx = this.program.methods
        .buy(quoteAmount, minBaseAmount)
        .accounts({
          config: configPda,
          pool,
          quoteVault: quoteVaultPda,
          baseVault: baseVaultPda,
          userQuoteAccount: accounts.userQuoteAccount,
          userBaseAccount: accounts.userBaseAccount,
          feeRecipientAccount: accounts.feeRecipientAccount,
          protocolFeeRecipient: accounts.protocolFeeRecipient,
          user: this.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        });

      // Add priority fees if specified
      if (params.priorityFee || params.computeUnits) {
        const computeUnits = params.computeUnits ?? 200000;
        tx.preInstructions([
          ...(params.priorityFee ? [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: params.priorityFee })] : []),
          ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
        ]);
      }

      // Execute and get signature
      const signature = await tx.rpc();

      // Confirm with retry logic
      await this.confirmTransactionWithRetry(signature);

      // Parse result from transaction
      return await this.parseTradeResult(signature, true);
    } catch (error) {
      throw translateAnchorError(error);
    }
  }

  /**
   * Sell tokens for CRX
   *
   * @example
   * ```typescript
   * const result = await scale.sell(poolAddress, {
   *   tokenAmount: 50,
   *   slippage: 1.0,
   * });
   * console.log('Received:', result.crxReceived, 'CRX');
   * ```
   */
  async sell(pool: PublicKey, params: SellParams): Promise<TradeResult> {
    try {
      const slippage = params.slippage ?? 0.5;

      // Fetch pool state
      const poolData = await this.program.account.pool.fetch(pool) as PoolData;

      // Get token decimals
      const baseDecimals = await this.getMintDecimals(poolData.baseMint);
      const quoteDecimals = await this.getMintDecimals(poolData.quoteMint);

      // Convert tokens to lamports
      const baseAmount = new BN(params.tokenAmount * Math.pow(10, baseDecimals));

      // Estimate output for slippage calculation
      let minQuoteAmount: BN;
      if (params.minCrx !== undefined) {
        minQuoteAmount = new BN(params.minCrx * Math.pow(10, quoteDecimals));
      } else {
        const estimated = await this.estimateSellInternal(poolData, params.tokenAmount);
        minQuoteAmount = new BN(estimated.output * (1 - slippage / 100) * Math.pow(10, quoteDecimals));
      }

      // Derive PDAs
      const [configPda] = this.deriveConfigPda();
      const [quoteVaultPda] = this.deriveQuoteVaultPda(pool);
      const [baseVaultPda] = this.deriveBaseVaultPda(pool);

      // Fetch config and get all required token accounts
      const configData = await this.program.account.config.fetch(configPda);
      const accounts = await this.getTradeAccounts(poolData, configData);

      // Build transaction with priority fees if specified
      const tx = this.program.methods
        .sell(baseAmount, minQuoteAmount)
        .accounts({
          config: configPda,
          pool,
          quoteVault: quoteVaultPda,
          baseVault: baseVaultPda,
          userQuoteAccount: accounts.userQuoteAccount,
          userBaseAccount: accounts.userBaseAccount,
          feeRecipientAccount: accounts.feeRecipientAccount,
          protocolFeeRecipient: accounts.protocolFeeRecipient,
          user: this.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        });

      // Add priority fees if specified
      if (params.priorityFee || params.computeUnits) {
        const computeUnits = params.computeUnits ?? 200000;
        tx.preInstructions([
          ...(params.priorityFee ? [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: params.priorityFee })] : []),
          ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
        ]);
      }

      // Execute and get signature
      const signature = await tx.rpc();

      // Confirm with retry logic
      await this.confirmTransactionWithRetry(signature);

      // Parse result from transaction
      return await this.parseTradeResult(signature, false);
    } catch (error) {
      throw translateAnchorError(error);
    }
  }

  // ==========================================================================
  // QUERY OPERATIONS (No Transactions)
  // ==========================================================================

  /**
   * Get complete pool information
   *
   * @example
   * ```typescript
   * const pool = await scale.getPool(tokenMint);
   * console.log('Price:', pool.price, 'CRX per token');
   * console.log('Market Cap:', pool.marketCapUsd, 'USD');
   * ```
   */
  async getPool(baseMint: PublicKey): Promise<PoolInfo> {
    try {
      const [poolPda] = this.derivePoolPda(baseMint);
      const poolData = await this.program.account.pool.fetch(poolPda) as PoolData;

      // Calculate derived values
      const price = this.calculatePrice(poolData);
      const marketCapUsd = this.calculateMarketCapUsd(poolData, price);
      const graduationProgress = this.calculateGraduationProgress(poolData);

      // Format phase and curve type
      const phase = 'graduated' in poolData.currentPhase
        ? 'Graduated' as const
        : 'PreBonding' as const;

      const curveType = 'exponential' in poolData.curveType
        ? 'Exponential' as const
        : 'ConstantProduct' as const;

      return {
        address: poolPda,
        baseMint: poolData.baseMint,
        quoteMint: poolData.quoteMint,
        creator: poolData.creator,

        phase,
        curveType,

        price,
        marketCapUsd,
        liquidityCrx: poolData.realQuoteReserves.toNumber() / 1_000_000,
        liquidityTokens: poolData.realBaseReserves.toNumber() / 1_000_000,

        volumeCrx: poolData.totalQuoteVolume.toNumber() / 1_000_000,
        feeBps: poolData.feeBps,

        graduationThresholdCrx: poolData.graduationThresholdCrx.toNumber() / 1_000_000,
        graduationProgress,

        initialPrice: poolData.virtualQuoteReserves.toNumber() / poolData.virtualBaseReserves.toNumber(),
        targetMarketCapUsd: poolData.targetMarketCapUsd.toNumber() / 1_000_000,

        metadataUri: poolData.metadataUri,

        createdAt: new Date(poolData.createdAtSlot.toNumber() * 400), // ~400ms per slot
        url: `https://scale-amm.xyz/pool/${poolPda.toBase58()}`,
      };
    } catch (error) {
      throw translateAnchorError(error);
    }
  }

  /**
   * Get current price information
   *
   * @example
   * ```typescript
   * const price = await scale.getPrice(poolAddress);
   * console.log('Current price:', price.price, 'CRX per token');
   * ```
   */
  async getPrice(pool: PublicKey): Promise<PriceInfo> {
    try {
      const poolData = await this.program.account.pool.fetch(pool) as PoolData;
      const price = this.calculatePrice(poolData);
      const marketCapUsd = this.calculateMarketCapUsd(poolData, price);

      const phase = 'graduated' in poolData.currentPhase
        ? 'Graduated' as const
        : 'PreBonding' as const;

      return {
        price,
        marketCapUsd,
        liquidityCrx: poolData.realQuoteReserves.toNumber() / 1_000_000,
        phase,
      };
    } catch (error) {
      throw translateAnchorError(error);
    }
  }

  /**
   * Get protocol configuration
   *
   * @example
   * ```typescript
   * const config = await scale.getConfig();
   * console.log('Fee recipient:', config.feeRecipient.toBase58());
   * console.log('CRX mint:', config.crxMint.toBase58());
   * console.log('Pre-bonding fee:', config.preBondingFeeBps / 100, '%');
   * ```
   */
  async getConfig(): Promise<ConfigInfo> {
    try {
      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('config')],
        this.programId
      );

      const configData = await this.program.account.config.fetch(configPda);

      return {
        address: configPda,
        authority: configData.authority,
        feeRecipient: configData.feeRecipient,
        crxMint: configData.crxMint,
        crxPriceOracle: configData.crxPriceOracle,
        crxPriceUsd: configData.crxPriceUsd.toNumber() / 1_000_000,
        crxPriceLastUpdated: configData.crxPriceLastUpdated.toNumber(),

        oracleMaxAgeSeconds: configData.oracleMaxAgeSeconds.toNumber(),
        oracleMaxConfidenceBps: configData.oracleMaxConfidenceBps.toNumber(),

        approvedQuoteTokens: configData.approvedQuoteTokens,
        approvedQuoteCount: configData.approvedQuoteCount,

        protocolFeeBps: configData.protocolFeeBps,
      };
    } catch (error) {
      throw translateAnchorError(error);
    }
  }

  /**
   * Estimate buy output (no transaction)
   *
   * @example
   * ```typescript
   * const estimate = await scale.estimateBuy(poolAddress, 100);
   * console.log('Will receive:', estimate.output, 'tokens');
   * console.log('Price impact:', estimate.priceImpact, '%');
   * ```
   */
  async estimateBuy(pool: PublicKey, crxAmount: number): Promise<EstimateResult> {
    try {
      const poolData = await this.program.account.pool.fetch(pool) as PoolData;
      return await this.estimateBuyInternal(poolData, crxAmount);
    } catch (error) {
      throw translateAnchorError(error);
    }
  }

  /**
   * Estimate sell output (no transaction)
   *
   * @example
   * ```typescript
   * const estimate = await scale.estimateSell(poolAddress, 50);
   * console.log('Will receive:', estimate.output, 'CRX');
   * ```
   */
  async estimateSell(pool: PublicKey, tokenAmount: number): Promise<EstimateResult> {
    try {
      const poolData = await this.program.account.pool.fetch(pool) as PoolData;
      return await this.estimateSellInternal(poolData, tokenAmount);
    } catch (error) {
      throw translateAnchorError(error);
    }
  }

  /**
   * Get user position for WAA fee tracking
   *
   * @example
   * ```typescript
   * const position = await scale.getUserPosition(userWallet, poolAddress);
   * console.log('WAA age:', position.waaAgeSeconds, 'seconds');
   * console.log('Has WAA fee:', position.hasWaaFee);
   * ```
   */
  async getUserPosition(user: PublicKey, pool: PublicKey): Promise<UserPosition | null> {
    try {
      // Derive UserPosition PDA
      const [positionPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('pos'),
          pool.toBuffer(),
          user.toBuffer(),
        ],
        this.programId
      );

      // Try to fetch the position account
      try {
        const positionData = await this.program.account.userPosition.fetch(positionPda);
        const currentSlot = await this.connection.getSlot();

        const waaSlot = positionData.weightedAverageEntrySlot.toNumber();
        const waaAge = currentSlot - waaSlot;
        const waaAgeSeconds = waaAge * 0.4; // ~400ms per slot

        // WAA fee active if selling within 5 minutes (750 slots)
        const hasWaaFee = waaAge < 750;

        return {
          pool: positionData.pool,
          user: positionData.user,
          weightedAverageEntrySlot: waaSlot,
          amount: positionData.amount.toNumber() / 1_000_000,
          currentSlot,
          waaAge,
          waaAgeSeconds,
          hasWaaFee,
        };
      } catch (accountError) {
        // Account doesn't exist - user has no position
        return null;
      }
    } catch (error) {
      throw translateAnchorError(error);
    }
  }

  /**
   * Get all pools from the protocol
   *
   * @param limit Optional limit on number of pools to return (default: 100)
   * @param offset Optional offset for pagination (default: 0)
   *
   * @example
   * ```typescript
   * const pools = await scale.getAllPools();
   * console.log('Total pools:', pools.length);
   *
   * // With pagination
   * const firstPage = await scale.getAllPools(10, 0);
   * const secondPage = await scale.getAllPools(10, 10);
   * ```
   */
  async getAllPools(limit: number = 100, offset: number = 0): Promise<PoolInfo[]> {
    try {
      // Get all pool accounts
      const poolAccounts = await this.program.account.pool.all();

      // Apply pagination
      const paginatedAccounts = poolAccounts.slice(offset, offset + limit);

      // Convert to PoolInfo
      const pools: PoolInfo[] = [];
      for (const account of paginatedAccounts) {
        const poolData = account.account as PoolData;
        const price = this.calculatePrice(poolData);
        const marketCapUsd = this.calculateMarketCapUsd(poolData, price);
        const graduationProgress = this.calculateGraduationProgress(poolData);

        const phase = 'graduated' in poolData.currentPhase
          ? 'Graduated' as const
          : 'PreBonding' as const;

        const curveType = 'exponential' in poolData.curveType
          ? 'Exponential' as const
          : 'ConstantProduct' as const;

        pools.push({
          address: account.publicKey,
          baseMint: poolData.baseMint,
          quoteMint: poolData.quoteMint,
          creator: poolData.creator,

          phase,
          curveType,

          price,
          marketCapUsd,
          liquidityCrx: poolData.realQuoteReserves.toNumber() / 1_000_000,
          liquidityTokens: poolData.realBaseReserves.toNumber() / 1_000_000,

          volumeCrx: poolData.totalQuoteVolume.toNumber() / 1_000_000,
          feeBps: poolData.feeBps,

          graduationThresholdCrx: poolData.graduationThresholdCrx.toNumber() / 1_000_000,
          graduationProgress,

          initialPrice: poolData.virtualQuoteReserves.toNumber() / poolData.virtualBaseReserves.toNumber(),
          targetMarketCapUsd: poolData.targetMarketCapUsd.toNumber() / 1_000_000,

          metadataUri: poolData.metadataUri,

          createdAt: new Date(poolData.createdAtSlot.toNumber() * 400),
          url: `https://scale-amm.xyz/pool/${account.publicKey.toBase58()}`,
        });
      }

      return pools;
    } catch (error) {
      throw translateAnchorError(error);
    }
  }

  /**
   * Get pools by creator
   *
   * @example
   * ```typescript
   * const myPools = await scale.getPoolsByCreator(wallet.publicKey);
   * console.log('My pools:', myPools.length);
   * ```
   */
  async getPoolsByCreator(creator: PublicKey): Promise<PoolInfo[]> {
    try {
      const allPools = await this.getAllPools(1000); // Get up to 1000 pools
      return allPools.filter(pool => pool.creator.equals(creator));
    } catch (error) {
      throw translateAnchorError(error);
    }
  }

  // ==========================================================================
  // EVENT LISTENING
  // ==========================================================================

  /**
   * Listen to trade events on a pool
   *
   * @example
   * ```typescript
   * const listener = scale.onTrade(poolAddress, (trade) => {
   *   console.log(`${trade.isBuy ? 'BUY' : 'SELL'}:`, trade.amount);
   * });
   * ```
   */
  onTrade(pool: PublicKey, callback: (trade: TradeEvent) => void): number {
    const listenerId = this.nextListenerId++;

    const subscriptionId = this.program.addEventListener('TradeExecuted', (event) => {
      if (event.pool.equals(pool)) {
        callback({
          pool: event.pool,
          trader: event.user,
          isBuy: event.isBuy,
          amount: event.outputAmount.toNumber() / 1_000_000,
          price: event.priceAfter.toNumber() / 1_000_000_000,
          marketCapUsd: event.marketCapUsd.toNumber() / 1_000_000,
          timestamp: new Date(event.timestamp * 1000),
          signature: '', // Available from transaction context
        });
      }
    });

    this.listeners.set(listenerId, subscriptionId);
    return listenerId;
  }

  /**
   * Listen to graduation events on a pool
   *
   * @example
   * ```typescript
   * const listener = scale.onGraduation(poolAddress, (event) => {
   *   console.log('🎉 Pool graduated at', event.marketCapUsd, 'USD');
   * });
   * ```
   */
  onGraduation(pool: PublicKey, callback: (event: GraduationEvent) => void): number {
    const listenerId = this.nextListenerId++;

    const subscriptionId = this.program.addEventListener('PoolGraduated', (event) => {
      if (event.pool.equals(pool)) {
        callback({
          pool: event.pool,
          baseMint: event.baseMint,
          creator: event.creator,
          crxAccumulated: event.totalCrxAccumulated.toNumber() / 1_000_000,
          marketCapUsd: event.marketCapUsdAtGraduation.toNumber() / 1_000_000,
          finalPrice: event.priceAtGraduation.toNumber() / 1_000_000_000,
          totalVolume: event.totalVolumeCrx.toNumber() / 1_000_000,
          totalFees: event.totalFeesCollected.toNumber() / 1_000_000,
          slotsToGraduate: event.slotsToGraduate.toNumber(),
          timestamp: new Date(event.timestamp * 1000),
        });
      }
    });

    this.listeners.set(listenerId, subscriptionId);
    return listenerId;
  }

  /**
   * Listen to config initialized event (protocol deployment)
   *
   * @example
   * ```typescript
   * const listener = scale.onConfigInitialized((event) => {
   *   console.log('Protocol initialized by:', event.authority.toBase58());
   *   console.log('Fee recipient:', event.feeRecipient.toBase58());
   * });
   * ```
   */
  onConfigInitialized(callback: (event: ConfigInitializedEvent) => void): number {
    const listenerId = this.nextListenerId++;

    const subscriptionId = this.program.addEventListener('ConfigInitialized', (event) => {
      callback({
        authority: event.authority,
        feeRecipient: event.feeRecipient,
        crxMint: event.crxMint,
        crxPriceOracle: event.crxPriceOracle,
        timestamp: new Date(event.timestamp.toNumber() * 1000),
      });
    });

    this.listeners.set(listenerId, subscriptionId);
    return listenerId;
  }

  /**
   * Listen to phase transition events (PreBonding → Graduated)
   *
   * @example
   * ```typescript
   * const listener = scale.onPhaseTransition(poolAddress, (event) => {
   *   console.log(`Pool transitioned: ${event.fromPhase} → ${event.toPhase}`);
   * });
   * ```
   */
  onPhaseTransition(pool: PublicKey, callback: (event: PhaseTransitionEvent) => void): number {
    const listenerId = this.nextListenerId++;

    const subscriptionId = this.program.addEventListener('PhaseTransition', (event) => {
      if (event.pool.equals(pool)) {
        const fromPhase = 'graduated' in event.fromPhase
          ? 'Graduated' as const
          : 'PreBonding' as const;

        const toPhase = 'graduated' in event.toPhase
          ? 'Graduated' as const
          : 'PreBonding' as const;

        callback({
          pool: event.pool,
          baseMint: event.baseMint,
          fromPhase,
          toPhase,
          slot: event.slot.toNumber(),
          timestamp: new Date(event.timestamp.toNumber() * 1000),
        });
      }
    });

    this.listeners.set(listenerId, subscriptionId);
    return listenerId;
  }

  /**
   * Remove an event listener
   *
   * @example
   * ```typescript
   * scale.removeListener(listenerId);
   * ```
   */
  async removeListener(listenerId: number): Promise<void> {
    const subscriptionId = this.listeners.get(listenerId);
    if (subscriptionId !== undefined) {
      await this.program.removeEventListener(subscriptionId);
      this.listeners.delete(listenerId);
    }
  }

  // ==========================================================================
  // INTERNAL HELPERS (Private)
  // ==========================================================================

  private deriveConfigPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      this.programId
    );
  }

  private derivePoolPda(baseMint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), baseMint.toBuffer()],
      this.programId
    );
  }

  private deriveQuoteVaultPda(pool: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('quote_vault'), pool.toBuffer()],
      this.programId
    );
  }

  private deriveBaseVaultPda(pool: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('base_vault'), pool.toBuffer()],
      this.programId
    );
  }

  private calculatePrice(poolData: PoolData): number {
    const phase = 'graduated' in poolData.currentPhase ? 'Graduated' : 'PreBonding';

    if (phase === 'Graduated') {
      return poolData.realQuoteReserves.toNumber() / poolData.realBaseReserves.toNumber();
    } else {
      return poolData.virtualQuoteReserves.toNumber() / poolData.virtualBaseReserves.toNumber();
    }
  }

  private calculateMarketCapUsd(poolData: PoolData, price: number): number {
    const marketCapCrx = price * poolData.tokenTotalSupply.toNumber();
    const marketCapUsd = (marketCapCrx * poolData.lastCrxPriceUsd.toNumber()) / 1_000_000;
    return marketCapUsd / 1_000_000; // Convert to human-readable
  }

  private calculateGraduationProgress(poolData: PoolData): number {
    const progress = (poolData.realQuoteReserves.toNumber() / poolData.graduationThresholdCrx.toNumber()) * 100;
    return Math.min(progress, 100);
  }

  private async estimateBuyInternal(poolData: PoolData, crxAmount: number): Promise<EstimateResult> {
    // Implement bonding curve math here
    // This is a simplified version - actual implementation should match Rust logic
    const phase = 'graduated' in poolData.currentPhase ? 'Graduated' : 'PreBonding';
    const reserves = phase === 'Graduated'
      ? { quote: poolData.realQuoteReserves, base: poolData.realBaseReserves }
      : { quote: poolData.virtualQuoteReserves, base: poolData.virtualBaseReserves };

    const fee = (crxAmount * poolData.feeBps) / 10000;
    const swapAmount = crxAmount - fee;

    // Constant product formula: output = (input * Y) / (X + input)
    const output = (swapAmount * reserves.base.toNumber()) / (reserves.quote.toNumber() + swapAmount);

    const oldPrice = reserves.quote.toNumber() / reserves.base.toNumber();
    const newPrice = (reserves.quote.toNumber() + swapAmount) / (reserves.base.toNumber() - output);
    const priceImpact = ((newPrice - oldPrice) / oldPrice) * 100;

    return {
      output: output / 1_000_000,
      fee: fee,
      priceImpact,
      newPrice: newPrice / 1_000_000,
    };
  }

  private async estimateSellInternal(poolData: PoolData, tokenAmount: number): Promise<EstimateResult> {
    // Similar to estimateBuyInternal but reversed
    const phase = 'graduated' in poolData.currentPhase ? 'Graduated' : 'PreBonding';
    const reserves = phase === 'Graduated'
      ? { quote: poolData.realQuoteReserves, base: poolData.realBaseReserves }
      : { quote: poolData.virtualQuoteReserves, base: poolData.virtualBaseReserves };

    const fee = (tokenAmount * poolData.feeBps) / 10000;
    const swapAmount = tokenAmount - fee;

    const output = (swapAmount * reserves.quote.toNumber()) / (reserves.base.toNumber() + swapAmount);

    const oldPrice = reserves.quote.toNumber() / reserves.base.toNumber();
    const newPrice = (reserves.quote.toNumber() - output) / (reserves.base.toNumber() + swapAmount);
    const priceImpact = ((oldPrice - newPrice) / oldPrice) * 100;

    return {
      output: output / 1_000_000,
      fee: fee,
      priceImpact,
      newPrice: newPrice / 1_000_000,
    };
  }

  private async parseTradeResult(signature: string, isBuy: boolean): Promise<TradeResult> {
    // Fetch transaction details
    const tx = await this.connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || !tx.meta) {
      throw new ScaleError('TRANSACTION_NOT_FOUND', 'Transaction not found or not confirmed');
    }

    // Parse TradeExecuted event from logs
    const logs = tx.meta.logMessages || [];

    // Look for TradeExecuted event data
    // Format: "Program data: <base64_encoded_event>"
    const eventLog = logs.find(log => log.includes('Program data:'));

    if (!eventLog) {
      throw new ScaleError('EVENT_NOT_FOUND', 'TradeExecuted event not found in transaction logs');
    }

    // Parse the event data (simplified - in production would use proper event parsing)
    // TODO: Implement proper Anchor event decoding for accurate price and impact data
    const fee = Math.abs(tx.meta.fee);

    return {
      signature,
      fee,
      newPrice: 0, // TODO: Parse from event using Anchor event decoder
      priceImpact: 0, // TODO: Calculate from pre/post reserves in event
    };
  }

}
