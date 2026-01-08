/**
 * Creator AMM v2 - Simple SDK
 *
 * This is a conceptual SDK showing how to interact with the AMM.
 * For production use, implement with actual Anchor IDL and connection.
 *
 * Usage:
 *   import { CreatorAMM } from './sdk';
 *   const amm = new CreatorAMM(connection, wallet);
 *   const pool = await amm.createPool({ ... });
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js';

// ============================================================================
// TYPES
// ============================================================================

export type CurveType = 'constant' | 'exponential' | 'custom';

export type CurvePhase = 'prebonding' | 'graduated';

export interface PoolConfig {
  /** Token name */
  name: string;
  /** Token symbol (3-5 chars) */
  symbol: string;
  /** Total token supply. Accepts: 1000000, "1M", "1_000_000" */
  supply: number | string;
  /** Initial market cap in USD. Accepts: 10000, "$10k", "10k" */
  initialMarketCap: number | string;
  /** Curve type: 'constant' (balanced) or 'exponential' (aggressive) */
  curve?: CurveType;
  /** Trading fee. Accepts: 0.25, "0.25%", 25 (basis points) */
  fee?: number | string;
  /** Graduation threshold in USD. Accepts: "$40k", "40k", 40000 */
  graduationThreshold?: number | string;
}

export interface Pool {
  /** Pool public key */
  address: PublicKey;
  /** Token mint */
  tokenMint: PublicKey;
  /** Current phase */
  phase: CurvePhase;
  /** Current spot price in CRX per token */
  price: number;
  /** Market cap in USD */
  marketCapUsd: number;
  /** Progress to graduation (0-100%) */
  graduationProgress: number;
  /** Buy tokens with CRX */
  buy: (crxAmount: number | string, options?: TradeOptions) => Promise<TradeResult>;
  /** Sell tokens for CRX */
  sell: (tokenAmount: number | string, options?: TradeOptions) => Promise<TradeResult>;
  /** Get current pool stats */
  getStats: () => Promise<PoolStats>;
  /** Simulate a trade without executing */
  simulate: (type: 'buy' | 'sell', amount: number) => Promise<SimulationResult>;
}

export interface TradeOptions {
  /** Max slippage allowed. Accepts: 0.05, "5%", 500 (basis points) */
  slippage?: number | string;
}

export interface TradeResult {
  /** Transaction signature */
  txId: string;
  /** Amount of input token spent */
  inputAmount: number;
  /** Amount of output token received */
  outputAmount: number;
  /** Fee paid in CRX */
  feePaid: number;
  /** New price after trade */
  newPrice: number;
}

export interface PoolStats {
  phase: CurvePhase;
  price: number;
  marketCapUsd: number;
  totalVolumeCrx: number;
  totalFeesCollected: number;
  crxAccumulated: number;
  graduationThreshold: number;
  graduationProgress: number;
  tokensRemaining: number;
  uniqueTraders: number;
}

export interface SimulationResult {
  inputAmount: number;
  outputAmount: number;
  priceImpact: number;
  fee: number;
  newPrice: number;
  wouldGraduate: boolean;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Parse human-readable numbers
 * Accepts: 1000000, "1M", "1_000_000", "$10k", "10k"
 */
export function parseAmount(value: number | string): number {
  if (typeof value === 'number') return value;

  // Remove $ and commas and underscores
  let clean = value.replace(/[$,_]/g, '').toLowerCase();

  // Handle suffixes
  const suffixes: Record<string, number> = {
    'k': 1_000,
    'm': 1_000_000,
    'b': 1_000_000_000,
  };

  for (const [suffix, multiplier] of Object.entries(suffixes)) {
    if (clean.endsWith(suffix)) {
      return parseFloat(clean.slice(0, -1)) * multiplier;
    }
  }

  return parseFloat(clean);
}

/**
 * Parse fee input to basis points
 * Accepts: 0.25, "0.25%", 25 (basis points)
 */
export function parseFee(value: number | string): number {
  if (typeof value === 'number') {
    // If < 1, assume percentage (0.25 = 25 bps)
    // If >= 1, assume basis points (25 = 25 bps)
    return value < 1 ? Math.round(value * 100) : Math.round(value);
  }

  // Remove % and parse
  const clean = value.replace('%', '').trim();
  const num = parseFloat(clean);

  // If original had %, convert to bps
  if (value.includes('%')) {
    return Math.round(num * 100);
  }

  return Math.round(num);
}

/**
 * Parse slippage input
 * Accepts: 0.05, "5%", 500 (basis points)
 */
export function parseSlippage(value: number | string): number {
  if (typeof value === 'number') {
    // If < 1, assume decimal (0.05 = 5%)
    // If >= 1, assume basis points (500 = 5%)
    return value < 1 ? value : value / 10000;
  }

  const clean = value.replace('%', '').trim();
  const num = parseFloat(clean);

  if (value.includes('%')) {
    return num / 100;
  }

  return num / 10000;
}

// ============================================================================
// MAIN SDK CLASS
// ============================================================================

export class CreatorAMM {
  private connection: Connection;
  private wallet: Keypair;
  private programId: PublicKey;

