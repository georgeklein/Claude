/**
 * Scale AMM SDK Utilities
 *
 * Helper functions for common operations.
 */

import { PublicKey } from '@solana/web3.js';

/**
 * Default Scale AMM program ID (mainnet-beta)
 */
export const SCALE_AMM_PROGRAM_ID = new PublicKey('CReamVLMa2dFi8RmKJQAYWn8Jy2yN5qvSu8gKFCxfp3');

/**
 * Utility functions for Scale AMM
 */
export class ScaleUtils {
  /**
   * Convert USD to micro-USD (6 decimals)
   *
   * @example
   * ```typescript
   * const microUsd = ScaleUtils.usdToMicroUsd(10_000);
   * // 10_000_000_000
   * ```
   */
  static usdToMicroUsd(usd: number): number {
    return Math.floor(usd * 1_000_000);
  }

  /**
   * Convert micro-USD (6 decimals) to USD
   *
   * @example
   * ```typescript
   * const usd = ScaleUtils.microUsdToUsd(10_000_000_000);
   * // 10_000
   * ```
   */
  static microUsdToUsd(microUsd: number): number {
    return microUsd / 1_000_000;
  }

  /**
   * Find pool address for a token (deterministic)
   *
   * @example
   * ```typescript
   * const poolAddress = ScaleUtils.findPoolAddress(
   *   tokenMint,
   *   SCALE_AMM_PROGRAM_ID
   * );
   * ```
   */
  static findPoolAddress(
    baseMint: PublicKey,
    programId: PublicKey = SCALE_AMM_PROGRAM_ID
  ): PublicKey {
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), baseMint.toBuffer()],
      programId
    );
    return poolPda;
  }

  /**
   * Find config address (global protocol config)
   *
   * @example
   * ```typescript
   * const configAddress = ScaleUtils.findConfigAddress();
   * ```
   */
  static findConfigAddress(programId: PublicKey = SCALE_AMM_PROGRAM_ID): PublicKey {
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      programId
    );
    return configPda;
  }

  /**
   * Find quote vault address for a pool
   */
  static findQuoteVaultAddress(
    pool: PublicKey,
    programId: PublicKey = SCALE_AMM_PROGRAM_ID
  ): PublicKey {
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('quote_vault'), pool.toBuffer()],
      programId
    );
    return vaultPda;
  }

  /**
   * Find base vault address for a pool
   */
  static findBaseVaultAddress(
    pool: PublicKey,
    programId: PublicKey = SCALE_AMM_PROGRAM_ID
  ): PublicKey {
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('base_vault'), pool.toBuffer()],
      programId
    );
    return vaultPda;
  }

  /**
   * Convert tokens to lamports (apply decimals)
   *
   * @example
   * ```typescript
   * const lamports = ScaleUtils.toLamports(100, 6);
   * // 100_000_000
   * ```
   */
  static toLamports(amount: number, decimals: number): bigint {
    return BigInt(Math.floor(amount * Math.pow(10, decimals)));
  }

  /**
   * Convert lamports to tokens (remove decimals)
   *
   * @example
   * ```typescript
   * const tokens = ScaleUtils.fromLamports(100_000_000n, 6);
   * // 100
   * ```
   */
  static fromLamports(lamports: bigint, decimals: number): number {
    return Number(lamports) / Math.pow(10, decimals);
  }

  /**
   * Calculate price impact for a trade
   *
   * @param oldPrice - Price before trade
   * @param newPrice - Price after trade
   * @returns Price impact as percentage
   *
   * @example
   * ```typescript
   * const impact = ScaleUtils.calculatePriceImpact(10, 10.5);
   * // 5.0 (5% price increase)
   * ```
   */
  static calculatePriceImpact(oldPrice: number, newPrice: number): number {
    return ((newPrice - oldPrice) / oldPrice) * 100;
  }

  /**
   * Calculate minimum output amount with slippage
   *
   * @param expectedOutput - Expected output amount
   * @param slippageBps - Slippage in basis points (100 = 1%)
   * @returns Minimum output amount
   *
   * @example
   * ```typescript
   * const minOutput = ScaleUtils.applySlippage(100, 50); // 0.5% slippage
   * // 99.5
   * ```
   */
  static applySlippage(expectedOutput: number, slippageBps: number): number {
    return expectedOutput * (1 - slippageBps / 10000);
  }

  /**
   * Format price for display
   *
   * @example
   * ```typescript
   * ScaleUtils.formatPrice(0.00001234);
   * // "0.00001234"
   *
   * ScaleUtils.formatPrice(1234.567);
   * // "1,234.57"
   * ```
   */
  static formatPrice(price: number): string {
    if (price < 0.0001) {
      return price.toExponential(4);
    }
    if (price < 1) {
      return price.toFixed(8);
    }
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /**
   * Format market cap for display
   *
   * @example
   * ```typescript
   * ScaleUtils.formatMarketCap(1_234_567);
   * // "$1.23M"
   *
   * ScaleUtils.formatMarketCap(42_000);
   * // "$42.0K"
   * ```
   */
  static formatMarketCap(marketCapUsd: number): string {
    if (marketCapUsd >= 1_000_000) {
      return `$${(marketCapUsd / 1_000_000).toFixed(2)}M`;
    }
    if (marketCapUsd >= 1_000) {
      return `$${(marketCapUsd / 1_000).toFixed(1)}K`;
    }
    return `$${marketCapUsd.toFixed(2)}`;
  }

  /**
   * Format token amount with symbol
   *
   * @example
   * ```typescript
   * ScaleUtils.formatAmount(1234.5678, 'CRX');
   * // "1,234.57 CRX"
   * ```
   */
  static formatAmount(amount: number, symbol: string): string {
    return `${amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    })} ${symbol}`;
  }

  /**
   * Validate slippage tolerance (0.1% - 50%)
   *
   * @throws Error if slippage out of range
   */
  static validateSlippage(slippagePercent: number): void {
    if (slippagePercent < 0.1 || slippagePercent > 50) {
      throw new Error('Slippage must be between 0.1% and 50%');
    }
  }

  /**
   * Validate fee (0, 25, or 100 bps)
   *
   * @throws Error if fee invalid
   */
  static validateFee(feeBps: number): void {
    if (![0, 25, 100].includes(feeBps)) {
      throw new Error('Fee must be 0, 25, or 100 bps (0%, 0.25%, or 1%)');
    }
  }

  /**
   * Calculate constant product output
   *
   * Formula: output = (input * Y) / (X + input)
   *
   * @example
   * ```typescript
   * const output = ScaleUtils.calculateConstantProductOutput(
   *   100,     // input amount
   *   10_000,  // input reserve
   *   50_000   // output reserve
   * );
   * // ~495.05
   * ```
   */
  static calculateConstantProductOutput(
    inputAmount: number,
    inputReserve: number,
    outputReserve: number
  ): number {
    return (inputAmount * outputReserve) / (inputReserve + inputAmount);
  }

  /**
   * Calculate exponential curve output
   *
   * Formula: output = (input * Y) / (X + 1.5*input)
   *
   * Steeper curve than constant product
   */
  static calculateExponentialOutput(
    inputAmount: number,
    inputReserve: number,
    outputReserve: number
  ): number {
    return (inputAmount * outputReserve) / (inputReserve + 1.5 * inputAmount);
  }

  /**
   * Generate Scale AMM frontend URL for a pool
   *
   * @example
   * ```typescript
   * const url = ScaleUtils.getPoolUrl(poolAddress);
   * // "https://scale-amm.xyz/pool/ABC...XYZ"
   * ```
   */
  static getPoolUrl(pool: PublicKey, network: 'mainnet' | 'devnet' = 'mainnet'): string {
    const base = network === 'mainnet'
      ? 'https://scale-amm.xyz'
      : 'https://devnet.scale-amm.xyz';
    return `${base}/pool/${pool.toBase58()}`;
  }

  /**
   * Generate Solana Explorer URL for a transaction
   */
  static getExplorerUrl(
    signature: string,
    network: 'mainnet' | 'devnet' = 'mainnet'
  ): string {
    const cluster = network === 'devnet' ? '?cluster=devnet' : '';
    return `https://explorer.solana.com/tx/${signature}${cluster}`;
  }

  /**
   * Sleep for specified milliseconds (useful for polling)
   *
   * @example
   * ```typescript
   * await ScaleUtils.sleep(1000); // Wait 1 second
   * ```
   */
  static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry an async operation with exponential backoff
   *
   * @example
   * ```typescript
   * const result = await ScaleUtils.retry(
   *   async () => scale.buy(pool, { crxAmount: 100 }),
   *   3, // max retries
   *   1000 // initial delay ms
   * );
   * ```
   */
  static async retry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): Promise<T> {
    let lastError: any;

    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < maxRetries) {
          await this.sleep(delayMs * Math.pow(2, i)); // Exponential backoff
        }
      }
    }

    throw lastError;
  }
}

/**
 * Constants for Scale AMM
 */
export const SCALE_CONSTANTS = {
  // Fee tiers (basis points)
  FEE_TIERS: [0, 25, 100], // 0%, 0.25%, 1%

  // Market cap limits (USD)
  MIN_MARKET_CAP: 1_000,
  MAX_MARKET_CAP: 1_000_000,
  MIN_GRADUATION: 5_000,
  MAX_GRADUATION: 10_000_000,

  // Slippage defaults (Creator platform will enforce safer limits)
  DEFAULT_SLIPPAGE_BPS: 200, // 2% (realistic for low-liquidity pools)

  // Curve types
  CURVE_TYPES: ['ConstantProduct', 'Exponential'] as const,

  // Decimals
  USD_DECIMALS: 6,
  CRX_DECIMALS: 6,
  PRICE_DECIMALS: 9,

  // URLs
  MAINNET_RPC: 'https://api.mainnet-beta.solana.com',
  DEVNET_RPC: 'https://api.devnet.solana.com',
  FRONTEND_URL: 'https://scale-amm.xyz',
} as const;
