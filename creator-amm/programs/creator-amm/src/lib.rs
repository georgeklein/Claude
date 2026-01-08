use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod creator_amm {
    use super::*;

    /// Initialize the global AMM configuration
    ///
    /// # Arguments
    /// * `protocol_fee_bps` - Protocol fee in basis points (100 = 1%, max 10000)
    /// * `anti_sniper_window` - Number of slots for anti-sniper protection (e.g., 20 slots ≈ 8 seconds)
    /// * `anti_sniper_max_trade_bps` - Max trade size during anti-sniper window as % of supply (in bps)
    pub fn initialize(
        ctx: Context<Initialize>,
        protocol_fee_bps: u16,
        anti_sniper_window: u64,
        anti_sniper_max_trade_bps: u16,
    ) -> Result<()> {
        instructions::initialize::handler(
            ctx,
            protocol_fee_bps,
            anti_sniper_window,
            anti_sniper_max_trade_bps,
        )
    }

    /// Create a new bonding curve pool for a token launch
    ///
    /// # Arguments
    /// * `virtual_quote_reserves` - Virtual quote token reserves for pricing (e.g., 30 SOL = 30_000_000_000)
    /// * `virtual_base_reserves` - Virtual base token reserves for pricing (e.g., 1B tokens)
    /// * `initial_base_amount` - Actual base tokens to deposit (should equal or exceed virtual)
    /// * `graduation_threshold` - Quote tokens needed to graduate to DEX (e.g., 85 SOL)
    ///
    /// # Virtual Liquidity Explained
    /// Virtual reserves determine the initial price without requiring real quote tokens.
    /// Price = virtual_quote_reserves / virtual_base_reserves
    /// Example: 30 SOL / 1B tokens = 0.00000003 SOL per token
    pub fn create_pool(
        ctx: Context<CreatePool>,
        virtual_quote_reserves: u64,
        virtual_base_reserves: u64,
        initial_base_amount: u64,
        graduation_threshold: u64,
    ) -> Result<()> {
        instructions::create_pool::handler(
            ctx,
            virtual_quote_reserves,
            virtual_base_reserves,
            initial_base_amount,
            graduation_threshold,
        )
    }

    /// Buy base tokens by paying quote tokens
    ///
    /// # Arguments
    /// * `quote_amount` - Amount of quote tokens to spend
    /// * `min_base_amount` - Minimum base tokens to receive (slippage protection)
    ///
    /// # Anti-Sniper Protection
    /// During the anti-sniper window (first ~8 seconds), trade sizes are limited
    /// to prevent bots from buying large amounts before real users.
    pub fn buy(
        ctx: Context<Buy>,
        quote_amount: u64,
        min_base_amount: u64,
    ) -> Result<()> {
        instructions::buy::handler(ctx, quote_amount, min_base_amount)
    }

    /// Sell base tokens to receive quote tokens
    ///
    /// # Arguments
    /// * `base_amount` - Amount of base tokens to sell
    /// * `min_quote_amount` - Minimum quote tokens to receive (slippage protection)
    pub fn sell(
        ctx: Context<Sell>,
        base_amount: u64,
        min_quote_amount: u64,
    ) -> Result<()> {
        instructions::sell::handler(ctx, base_amount, min_quote_amount)
    }
}
