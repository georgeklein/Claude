# Scale AMM - Project Memory

## Project Overview
Scale AMM is a Solana-based automated market maker with innovative features:
- **CRX** as the primary quote currency
- **WAA Anti-Snipe** mechanism for meme token pools
- **Pluggable curve architecture** (CPMM, StableSwap, Bonding Curves)
- **Prediction markets** using LMSR

## Tech Stack
- Solana / Anchor framework
- Rust (on-chain programs)
- TypeScript (client SDK & tests)
- React (frontend - planned)

## Project Structure
```
/home/user/Claude/
├── CLAUDE.md              # This file - project memory
├── docs/                  # Design documents
│   ├── WAA_FEE_ANALYSIS.md
│   ├── CURVE_EXPANSION_AND_INNOVATION.md
│   └── IMPLEMENTATION_PRIORITIES.md
├── programs/              # Anchor programs (to be created)
│   └── scale_amm/
└── tests/                 # Integration tests
```

## Key Design Decisions

### WAA Anti-Snipe Mechanism
- Extra sell fee: 10% → 1% → 0% over 30 minutes
- Slot-based timing (75/750/4500 slots)
- Untracked tokens (transferred in) treated as "just bought"
- Fee routing: 50% LP / 30% treasury / 20% burn

### Curve Priority
1. CPMM (constant product) - MVP
2. Bonding curves (Pump.fun competitor)
3. LMSR prediction markets
4. StableSwap / CLMM (future)

## Commands to Remember
- `anchor build` - Build the Solana program
- `anchor test` - Run tests on localnet
- `anchor deploy` - Deploy to devnet/mainnet
- `solana logs` - Watch program logs

## Coding Conventions
- Use checked math (`checked_add`, `checked_mul`) for all arithmetic
- All amounts in u64, intermediate calculations in u128
- PDA seeds: `["pool", token_mint]`, `["pos", pool, user]`
- Error codes in `error.rs`, state in `state/` directory

## Notes for Claude
- This is a DeFi project with financial implications
- Security is critical - always consider attack vectors
- Reference existing Solana AMMs (Raydium, Orca) for patterns
- Test edge cases: zero amounts, max u64, overflow scenarios
