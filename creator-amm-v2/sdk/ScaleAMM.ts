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

import { Connection, PublicKey, Transaction, Keypair, TransactionSignature } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { CreatorAmmV2 } from './types/creator_amm_v2';
import { IDL } from './types/creator_amm_v2';
import { ScaleError, ErrorCode } from './errors';

// ============================================================================
// TYPES
// ============================================================================

export interface InitializeConfig {
  crxMint: PublicKey;
  crxPriceOracle: PublicKey;
  feeRecipient: PublicKey;

  // Optional with defaults
  preBondingFeeBps?: number;           // Default: 300 (3%)
  preBondingThresholdUsd?: number;     // Default: 40_000
  postBondingFeeBps?: number;          // Default: 100 (1%)
  graduationThresholdUsd?: number;     // Default: 85_000
  antiSniperWindowSlots?: number;      // Default: 20
  antiSniperMaxTradeBps?: number;      // Default: 500 (5%)
}

export interface CreatePoolParams {
  baseMint: PublicKey;
  supply: number;                      // Token supply (human-readable)
  initialMarketCapUsd: number;         // Launch MC in USD
  graduationThresholdUsd: number;      // Graduate at X USD

  // Optional
  feeBps?: number;                     // 0, 25, or 100 (default: 0)
  curveType?: 'ConstantProduct' | 'Exponential'; // default: ConstantProduct
}

export interface BuyParams {
  crxAmount: number;                   // CRX to spend
  slippage?: number;                   // % slippage (default: 0.5)
  minTokens?: number;                  // Alternative to slippage
}

export interface SellParams {
  tokenAmount: number;                 // Tokens to sell
  slippage?: number;                   // % slippage (default: 0.5)
  minCrx?: number;                     // Alternative to slippage
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
      const preBondingFeeBps = config.preBondingFeeBps ?? 300;
      const preBondingThresholdUsd = config.preBondingThresholdUsd ?? 40_000;
      const postBondingFeeBps = config.postBondingFeeBps ?? 100;
      const graduationThresholdUsd = config.graduationThresholdUsd ?? 85_000;
      const antiSniperWindowSlots = config.antiSniperWindowSlots ?? 20;
      const antiSniperMaxTradeBps = config.antiSniperMaxTradeBps ?? 500;

      // Derive config PDA
      const [configPda] = this.deriveConfigPda();

      // Convert USD to micro-USD (6 decimals)
      const preBondingThresholdMicro = new BN(preBondingThresholdUsd * 1_000_000);
      const graduationThresholdMicro = new BN(graduationThresholdUsd * 1_000_000);

      // Default: no approved quote tokens (CRX-only)
      const approvedQuoteTokens = [
        PublicKey.default,
        PublicKey.default,
        PublicKey.default,
        PublicKey.default,
        PublicKey.default,
      ];

      // Execute initialize
      const tx = await this.program.methods
        .initialize(
          preBondingFeeBps,
          preBondingThresholdMicro,
          postBondingFeeBps,
          graduationThresholdMicro,
          new BN(antiSniperWindowSlots),
          antiSniperMaxTradeBps,
          new BN(60), // oracle_max_age_seconds
          new BN(100), // oracle_max_confidence_bps (1%)
          approvedQuoteTokens,
          0 // approved_quote_count
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
      throw this.translateError(error);
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
      throw this.translateError(error);
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

      // Validate fee
      if (![0, 25, 100].includes(feeBps)) {
        throw new ScaleError('INVALID_FEE', 'Fee must be 0, 25, or 100 bps');
      }

      // Get token decimals
      const mintInfo = await this.connection.getParsedAccountInfo(params.baseMint);
      const decimals = (mintInfo.value?.data as any).parsed.info.decimals;

      // Convert human-readable to on-chain format
      const tokenSupply = new BN(params.supply * Math.pow(10, decimals));
      const targetMarketCapUsd = new BN(params.initialMarketCapUsd * 1_000_000);
      const graduationThresholdUsd = new BN(params.graduationThresholdUsd * 1_000_000);

      // Derive PDAs
      const [configPda] = this.deriveConfigPda();
      const [poolPda] = this.derivePoolPda(params.baseMint);
      const [quoteVaultPda] = this.deriveQuoteVaultPda(poolPda);
      const [baseVaultPda] = this.deriveBaseVaultPda(poolPda);

      // Fetch config to get CRX mint and oracle
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
          graduationThresholdUsd
        )
        .accounts({
          config: configPda,
          pool: poolPda,
          quoteMint: configData.crxMint,
          baseMint: params.baseMint,
          crxPriceOracle: configData.crxPriceOracle,
          quoteVault: quoteVaultPda,
          baseVault: baseVaultPda,
          creatorBaseAccount: creatorBaseAccount.address,
          creator: this.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: PublicKey.default,
          rent: PublicKey.default,
        })
        .rpc();

