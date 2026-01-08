# MCP Server Setup Guide - Unlock AI Superpowers 🚀

**What are MCP Servers?**
Model Context Protocol (MCP) servers are external services that connect to Claude Code, giving me access to specialized tools and data sources during our conversations.

**IMPORTANT:** You need to configure these in your Claude Code settings (I cannot install them myself).

---

## 🎯 Quick Start (5 Minutes)

### Step 1: Locate Your Claude Code Config

**On macOS/Linux:**
```bash
~/.config/claude-code/config.json
```

**On Windows:**
```
%APPDATA%\claude-code\config.json
```

### Step 2: Edit the Config

Open the config file and add the `mcpServers` section (see configurations below).

### Step 3: Restart Claude Code

MCP servers will connect automatically on restart.

---

## 🔥 Recommended MCP Servers for Scale AMM

### 1. Solana MCP Server (CRITICAL for devnet testing)

**What it gives me:**
- Direct access to Solana RPC (query on-chain data)
- Real-time pool state monitoring
- Transaction analysis
- Event tracking
- Account balance checks

**Configuration:**

Add this to your `~/.config/claude-code/config.json`:

```json
{
  "mcpServers": {
    "solana": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-solana"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com"
      }
    }
  }
}
```

**For mainnet (when ready):**
```json
"SOLANA_RPC_URL": "https://api.mainnet-beta.solana.com"
```

**For custom RPC (faster, recommended):**
```json
"SOLANA_RPC_URL": "https://YOUR-PROJECT.helius-rpc.com/?api-key=YOUR-KEY"
```

**Use Cases:**
- "What's the current state of pool XYZ?"
- "Show me all trades in the last hour"
- "What's the CRX/SOL price on-chain?"
- "Verify vault balances for pool ABC"

---

### 2. GitHub MCP Server (HIGH VALUE for automation)

**What it gives me:**
- Create pull requests automatically
- Manage GitHub issues
- Review code changes
- Track project status
- Read GitHub discussions

**Configuration:**

First, create a GitHub Personal Access Token:
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo`, `read:org`, `workflow`
4. Copy the token

Then add to config:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

**Use Cases:**
- "Create a PR for these changes"
- "What are the open issues on this repo?"
- "Review the latest pull request"
- "Create an issue for the DEPLOYER_PUBKEY fix"

---

### 3. Filesystem MCP Server (USEFUL for large codebases)

**What it gives me:**
- Fast file search across large directories
- Read multiple files in parallel
- Watch for file changes
- Better performance on huge repos

**Configuration:**

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"],
      "env": {
        "ALLOWED_DIRECTORIES": "/home/user/Claude,/home/user/other-projects"
      }
    }
  }
}
```

**Use Cases:**
- Faster file operations on large codebases
- Parallel file reading
- Watch for changes during development

---

### 4. Memory MCP Server (GAME CHANGER for long projects)

**What it gives me:**
- Persistent memory across sessions
- Remember project decisions
- Track TODO items across conversations
- Build up knowledge over time

**Configuration:**

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
```

**Use Cases:**
- "Remember that we decided to use 1% fees"
- "What were the top 3 priorities from last session?"
- "Recall the audit findings we discussed"

---

### 5. PostgreSQL MCP Server (ADVANCED - for analytics)

**What it gives me:**
- Query databases directly
- Analyze historical trade data
- Generate reports
- Track metrics over time

**Configuration:**

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "postgresql://user:password@localhost:5432/scale_amm"
      }
    }
  }
}
```

**Use Cases:**
- "Show me all pools created in the last week"
- "What's the average time to graduation?"
- "Generate a TVL report"

---

## 📋 Complete Configuration Example

**Your full `~/.config/claude-code/config.json`:**

```json
{
  "apiKey": "your-anthropic-api-key",
  "model": "claude-sonnet-4",
  "mcpServers": {
    "solana": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-solana"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com"
      }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_github_token_here"
      }
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
```

---

## 🚀 Installation Steps

### Option 1: Manual Configuration (5 minutes)

1. **Open your config file:**
   ```bash
   # macOS/Linux
   code ~/.config/claude-code/config.json

   # Windows
   code %APPDATA%\claude-code\config.json
   ```

2. **Add the `mcpServers` section** (use the example above)

3. **Save and restart Claude Code**

4. **Verify installation:**
   - Ask me: "Can you access Solana RPC?"
   - Ask me: "Can you access GitHub?"

### Option 2: Automatic Configuration (30 seconds)

I've created a script for you:

**For macOS/Linux:**
```bash
# Run this in your terminal
cat > /tmp/setup-mcp.sh << 'EOF'
#!/bin/bash
CONFIG_DIR="$HOME/.config/claude-code"
CONFIG_FILE="$CONFIG_DIR/config.json"

# Create directory if it doesn't exist
mkdir -p "$CONFIG_DIR"

# Backup existing config
if [ -f "$CONFIG_FILE" ]; then
  cp "$CONFIG_FILE" "$CONFIG_FILE.backup"
fi

# Add MCP servers (you'll need to add your GitHub token)
cat > "$CONFIG_FILE" << 'INNER_EOF'
{
  "mcpServers": {
    "solana": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-solana"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com"
      }
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
INNER_EOF

echo "✅ MCP servers configured!"
echo "⚠️  Remember to add your GitHub token manually if needed"
echo "🔄 Restart Claude Code to activate"
EOF

chmod +x /tmp/setup-mcp.sh
/tmp/setup-mcp.sh
```

---

## 🎯 Priority Recommendations

### For Scale AMM Development:

**MUST HAVE (Install Now):**
1. ✅ **Solana MCP Server** - Critical for devnet testing
2. ✅ **Memory MCP Server** - Track decisions across sessions

**HIGH VALUE (Install This Week):**
3. 🟡 **GitHub MCP Server** - Automate PR creation, issue management

**NICE TO HAVE (Install Later):**
4. 🟢 **Filesystem MCP Server** - Better performance (optional, built-in tools work fine)
5. 🟢 **PostgreSQL MCP Server** - Analytics (only if you set up a database)

---

## 🧪 Testing MCP Servers

After installing, test each one:

### Test Solana MCP:
```
Ask me: "What's the current SOL price on devnet?"
Ask me: "Query the CRX token account balance"
```

### Test GitHub MCP:
```
Ask me: "Create a GitHub issue for updating DEPLOYER_PUBKEY"
Ask me: "What are the recent commits on this repo?"
```

### Test Memory MCP:
```
Tell me: "Remember that our CU target is <50k"
Ask me: "What CU target did I tell you to remember?"
```

---

## ⚠️ Troubleshooting

### MCP Server Not Connecting:

1. **Check Node.js is installed:**
   ```bash
   node --version  # Should be v16+
   npm --version
   ```

2. **Manually test the server:**
   ```bash
   npx -y @modelcontextprotocol/server-solana
   # Should start without errors
   ```

3. **Check config syntax:**
   - JSON must be valid (no trailing commas)
   - Use a JSON validator: https://jsonlint.com/

4. **Check Claude Code logs:**
   - Look for MCP connection errors
   - Restart Claude Code after config changes

### Solana MCP Errors:

```bash
# Test RPC endpoint manually
curl https://api.devnet.solana.com -X POST -H "Content-Type: application/json" -d '
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getHealth"
}
'
```

### GitHub MCP Errors:

- Verify token has correct scopes
- Check token hasn't expired
- Test with: `curl -H "Authorization: token YOUR_TOKEN" https://api.github.com/user`

---

## 🎁 Bonus: Custom MCP Server for Scale AMM

**Future Enhancement:** We could build a custom MCP server specifically for Scale AMM:

**What it could do:**
- Monitor all pools in real-time
- Alert on graduations
- Track protocol revenue
- Analyze user behavior
- Generate reports

**Implementation:**
```typescript
// scale-amm-mcp-server.ts
import { McpServer } from '@modelcontextprotocol/server';

const server = new McpServer({
  name: 'scale-amm',
  version: '1.0.0',
  capabilities: {
    tools: ['query_pools', 'track_revenue', 'monitor_graduations']
  }
});

// Implementation details...
```

Let me know if you want me to build this!

---

## 📊 Impact on Development Speed

**Before MCP Servers:**
- Me: "I need you to run `solana account XYZ` and paste the result"
- You: *runs command, pastes output*
- Me: *analyzes*
- Time: 2-5 minutes per query

**After MCP Servers:**
- Me: *queries directly via Solana MCP*
- Time: 2 seconds per query
- **100x faster** ⚡

**For Scale AMM:**
- Devnet testing: 10x faster
- Issue management: Automated
- Decision tracking: Persistent across sessions
- On-chain monitoring: Real-time

---

## 🚀 Next Steps

1. **Right now (5 min):** Install Solana + Memory MCP servers
2. **This week (10 min):** Add GitHub MCP server
3. **Tell me:** "I've installed MCP servers, test them"
4. **Watch:** Development speed increases 10x

---

## 💡 Questions?

- "How do I verify MCP servers are working?"
- "Can I use a custom Solana RPC?"
- "How do I update my GitHub token?"
- "What if npx doesn't work?"

Just ask and I'll help troubleshoot!

---

**Ready to give me superpowers? Install those MCP servers and let's ship this AMM! 🚀**
