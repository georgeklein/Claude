#!/bin/bash

################################################################################
# Creator AMM v2 - Devnet Deployment Script
#
# This script automates the complete deployment of Creator AMM v2 to Solana devnet
# including program deployment, config initialization, and CRX token setup.
#
# Prerequisites:
#   - Solana CLI (solana-cli)
#   - Anchor CLI (anchor-cli)
#   - SPL Token CLI (spl-token)
#   - Node.js & npm
#
# Usage:
#   ./scripts/deploy-devnet.sh
#
# Environment Variables:
#   DEPLOYER_KEYPAIR    - Path to deployer wallet (default: ~/.config/solana/id.json)
#   SKIP_BUILD          - Set to "true" to skip anchor build
#   SKIP_TOKEN_SETUP    - Set to "true" to skip CRX token creation
################################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable
set -o pipefail  # Exit on pipe failure

################################################################################
# Configuration
################################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
CLUSTER="devnet"
RPC_URL="https://api.devnet.solana.com"
DEPLOYER_KEYPAIR="${DEPLOYER_KEYPAIR:-$HOME/.config/solana/id.json}"

# Generated keypairs directory
KEYPAIRS_DIR="$PROJECT_DIR/.keypairs"
mkdir -p "$KEYPAIRS_DIR"

# Deployment artifacts
DEPLOYMENT_LOG="$PROJECT_DIR/deployment-devnet.log"
DEPLOYMENT_STATE="$PROJECT_DIR/.deployment-state-devnet.json"

################################################################################
# Helper Functions
################################################################################

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

log_step() {
    echo -e "\n${PURPLE}========================================${NC}" | tee -a "$DEPLOYMENT_LOG"
    echo -e "${PURPLE}$1${NC}" | tee -a "$DEPLOYMENT_LOG"
    echo -e "${PURPLE}========================================${NC}\n" | tee -a "$DEPLOYMENT_LOG"
}

# Save deployment state
save_state() {
    local key=$1
    local value=$2

    # Create or update JSON file
    if [ -f "$DEPLOYMENT_STATE" ]; then
        tmp=$(mktemp)
        jq --arg key "$key" --arg value "$value" '. + {($key): $value}' "$DEPLOYMENT_STATE" > "$tmp"
        mv "$tmp" "$DEPLOYMENT_STATE"
    else
        echo "{\"$key\": \"$value\"}" > "$DEPLOYMENT_STATE"
    fi
}

# Get deployment state
get_state() {
    local key=$1
    if [ -f "$DEPLOYMENT_STATE" ]; then
        jq -r ".$key // \"\"" "$DEPLOYMENT_STATE"
    else
        echo ""
    fi
}

# Check if command exists
check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed. Please install it first."
        exit 1
    fi
}

# Wait for transaction confirmation
wait_for_confirmation() {
    local signature=$1
    log_info "Waiting for confirmation: $signature"

    for i in {1..30}; do
        if solana confirm -u "$RPC_URL" "$signature" &> /dev/null; then
            log_success "Transaction confirmed!"
            return 0
        fi
        echo -n "."
        sleep 2
    done

    log_error "Transaction confirmation timeout"
    return 1
}

# Request airdrop and wait
request_airdrop() {
    local address=$1
    local amount=$2

    log_info "Requesting $amount SOL airdrop to $address..."

    local signature
    signature=$(solana airdrop "$amount" "$address" --url "$RPC_URL" 2>&1 | grep -oP 'Signature: \K[A-Za-z0-9]+' || echo "")

    if [ -z "$signature" ]; then
        log_warn "Airdrop may have failed or rate-limited. Continuing anyway..."
        sleep 5
        return 0
    fi

    wait_for_confirmation "$signature"
}

# Get balance
get_balance() {
    local address=$1
    solana balance "$address" --url "$RPC_URL" 2>/dev/null | grep -oP '\d+\.?\d*' || echo "0"
}

################################################################################
# Pre-flight Checks
################################################################################

