use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{Config, Pool, CurvePhase, UserPosition};
use crate::errors::ErrorCode;
use crate::events::{TradeExecuted, PoolGraduated, PhaseTransition};

#[derive(Accounts)]
pub struct Sell<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [
            b"pool",
            pool.base_mint.as_ref(),
        ],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        constraint = quote_vault.key() == pool.quote_vault,
        constraint = quote_vault.owner == pool.key() @ ErrorCode::Unauthorized,
    )]
    pub quote_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = base_vault.key() == pool.base_vault,
        constraint = base_vault.owner == pool.key() @ ErrorCode::Unauthorized,
    )]
    pub base_vault: Account<'info, TokenAccount>,

    /// User's quote token account (receiving CRX)
    #[account(
        mut,
        constraint = user_quote_account.mint == pool.quote_mint,
        constraint = user_quote_account.owner == user.key(),
    )]
    pub user_quote_account: Account<'info, TokenAccount>,

    /// User's base token account (paying with tokens)
    #[account(
        mut,
        constraint = user_base_account.mint == pool.base_mint,
        constraint = user_base_account.owner == user.key(),
    )]
    pub user_base_account: Account<'info, TokenAccount>,

    /// Protocol fee recipient's quote token account
    #[account(
        mut,
        constraint = fee_recipient_account.mint == pool.quote_mint @ ErrorCode::Unauthorized,
        constraint = fee_recipient_account.owner == config.fee_recipient @ ErrorCode::Unauthorized,
    )]
    pub fee_recipient_account: Account<'info, TokenAccount>,

    /// User position for WAA tracking (must exist for sells)
    #[account(
        mut,
        seeds = [b"pos", pool.key().as_ref(), user.key().as_ref()],
        bump = user_position.bump,
        constraint = user_position.pool == pool.key() @ ErrorCode::Unauthorized,
        constraint = user_position.user == user.key() @ ErrorCode::Unauthorized,
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<Sell>,
    base_amount: u64,       // Amount of tokens to sell
    min_quote_amount: u64,  // Minimum CRX to receive (slippage protection)
) -> Result<()> {
    require!(base_amount > 0, ErrorCode::InvalidAmount);

    let pool = &mut ctx.accounts.pool;
    let config = &ctx.accounts.config;
    let clock = Clock::get()?;

    // Get current phase parameters
    let current_fee_bps = pool.get_current_fee_bps();

    msg!("Sell Request:");
    msg!("   Base Amount: {} tokens", base_amount);
    msg!("   Current Phase: {:?}", pool.current_phase);
    msg!("   Fee: {} bps", current_fee_bps);

    // Get correct reserves based on phase (virtual or real)
    let (quote_reserve, base_reserve) = pool.get_pricing_reserves();

    // Anti-sniper protection check (also applies to sells)
    if pool.is_anti_sniper_active(clock.slot, config.anti_sniper_window_slots) {
        let max_trade_amount = (base_reserve as u128)
            .checked_mul(config.anti_sniper_max_trade_bps as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)? as u64;

        require!(
            base_amount <= max_trade_amount,
            ErrorCode::AntiSniperActive
        );

        msg!("Anti-sniper active: max {} tokens", max_trade_amount);
    }

    // CRITICAL FEE LOGIC: Calculate output first, then extract fee from output
    // This maintains consistency with buy.rs and prevents token mint mismatch

    // Calculate output WITHOUT fee first
    let quote_output_before_fee = pool.calculate_output(
        base_amount,
        base_reserve,
        quote_reserve,
        0, // No fee in calculation
    )?;

    // Calculate base fee from OUTPUT (in quote tokens, not base tokens)
    let base_fee_in_quote = if current_fee_bps > 0 {
        let fee = (quote_output_before_fee as u128)
            .checked_mul(current_fee_bps as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)? as u64;
        std::cmp::max(fee, 1) // Minimum 1 lamport if fee enabled
    } else {
        0
    };

    // Calculate WAA-based extra sell fee (anti-sniper)
    let user_position = &ctx.accounts.user_position;
    let extra_fee_bps = user_position.calculate_extra_sell_fee_bps(clock.slot);
    let extra_fee_in_quote = if extra_fee_bps > 0 {
        let fee = (quote_output_before_fee as u128)
            .checked_mul(extra_fee_bps as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)? as u64;
        std::cmp::max(fee, 1)
    } else {
        0
    };

    // Total fee (base + extra)
    let total_fee_in_quote = base_fee_in_quote
        .checked_add(extra_fee_in_quote)
        .ok_or(ErrorCode::MathOverflow)?;

    msg!("Sell Fees:");
    msg!("   Base fee: {} CRX ({} bps)", base_fee_in_quote, current_fee_bps);
    msg!("   Extra WAA fee: {} CRX ({} bps)", extra_fee_in_quote, extra_fee_bps);
    msg!("   Total fee: {} CRX", total_fee_in_quote);

    // Final output to user (after total fee)
    let quote_output = quote_output_before_fee
        .checked_sub(total_fee_in_quote)
        .ok_or(ErrorCode::MathOverflow)?;

    // Slippage protection (CRITICAL SECURITY FIX from PumpSwap)
    require!(
        quote_output >= min_quote_amount,
        ErrorCode::SlippageExceeded
    );

    // Minimum output validation (prevents dust trades)
    const MIN_OUTPUT_AMOUNT: u64 = 1000; // 0.001 CRX (with 6 decimals)
    require!(
        quote_output >= MIN_OUTPUT_AMOUNT,
        ErrorCode::OutputTooSmall
    );

    // Transfer 1: All base tokens from user to pool vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_base_account.to_account_info(),
        to: ctx.accounts.base_vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
        base_amount, // Full amount goes to pool
    )?;

    // Setup pool signer for outgoing transfers
    let pool_seeds = &[
        b"pool",
        pool.base_mint.as_ref(),
        &[pool.bump],
    ];
    let signer = &[&pool_seeds[..]];

    // Transfer 2: Quote tokens from pool to user (after fee deduction)
    let cpi_accounts = Transfer {
        from: ctx.accounts.quote_vault.to_account_info(),
        to: ctx.accounts.user_quote_account.to_account_info(),
        authority: pool.to_account_info(),
    };
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        ),
        quote_output, // User gets output after fee
    )?;

    // Transfer 3: Total fee (base + WAA) in QUOTE tokens from pool to creator
    if total_fee_in_quote > 0 {
        let fee_cpi_accounts = Transfer {
            from: ctx.accounts.quote_vault.to_account_info(),
            to: ctx.accounts.fee_recipient_account.to_account_info(),
            authority: pool.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                fee_cpi_accounts,
                signer,
            ),
            total_fee_in_quote,
        )?;
    }

    // Update reserves based on phase
    // CRITICAL: Full base_amount enters vault, fee extracted from output
    // This maintains x*y=k perfectly - no degradation!

    // Total quote leaving vault = quote_output (to user) + fee_in_quote (to creator)
    let total_quote_out = quote_output_before_fee;

    if matches!(pool.current_phase, CurvePhase::Graduated) {
        // GRADUATED PHASE: Pure constant product with fees taken from output
        // Full base_amount enters vault, quote_output_before_fee leaves vault
        // Reserves updated accordingly - k is maintained!
        pool.real_base_reserves = pool.real_base_reserves
            .checked_add(base_amount)  // Full amount to vault
            .ok_or(ErrorCode::MathOverflow)?;
        pool.real_quote_reserves = pool.real_quote_reserves
            .checked_sub(total_quote_out)  // Total output (user + fee)
            .ok_or(ErrorCode::MathOverflow)?;
        // Virtual reserves frozen at graduation (no longer used for pricing)
    } else {
        // PRE-BONDING PHASE: Update VIRTUAL reserves for bonding curve
        // Full base_amount to vault, total_quote_out from vault
        pool.virtual_base_reserves = pool.virtual_base_reserves
            .checked_add(base_amount)
            .ok_or(ErrorCode::MathOverflow)?;
        pool.virtual_quote_reserves = pool.virtual_quote_reserves
            .checked_sub(total_quote_out)
            .ok_or(ErrorCode::MathOverflow)?;

        // Update real reserves (tracking actual vault balances)
        // Real reserves must match actual tokens in vaults
        pool.real_base_reserves = pool.real_base_reserves
            .checked_add(base_amount)  // Full amount went to vault
            .ok_or(ErrorCode::MathOverflow)?;
        pool.real_quote_reserves = pool.real_quote_reserves
            .checked_sub(total_quote_out)  // Total output left vault
            .ok_or(ErrorCode::MathOverflow)?;
    }

    // Update statistics
    pool.total_base_volume = pool.total_base_volume
        .checked_add(base_amount)
        .ok_or(ErrorCode::MathOverflow)?;
    pool.total_quote_volume = pool.total_quote_volume
        .checked_add(quote_output)
        .ok_or(ErrorCode::MathOverflow)?;
    pool.total_fees_collected = pool.total_fees_collected
        .checked_add(total_fee_in_quote)  // Track total fees (base + WAA) in CRX
        .ok_or(ErrorCode::MathOverflow)?;

    // Update user position - reduce tracked amount after sell
    let user_position = &mut ctx.accounts.user_position;
    user_position.update_on_sell(base_amount)?;

    msg!("Position updated: avg_entry_slot={}, tracked_amount={}",
        user_position.avg_entry_slot,
        user_position.tracked_amount
    );

    // Capture pre-transition state for event
    let phase_before = pool.current_phase;
    let virtual_quote_before = pool.virtual_quote_reserves;
    let virtual_base_before = pool.virtual_base_reserves;

    // Note: Phase transitions on sells are less common but still checked
    let transitioned = pool.check_phase_transition()?;

    // Emit graduation events if transition occurred (rare on sells, but possible)
    if transitioned {
        let price_at_graduation = pool.get_spot_price()?;
        let market_cap_at_graduation = pool.get_market_cap_usd()?;
        let slots_to_graduate = clock.slot.saturating_sub(pool.created_at_slot);

        emit!(PoolGraduated {
            pool: pool.key(),
            base_mint: pool.base_mint,
            creator: pool.creator,
            graduation_slot: clock.slot,
            total_crx_accumulated: pool.real_quote_reserves,
            graduation_threshold_crx: pool.graduation_threshold_crx,
            final_virtual_quote_reserves: virtual_quote_before,
            final_virtual_base_reserves: virtual_base_before,
            starting_real_quote_reserves: pool.real_quote_reserves,
            starting_real_base_reserves: pool.real_base_reserves,
            price_at_graduation,
            market_cap_usd_at_graduation: market_cap_at_graduation,
            total_volume_crx: pool.total_quote_volume,
            total_fees_collected: pool.total_fees_collected,
            slots_to_graduate,
            timestamp: clock.unix_timestamp,
        });

        emit!(PhaseTransition {
            pool: pool.key(),
            base_mint: pool.base_mint,
            from_phase: phase_before,
            to_phase: pool.current_phase,
            transition_slot: clock.slot,
            timestamp: clock.unix_timestamp,
        });
    }

    // Emit trade event
    let (quote_reserves_after, base_reserves_after) = pool.get_pricing_reserves();
    let price_after = pool.get_spot_price()?;
    let market_cap_usd = pool.get_market_cap_usd()?;
    let anti_sniper_active = pool.is_anti_sniper_active(clock.slot, config.anti_sniper_window_slots);

    // Calculate effective fee bps (base + WAA)
    let effective_fee_bps = current_fee_bps
        .checked_add(extra_fee_bps as u16)
        .unwrap_or(current_fee_bps);

    emit!(TradeExecuted {
        pool: pool.key(),
        user: ctx.accounts.user.key(),
        base_mint: pool.base_mint,
        is_buy: false,
        input_amount: base_amount,
        output_amount: quote_output,
        fee_amount: total_fee_in_quote,  // Report total fee (base + WAA) in CRX
        fee_bps: effective_fee_bps,      // Effective fee including WAA penalty
        phase: pool.current_phase,
        price_after,
        quote_reserves_after,
        base_reserves_after,
        real_crx_accumulated: pool.real_quote_reserves,
        market_cap_usd,
        anti_sniper_active,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });

    msg!("Sell executed!");
    msg!("   Base In: {} tokens (from user)", base_amount);
    msg!("   Quote Out: {} CRX (to user, after {} bps effective fee)", quote_output, effective_fee_bps);
    msg!("   Total Fee to Creator: {} CRX (base: {}, WAA: {})",
        total_fee_in_quote, base_fee_in_quote, extra_fee_in_quote);
    let (new_quote_res, new_base_res) = pool.get_pricing_reserves();
    msg!("   New Price: {} CRX per token",
        (new_quote_res as f64) / (new_base_res as f64)
    );

    if matches!(pool.current_phase, CurvePhase::PreBonding) {
        msg!("   Real CRX Accumulated: {} / {} (to graduation)",
            pool.real_quote_reserves,
            pool.graduation_threshold_crx
        );
    }

    if transitioned {
        msg!("Phase transition occurred!");
    }

    // CRITICAL: Validate reserves match actual vault balances
    // This prevents accounting bugs and ensures pool integrity
    ctx.accounts.quote_vault.reload()?;
    ctx.accounts.base_vault.reload()?;

    require!(
        pool.real_quote_reserves == ctx.accounts.quote_vault.amount,
        ErrorCode::ReserveVaultMismatch
    );
    require!(
        pool.real_base_reserves == ctx.accounts.base_vault.amount,
        ErrorCode::ReserveVaultMismatch
    );

    Ok(())
}
