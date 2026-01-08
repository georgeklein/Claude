use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{Config, Pool, CurvePhase, UserPosition};
use crate::errors::ErrorCode;
use crate::events::{TradeExecuted, PoolGraduated, PhaseTransition};

#[derive(Accounts)]
pub struct Buy<'info> {
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

    /// User's quote token account (paying with CRX)
    #[account(
        mut,
        constraint = user_quote_account.mint == pool.quote_mint,
        constraint = user_quote_account.owner == user.key(),
    )]
    pub user_quote_account: Account<'info, TokenAccount>,

    /// User's base token account (receiving tokens)
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

    /// User position for WAA tracking (init_if_needed to auto-create)
    #[account(
        init_if_needed,
        payer = user,
        space = UserPosition::LEN,
        seeds = [b"pos", pool.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Buy>,
    quote_amount: u64,      // Amount of CRX to spend
    min_base_amount: u64,   // Minimum tokens to receive (slippage protection)
) -> Result<()> {
    require!(quote_amount > 0, ErrorCode::InvalidAmount);

    let pool = &mut ctx.accounts.pool;
    let config = &ctx.accounts.config;
    let clock = Clock::get()?;

    // Get current phase parameters
    let current_fee_bps = pool.get_current_fee_bps();

    // Get correct reserves based on phase (virtual or real)
    let (quote_reserve, base_reserve) = pool.get_pricing_reserves();

    msg!("💰 Buy Request:");
    msg!("   Quote Amount: {} CRX", quote_amount);
    msg!("   Current Phase: {:?}", pool.current_phase);
    msg!("   Fee: {} bps", current_fee_bps);
    msg!("   Using {} reserves", if matches!(pool.current_phase, CurvePhase::Graduated) { "REAL" } else { "VIRTUAL" });

    // Anti-sniper protection check (only PreBonding phase)
    if pool.is_anti_sniper_active(clock.slot, config.anti_sniper_window_slots) {
        let max_trade_amount = (base_reserve as u128)
            .checked_mul(config.anti_sniper_max_trade_bps as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)? as u64;

        // Estimate output (without fee for check)
        let estimated_output = pool.calculate_output(
            quote_amount,
            quote_reserve,
            base_reserve,
            0, // No fee for estimate
        )?;

        require!(
            estimated_output <= max_trade_amount,
            ErrorCode::AntiSniperActive
        );

        msg!("🛡️  Anti-sniper active: max {} tokens", max_trade_amount);
    }

    // CRITICAL FEE LOGIC: Take fee "off the cuff" BEFORE swap
    // This prevents liquidity degradation by not extracting fees from reserves

    // Calculate fee from user's input amount
    let fee_in_quote = if current_fee_bps > 0 {
        let fee = (quote_amount as u128)
            .checked_mul(current_fee_bps as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)? as u64;
        std::cmp::max(fee, 1) // Minimum 1 lamport if fee enabled
    } else {
        0
    };

    // Calculate swap amount (quote_amount minus fee)
    let swap_amount = quote_amount
        .checked_sub(fee_in_quote)
        .ok_or(ErrorCode::MathOverflow)?;

    // Calculate output based on SWAP AMOUNT (not full quote_amount)
    // This maintains x*y=k invariant because only swap_amount enters reserves
    let base_output = pool.calculate_output(
        swap_amount,
        quote_reserve,
        base_reserve,
        0, // No fee here - already extracted above
    )?;

    // Slippage protection (CRITICAL SECURITY FIX from PumpSwap)
    require!(
        base_output >= min_base_amount,
        ErrorCode::SlippageExceeded
    );

    // Minimum output validation (prevents dust trades)
    const MIN_OUTPUT_AMOUNT: u64 = 1000; // 0.001 tokens (with 6 decimals)
    require!(
        base_output >= MIN_OUTPUT_AMOUNT,
        ErrorCode::OutputTooSmall
    );

    // Transfer 1: Fee goes directly to creator (if any)
    if fee_in_quote > 0 {
        let fee_cpi_accounts = Transfer {
            from: ctx.accounts.user_quote_account.to_account_info(),
            to: ctx.accounts.fee_recipient_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), fee_cpi_accounts),
            fee_in_quote,
        )?;
    }

    // Transfer 2: Swap amount goes to pool vault (NOT full quote_amount)
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_quote_account.to_account_info(),
        to: ctx.accounts.quote_vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
        swap_amount, // Only swap amount, not full quote_amount
    )?;

    // Transfer 3: Base tokens from pool to user
    let pool_seeds = &[
        b"pool",
        pool.base_mint.as_ref(),
        &[pool.bump],
    ];
    let signer = &[&pool_seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.base_vault.to_account_info(),
        to: ctx.accounts.user_base_account.to_account_info(),
        authority: pool.to_account_info(),
    };
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        ),
        base_output,
    )?;

    // Update reserves based on phase
    // CRITICAL: Only swap_amount enters vault (fee already went to creator)
    // This maintains x*y=k perfectly - no degradation!
    if matches!(pool.current_phase, CurvePhase::Graduated) {
        // GRADUATED PHASE: Pure constant product with fees taken "off the cuff"
        // Fee went directly to creator, swap_amount to vault
        // Reserves updated with swap_amount only - k is maintained!
        pool.real_quote_reserves = pool.real_quote_reserves
            .checked_add(swap_amount)  // Only swap amount, not full quote_amount
            .ok_or(ErrorCode::MathOverflow)?;
        pool.real_base_reserves = pool.real_base_reserves
            .checked_sub(base_output)
            .ok_or(ErrorCode::MathOverflow)?;
        // Virtual reserves frozen at graduation (no longer used for pricing)
    } else {
        // PRE-BONDING PHASE: Update VIRTUAL reserves for bonding curve
        // Swap calculated with swap_amount, so add swap_amount to reserves
        pool.virtual_quote_reserves = pool.virtual_quote_reserves
            .checked_add(swap_amount)
            .ok_or(ErrorCode::MathOverflow)?;
        pool.virtual_base_reserves = pool.virtual_base_reserves
            .checked_sub(base_output)
            .ok_or(ErrorCode::MathOverflow)?;

        // Update real reserves (tracking actual vault balances)
        // Real reserves only track what's actually in vaults
        pool.real_quote_reserves = pool.real_quote_reserves
            .checked_add(swap_amount)  // Only swap amount went to vault
            .ok_or(ErrorCode::MathOverflow)?;
        pool.real_base_reserves = pool.real_base_reserves
            .checked_sub(base_output)
            .ok_or(ErrorCode::MathOverflow)?;
    }

    // Update statistics
    pool.total_quote_volume = pool.total_quote_volume
        .checked_add(quote_amount)
        .ok_or(ErrorCode::MathOverflow)?;
    pool.total_base_volume = pool.total_base_volume
        .checked_add(base_output)
        .ok_or(ErrorCode::MathOverflow)?;
    pool.total_fees_collected = pool.total_fees_collected
        .checked_add(fee_in_quote)
        .ok_or(ErrorCode::MathOverflow)?;

    // Update user position for WAA tracking
    let user_position = &mut ctx.accounts.user_position;

    // Initialize position if first time
    if user_position.pool == Pubkey::default() {
        user_position.pool = pool.key();
        user_position.user = ctx.accounts.user.key();
        user_position.bump = ctx.bumps.user_position;
    }

    // Update weighted average entry slot
    user_position.update_on_buy(base_output, clock.slot)?;

    msg!("📊 WAA updated: avg_entry_slot={}, tracked_amount={}",
        user_position.avg_entry_slot,
        user_position.tracked_amount
    );

    // Capture pre-transition state for event
    let phase_before = pool.current_phase;
    let virtual_quote_before = pool.virtual_quote_reserves;
    let virtual_base_before = pool.virtual_base_reserves;

    // Check for phase transition (DUAL-PHASE BONDING CURVE INNOVATION)
    let transitioned = pool.check_phase_transition()?;

    // Emit graduation events if transition occurred
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

    emit!(TradeExecuted {
        pool: pool.key(),
        user: ctx.accounts.user.key(),
        base_mint: pool.base_mint,
        is_buy: true,
        input_amount: quote_amount,
        output_amount: base_output,
        fee_amount: fee_in_quote,
        fee_bps: current_fee_bps,
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

    msg!("✅ Buy executed!");
    msg!("   Quote In: {} CRX (total paid by user)", quote_amount);
    msg!("   Swap Amount: {} CRX (after {} bps fee)", swap_amount, current_fee_bps);
    msg!("   Base Out: {} tokens", base_output);
    msg!("   Fee to Creator: {} CRX", fee_in_quote);

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
        msg!("🎉 Phase transition occurred!");
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