preflight_checks() {
    log_step "Running Pre-flight Checks"

    # Check required commands
    log_info "Checking required tools..."
    check_command "solana"
    check_command "anchor"
    check_command "spl-token"
    check_command "node"
    check_command "npm"
    check_command "jq"

    # Check Solana version
    log_info "Solana CLI version: $(solana --version)"
    log_info "Anchor CLI version: $(anchor --version)"

    # Check deployer keypair exists
    if [ ! -f "$DEPLOYER_KEYPAIR" ]; then
        log_warn "Deployer keypair not found at $DEPLOYER_KEYPAIR"
        log_info "Generating new deployer keypair..."
        solana-keygen new --no-bip39-passphrase --outfile "$DEPLOYER_KEYPAIR"
    fi

    local deployer_pubkey
    deployer_pubkey=$(solana address -k "$DEPLOYER_KEYPAIR")
    log_info "Deployer address: $deployer_pubkey"

    # Check deployer balance
    local balance
    balance=$(get_balance "$deployer_pubkey")
    log_info "Deployer balance: $balance SOL"

    # Request airdrop if needed
    if (( $(echo "$balance < 5" | bc -l) )); then
        log_warn "Deployer balance low. Requesting airdrop..."
        request_airdrop "$deployer_pubkey" 10
        balance=$(get_balance "$deployer_pubkey")
        log_info "New balance: $balance SOL"
    fi

    # Set Solana config
    log_info "Configuring Solana CLI..."
    solana config set --url "$RPC_URL"
    solana config set --keypair "$DEPLOYER_KEYPAIR"

    log_success "Pre-flight checks complete!"
}

################################################################################
# Generate Keypairs
################################################################################

generate_keypairs() {
    log_step "Generating Keypairs"

    # Fee recipient
    if [ ! -f "$KEYPAIRS_DIR/fee-recipient.json" ]; then
        log_info "Generating fee recipient keypair..."
        solana-keygen new --no-bip39-passphrase --outfile "$KEYPAIRS_DIR/fee-recipient.json"
    fi
    FEE_RECIPIENT=$(solana address -k "$KEYPAIRS_DIR/fee-recipient.json")
    log_info "Fee recipient: $FEE_RECIPIENT"
    save_state "fee_recipient" "$FEE_RECIPIENT"

    # Test creator
    if [ ! -f "$KEYPAIRS_DIR/test-creator.json" ]; then
        log_info "Generating test creator keypair..."
        solana-keygen new --no-bip39-passphrase --outfile "$KEYPAIRS_DIR/test-creator.json"
    fi
    TEST_CREATOR=$(solana address -k "$KEYPAIRS_DIR/test-creator.json")
    log_info "Test creator: $TEST_CREATOR"
    save_state "test_creator" "$TEST_CREATOR"

    # Test users (10)
    log_info "Generating test user keypairs..."
    for i in {1..10}; do
        if [ ! -f "$KEYPAIRS_DIR/test-user-$i.json" ]; then
            solana-keygen new --no-bip39-passphrase --outfile "$KEYPAIRS_DIR/test-user-$i.json" &>/dev/null
        fi
        USER_ADDR=$(solana address -k "$KEYPAIRS_DIR/test-user-$i.json")
        log_info "Test user $i: $USER_ADDR"
        save_state "test_user_$i" "$USER_ADDR"
    done

    log_success "Keypair generation complete!"
}

################################################################################
# Fund Wallets
################################################################################

fund_wallets() {
    log_step "Funding Wallets"

    # Fund fee recipient
    log_info "Funding fee recipient..."
    request_airdrop "$FEE_RECIPIENT" 1

    # Fund test creator
    log_info "Funding test creator..."
    request_airdrop "$TEST_CREATOR" 5

    # Fund test users
    log_info "Funding test users..."
    for i in {1..10}; do
        USER_ADDR=$(solana address -k "$KEYPAIRS_DIR/test-user-$i.json")
        log_info "Funding user $i: $USER_ADDR"
        request_airdrop "$USER_ADDR" 2
        sleep 1  # Rate limiting
    done

    log_success "Wallet funding complete!"
}

################################################################################
# Build Program
################################################################################

build_program() {
    if [ "${SKIP_BUILD:-false}" = "true" ]; then
        log_warn "Skipping build (SKIP_BUILD=true)"
        return 0
    fi

    log_step "Building Program"

    cd "$PROJECT_DIR"

    log_info "Running anchor build..."
    anchor build 2>&1 | tee -a "$DEPLOYMENT_LOG"

    if [ ! -f "target/deploy/creator_amm_v2.so" ]; then
        log_error "Build failed! Program binary not found."
        exit 1
    fi

    local binary_size
    binary_size=$(du -h "target/deploy/creator_amm_v2.so" | cut -f1)
    log_info "Program binary size: $binary_size"

    # Get program ID from keypair
    if [ -f "target/deploy/creator_amm_v2-keypair.json" ]; then
        PROGRAM_ID=$(solana address -k "target/deploy/creator_amm_v2-keypair.json")
        log_info "Program ID: $PROGRAM_ID"
        save_state "program_id" "$PROGRAM_ID"
    else
        log_error "Program keypair not found!"
        exit 1
    fi

    log_success "Build complete!"
}

