use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use crate::state::{Config, Pool, CurvePhase};
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
    #[account(
        constraint = quote_mint.key() == config.crx_mint @ ErrorCode::InvalidOracle
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
    target_market_cap_usd: u64,    // e.g., 50_000_000_000 = $50k (6 decimals)
    token_supply: u64,              // e.g., 1_000_000_000_000 = 1M tokens (6 decimals)
) -> Result<()> {
    // Validation
    require!(target_market_cap_usd > 0, ErrorCode::InvalidMarketCap);
    require!(token_supply > 0, ErrorCode::InvalidTokenSupply);

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

    // Step 3: Calculate dynamic CRX thresholds based on USD targets
    let (pre_bonding_threshold_crx, graduation_threshold_crx) =
        calculate_crx_thresholds(
            config.pre_bonding_threshold_usd,
            config.graduation_threshold_usd,
            crx_price_usd,
        )?;

    msg!("🎯 Thresholds:");
    msg!("   Pre-bonding: {} CRX (${} USD)",
        pre_bonding_threshold_crx,
        config.pre_bonding_threshold_usd as f64 / 1_000_000.0
    );
    msg!("   Graduation: {} CRX (${} USD)",
        graduation_threshold_crx,
        config.graduation_threshold_usd as f64 / 1_000_000.0
    );

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
    pool.target_market_cap_usd = target_market_cap_usd;
    pool.token_total_supply = token_supply;

    pool.pre_bonding_threshold_crx = pre_bonding_threshold_crx;
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
    msg!("🎯 Phase: PreBonding (Fee: {} bps)", config.pre_bonding_fee_bps);

    Ok(())
}
