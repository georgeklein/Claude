use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Slippage exceeded")]
    SlippageExceeded,
    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,
    #[msg("Invalid fee")]
    InvalidFee,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Anti-sniper active")]
    AntiSniperActive,
    #[msg("Invalid virtual reserves")]
    InvalidVirtualReserves,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid reserves")]
    InvalidReserves,
    #[msg("Oracle price stale")]
    OraclePriceStale,
    #[msg("Oracle confidence too low")]
    OracleConfidenceTooLow,
    #[msg("Invalid market cap")]
    InvalidMarketCap,
    #[msg("Invalid token supply")]
    InvalidTokenSupply,
    #[msg("Invalid oracle")]
    InvalidOracle,
    #[msg("Invalid CRX price")]
    InvalidCrxPrice,
    #[msg("Threshold calculation failed")]
    ThresholdCalculationFailed,
    #[msg("Must use CRX quote")]
    MustUseCrxQuote,
    #[msg("Custom curve not implemented")]
    CustomCurveNotImplemented,
    #[msg("Reserve vault mismatch")]
    ReserveVaultMismatch,
    #[msg("Mint authority not revoked")]
    MintAuthorityNotRevoked,
    #[msg("Freeze authority not revoked")]
    FreezeAuthorityNotRevoked,
    #[msg("Output too small")]
    OutputTooSmall,
    #[msg("Pool paused")]
    PoolPaused,
}