################################################################################
# Deploy Program
################################################################################

deploy_program() {
    log_step "Deploying Program to Devnet"

    cd "$PROJECT_DIR"

    # Check if already deployed
    EXISTING_PROGRAM_ID=$(get_state "deployed_program_id")
    if [ -n "$EXISTING_PROGRAM_ID" ]; then
        log_warn "Program already deployed: $EXISTING_PROGRAM_ID"
        read -p "Do you want to redeploy? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Skipping deployment"
            PROGRAM_ID="$EXISTING_PROGRAM_ID"
            return 0
        fi
    fi

    log_info "Deploying program to devnet..."
    log_info "This may take 2-3 minutes..."

    # Deploy using anchor
    anchor deploy --provider.cluster devnet 2>&1 | tee -a "$DEPLOYMENT_LOG"

    # Verify deployment
    if solana program show "$PROGRAM_ID" --url "$RPC_URL" &>/dev/null; then
        log_success "Program deployed successfully!"
        log_info "Program ID: $PROGRAM_ID"
        save_state "deployed_program_id" "$PROGRAM_ID"
    else
        log_error "Program deployment verification failed!"
        exit 1
    fi

    # Get program data account
    PROGRAM_DATA=$(solana program show "$PROGRAM_ID" --url "$RPC_URL" | grep "ProgramData Address" | awk '{print $3}')
    log_info "Program Data Account: $PROGRAM_DATA"
    save_state "program_data" "$PROGRAM_DATA"
}

################################################################################
# Setup CRX Token
################################################################################

setup_crx_token() {
    if [ "${SKIP_TOKEN_SETUP:-false}" = "true" ]; then
        log_warn "Skipping CRX token setup (SKIP_TOKEN_SETUP=true)"
        return 0
    fi

    log_step "Setting Up CRX Token"

    # Check if already created
    EXISTING_CRX_MINT=$(get_state "crx_mint")
    if [ -n "$EXISTING_CRX_MINT" ]; then
        log_warn "CRX token already created: $EXISTING_CRX_MINT"
        CRX_MINT="$EXISTING_CRX_MINT"
        return 0
    fi

    # Create CRX token
    log_info "Creating CRX token with 6 decimals..."
    CRX_MINT=$(spl-token create-token --decimals 6 --url "$RPC_URL" 2>&1 | grep "Creating token" | awk '{print $3}')

    if [ -z "$CRX_MINT" ]; then
        log_error "Failed to create CRX token!"
        exit 1
    fi

    log_success "CRX token created: $CRX_MINT"
    save_state "crx_mint" "$CRX_MINT"

    # Create token account for deployer
    log_info "Creating CRX token account for deployer..."
    DEPLOYER_CRX_ATA=$(spl-token create-account "$CRX_MINT" --url "$RPC_URL" 2>&1 | grep "Creating account" | awk '{print $3}')
    save_state "deployer_crx_ata" "$DEPLOYER_CRX_ATA"

    # Mint initial supply (1,000,000 CRX)
    log_info "Minting 1,000,000 CRX..."
    spl-token mint "$CRX_MINT" 1000000000000 --url "$RPC_URL" 2>&1 | tee -a "$DEPLOYMENT_LOG"

    # Create token account for fee recipient
    log_info "Creating CRX token account for fee recipient..."
    FEE_RECIPIENT_CRX_ATA=$(spl-token create-account "$CRX_MINT" --owner "$FEE_RECIPIENT" --fee-payer "$DEPLOYER_KEYPAIR" --url "$RPC_URL" 2>&1 | grep "Creating account" | awk '{print $3}')
    save_state "fee_recipient_crx_ata" "$FEE_RECIPIENT_CRX_ATA"

    # Create token accounts for test users
    log_info "Creating CRX token accounts for test users..."
    for i in {1..10}; do
        USER_ADDR=$(get_state "test_user_$i")
        log_info "Creating account for user $i: $USER_ADDR"
        USER_CRX_ATA=$(spl-token create-account "$CRX_MINT" --owner "$USER_ADDR" --fee-payer "$DEPLOYER_KEYPAIR" --url "$RPC_URL" 2>&1 | grep "Creating account" | awk '{print $3}')
        save_state "test_user_${i}_crx_ata" "$USER_CRX_ATA"

        # Transfer 10,000 CRX to each user
        log_info "Transferring 10,000 CRX to user $i..."
        spl-token transfer "$CRX_MINT" 10000000000 "$USER_CRX_ATA" --fund-recipient --url "$RPC_URL" 2>&1 | tee -a "$DEPLOYMENT_LOG"

        sleep 1  # Rate limiting
    done

    log_success "CRX token setup complete!"
}

