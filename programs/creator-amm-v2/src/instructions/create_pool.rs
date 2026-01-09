use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use crate::constants::*;
use crate::state::{Config, Pool, CurvePhase, CurveType};
use crate::utils::oracle::calculate_virtual_reserves_for_market_cap;
use crate::errors::ErrorCode;
use crate::events::PoolCreated;

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

    /// Quote token mint (CRX or approved tokens like SOL/USDC/USDT)
    /// TWO-TIER PERMISSIONING:
    /// Tier 1 (Permissionless): CRX pairs - anyone can create
    /// Tier 2 (Permissioned): SOL/USDC/USDT pairs - whitelist only
    /// Validation happens in handler (see below)
    pub quote_mint: Account<'info, Mint>,

    /// Base token mint (the new token being launched)
    pub base_mint: Account<'info, Mint>,

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
    // Removed: rent sysvar (Anchor 0.29+ handles rent exemption automatically in init)
}

pub fn handler(
    ctx: Context<CreatePool>,
    target_market_cap_usd: u64,      // e.g., 10_000_000_000 = $10k (6 decimals)
    token_supply: u64,                // e.g., 1_000_000_000_000 = 1M tokens (6 decimals)
    fee_bps: u16,                     // Fee: 0, 25, or 100 bps (0%, 0.25%, or 1%)
    curve_type: CurveType,            // Curve: ConstantProduct, Exponential, or Custom
    graduation_threshold_usd: u64,    // e.g., 40_000_000_000 = $40k (6 decimals) - dynamic per pool
    disable_waa: bool,                // If true, pure permissionless (no WAA anti-dump fees)
) -> Result<()> {
    let config = &ctx.accounts.config;
    let quote_mint_key = ctx.accounts.quote_mint.key();

    // TWO-TIER QUOTE TOKEN VALIDATION
    // Tier 1 (Permissionless): CRX pairs - anyone can create
    let is_crx = quote_mint_key == config.crx_mint;

    // Tier 2 (Permissioned): SOL/USDC/USDT pairs - whitelist only
    let is_approved = config.approved_quote_tokens[..config.approved_quote_count as usize]
        .contains(&quote_mint_key);

    require!(
        is_crx || is_approved,
        ErrorCode::QuoteTokenNotApproved
    );

    if is_crx {
        msg!("Quote token: CRX (Tier 1 - Permissionless)");
    } else {
        msg!("Quote token: Approved whitelist token (Tier 2 - Permissioned)");
    }

    // Validate fee is one of the allowed values
    require!(
        fee_bps == FEE_TIER_FREE || fee_bps == FEE_TIER_LOW || fee_bps == FEE_TIER_STANDARD,
        ErrorCode::InvalidFee
    );

    // Validate curve type is implemented (CRITICAL: prevent Custom DOS)
    require!(
        matches!(curve_type, CurveType::ConstantProduct | CurveType::Exponential),
        ErrorCode::CustomCurveNotImplemented
    );

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

    let pool = &mut ctx.accounts.pool;
    let clock = Clock::get()?;

    // Step 1: Get CRX price from config
    let crx_price_usd = config.crx_price_usd;

    // Validate CRX price is reasonable ($0.01 to $1000)
    require!(
        crx_price_usd >= CRX_PRICE_MIN_USD && crx_price_usd <= CRX_PRICE_MAX_USD,
        ErrorCode::InvalidCrxPrice
    );

    // Step 2: Calculate dynamic virtual reserves for target market cap
    let (virtual_quote_reserves, virtual_base_reserves) =
        calculate_virtual_reserves_for_market_cap(
            target_market_cap_usd,
            token_supply,
            crx_price_usd,
        )?;

    // Step 3: Calculate dynamic graduation threshold in CRX
    let graduation_threshold_crx = (graduation_threshold_usd as u128)
        .checked_mul(CRX_DECIMALS as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(crx_price_usd as u128)
        .ok_or(ErrorCode::ThresholdCalculationFailed)? as u64;

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
    // Removed: total_base_volume, total_fees_collected, unique_traders (derive from events)

    pool.creator = ctx.accounts.creator.key();

    pool.last_crx_price_usd = crx_price_usd;
    pool.last_price_update_slot = clock.slot;

    pool.disable_waa = disable_waa;

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

    // Calculate initial price and market cap for event (optimized to avoid redundant calculations)
    let initial_price = pool.get_spot_price()?;
    let market_cap_crx = pool.get_market_cap_crx_from_price(initial_price)?;
    let initial_market_cap_usd = pool.get_market_cap_usd_from_crx(market_cap_crx)?;

    // Emit event for indexers
    emit!(PoolCreated {
        pool: pool.key(),
        base_mint: pool.base_mint,
        quote_mint: pool.quote_mint,
        creator: pool.creator,
        curve_type: pool.curve_type,
        target_market_cap_usd,
        token_supply,
        fee_bps,
        graduation_threshold_usd,
        graduation_threshold_crx,
        virtual_quote_reserves,
        virtual_base_reserves,
        crx_price_at_creation: crx_price_usd,
        initial_price,
        initial_market_cap_usd,
        created_at_slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });

    msg!("Pool created successfully!");

    Ok(())
}
