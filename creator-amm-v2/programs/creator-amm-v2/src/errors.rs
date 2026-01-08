use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,

    #[msg("Insufficient liquidity in pool")]
    InsufficientLiquidity,

    #[msg("Invalid fee percentage (must be 0-10000 basis points)")]
    InvalidFee,

    #[msg("Pool has graduated")]
    PoolGraduated, // Note: Trading is still allowed after graduation

    #[msg("Math overflow occurred")]
    MathOverflow,

    #[msg("Invalid amount (must be greater than 0)")]
    InvalidAmount,

    #[msg("Graduation threshold not met yet")]
    GraduationThresholdNotMet,

    #[msg("Anti-sniper protection active - trade size limited")]
    AntiSniperActive,

    #[msg("Pool not initialized")]
    PoolNotInitialized,

    #[msg("Invalid virtual reserves")]
    InvalidVirtualReserves,

    #[msg("Unauthorized access")]
    Unauthorized,

    #[msg("Invalid reserves configuration")]
    InvalidReserves,

    #[msg("Oracle price is stale")]
    OraclePriceStale,

    #[msg("Oracle confidence interval too wide")]
    OracleConfidenceTooLow,

    #[msg("Invalid target market cap")]
    InvalidMarketCap,

    #[msg("Invalid token supply")]
    InvalidTokenSupply,

    #[msg("Pool already graduated")]
    AlreadyGraduated,

    #[msg("Wrong curve phase for this operation")]
    WrongPhase,

    #[msg("Invalid oracle account")]
    InvalidOracle,

    #[msg("CRX price out of reasonable bounds")]
    InvalidCrxPrice,

    #[msg("Threshold calculation failed")]
    ThresholdCalculationFailed,

    #[msg("Quote token must be CRX - this AMM is permissioned for CRX pairs only")]
    MustUseCrxQuote,

    #[msg("Custom curve type not implemented - fork the protocol to add your own curve math")]
    CustomCurveNotImplemented,
}
