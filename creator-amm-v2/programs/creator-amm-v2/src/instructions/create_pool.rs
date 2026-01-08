use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use crate::state::{Config, Pool, CurvePhase, CurveType};
use crate::utils::oracle::{PythPriceFeed, get_crx_price_usd, calculate_crx_thresholds, calculate_virtual_reserves_for_market_cap};
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct CreatePool<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = creator,
        space = Pool::LEN,
        seeds = [
            b"pool",
            base_mint.key().as_ref(),
        ],
        bump
    )]
    pub pool: Account<'info, Pool>,

    /// CRX token mint (quote token)
    /// 🔒 PERMISSIONED: Must be CRX - enforces all pools use CRX as quote
    #[account(
        constraint = quote_mint.key() == config.crx_mint @ ErrorCode::MustUseCrxQuote
    )]
    pub quote_mint: Account<'info, Mint>,

    /// Base token mint (the new token being launched)
    pub base_mint: Account<'info, Mint>,

    /// CRX price oracle
    #[account(
        constraint = crx_price_oracle.key() == config.crx_price_oracle @ ErrorCode::InvalidOracle
    )]
    pub crx_price_oracle: Account<'info, PythPriceFeed>,

    /// Pool's quote token vault (CRX)
    #[account(
        init,
        payer = creator,
        seeds = [
            b"quote_vault",
            pool.key().as_ref(),
        ],
        bump,
        token::mint = quote_mint,
        token::authority = pool,
    )]
    pub quote_vault: Account<'info, TokenAccount>,

    /// Pool's base token vault
    #[account(
        init,
        payer = creator,
        seeds = [
            b"base_vault",
            pool.key().as_ref(),
        ],
        bump,
        token::mint = base_mint,
        token::authority = pool,
    )]
    pub base_vault: Account<'info, TokenAccount>,

    /// Creator's base token account (deposits initial token supply)
    #[account(
        mut,
        constraint = creator_base_account.mint == base_mint.key(),
        constraint = creator_base_account.owner == creator.key(),
    )]
    pub creator_base_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<CreatePool>,
    target_market_cap_usd: u64,      // e.g., 10_000_000_000 = $10k (6 decimals)
    token_supply: u64,                // e.g., 1_000_000_000_000 = 1M tokens (6 decimals)
    fee_bps: u16,                     // Fee: 0, 25, or 100 bps (0%, 0.25%, or 1%)
    curve_type: CurveType,            // Curve: ConstantProduct, Exponential, or Custom
    graduation_threshold_usd: u64,    // e.g., 40_000_000_000 = $40k (6 decimals) - dynamic per pool
) -> Result<()> {
    // Validate fee is one of the allowed values
    require!(
        fee_bps == 0 || fee_bps == 25 || fee_bps == 100,
        ErrorCode::InvalidFee
    );

    // Validate curve type is implemented (CRITICAL: prevent Custom DOS)
    require!(
        matches!(curve_type, CurveType::ConstantProduct | CurveType::Exponential),
        ErrorCode::CustomCurveNotImplemented
    );

    // Validation constants
    const MIN_MARKET_CAP_USD: u64 = 1_000_000_000; // $1k minimum with 6 decimals
    const MAX_MARKET_CAP_USD: u64 = 1_000_000_000_000; // $1M maximum with 6 decimals
    const MIN_GRADUATION_USD: u64 = 5_000_000_000; // $5k minimum graduation
    const MAX_GRADUATION_USD: u64 = 10_000_000_000_000; // $10M maximum graduation

    require!(
        target_market_cap_usd >= MIN_MARKET_CAP_USD,
        ErrorCode::InvalidMarketCap
    );
    require!(
        target_market_cap_usd <= MAX_MARKET_CAP_USD,
        ErrorCode::InvalidMarketCap
    );
    require!(
        graduation_threshold_usd >= MIN_GRADUATION_USD,
        ErrorCode::InvalidMarketCap
    );
    require!(
        graduation_threshold_usd <= MAX_GRADUATION_USD,
        ErrorCode::InvalidMarketCap
    );
    require!(
        graduation_threshold_usd > target_market_cap_usd,
        ErrorCode::InvalidMarketCap
    );
    require!(token_supply > 0, ErrorCode::InvalidTokenSupply);

    // CRITICAL SECURITY: Validate mint authorities are revoked (prevents rugpull)
    require!(
        ctx.accounts.base_mint.mint_authority.is_none(),
        ErrorCode::MintAuthorityNotRevoked
    );
    require!(
        ctx.accounts.base_mint.freeze_authority.is_none(),
        ErrorCode::FreezeAuthorityNotRevoked
    );

    let config = &ctx.accounts.config;
    let pool = &mut ctx.accounts.pool;
    let clock = Clock::get()?;

    // Step 1: Get CRX price from oracle
    let crx_price_usd = get_crx_price_usd(
        &ctx.accounts.crx_price_oracle,
        config.oracle_max_age_seconds,
        config.oracle_max_confidence_bps,
    )?;

    // Validate CRX price is reasonable ($0.01 to $1000)
    require!(
        crx_price_usd >= 10_000 && crx_price_usd <= 1_000_000_000,
        ErrorCode::InvalidCrxPrice
    );

    msg!("📊 CRX Price: ${}", crx_price_usd as f64 / 1_000_000.0);

    // Step 2: Calculate dynamic virtual reserves for target market cap
    let (virtual_quote_reserves, virtual_base_reserves) =
        calculate_virtual_reserves_for_market_cap(
            target_market_cap_usd,
            token_supply,
            crx_price_usd,
        )?;

    // Step 3: Calculate dynamic graduation threshold in CRX
    let graduation_threshold_crx = (graduation_threshold_usd as u128)
        .checked_mul(1_000_000u128) // CRX decimals
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(crx_price_usd as u128)
        .ok_or(ErrorCode::ThresholdCalculationFailed)? as u64;

    msg!("🎯 Graduation Threshold (Dynamic):");
    msg!("   {} CRX = ${} USD",
        graduation_threshold_crx,
        graduation_threshold_usd as f64 / 1_000_000.0
    );
    msg!("   CRX Price at Launch: ${}", crx_price_usd as f64 / 1_000_000.0);

    // Initialize pool state
    pool.authority = pool.key();
    pool.quote_mint = ctx.accounts.quote_mint.key();
    pool.base_mint = ctx.accounts.base_mint.key();
    pool.quote_vault = ctx.accounts.quote_vault.key();
    pool.base_vault = ctx.accounts.base_vault.key();

    pool.virtual_quote_reserves = virtual_quote_reserves;
    pool.virtual_base_reserves = virtual_base_reserves;

    pool.real_quote_reserves = 0; // Starts with 0 CRX
    pool.real_base_reserves = token_supply; // All tokens deposited

    pool.current_phase = CurvePhase::PreBonding;
    pool.curve_type = curve_type;
    pool.target_market_cap_usd = target_market_cap_usd;
    pool.token_total_supply = token_supply;
    pool.fee_bps = fee_bps;

    pool.graduation_threshold_crx = graduation_threshold_crx;

    pool.created_at_slot = clock.slot;
    pool.total_quote_volume = 0;
    pool.total_base_volume = 0;
    pool.total_fees_collected = 0;
    pool.unique_traders = 0;

    pool.creator = ctx.accounts.creator.key();

    pool.last_crx_price_usd = crx_price_usd;
    pool.last_price_update_slot = clock.slot;

    pool.bump = ctx.bumps.pool;

    // Transfer initial base tokens from creator to pool
    let cpi_accounts = Transfer {
        from: ctx.accounts.creator_base_account.to_account_info(),
        to: ctx.accounts.base_vault.to_account_info(),
        authority: ctx.accounts.creator.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, token_supply)?;

    msg!("🚀 Pool created successfully!");
    msg!("💰 Target Market Cap: ${}", target_market_cap_usd as f64 / 1_000_000.0);
    msg!("🪙 Token Supply: {}", token_supply);
    msg!("📈 Initial Price: {} CRX per token",
        (virtual_quote_reserves as f64) / (virtual_base_reserves as f64)
    );
    msg!("📊 Virtual Reserves: {} CRX × {} tokens",
        virtual_quote_reserves,
        virtual_base_reserves
    );
    msg!("🎯 Phase: PreBonding (Fee: {} bps)", fee_bps);
    msg!("📈 Curve Type: {:?}", curve_type);

    Ok(())
}