################################################################################
# Setup Oracle
################################################################################

setup_oracle() {
    log_step "Setting Up Oracle"

    # For devnet, we use Pyth's SOL/USD feed as CRX proxy
    # Devnet Pyth SOL/USD: J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix
    PYTH_SOL_USD="J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix"

    log_info "Using Pyth SOL/USD feed as CRX price proxy"
    log_info "Oracle address: $PYTH_SOL_USD"

    save_state "crx_price_oracle" "$PYTH_SOL_USD"

    # Verify oracle account exists
    if solana account "$PYTH_SOL_USD" --url "$RPC_URL" &>/dev/null; then
        log_success "Oracle account verified!"
    else
        log_error "Oracle account not found on devnet!"
        log_warn "This is expected if devnet was recently reset."
        log_info "You may need to use a different oracle or mock implementation."
    fi
}

################################################################################
# Initialize Config
################################################################################

initialize_config() {
    log_step "Initializing AMM Config"

    # Check if already initialized
    EXISTING_CONFIG=$(get_state "config_pda")
    if [ -n "$EXISTING_CONFIG" ]; then
        log_warn "Config already initialized: $EXISTING_CONFIG"
        read -p "Do you want to reinitialize? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Skipping initialization"
            return 0
        fi
    fi

    log_info "Initializing config with parameters:"
    log_info "  Pre-bonding fee: 3% (300 bps)"
    log_info "  Pre-bonding threshold: $40,000 USD"
    log_info "  Post-bonding fee: 1% (100 bps)"
    log_info "  Graduation threshold: $85,000 USD"
    log_info "  Anti-sniper window: 20 slots (~8 seconds)"
    log_info "  Anti-sniper max trade: 5% (500 bps)"
    log_info "  Oracle max age: 60 seconds"
    log_info "  Oracle max confidence: 1% (100 bps)"

    # Create initialization script
    cat > "$PROJECT_DIR/scripts/init-config.ts" << 'EOF'
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CreatorAmmV2 } from "../target/types/creator_amm_v2";
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";

