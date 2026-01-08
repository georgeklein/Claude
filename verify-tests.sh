#!/bin/bash

echo "========================================="
echo "Scale AMM v2 - Test Suite Verification"
echo "========================================="
echo ""

# Count tests by file
echo "📊 Test Count by File:"
echo "─────────────────────────────────────────"
for file in tests/*.ts; do
  if [[ "$file" != *"CRITICAL_TESTS_NEEDED"* ]]; then
    filename=$(basename "$file")
    count=$(grep -c "it(" "$file" 2>/dev/null || echo 0)
    printf "%-30s %3d tests\n" "$filename" "$count"
  fi
done
echo "─────────────────────────────────────────"

# Total count
total=$(grep -r "it(" tests/*.ts | grep -v "CRITICAL_TESTS_NEEDED" | wc -l)
echo "TOTAL:                         $total tests"
echo ""

# Count describes
echo "📂 Test Suites by File:"
echo "─────────────────────────────────────────"
for file in tests/*.ts; do
  if [[ "$file" != *"CRITICAL_TESTS_NEEDED"* ]]; then
    filename=$(basename "$file")
    count=$(grep -c "describe(" "$file" 2>/dev/null || echo 0)
    printf "%-30s %3d suites\n" "$filename" "$count"
  fi
done
echo ""

# List all test suites
echo "📋 All Test Suites:"
echo "─────────────────────────────────────────"
grep -h "describe(" tests/*.ts | grep -v "CRITICAL_TESTS_NEEDED" | sed 's/^[ \t]*//' | sed 's/describe(//' | sed 's/, () => {//' | sed 's/"//g' | sed "s/'//g"
echo ""

# Verify new test file
echo "✅ New Test File Verification:"
echo "─────────────────────────────────────────"
if [ -f "tests/edge-cases-final.ts" ]; then
  echo "✓ edge-cases-final.ts exists"
  echo ""
  echo "Categories in edge-cases-final.ts:"
  grep "describe(" tests/edge-cases-final.ts | grep -v "Scale AMM" | sed 's/^[ \t]*/  /' | sed 's/describe(//' | sed 's/, () => {//' | sed 's/"//g'
  echo ""
  test_count=$(grep -c "it(" tests/edge-cases-final.ts)
  echo "  Total tests: $test_count"

  if [ "$test_count" -eq 28 ]; then
    echo "  ✓ Correct number of tests (28)"
  else
    echo "  ⚠ Expected 28 tests, found $test_count"
  fi
else
  echo "✗ edge-cases-final.ts not found"
fi
echo ""

# Check for specific test categories
echo "🎯 Required Test Categories:"
echo "─────────────────────────────────────────"
categories=(
  "Token/Mint Edge Cases"
  "Reserve/Vault Validation"
  "User Position Edge Cases"
  "Slippage Edge Cases"
  "Oracle.*Edge Cases"
)

for category in "${categories[@]}"; do
  if grep -q "$category" tests/edge-cases-final.ts 2>/dev/null; then
    echo "✓ $category"
  else
    echo "✗ $category (not found)"
  fi
done
echo ""

# Summary
echo "📈 Summary:"
echo "─────────────────────────────────────────"
echo "Total Tests:        $total"
echo "Target Tests:       103"
if [ "$total" -ge 103 ]; then
  echo "Status:             ✅ TARGET EXCEEDED"
  echo "Overage:            +$((total - 103)) tests"
else
  echo "Status:             ⚠ BELOW TARGET"
  echo "Remaining:          $((103 - total)) tests"
fi
echo ""

echo "✅ Verification complete!"
