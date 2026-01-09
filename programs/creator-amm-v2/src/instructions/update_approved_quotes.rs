use anchor_lang::prelude::*;
use crate::state::Config;
use crate::errors::ErrorCode;
use crate::events::ApprovedQuotesUpdated;

/// Update the approved quote token whitelist (Tier 2 - Permissioned)
///
/// Only the protocol authority can modify the whitelist.
/// This allows adding/removing premium quote tokens like SOL, USDC, USDT.
///
/// # Security
/// - Restricted to authority only
/// - Validates count is within bounds (0-5)
/// - No breaking changes to existing pools
#[derive(Accounts)]
pub struct UpdateApprovedQuotes<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        constraint = config.authority == authority.key() @ ErrorCode::Unauthorized
    )]
    pub config: Account<'info, Config>,

    pub authority: Signer<'info>,
}

pub fn handler(
    ctx: Context<UpdateApprovedQuotes>,
    approved_quote_tokens: [Pubkey; 5],
    approved_quote_count: u8,
) -> Result<()> {
    // Validate count is within bounds
    require!(
        approved_quote_count <= 5,
        ErrorCode::InvalidQuoteTokenCount
    );

    let config = &mut ctx.accounts.config;
    let old_quote_count = config.approved_quote_count;
    config.approved_quote_tokens = approved_quote_tokens;
    config.approved_quote_count = approved_quote_count;

    emit!(ApprovedQuotesUpdated {
        old_quote_count,
        new_quote_count: approved_quote_count,
        new_approved_quotes: approved_quote_tokens,
        authority: ctx.accounts.authority.key(),
        slot: Clock::get()?.slot,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!("Approved quote tokens updated by authority");
    msg!("   Active slots: {}/5", approved_quote_count);

    // Log each active whitelist entry for transparency
    for i in 0..approved_quote_count as usize {
        msg!("   [{}] {}", i, approved_quote_tokens[i]);
    }

    Ok(())
}