async function main() {
  // Load deployment state
  const state = JSON.parse(fs.readFileSync(".deployment-state-devnet.json", "utf-8"));

  // Setup provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load program
  const programId = new PublicKey(state.deployed_program_id);
  const program = anchor.workspace.CreatorAmmV2 as Program<CreatorAmmV2>;

  // Derive config PDA
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId
  );

  console.log("Config PDA:", configPda.toString());

  // Initialize config
  try {
    const tx = await program.methods
      .initialize(
        300,                     // 3% pre-bonding fee
        new anchor.BN(40_000_000_000),   // $40k pre-bonding threshold
        100,                     // 1% post-bonding fee
        new anchor.BN(85_000_000_000),   // $85k graduation threshold
        new anchor.BN(20),       // 20 slot anti-sniper window
        500,                     // 5% max trade during anti-sniper
        new anchor.BN(60),       // 60 second oracle max age
        new anchor.BN(100)       // 1% oracle max confidence
      )
      .accounts({
        config: configPda,
        authority: provider.wallet.publicKey,
        feeRecipient: new PublicKey(state.fee_recipient),
        crxPriceOracle: new PublicKey(state.crx_price_oracle),
        crxMint: new PublicKey(state.crx_mint),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Config initialized!");
    console.log("Transaction:", tx);

    // Save config PDA to state
    const updatedState = { ...state, config_pda: configPda.toString() };
    fs.writeFileSync(".deployment-state-devnet.json", JSON.stringify(updatedState, null, 2));

  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

main().catch(console.error);
EOF

    # Run initialization
    log_info "Running initialization transaction..."
    cd "$PROJECT_DIR"
    npx ts-node scripts/init-config.ts 2>&1 | tee -a "$DEPLOYMENT_LOG"

    # Reload state
    CONFIG_PDA=$(get_state "config_pda")
    if [ -n "$CONFIG_PDA" ]; then
        log_success "Config initialized: $CONFIG_PDA"
    else
        log_error "Config initialization failed!"
        exit 1
    fi
}

################################################################################
# Verification
################################################################################

verify_deployment() {
    log_step "Verifying Deployment"

    log_info "Deployment Summary:"
    echo -e "\n${CYAN}═══════════════════════════════════════════════════════${NC}"

    # Program
    PROGRAM_ID=$(get_state "deployed_program_id")
    echo -e "${GREEN}Program ID:${NC} $PROGRAM_ID"

    # Config
    CONFIG_PDA=$(get_state "config_pda")
    echo -e "${GREEN}Config PDA:${NC} $CONFIG_PDA"

    # CRX Token
    CRX_MINT=$(get_state "crx_mint")
    echo -e "${GREEN}CRX Mint:${NC} $CRX_MINT"

    # Oracle
    ORACLE=$(get_state "crx_price_oracle")
    echo -e "${GREEN}Oracle:${NC} $ORACLE"

    # Fee Recipient
    FEE_RECIPIENT=$(get_state "fee_recipient")
    FEE_RECIPIENT_ATA=$(get_state "fee_recipient_crx_ata")
    echo -e "${GREEN}Fee Recipient:${NC} $FEE_RECIPIENT"
    echo -e "${GREEN}Fee Recipient CRX ATA:${NC} $FEE_RECIPIENT_ATA"

    # Test Accounts
    echo -e "\n${GREEN}Test Accounts:${NC}"
    TEST_CREATOR=$(get_state "test_creator")
    echo -e "  Creator: $TEST_CREATOR"
    for i in {1..5}; do
        USER=$(get_state "test_user_$i")
        echo -e "  User $i: $USER"
    done
    echo -e "  ... and 5 more users"

    echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}\n"

    # Verify program account
    log_info "Verifying program account..."
    if solana program show "$PROGRAM_ID" --url "$RPC_URL" &>/dev/null; then
        log_success "✓ Program account verified"
    else
        log_error "✗ Program account not found"
    fi

    # Verify config account
    log_info "Verifying config account..."
    if solana account "$CONFIG_PDA" --url "$RPC_URL" &>/dev/null; then
        log_success "✓ Config account verified"
    else
        log_error "✗ Config account not found"
    fi

    # Verify CRX token
    log_info "Verifying CRX token..."
    if spl-token supply "$CRX_MINT" --url "$RPC_URL" &>/dev/null; then
        SUPPLY=$(spl-token supply "$CRX_MINT" --url "$RPC_URL")
        log_success "✓ CRX token verified (Supply: $SUPPLY)"
    else
        log_error "✗ CRX token not found"
    fi

    log_success "Verification complete!"
}

################################################################################
# Generate Deployment Report
################################################################################

generate_report() {
    log_step "Generating Deployment Report"

    REPORT_FILE="$PROJECT_DIR/DEPLOYMENT_REPORT_DEVNET.md"

    cat > "$REPORT_FILE" << EOF
# Creator AMM v2 - Devnet Deployment Report

**Date:** $(date)
**Network:** Solana Devnet
**RPC:** $RPC_URL

---

## Deployment Details

### Program
- **Program ID:** $(get_state "deployed_program_id")
- **Program Data:** $(get_state "program_data")
- **Deployer:** $(solana address -k "$DEPLOYER_KEYPAIR")

### Configuration
- **Config PDA:** $(get_state "config_pda")
- **Fee Recipient:** $(get_state "fee_recipient")
- **Fee Recipient CRX ATA:** $(get_state "fee_recipient_crx_ata")

### CRX Token
- **Mint Address:** $(get_state "crx_mint")
- **Decimals:** 6
- **Total Supply:** 1,000,000 CRX
- **Deployer CRX ATA:** $(get_state "deployer_crx_ata")

### Oracle
- **CRX Price Oracle:** $(get_state "crx_price_oracle")
- **Type:** Pyth SOL/USD (proxy)

---

## Test Accounts

### Creator
- **Address:** $(get_state "test_creator")
- **Keypair:** \`.keypairs/test-creator.json\`

### Users
EOF

    for i in {1..10}; do
        cat >> "$REPORT_FILE" << EOF
- **User $i:** $(get_state "test_user_$i")
  - Keypair: \`.keypairs/test-user-$i.json\`
  - CRX ATA: $(get_state "test_user_${i}_crx_ata")
  - Balance: 10,000 CRX
EOF
    done

    cat >> "$REPORT_FILE" << EOF

---

## Configuration Parameters

- **Pre-bonding Fee:** 3% (300 bps)
- **Pre-bonding Threshold:** \$40,000 USD
- **Post-bonding Fee:** 1% (100 bps)
- **Graduation Threshold:** \$85,000 USD
- **Anti-sniper Window:** 20 slots (~8 seconds)
- **Anti-sniper Max Trade:** 5% (500 bps)
- **Oracle Max Age:** 60 seconds
- **Oracle Max Confidence:** 1% (100 bps)

---

## Next Steps

1. **Test Pool Creation:**
   \`\`\`bash
   # Create a test token
   spl-token create-token --decimals 6

   # Mint supply and revoke authorities
   spl-token mint <TOKEN> 1000000000000
   spl-token authorize <TOKEN> mint --disable
   spl-token authorize <TOKEN> freeze --disable

   # Create pool (use provided TypeScript SDK)
   \`\`\`

2. **Run Test Scenarios:**
   - Refer to \`DEVNET_SIMULATION.md\` for comprehensive test scenarios
   - Execute buy/sell transactions
   - Test graduation mechanics

3. **Monitor Pool Activity:**
   - Check pool state regularly
   - Verify reserve accounting
   - Monitor fee collection

4. **Load Testing:**
   - Run concurrent transactions
   - Test with multiple pools
   - Validate under stress

---

## Important Links

- **Solana Explorer:** https://explorer.solana.com/address/$(get_state "deployed_program_id")?cluster=devnet
- **Config Account:** https://explorer.solana.com/address/$(get_state "config_pda")?cluster=devnet
- **CRX Token:** https://explorer.solana.com/address/$(get_state "crx_mint")?cluster=devnet

---

## Troubleshooting

### Program Not Found
- Ensure devnet is accessible: \`solana cluster-version --url devnet\`
- Check program account: \`solana program show $(get_state "deployed_program_id") --url devnet\`

### Transaction Failures
- Check wallet balance: \`solana balance --url devnet\`
- Request airdrop: \`solana airdrop 2 --url devnet\`
- Check RPC health: Try different RPC endpoints

### Oracle Issues
- Verify oracle account exists: \`solana account $(get_state "crx_price_oracle") --url devnet\`
- If devnet was reset, oracle may be missing
- Consider using mock oracle for testing

---

**Deployment Complete!** 🚀

For detailed simulation scenarios, see \`DEVNET_SIMULATION.md\`.
EOF

    log_success "Report generated: $REPORT_FILE"

    # Display report
    cat "$REPORT_FILE"
}

################################################################################
# Main Deployment Flow
################################################################################

main() {
    clear

    echo -e "${CYAN}"
    cat << "EOF"
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║     Creator AMM v2 - Devnet Deployment Script             ║
║                                                            ║
║     Automated deployment to Solana Devnet                 ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}\n"

    log "Starting deployment at $(date)"
    log "Deployment log: $DEPLOYMENT_LOG"
    log "Deployment state: $DEPLOYMENT_STATE"

    # Run deployment steps
    preflight_checks
    generate_keypairs
    fund_wallets
    build_program
    deploy_program
    setup_crx_token
    setup_oracle
    initialize_config
    verify_deployment
    generate_report

    # Final success message
    echo -e "\n${GREEN}════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}║                                                          ║${NC}"
    echo -e "${GREEN}║  ✅ DEPLOYMENT COMPLETE!                                 ║${NC}"
    echo -e "${GREEN}║                                                          ║${NC}"
    echo -e "${GREEN}║  Your Creator AMM v2 is now live on Solana Devnet!     ║${NC}"
    echo -e "${GREEN}║                                                          ║${NC}"
    echo -e "${GREEN}║  Next: Review DEPLOYMENT_REPORT_DEVNET.md               ║${NC}"
    echo -e "${GREEN}║        and run test scenarios from DEVNET_SIMULATION.md ║${NC}"
    echo -e "${GREEN}║                                                          ║${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════${NC}\n"

    log "Deployment completed successfully at $(date)"
}

################################################################################
# Script Entry Point
################################################################################

# Handle interrupts
trap 'log_error "Deployment interrupted!"; exit 1' INT TERM

# Run main deployment
main "$@"
