/**
 * Error handling for Scale AMM SDK
 *
 * Maps low-level Anchor errors to friendly, actionable error messages.
 */

export type ErrorCode =
  | 'SLIPPAGE_EXCEEDED'
  | 'INSUFFICIENT_BALANCE'
  | 'ANTI_SNIPER_ACTIVE'
  | 'POOL_NOT_FOUND'
  | 'INVALID_FEE'
  | 'INVALID_MARKET_CAP'
  | 'INVALID_TOKEN_SUPPLY'
  | 'MINT_AUTHORITY_NOT_REVOKED'
  | 'FREEZE_AUTHORITY_NOT_REVOKED'
  | 'QUOTE_TOKEN_NOT_APPROVED'
  | 'OUTPUT_TOO_SMALL'
  | 'INSUFFICIENT_LIQUIDITY'
  | 'INVALID_AMOUNT'
  | 'RESERVE_VAULT_MISMATCH'
  | 'MATH_OVERFLOW'
  | 'INVALID_ORACLE'
  | 'ORACLE_STALE'
  | 'ORACLE_CONFIDENCE_TOO_LOW'
  | 'INVALID_CRX_PRICE'
  | 'CUSTOM_CURVE_NOT_IMPLEMENTED'
  | 'UNAUTHORIZED'
  | 'INVALID_QUOTE_TOKEN_COUNT'
  | 'UNKNOWN';

/**
 * Scale AMM SDK Error
 *
 * All SDK operations throw ScaleError with friendly messages.
 *
 * @example
 * ```typescript
 * try {
 *   await scale.buy(pool, { crxAmount: 100 });
 * } catch (error) {
 *   if (error instanceof ScaleError) {
 *     console.error(error.code, ':', error.message);
 *     // Handle specific error codes
 *     if (error.code === 'SLIPPAGE_EXCEEDED') {
 *       // Retry with higher slippage
 *     }
 *   }
 * }
 * ```
 */
export class ScaleError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: any;

  constructor(code: ErrorCode, message: string, details?: any) {
    super(message);
    this.name = 'ScaleError';
    this.code = code;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ScaleError);
    }
  }

  /**
   * Convert to JSON for logging/reporting
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Error code mapping from Anchor program
 *
 * Maps numeric error codes (6000-6999) to friendly error info.
 */
export const ERROR_MAP: { [key: number]: { code: ErrorCode; message: string } } = {
  // Math errors
  6000: {
    code: 'MATH_OVERFLOW',
    message: 'Arithmetic overflow occurred. Amount too large.',
  },

  // Trading errors
  6001: {
    code: 'SLIPPAGE_EXCEEDED',
    message: 'Price moved beyond your slippage tolerance. Try increasing slippage or reducing trade size.',
  },
  6002: {
    code: 'OUTPUT_TOO_SMALL',
    message: 'Trade output too small (dust trade). Increase input amount.',
  },
  6003: {
    code: 'INVALID_AMOUNT',
    message: 'Invalid trade amount. Must be greater than zero.',
  },
  6004: {
    code: 'INSUFFICIENT_LIQUIDITY',
    message: 'Pool has insufficient liquidity for this trade.',
  },

  // Anti-sniper errors
  6010: {
    code: 'ANTI_SNIPER_ACTIVE',
    message: 'Anti-sniper protection active. Trade size exceeds maximum allowed in first ~20 slots after launch.',
  },

  // Pool creation errors
  6020: {
    code: 'INVALID_MARKET_CAP',
    message: 'Invalid market cap. Must be between $1,000 and $1,000,000 for initial MC, and $5,000 to $10,000,000 for graduation.',
  },
  6021: {
    code: 'INVALID_TOKEN_SUPPLY',
    message: 'Invalid token supply. Must be greater than zero.',
  },
  6022: {
    code: 'INVALID_FEE',
    message: 'Invalid fee. Must be 0, 25, or 100 basis points (0%, 0.25%, or 1%).',
  },
  6023: {
    code: 'MINT_AUTHORITY_NOT_REVOKED',
    message: 'Token mint authority must be revoked before creating pool (prevents rugpulls).',
  },
  6024: {
    code: 'FREEZE_AUTHORITY_NOT_REVOKED',
    message: 'Token freeze authority must be revoked before creating pool (prevents rugpulls).',
  },
  6025: {
    code: 'QUOTE_TOKEN_NOT_APPROVED',
    message: 'Quote token not approved. Use CRX or contact admin to whitelist your quote token.',
  },
  6026: {
    code: 'CUSTOM_CURVE_NOT_IMPLEMENTED',
    message: 'Custom bonding curves not implemented. Use ConstantProduct or Exponential.',
  },

  // Oracle errors
  6030: {
    code: 'INVALID_ORACLE',
    message: 'Invalid or missing price oracle.',
  },
  6031: {
    code: 'ORACLE_STALE',
    message: 'Oracle price too old. Price feed may be down.',
  },
  6032: {
    code: 'ORACLE_CONFIDENCE_TOO_LOW',
    message: 'Oracle confidence too low. Price feed unstable.',
  },
  6033: {
    code: 'INVALID_CRX_PRICE',
    message: 'CRX price out of valid range ($0.01 - $1000).',
  },

  // State errors
  6040: {
    code: 'RESERVE_VAULT_MISMATCH',
    message: 'Internal error: Reserve accounting mismatch. Contact support.',
  },

  // Admin errors
  6050: {
    code: 'UNAUTHORIZED',
    message: 'Unauthorized. This operation requires admin privileges.',
  },
  6051: {
    code: 'INVALID_QUOTE_TOKEN_COUNT',
    message: 'Invalid quote token count. Maximum 5 approved tokens.',
  },
};

