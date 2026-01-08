use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,

    #[msg("Insufficient liquidity in pool")]
    InsufficientLiquidity,

    #[msg("Invalid fee percentage (must be 0-10000 basis points)")]
    InvalidFee,

    #[msg("Math overflow occurred")]
    MathOverflow,

    #[msg("Invalid amount (must be greater than 0)")]
    InvalidAmount,

    #[msg("Anti-sniper protection active - trade size limited")]
    AntiSniperActive,

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

    #[msg("Invalid oracle account")]
    InvalidOracle,

    #[msg("CRX price out of reasonable bounds")]
    InvalidCrxPrice,

    #[msg("Threshold calculation failed")]
    ThresholdCalculationFailed,

    #[msg("Custom curve type not implemented - fork the protocol to add your own curve math")]
    CustomCurveNotImplemented,

    #[msg("Pool reserves do not match vault balances - potential accounting error")]
    ReserveVaultMismatch,

    #[msg("Base token mint authority must be revoked to prevent rugpull")]
    MintAuthorityNotRevoked,

    #[msg("Base token freeze authority must be revoked to prevent freeze attacks")]
    FreezeAuthorityNotRevoked,

    #[msg("Output amount too small (dust trade)")]
    OutputTooSmall,

    #[msg("Quote token not approved - must be CRX (permissionless) or whitelisted token like SOL/USDC/USDT (permissioned)")]
    QuoteTokenNotApproved,

    #[msg("Invalid quote token count - must be between 0 and 5")]
    InvalidQuoteTokenCount,

    #[msg("Oracle exponent out of safe bounds (-12 to 6) - potential overflow attack")]
    InvalidOracleExponent,

    #[msg("Oracle confidence exceeds price - invalid oracle data")]
    InvalidOracleConfidence,
}
