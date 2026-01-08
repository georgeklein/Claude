# .claude

**Claude Code configuration and automation**

This directory contains hooks and commands for AI-assisted development with Claude Code.

---

## Structure

### `hooks/`
**Pre-commit hooks** - Run automatically before commits

**`pre-commit.sh`**
- Runs `cargo check` on Solana program
- Prevents broken code from being committed
- Catches compilation errors early
- Exit code 1 = commit blocked, fix errors first

```bash
# Runs automatically on git commit
# Or manually:
.claude/hooks/pre-commit.sh
```

---

### `commands/`
**Slash commands** - Quick AI workflows

**`/test`** (`.claude/commands/test.md`)
- Run test suite and analyze results
- Report pass/fail status
- Identify coverage gaps
- Suggest improvements

**`/security`** (`.claude/commands/security.md`)
- Comprehensive security audit
- Check arithmetic safety (overflows)
- Validate oracle integration
- Review access control
- Verify vault security
- Check emergency controls

**`/optimize`** (`.claude/commands/optimize.md`)
- Analyze compute unit usage
- Identify optimization opportunities
- Suggest CU reduction strategies
- Target: <50k CU per trade

---

## Usage with Claude Code

### Hooks (Automatic)
Hooks run automatically:
```bash
git commit -m "message"
# → pre-commit.sh runs cargo check
# → commit proceeds if successful
```

### Slash Commands (Manual)
Run commands in Claude Code:
```
/test           # Run and analyze test suite
/security       # Security audit
/optimize       # CU optimization analysis
```

---

## Purpose

**Improve development velocity:**
- Catch errors before commit (pre-commit hook)
- Quick security audits (slash command)
- Automated testing workflows (slash command)
- Compute unit optimization (slash command)

**Enable AI pair programming:**
- Claude can run tests and analyze results
- Claude can audit security automatically
- Claude can suggest optimizations
- Claude has project context in `CLAUDE.md`

---

## Configuration

Claude Code reads from `.claude/` directory automatically:
- `hooks/` - Scripts that run on git events
- `commands/` - Custom slash commands
- Parent directory `CLAUDE.md` - Project context for AI

---

## For Contributors

When working with Claude Code:
1. Read `../CLAUDE.md` for project context
2. Use `/test` to verify changes
3. Use `/security` before submitting PRs
4. Pre-commit hook will catch compilation errors