      // Fetch pool state and return info
      return await this.getPool(params.baseMint);
    } catch (error) {
      throw this.translateError(error);
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
      const poolData = await this.program.account.pool.fetch(pool);

      // Get token decimals
      const mintInfo = await this.connection.getParsedAccountInfo(poolData.quoteMint);
      const decimals = (mintInfo.value?.data as any).parsed.info.decimals;

      // Convert CRX to lamports
      const quoteAmount = new BN(params.crxAmount * Math.pow(10, decimals));

      // Estimate output for slippage calculation
      let minBaseAmount: BN;
      if (params.minTokens !== undefined) {
        const baseMintInfo = await this.connection.getParsedAccountInfo(poolData.baseMint);
        const baseDecimals = (baseMintInfo.value?.data as any).parsed.info.decimals;
        minBaseAmount = new BN(params.minTokens * Math.pow(10, baseDecimals));
      } else {
        const estimated = await this.estimateBuyInternal(poolData, params.crxAmount);
        minBaseAmount = new BN(estimated.output * (1 - slippage / 100) * Math.pow(10, decimals));
      }

      // Derive PDAs
      const [configPda] = this.deriveConfigPda();
      const [quoteVaultPda] = this.deriveQuoteVaultPda(pool);
      const [baseVaultPda] = this.deriveBaseVaultPda(pool);

      // Get/create user token accounts
      const userQuoteAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.wallet.payer,
        poolData.quoteMint,
        this.wallet.publicKey
      );

      const userBaseAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.wallet.payer,
        poolData.baseMint,
        this.wallet.publicKey
      );

      // Get fee recipient account
      const configData = await this.program.account.config.fetch(configPda);
      const feeRecipientAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.wallet.payer,
        poolData.quoteMint,
        configData.feeRecipient
      );

      // Execute buy
      const tx = await this.program.methods
        .buy(quoteAmount, minBaseAmount)
        .accounts({
          config: configPda,
          pool,
          quoteVault: quoteVaultPda,
          baseVault: baseVaultPda,
          userQuoteAccount: userQuoteAccount.address,
          userBaseAccount: userBaseAccount.address,
          feeRecipientAccount: feeRecipientAccount.address,
          user: this.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Parse result from transaction
      return await this.parseTradeResult(tx, true);
    } catch (error) {
      throw this.translateError(error);
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
      const poolData = await this.program.account.pool.fetch(pool);

      // Get token decimals
      const baseMintInfo = await this.connection.getParsedAccountInfo(poolData.baseMint);
      const baseDecimals = (baseMintInfo.value?.data as any).parsed.info.decimals;

      // Convert tokens to lamports
      const baseAmount = new BN(params.tokenAmount * Math.pow(10, baseDecimals));

      // Estimate output for slippage calculation
      let minQuoteAmount: BN;
      if (params.minCrx !== undefined) {
        const quoteMintInfo = await this.connection.getParsedAccountInfo(poolData.quoteMint);
        const quoteDecimals = (quoteMintInfo.value?.data as any).parsed.info.decimals;
        minQuoteAmount = new BN(params.minCrx * Math.pow(10, quoteDecimals));
      } else {
        const estimated = await this.estimateSellInternal(poolData, params.tokenAmount);
        const quoteMintInfo = await this.connection.getParsedAccountInfo(poolData.quoteMint);
        const quoteDecimals = (quoteMintInfo.value?.data as any).parsed.info.decimals;
        minQuoteAmount = new BN(estimated.output * (1 - slippage / 100) * Math.pow(10, quoteDecimals));
      }

      // Derive PDAs
      const [configPda] = this.deriveConfigPda();
      const [quoteVaultPda] = this.deriveQuoteVaultPda(pool);
      const [baseVaultPda] = this.deriveBaseVaultPda(pool);

      // Get/create user token accounts
      const userQuoteAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.wallet.payer,
        poolData.quoteMint,
        this.wallet.publicKey
      );

      const userBaseAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.wallet.payer,
        poolData.baseMint,
        this.wallet.publicKey
      );

      // Get fee recipient account
      const configData = await this.program.account.config.fetch(configPda);
      const feeRecipientAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.wallet.payer,
        poolData.quoteMint,
        configData.feeRecipient
      );

      // Execute sell
      const tx = await this.program.methods
        .sell(baseAmount, minQuoteAmount)
        .accounts({
          config: configPda,
          pool,
          quoteVault: quoteVaultPda,
          baseVault: baseVaultPda,
          userQuoteAccount: userQuoteAccount.address,
          userBaseAccount: userBaseAccount.address,
          feeRecipientAccount: feeRecipientAccount.address,
          user: this.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Parse result from transaction
      return await this.parseTradeResult(tx, false);
    } catch (error) {
      throw this.translateError(error);
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
      const poolData = await this.program.account.pool.fetch(poolPda);

      // Calculate derived values
      const price = this.calculatePrice(poolData);
      const marketCapUsd = this.calculateMarketCapUsd(poolData, price);
      const graduationProgress = this.calculateGraduationProgress(poolData);

      // Format phase and curve type
      const phase = 'currentPhase' in poolData && poolData.currentPhase.graduated
        ? 'Graduated' as const
        : 'PreBonding' as const;

      const curveType = 'curveType' in poolData && poolData.curveType.exponential
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

        createdAt: new Date(poolData.createdAtSlot.toNumber() * 400), // ~400ms per slot
        url: `https://scale-amm.xyz/pool/${poolPda.toBase58()}`,
      };
    } catch (error) {
      throw this.translateError(error);
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
      const poolData = await this.program.account.pool.fetch(pool);
      const price = this.calculatePrice(poolData);
      const marketCapUsd = this.calculateMarketCapUsd(poolData, price);

      const phase = 'currentPhase' in poolData && poolData.currentPhase.graduated
        ? 'Graduated' as const
        : 'PreBonding' as const;

      return {
        price,
        marketCapUsd,
        liquidityCrx: poolData.realQuoteReserves.toNumber() / 1_000_000,
        phase,
      };
    } catch (error) {
      throw this.translateError(error);
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
      const poolData = await this.program.account.pool.fetch(pool);
      return await this.estimateBuyInternal(poolData, crxAmount);
    } catch (error) {
      throw this.translateError(error);
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
      const poolData = await this.program.account.pool.fetch(pool);
      return await this.estimateSellInternal(poolData, tokenAmount);
    } catch (error) {
      throw this.translateError(error);
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

  private calculatePrice(poolData: any): number {
    const phase = poolData.currentPhase.graduated ? 'Graduated' : 'PreBonding';

    if (phase === 'Graduated') {
      return poolData.realQuoteReserves.toNumber() / poolData.realBaseReserves.toNumber();
    } else {
      return poolData.virtualQuoteReserves.toNumber() / poolData.virtualBaseReserves.toNumber();
    }
  }

  private calculateMarketCapUsd(poolData: any, price: number): number {
    const marketCapCrx = price * poolData.tokenTotalSupply.toNumber();
    const marketCapUsd = (marketCapCrx * poolData.lastCrxPriceUsd.toNumber()) / 1_000_000;
    return marketCapUsd / 1_000_000; // Convert to human-readable
  }

  private calculateGraduationProgress(poolData: any): number {
    const progress = (poolData.realQuoteReserves.toNumber() / poolData.graduationThresholdCrx.toNumber()) * 100;
    return Math.min(progress, 100);
  }

  private async estimateBuyInternal(poolData: any, crxAmount: number): Promise<EstimateResult> {
    // Implement bonding curve math here
    // This is a simplified version - actual implementation should match Rust logic
    const phase = poolData.currentPhase.graduated ? 'Graduated' : 'PreBonding';
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

  private async estimateSellInternal(poolData: any, tokenAmount: number): Promise<EstimateResult> {
    // Similar to estimateBuyInternal but reversed
    const phase = poolData.currentPhase.graduated ? 'Graduated' : 'PreBonding';
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
    // Parse transaction to extract trade details
    // In production, this would parse the transaction logs and events
    return {
      signature,
      fee: 0,
      newPrice: 0,
      priceImpact: 0,
    };
  }

  private translateError(error: any): ScaleError {
    // Map Anchor error codes to friendly messages
    // This is a simplified version
    if (error instanceof ScaleError) {
      return error;
    }

    // Extract Anchor error code if present
    const errorCode = error?.code || error?.error?.errorCode?.code;

    const errorMap: { [key: string]: { code: ErrorCode; message: string } } = {
      '6001': { code: 'SLIPPAGE_EXCEEDED', message: 'Price moved beyond your slippage tolerance' },
      '6002': { code: 'ANTI_SNIPER_ACTIVE', message: 'Trade size too large during anti-sniper window' },
      '6003': { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient token balance' },
      // ... map all error codes
    };

    const mapped = errorMap[errorCode];
    if (mapped) {
      return new ScaleError(mapped.code, mapped.message);
    }

    return new ScaleError('UNKNOWN', error?.message || 'Unknown error occurred');
  }
}
