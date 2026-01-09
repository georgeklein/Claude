/**
 * Scale AMM TypeScript SDK
 *
 * Dead-simple SDK for integrating Scale AMM in <10 lines of code.
 *
 * @packageDocumentation
 */

// Main SDK class
export { ScaleAMM } from './ScaleAMM';

// Utilities
export { ScaleUtils, SCALE_CONSTANTS, SCALE_AMM_PROGRAM_ID } from './ScaleUtils';
export { AdminUtils } from './AdminUtils';
export { FeeSponsor, BatchFeeSponsor } from './FeeSponsorship';

// Error handling
export { ScaleError, isScaleError, getErrorAction, translateAnchorError } from './errors';
export type { ErrorCode } from './errors';

// Types
export type {
  InitializeConfig,
  CreatePoolParams,
  BuyParams,
  SellParams,
  PoolInfo,
  TradeResult,
  EstimateResult,
  PriceInfo,
  TradeEvent,
  GraduationEvent,
} from './ScaleAMM';

// Re-export common Solana types for convenience
export { Connection, PublicKey, Keypair } from '@solana/web3.js';
export type { Wallet } from '@coral-xyz/anchor';
