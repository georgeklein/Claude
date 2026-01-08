Perform comprehensive security audit:

1. **Arithmetic Safety:**
   - Search for unchecked arithmetic: `.unwrap()`, `panic!`, direct `+`, `-`, `*`, `/`
   - Verify all math uses `checked_*` or `saturating_*` functions
   - Report violations with file:line references

2. **Oracle Validation:**
   - Check price freshness validation (<60s)
   - Verify confidence interval checks
   - Confirm exponent bounds (-12 to 6)
   - Validate positive price requirement

3. **Access Control:**
   - Verify authority checks on admin functions
   - Confirm signer validations
   - Check PDA derivation constraints

4. **Vault Security:**
   - Verify post-trade balance validation
   - Check for potential vault draining vectors
   - Confirm ATA ownership checks

5. **Input Validation:**
   - Check all `require!()` statements
   - Verify slippage protection
   - Confirm amount > 0 checks

6. **Emergency Controls:**
   - Verify pause mechanism works
   - Check pause checks in buy/sell

Report findings in order of severity: CRITICAL, HIGH, MEDIUM, LOW
