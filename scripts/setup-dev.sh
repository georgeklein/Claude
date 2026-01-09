#!/bin/bash
# Scale AMM Development Environment Setup
# Installs Solana CLI, Rust, Anchor, and Node.js dependencies

set -e

echo "=========================================="
echo "Scale AMM Development Environment Setup"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 1. Install Rust
echo ""
echo "Step 1: Checking Rust installation..."
if command_exists rustc; then
    RUST_VERSION=$(rustc --version)
    print_status "Rust already installed: $RUST_VERSION"
else
    print_warning "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    print_status "Rust installed: $(rustc --version)"
fi

# Ensure cargo is in PATH
export PATH="$HOME/.cargo/bin:$PATH"

# 2. Install Solana CLI
echo ""
echo "Step 2: Checking Solana CLI installation..."
if command_exists solana; then
    SOLANA_VERSION=$(solana --version)
    print_status "Solana CLI already installed: $SOLANA_VERSION"
else
    print_warning "Installing Solana CLI..."
    sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
    print_status "Solana CLI installed: $(solana --version)"
fi

# Ensure solana is in PATH
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# 3. Install Anchor CLI
echo ""
echo "Step 3: Checking Anchor CLI installation..."
if command_exists anchor; then
    ANCHOR_VERSION=$(anchor --version)
    print_status "Anchor already installed: $ANCHOR_VERSION"
else
    print_warning "Installing Anchor Version Manager (AVM)..."
    cargo install --git https://github.com/coral-xyz/anchor avm --locked --force

    print_warning "Installing Anchor 0.30.1..."
    avm install 0.30.1
    avm use 0.30.1
    print_status "Anchor installed: $(anchor --version)"
fi

# 4. Check Node.js
echo ""
echo "Step 4: Checking Node.js installation..."
if command_exists node; then
    NODE_VERSION=$(node --version)
    print_status "Node.js already installed: $NODE_VERSION"
else
    print_error "Node.js not found. Please install Node.js 18+ manually:"
    echo "  - macOS: brew install node"
    echo "  - Ubuntu: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
    echo "  - Or use nvm: https://github.com/nvm-sh/nvm"
    exit 1
fi

# 5. Install Node.js dependencies
echo ""
echo "Step 5: Installing Node.js dependencies..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [ -f "$PROJECT_ROOT/package.json" ]; then
    cd "$PROJECT_ROOT"
    npm install
    print_status "Node.js dependencies installed"
else
    print_warning "package.json not found, skipping npm install"
fi

# 6. Generate Solana keypair if needed
echo ""
echo "Step 6: Checking Solana keypair..."
KEYPAIR_PATH="$HOME/.config/solana/id.json"
if [ -f "$KEYPAIR_PATH" ]; then
    print_status "Solana keypair exists at $KEYPAIR_PATH"
else
    print_warning "Generating new Solana keypair..."
    mkdir -p "$HOME/.config/solana"
    solana-keygen new --outfile "$KEYPAIR_PATH" --no-bip39-passphrase
    print_status "Keypair generated at $KEYPAIR_PATH"
fi

# 7. Configure Solana for localhost
echo ""
echo "Step 7: Configuring Solana CLI..."
solana config set --url localhost >/dev/null 2>&1
solana config set --keypair "$KEYPAIR_PATH" >/dev/null 2>&1
print_status "Solana configured for localhost testing"

# 8. Build the project
echo ""
echo "Step 8: Building the project..."
cd "$PROJECT_ROOT"
if anchor build; then
    print_status "Project built successfully"
else
    print_warning "Build failed - this may be expected if dependencies are missing"
    print_warning "Try running 'cargo check' to see specific errors"
fi

# Summary
echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Add these to your shell profile (~/.bashrc or ~/.zshrc):"
echo ""
echo '  export PATH="$HOME/.cargo/bin:$PATH"'
echo '  export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"'
echo ""
echo "Then run:"
echo "  source ~/.bashrc  # or source ~/.zshrc"
echo ""
echo "To run tests:"
echo "  anchor test"
echo ""
echo "To run on devnet:"
echo "  solana config set --url devnet"
echo "  solana airdrop 2  # Get some SOL"
echo "  anchor test --provider.cluster devnet"
echo ""
