use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,

    #[msg("Insufficient liquidity in pool")]
    InsufficientLiquidity,

    #[msg("Invalid fee percentage (must be 0-10000 basis points)")]
    InvalidFee,

    #[msg("Pool has already graduated to DEX")]
    PoolGraduated,

    #[msg("Math overflow occurred")]
    MathOverflow,

    #[msg("Invalid amount (must be greater than 0)")]
    InvalidAmount,

    #[msg("Graduation threshold not met")]
    GraduationThresholdNotMet,

    #[msg("Anti-sniper protection active - trade size limited")]
    AntiSniperActive,

    #[msg("Pool not initialized")]
    PoolNotInitialized,

    #[msg("Invalid virtual reserves")]
    InvalidVirtualReserves,

    #[msg("Unauthorized access")]
    Unauthorized,

    #[msg("Invalid decimals")]
    InvalidDecimals,
}
