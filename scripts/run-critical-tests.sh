#!/bin/bash

# ============================================================================
# Critical Security Tests Runner
# ============================================================================
# Runs the 30 critical security tests for Scale AMM
# Usage: ./scripts/run-critical-tests.sh [options]
#
# Options:
#   --build      Build program before running tests
#   --verbose    Show detailed test output
#   --category   Run specific test category (oracle|waa|antisniper|concurrent)
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
BUILD_FLAG=""
VERBOSE_FLAG=""
CATEGORY=""

for arg in "$@"; do
  case $arg in
    --build)
      BUILD_FLAG="yes"
      ;;
    --verbose)
      VERBOSE_FLAG="--verbose"
      ;;
    --category=*)
      CATEGORY="${arg#*=}"
      ;;
  esac
done

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}Scale AMM - Critical Security Tests${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

# Check if Anchor is installed
if ! command -v anchor &> /dev/null; then
    echo -e "${RED}❌ Anchor CLI not found. Please install:${NC}"
    echo "   cargo install --git https://github.com/coral-xyz/anchor avm --locked --force"
    echo "   avm install 0.29.0"
    echo "   avm use 0.29.0"
    exit 1
fi

echo -e "${GREEN}✓ Anchor CLI found: $(anchor --version)${NC}"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠ Dependencies not installed. Running npm install...${NC}"
    npm install
fi

echo -e "${GREEN}✓ Dependencies installed${NC}"

# Build program if requested
if [ "$BUILD_FLAG" == "yes" ]; then
    echo ""
    echo -e "${YELLOW}Building Solana program...${NC}"
    anchor build
    echo -e "${GREEN}✓ Program built successfully${NC}"
fi

# Run tests
echo ""
echo -e "${YELLOW}Running critical tests...${NC}"
echo ""

if [ -n "$CATEGORY" ]; then
    case $CATEGORY in
        oracle)
            echo -e "${BLUE}Running Oracle Edge Case tests (8 tests)...${NC}"
            anchor test $VERBOSE_FLAG -- --grep "Oracle Edge Cases"
            ;;
        waa)
            echo -e "${BLUE}Running WAA Sell Fee System tests (10 tests)...${NC}"
            anchor test $VERBOSE_FLAG -- --grep "WAA Sell Fee System"
            ;;
        antisniper)
            echo -e "${BLUE}Running Anti-Sniper Protection tests (7 tests)...${NC}"
            anchor test $VERBOSE_FLAG -- --grep "Anti-Sniper Protection"
            ;;
        concurrent)
            echo -e "${BLUE}Running Concurrent Trading tests (5 tests)...${NC}"
            anchor test $VERBOSE_FLAG -- --grep "Concurrent Trading"
            ;;
        *)
            echo -e "${RED}❌ Unknown category: $CATEGORY${NC}"
            echo "   Valid categories: oracle, waa, antisniper, concurrent"
            exit 1
            ;;
    esac
else
    echo -e "${BLUE}Running all 30 critical tests...${NC}"
    anchor test $VERBOSE_FLAG tests/critical-coverage.ts
fi

# Test completion
if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}============================================================================${NC}"
    echo -e "${GREEN}✅ All tests passed successfully!${NC}"
    echo -e "${GREEN}============================================================================${NC}"
    echo ""
    echo "Test Summary:"
    echo "  • Oracle Edge Cases: 8 tests"
    echo "  • WAA Sell Fee System: 10 tests"
    echo "  • Anti-Sniper Protection: 7 tests"
    echo "  • Concurrent Trading: 5 tests"
    echo "  • Total: 30 tests"
    echo ""
    echo "For detailed results, see: TEST_IMPLEMENTATION_SUMMARY.md"
else
    echo ""
    echo -e "${RED}============================================================================${NC}"
    echo -e "${RED}❌ Some tests failed. Review the output above.${NC}"
    echo -e "${RED}============================================================================${NC}"
    echo ""
    echo "Debugging tips:"
    echo "  1. Check Solana localnet is running: solana-test-validator"
    echo "  2. Verify program deployed: anchor deploy"
    echo "  3. Review logs: solana logs"
    echo "  4. Run with --verbose flag for details"
    exit 1
fi