  constructor(
    connection: Connection,
    wallet: Keypair,
    programId?: PublicKey
  ) {
    this.connection = connection;
    this.wallet = wallet;
    this.programId = programId || new PublicKey('YOUR_PROGRAM_ID_HERE');
  }

  // --------------------------------------------------------------------------
  // POOL CREATION
  // --------------------------------------------------------------------------

  /**
   * Create a new token pool
   *
   * @example
   * const pool = await amm.createPool({
   *   name: "My Token",
   *   symbol: "MTK",
   *   supply: "1M",
   *   initialMarketCap: "$10k",
   *   curve: "exponential",
   *   fee: "0.25%",
   *   graduationThreshold: "$40k"
   * });
   */
  async createPool(config: PoolConfig): Promise<Pool> {
    // Parse inputs
    const supply = parseAmount(config.supply);
    const initialMC = parseAmount(config.initialMarketCap);
    const fee = parseFee(config.fee || '0.25%');
    const threshold = parseAmount(config.graduationThreshold || '$40000');
    const curve = config.curve || 'constant';

    // Validate
    if (supply <= 0) throw new Error('Supply must be positive');
    if (initialMC <= 0) throw new Error('Initial market cap must be positive');
    if (fee < 0 || fee > 100) throw new Error('Fee must be 0-100 basis points (0-1%)');
    if (threshold < 5000 || threshold > 10_000_000) {
      throw new Error('Graduation threshold must be $5k - $10M');
    }

    console.log('Creating pool with:');
    console.log(`  Name: ${config.name}`);
    console.log(`  Symbol: ${config.symbol}`);
    console.log(`  Supply: ${supply.toLocaleString()}`);
    console.log(`  Initial MC: $${initialMC.toLocaleString()}`);
    console.log(`  Curve: ${curve}`);
    console.log(`  Fee: ${fee} bps (${fee/100}%)`);
    console.log(`  Graduation: $${threshold.toLocaleString()}`);

    // TODO: Implement actual Anchor instruction
    // This is a placeholder that shows the interface

    const poolAddress = Keypair.generate().publicKey;
    const tokenMint = Keypair.generate().publicKey;

    return this.wrapPool(poolAddress, tokenMint);
  }

  // --------------------------------------------------------------------------
  // POOL LOADING
  // --------------------------------------------------------------------------

  /**
   * Load an existing pool by address
   */
  async getPool(address: PublicKey | string): Promise<Pool> {
    const pubkey = typeof address === 'string' ? new PublicKey(address) : address;

    // TODO: Fetch pool state from chain
    // This is a placeholder

    const tokenMint = Keypair.generate().publicKey;
    return this.wrapPool(pubkey, tokenMint);
  }

