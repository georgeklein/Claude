# Programs

**Solana on-chain programs**

This directory contains the Scale AMM Solana program (smart contract) written in Rust using the Anchor framework.

## Structure

- `creator-amm-v2/` - Scale AMM bonding curve protocol
  - `src/` - Program source code
    - `lib.rs` - Program entry point
    - `state.rs` - Data structures (Config, Pool, UserPosition)
    - `errors.rs` - Error codes
    - `events.rs` - On-chain events
    - `instructions/` - Program instructions (buy, sell, create_pool, etc.)
    - `utils/` - Helper utilities (oracle, math)
  - `Cargo.toml` - Rust dependencies

## Purpose

The Solana program handles:
- Pool creation and management
- Token swaps (buy/sell)
- Virtual liquidity calculations
- Oracle integration for $CRX pricing
- Anti-sniper protection (WAA)
- Automatic pool graduation
- Fee collection in $CRX
