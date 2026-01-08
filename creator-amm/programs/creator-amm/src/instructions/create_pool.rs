use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use crate::state::{Config, Pool};
use crate::errors::ErrorCode;

#[derive(Accounts)]
#[instruction(virtual_quote_reserves: u64, virtual_base_reserves: u64)]
pub struct CreatePool<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = creator,
        space = Pool::LEN,
        seeds = [
            b"pool",
            quote_mint.key().as_ref(),
            base_mint.key().as_ref(),
        ],
        bump
    )]
    pub pool: Account<'info, Pool>,

    /// Quote token mint (e.g., wrapped SOL, CRX, USDC)
    pub quote_mint: Account<'info, Mint>,

    /// Base token mint (the new token being launched)
    pub base_mint: Account<'info, Mint>,

    /// Pool's quote token vault
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
    virtual_quote_reserves: u64,
    virtual_base_reserves: u64,
    initial_base_amount: u64,
    graduation_threshold: u64,
) -> Result<()> {
    require!(virtual_quote_reserves > 0, ErrorCode::InvalidVirtualReserves);
    require!(virtual_base_reserves > 0, ErrorCode::InvalidVirtualReserves);
    require!(initial_base_amount > 0, ErrorCode::InvalidAmount);
    require!(graduation_threshold > 0, ErrorCode::InvalidAmount);

    let pool = &mut ctx.accounts.pool;
    let clock = Clock::get()?;

    // Initialize pool state
    pool.authority = pool.key();
    pool.quote_mint = ctx.accounts.quote_mint.key();
    pool.base_mint = ctx.accounts.base_mint.key();
    pool.quote_vault = ctx.accounts.quote_vault.key();
    pool.base_vault = ctx.accounts.base_vault.key();

    pool.virtual_quote_reserves = virtual_quote_reserves;
    pool.virtual_base_reserves = virtual_base_reserves;

    pool.real_quote_reserves = 0;
    pool.real_base_reserves = initial_base_amount;

    pool.created_at_slot = clock.slot;
    pool.graduated = false;
    pool.graduation_threshold = graduation_threshold;

    pool.total_quote_volume = 0;
    pool.total_base_volume = 0;

    pool.creator = ctx.accounts.creator.key();
    pool.bump = ctx.bumps.pool;

    // Transfer initial base tokens from creator to pool
    let cpi_accounts = Transfer {
        from: ctx.accounts.creator_base_account.to_account_info(),
        to: ctx.accounts.base_vault.to_account_info(),
        authority: ctx.accounts.creator.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, initial_base_amount)?;

    msg!("Pool created!");
    msg!("Quote mint: {}", pool.quote_mint);
    msg!("Base mint: {}", pool.base_mint);
    msg!("Virtual reserves: {} quote, {} base", virtual_quote_reserves, virtual_base_reserves);
    msg!("Initial base amount: {}", initial_base_amount);
    msg!("Graduation threshold: {}", graduation_threshold);

    Ok(())
}
