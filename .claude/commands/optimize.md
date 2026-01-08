Optimize compute unit usage (target: <50k per trade, currently ~100k):

1. **Profile Current Usage:**
   - Analyze buy.rs instruction complexity
   - Analyze sell.rs instruction complexity
   - Identify CU-expensive operations

2. **Optimization Opportunities:**
   - **Account reduction:** Can any accounts be removed or combined?
   - **Computation simplification:** Any redundant calculations?
   - **Inline functions:** Small helpers that should be inlined?
   - **Memory optimization:** Reduce stack usage?
   - **Consolidation:** Merge buy.rs + sell.rs to share logic?

3. **Specific Targets:**
   - Virtual reserve calculations
   - Fee calculations (WAA, base fees)
   - Oracle price conversions
   - Event emission overhead
   - PDA derivations

4. **Provide:**
   - Current estimated CU per operation
   - Specific optimization recommendations with code examples
   - Expected CU savings per optimization
   - Total projected CU after all optimizations

Goal: Reduce from ~100k to <50k CU per trade
