#!/bin/bash
# Scale AMM - Pre-Commit Hook
# Ensures code compiles before allowing commits

echo "🔍 Running pre-commit checks..."

# Check if we're in a Rust project
if [ -f "programs/creator-amm-v2/Cargo.toml" ]; then
    echo "📦 Checking Rust compilation..."
    cd programs/creator-amm-v2

    # Run cargo check
    if cargo check 2>&1 | grep -q "error"; then
        echo "❌ Cargo check failed! Fix errors before committing."
        cargo check
        exit 1
    fi

    echo "✅ Cargo check passed"
    cd ../..
fi

# Check for common security issues
echo "🔒 Checking for security issues..."

# Check for unwrap() calls in production code
unwrap_count=$(grep -r "\.unwrap()" programs/creator-amm-v2/src/ 2>/dev/null | grep -v "test" | wc -l)
if [ "$unwrap_count" -gt 0 ]; then
    echo "⚠️  Warning: Found $unwrap_count .unwrap() calls in production code"
    grep -rn "\.unwrap()" programs/creator-amm-v2/src/ | grep -v "test" | head -5
fi

# Check for panic! calls
panic_count=$(grep -r "panic!" programs/creator-amm-v2/src/ 2>/dev/null | grep -v "test" | wc -l)
if [ "$panic_count" -gt 0 ]; then
    echo "⚠️  Warning: Found $panic_count panic! calls in production code"
    grep -rn "panic!" programs/creator-amm-v2/src/ | grep -v "test" | head -5
fi

echo "✅ Pre-commit checks complete"
exit 0
