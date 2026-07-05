# Plan: MCP Server On-Demand Toggle

> Status: DRAFT
> Created: 2026-06-28

## Problem

The DevDigest MCP server (`devdigest`) spawns on every Claude Code session start, consuming resources and tokens even when not needed. Users want a simple command to enable/disable the server without manually editing JSON configuration files. The only reliable mechanism is `disabledMcpjsonServers` in `.claude/settings.json` -- it completely prevents server spawn when listed.

## Solution: Shell Scripts + npm aliases

Two shell scripts (`scripts/mcp-on.sh`, `scripts/mcp-off.sh`) that programmatically edit `.claude/settings.json` to add/remove `"devdigest"` from `disabledMcpjsonServers`. Default state: **disabled** (server does NOT start unless explicitly enabled).

### Why this approach wins over alternatives

| Option | Verdict |
|--------|---------|
| Shell scripts editing `disabledMcpjsonServers` | **CHOSEN** -- reliable, no spawn, no token cost, simple UX |
| Claude Code hooks (PreToolUse) | Cannot prevent server spawn -- hooks run after server is already up |
| `disabled: true` in `.mcp.json` | Buggy/unreliable per research |
| HTTP transport + lazy connect | Requires rewriting MCP server; schema loading bug still present |
| `@` menu toggle | Manual, session-scoped, resets on restart |

## Affected Modules

| Module | Path | Change Type |
|--------|------|-------------|
| scripts | `scripts/mcp-on.sh` | Add |
| scripts | `scripts/mcp-off.sh` | Add |
| config | `.claude/settings.json` | Modify (add default disabled state) |
| mcp | `mcp/package.json` | Modify (add convenience scripts) |

## Tasks

### TASK-001: Create mcp-off.sh script

**Scope:** tooling

**Owned Paths:**
- `scripts/mcp-off.sh`

**What it does:**
1. Read `.claude/settings.json` (path: `<project-root>/.claude/settings.json`)
2. Parse JSON, ensure `disabledMcpjsonServers` array exists
3. Add `"devdigest"` to the array if not already present
4. Write back with proper formatting (2-space indent)
5. Print confirmation message: `MCP server 'devdigest' disabled. Restart Claude Code session to apply.`

**Implementation notes:**
- Use `node -e` one-liner or a small inline Node.js script (available in project -- Node >= 22)
- No external dependencies needed -- `fs` and `JSON.parse/stringify` suffice
- `jq` is an alternative but not guaranteed on all dev machines; Node.js IS guaranteed
- Script must be idempotent (running twice does not duplicate the entry)

**Acceptance Criteria:**
- [ ] AC-001: Running `./scripts/mcp-off.sh` adds `"devdigest"` to `disabledMcpjsonServers` in `.claude/settings.json`
- [ ] AC-002: Running it twice does not create duplicate entries
- [ ] AC-003: Existing settings (env, hooks) are preserved exactly

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001 | `cat .claude/settings.json \| grep devdigest` shows entry in disabledMcpjsonServers |
| AC-002 | Run twice, count occurrences: `grep -c devdigest .claude/settings.json` = 1 |
| AC-003 | `diff` before/after shows only disabledMcpjsonServers change |

---

### TASK-002: Create mcp-on.sh script

**Scope:** tooling

**Owned Paths:**
- `scripts/mcp-on.sh`

**What it does:**
1. Read `.claude/settings.json`
2. Remove `"devdigest"` from `disabledMcpjsonServers` array
3. If array becomes empty, remove the key entirely (clean JSON)
4. Write back with proper formatting
5. Print confirmation: `MCP server 'devdigest' enabled. Restart Claude Code session to apply.`

**Implementation notes:**
- Same Node.js inline approach as TASK-001 for consistency
- Idempotent: running when already enabled is a no-op with a message
- Script must handle the case where `disabledMcpjsonServers` key does not exist

**Acceptance Criteria:**
- [ ] AC-001: Running `./scripts/mcp-on.sh` removes `"devdigest"` from `disabledMcpjsonServers`
- [ ] AC-002: Running when already enabled prints "already enabled" and does not error
- [ ] AC-003: Empty `disabledMcpjsonServers` array is removed from JSON

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001 | `cat .claude/settings.json \| grep disabledMcpjsonServers` shows no devdigest |
| AC-002 | Exit code 0, message printed |
| AC-003 | `cat .claude/settings.json` has no `disabledMcpjsonServers` key when array would be empty |

