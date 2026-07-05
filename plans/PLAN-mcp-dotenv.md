# Plan: MCP Server .env.example / .env Support

> Status: DRAFT
> Created: 2026-06-28

## Problem

The MCP server (`mcp/`) reads configuration from `process.env` via Zod in `config.ts`, but there is no `.env` file support. Developers must either rely on `.mcp.json` `env` field (which uses absolute paths and is machine-specific) or manually export variables. Adding `.env.example` (committed) + `.env` (gitignored) with `--env-file` flag gives a standard, self-documenting configuration workflow.

## Design Decision: `.mcp.json` vs `.env`

**Chosen approach: Option A** -- keep `env` field in `.mcp.json` for MCP client usage (Claude Code reads it), use `.env` only for `pnpm start`/`pnpm dev` manual runs.

Rationale:
- `.mcp.json` `env` field is the **only** way to pass env vars when an MCP client (Claude Code) spawns the process -- the client does not support `--env-file` (open feature request #28942).
- `--env-file` with absolute paths in `.mcp.json` `args` would be machine-specific and break for other developers.
- `.env` serves a different use case: manual `pnpm start` / `pnpm dev` runs and MCP Inspector testing.
- No wrapper script needed. Clean separation of concerns.

## Affected Modules

| Module | Path | Change Type |
|--------|------|-------------|
| mcp | `mcp/` | Modify |
| root config | `.gitignore` | Modify |

## Tasks

### TASK-001: Add .env.example and .env support to MCP server

**Scope:** mcp package + root gitignore

**Owned Paths:**
- `mcp/.env.example` (new file)
- `mcp/package.json` (modify scripts)
- `.gitignore` (add entry)

**Steps:**

1. **Create `mcp/.env.example`** (new file, committed):
   ```
   # DevDigest MCP Server Configuration
   # Copy this file to .env and adjust values as needed:
   #   cp .env.example .env

   DEVDIGEST_API_URL=http://localhost:3001
   MCP_POLL_INTERVAL_MS=2000
   MCP_POLL_TIMEOUT_MS=120000
   ```

2. **Update `mcp/package.json`** -- modify `scripts` section:
   - Change `"start"` from `"tsx src/index.ts"` to `"tsx --env-file=.env src/index.ts"`
   - Add `"dev"` script: `"tsx watch --env-file=.env src/index.ts"`
   - Keep `"typecheck"`, `"on"`, `"off"` unchanged.

3. **Verify `.gitignore`** -- the root `.gitignore` already contains `.env` on line 12, which matches `mcp/.env` via glob. No change needed -- `.env` pattern already covers all subdirectories.

4. **Do NOT modify `.mcp.json`** -- keep current `env` field as-is. Claude Code will continue to inject env vars via this field when spawning the MCP server. The `.env` file is only used for manual `pnpm start`/`pnpm dev` runs.

**Acceptance Criteria:**
- [ ] AC-001: `mcp/.env.example` exists and is tracked by git
- [ ] AC-002: `cp mcp/.env.example mcp/.env && cd mcp && pnpm start` starts the server with config from `.env`
- [ ] AC-003: `mcp/.env` is not tracked by git (covered by root `.gitignore` pattern `.env`)
- [ ] AC-004: `.mcp.json` remains unchanged -- Claude Code MCP integration still works
- [ ] AC-005: `cd mcp && pnpm dev` starts the server in watch mode with `.env` loaded

**Verification:**

| AC | How to measure |
|----|----------------|
| AC-001 | `git ls-files mcp/.env.example` returns the file path |
| AC-002 | `cp mcp/.env.example mcp/.env && cd mcp && pnpm start` -- server starts without errors (Ctrl+C to stop) |
| AC-003 | `git check-ignore mcp/.env` returns `mcp/.env` |
| AC-004 | `cd mcp && pnpm on` enables MCP, restart Claude Code session, verify MCP tools are available |
| AC-005 | `cd mcp && pnpm dev` -- server starts in watch mode |

## Implementation Phases

### Phase 1: Files

- [ ] Create `mcp/.env.example` with documented variables and defaults
- [ ] Update `mcp/package.json` scripts (`start`, add `dev`)

### Phase 2: Verification

- [ ] Verify `mcp/.env` is gitignored (root `.gitignore` `.env` pattern)
- [ ] Verify `pnpm start` works with `--env-file=.env`
- [ ] Verify `.mcp.json` still works for Claude Code (no changes needed)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `--env-file` throws if `.env` doesn't exist | Document `cp .env.example .env` step clearly in `.env.example` comments. `pnpm start` is for manual use only -- MCP client uses `.mcp.json` `env` field instead. |
| Node `--env-file` flag not supported by `tsx` | `tsx` passes flags through to Node. Node >= 20.6 supports `--env-file`. Project requires Node >= 22. Confirmed working in tsx docs. |
| `.mcp.json` `env` and `.env` both define same var | `.mcp.json` `env` has higher priority (process env set by parent process overrides `--env-file`). This is correct behavior -- `.mcp.json` is the authoritative source for MCP client usage. |

## Out of Scope

- Modifying `.mcp.json` structure or removing its `env` field
- Adding `dotenv` package dependency
- Adding `.env` validation/check script
- Adding `ENABLE_TOOL_SEARCH` to `.env.example` (this is a feature flag managed via `.mcp.json` only)

## Architecture Notes

- `mcp/src/config.ts` already uses Zod `.default()` for all fields. If `.env` file is missing AND no `env` field in `.mcp.json`, the server will still start with defaults. The `--env-file` flag error only occurs with `pnpm start` (manual use) -- which is expected and intentional (developer should create `.env` first).
- The `config.ts` `readConfig()` function requires no changes -- it already reads from `process.env` which `--env-file` populates.
- `bin` field in `package.json` points to `./src/index.ts` (used by `npx devdigest-mcp`). This path does NOT use `--env-file` -- it relies on the MCP client to inject env vars. This is correct.