/**
 * Translate Anchor program error to ScaleError
 *
 * @param error - Raw error from Anchor/Solana
 * @returns Friendly ScaleError
 */
export function translateAnchorError(error: any): ScaleError {
  // Already a ScaleError
  if (error instanceof ScaleError) {
    return error;
  }

  // Extract error code from various error formats
  let errorCode: number | undefined;

  // Anchor v0.28+ format
  if (error?.error?.errorCode?.number) {
    errorCode = error.error.errorCode.number;
  }
  // Anchor v0.27 format
  else if (error?.code) {
    errorCode = error.code;
  }
  // Program error format
  else if (error?.logs) {
    const match = error.logs.join('\n').match(/custom program error: 0x([0-9a-f]+)/i);
    if (match) {
      errorCode = parseInt(match[1], 16);
    }
  }

  // Look up error in map
  if (errorCode !== undefined && ERROR_MAP[errorCode]) {
    const { code, message } = ERROR_MAP[errorCode];
    return new ScaleError(code, message, { originalError: error });
  }

  // Common Solana errors
  if (error?.message) {
    const msg = error.message.toLowerCase();

    if (msg.includes('insufficient funds') || msg.includes('insufficient lamports')) {
      return new ScaleError(
        'INSUFFICIENT_BALANCE',
        'Insufficient SOL or token balance',
        { originalError: error }
      );
    }

    if (msg.includes('account not found') || msg.includes('could not find account')) {
      return new ScaleError(
        'POOL_NOT_FOUND',
        'Pool does not exist for this token',
        { originalError: error }
      );
    }

    if (msg.includes('transaction too large')) {
      return new ScaleError(
        'UNKNOWN',
        'Transaction too large. Try reducing trade size.',
        { originalError: error }
      );
    }
  }

  // Unknown error
  return new ScaleError(
    'UNKNOWN',
    error?.message || 'Unknown error occurred',
    { originalError: error }
  );
}

/**
 * Check if error is a specific code
 *
 * @example
 * ```typescript
 * if (isScaleError(error, 'SLIPPAGE_EXCEEDED')) {
 *   // Retry with higher slippage
 * }
 * ```
 */
export function isScaleError(error: any, code: ErrorCode): boolean {
  return error instanceof ScaleError && error.code === code;
}

/**
 * Get user-friendly error message with action
 *
 * @example
 * ```typescript
 * console.error(getErrorAction(error));
 * // "Slippage exceeded. Try increasing slippage to 2% or reducing trade size."
 * ```
 */
export function getErrorAction(error: ScaleError): string {
  const actions: { [key in ErrorCode]?: string } = {
    SLIPPAGE_EXCEEDED: 'Try increasing slippage to 2% or reducing trade size.',
    INSUFFICIENT_BALANCE: 'Add more tokens to your wallet or reduce trade amount.',
    ANTI_SNIPER_ACTIVE: 'Wait a few seconds after launch or reduce trade size below 5% of supply.',
    POOL_NOT_FOUND: 'Verify the token address or create a pool first.',
    INVALID_FEE: 'Choose fee of 0%, 0.25%, or 1%.',
    MINT_AUTHORITY_NOT_REVOKED: 'Revoke mint authority before creating pool: `spl-token authorize <MINT> mint --disable`',
    QUOTE_TOKEN_NOT_APPROVED: 'Use CRX as quote token or contact admin for whitelist.',
    OUTPUT_TOO_SMALL: 'Increase trade amount above minimum threshold.',
    ORACLE_STALE: 'Wait for oracle to update or check oracle status.',
  };

  const action = actions[error.code];
  return action ? `${error.message} ${action}` : error.message;
}