---

### TASK-003: Set default state to disabled + add npm convenience aliases

**Scope:** config

**Owned Paths:**
- `.claude/settings.json`
- `mcp/package.json`

**What it does:**

1. **`.claude/settings.json`** -- add `disabledMcpjsonServers: ["devdigest"]` so the server is OFF by default for new sessions. This means:
   - First clone: server is disabled (no wasted tokens)
   - User runs `./scripts/mcp-on.sh` when they need MCP tools
   - User runs `./scripts/mcp-off.sh` when done

2. **`mcp/package.json`** -- add scripts for discoverability:
   ```json
   "scripts": {
     "on": "bash ../../scripts/mcp-on.sh",
     "off": "bash ../../scripts/mcp-off.sh"
   }
   ```
   Usage: `cd mcp && pnpm on` / `cd mcp && pnpm off`

**Acceptance Criteria:**
- [ ] AC-001: `.claude/settings.json` contains `disabledMcpjsonServers: ["devdigest"]`
- [ ] AC-002: `cd mcp && pnpm on` enables the server
- [ ] AC-003: `cd mcp && pnpm off` disables the server

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001 | `cat .claude/settings.json \| node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(j.disabledMcpjsonServers);})"` outputs `["devdigest"]` |
| AC-002 | Run `cd mcp && pnpm on`, verify settings.json updated |
| AC-003 | Run `cd mcp && pnpm off`, verify settings.json updated |

## Implementation Phases

### Phase 1: Scripts
- [ ] `scripts/mcp-off.sh` -- disable script (TASK-001)
- [ ] `scripts/mcp-on.sh` -- enable script (TASK-002)
- [ ] `chmod +x scripts/mcp-on.sh scripts/mcp-off.sh`

### Phase 2: Configuration
- [ ] `.claude/settings.json` -- add `disabledMcpjsonServers: ["devdigest"]` (TASK-003)
- [ ] `mcp/package.json` -- add `on`/`off` script aliases (TASK-003)

### Phase 3: Validation
- [ ] Test full cycle: off -> verify no spawn -> on -> verify spawn -> off
- [ ] Verify existing settings (env, hooks) survive both operations

## Script Template

Both scripts follow this pattern (Node.js inline, no deps):

```bash
#!/usr/bin/env bash
set -euo pipefail

SETTINGS_FILE="$(cd "$(dirname "$0")/.." && pwd)/.claude/settings.json"

node -e "
  const fs = require('fs');
  const path = '${SETTINGS_FILE}'.replace(/'/g, '');
  const settings = JSON.parse(fs.readFileSync(path, 'utf-8'));
  
  // ... add or remove 'devdigest' from settings.disabledMcpjsonServers ...
  
  fs.writeFileSync(path, JSON.stringify(settings, null, 2) + '\n');
"
```

Key details:
- `set -euo pipefail` for safety
- Resolves project root relative to script location (portable)
- Uses Node.js (guaranteed available per project prerequisites)
- Preserves all existing JSON keys
- Adds trailing newline for git cleanliness

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Script corrupts settings.json | Read -> parse -> modify -> stringify -> write pattern; JSON.parse will throw on bad input before any write happens |
| User forgets to restart session | Print clear message: "Restart Claude Code session to apply" |
| `disabledMcpjsonServers` key name changes in future Claude Code versions | Key name is a string constant in one place per script; easy to update |
| Settings file does not exist | Script should create `.claude/` dir and minimal settings file if missing |

## Out of Scope

- HTTP/SSE transport migration for the MCP server
- Auto-restart of Claude Code session after toggle
- GUI/TUI for server management
- Conditional auto-enable based on branch or working directory content

## Architecture Notes

- **No code changes to the MCP server itself** -- this is purely a configuration management solution
- **`disabledMcpjsonServers`** is a Claude Code project-level setting (`.claude/settings.json`), NOT a user-level setting (`~/.claude/settings.json`). This means it is committed and shared across the team.
- **Default disabled** is a deliberate choice: MCP tools are a special-purpose feature, not needed in every session. Opt-in is safer than opt-out for token economy.
- The `ENABLE_TOOL_SEARCH=true` setting remains valuable even when the server IS enabled -- it reduces schema loading from ~3-7k tokens to ~600 tokens.