  /**
   * Find pool by token mint
   */
  async findPoolByMint(mint: PublicKey | string): Promise<Pool | null> {
    const pubkey = typeof mint === 'string' ? new PublicKey(mint) : mint;

    // Derive pool PDA from mint
    const [poolAddress] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), pubkey.toBuffer()],
      this.programId
    );

    // Check if exists
    const account = await this.connection.getAccountInfo(poolAddress);
    if (!account) return null;

    return this.wrapPool(poolAddress, pubkey);
  }

  // --------------------------------------------------------------------------
  // PRIVATE HELPERS
  // --------------------------------------------------------------------------

  private wrapPool(address: PublicKey, tokenMint: PublicKey): Pool {
    const self = this;

    return {
      address,
      tokenMint,
      phase: 'prebonding',
      price: 0,
      marketCapUsd: 0,
      graduationProgress: 0,

      async buy(crxAmount, options) {
        const amount = parseAmount(crxAmount);
        const slippage = parseSlippage(options?.slippage || '5%');

        console.log(`Buying with ${amount} CRX (${slippage*100}% slippage)`);

        // TODO: Implement actual buy instruction
        return {
          txId: 'placeholder_tx_signature',
          inputAmount: amount,
          outputAmount: 0,
          feePaid: 0,
          newPrice: 0,
        };
      },

      async sell(tokenAmount, options) {
        const amount = parseAmount(tokenAmount);
        const slippage = parseSlippage(options?.slippage || '5%');

        console.log(`Selling ${amount} tokens (${slippage*100}% slippage)`);

        // TODO: Implement actual sell instruction
        return {
          txId: 'placeholder_tx_signature',
          inputAmount: amount,
          outputAmount: 0,
          feePaid: 0,
          newPrice: 0,
        };
      },

      async getStats() {
        // TODO: Fetch actual stats
        return {
          phase: 'prebonding' as CurvePhase,
          price: 0,
          marketCapUsd: 0,
          totalVolumeCrx: 0,
          totalFeesCollected: 0,
          crxAccumulated: 0,
          graduationThreshold: 0,
          graduationProgress: 0,
          tokensRemaining: 0,
          uniqueTraders: 0,
        };
      },

      async simulate(type, amount) {
        // TODO: Implement simulation
        return {
          inputAmount: amount,
          outputAmount: 0,
          priceImpact: 0,
          fee: 0,
          newPrice: 0,
          wouldGraduate: false,
        };
      },
    };
  }
}

// ============================================================================
// QUICK START EXAMPLES
// ============================================================================

/**
 * Example: Launch a meme token
 */
export async function exampleLaunchMeme() {
  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate(); // Use your actual wallet

  const amm = new CreatorAMM(connection, wallet);

  // Create pool with AI-friendly syntax
  const pool = await amm.createPool({
    name: 'Super Meme Token',
    symbol: 'SMEME',
    supply: '1M',           // 1,000,000 tokens
    initialMarketCap: '$10k', // Start at $10k market cap
    curve: 'exponential',    // Aggressive price growth
    fee: '0.25%',           // 25 basis points
    graduationThreshold: '$40k', // Graduate at $40k accumulated
  });

  console.log('Pool created:', pool.address.toString());

  // Simulate a buy
  const sim = await pool.simulate('buy', 100);
  console.log('If you buy 100 CRX:');
  console.log(`  You get: ${sim.outputAmount} tokens`);
  console.log(`  Price impact: ${sim.priceImpact}%`);
  console.log(`  Fee: ${sim.fee} CRX`);

  // Execute buy
  const result = await pool.buy('100 CRX', { slippage: '5%' });
  console.log('Trade executed:', result.txId);
}

/**
 * Example: Check pool status
 */
export async function exampleCheckPool() {
  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate();

  const amm = new CreatorAMM(connection, wallet);

  // Load existing pool
  const pool = await amm.getPool('YOUR_POOL_ADDRESS');
  const stats = await pool.getStats();

  console.log('Pool Status:');
  console.log(`  Phase: ${stats.phase}`);
  console.log(`  Price: ${stats.price} CRX per token`);
  console.log(`  Market Cap: $${stats.marketCapUsd}`);
  console.log(`  Graduation: ${stats.graduationProgress}%`);
  console.log(`  Volume: ${stats.totalVolumeCrx} CRX`);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default CreatorAMM;
