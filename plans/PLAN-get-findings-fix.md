# Plan: Fix get_findings -- Deduplicate and Structure Findings by Review

> Status: DRAFT
> Created: 2026-06-28

## Problem

The MCP `get_findings` tool returns findings as a flat list without identifying which review/run produced each finding. When a PR has multiple agent runs, findings from all runs are concatenated -- producing duplicates and making it impossible to attribute findings to specific runs. The API already returns structured data (each `ReviewDto` contains nested `findings[]` with `review_id`), but the MCP tool discards this structure during its response mapping.

## Affected Modules

| Module | Path | Change Type |
|--------|------|-------------|
| mcp: `get-findings` tool | `mcp/src/tools/get-findings.ts` | Modify |
| mcp: server tool registration | `mcp/src/server.ts` | Modify (description + schema) |

## Analysis

### What the API already provides

`GET /pulls/:id/reviews` returns `ReviewDto[]` where each element has:
- `id` (review ID)
- `agent_id`, `run_id`, `agent_name`
- `verdict`, `summary`, `score`, `model`
- `created_at`
- `findings[]` -- each finding already includes `review_id`

Source: `server/src/modules/reviews/helpers.ts` lines 19-33 (`ReviewDto` interface) and lines 56-75 (`reviewToDto` function).

### What the MCP tool currently does (the bug)

In `mcp/src/tools/get-findings.ts` lines 44-63:
1. Maps reviews to `{ verdict, summary, score, agent_id }` -- **drops `id`, `run_id`, `created_at`, `agent_name`, `model`**
2. Flat-maps ALL findings from ALL reviews into a single array -- **drops `review_id` and all review association**
3. Returns `{ reviews, findings }` -- two disconnected arrays with no way to correlate

### Chosen approach: Nested structure (option 3) with latest-run deduplication (option 2)

**Rationale:**
- Option 1 (add `review_id` to findings) keeps a flat list -- forces the consumer to manually group, adds cognitive load
- Option 2 (latest run only) alone loses history, but is useful as a default filter
- Option 3 (nested) preserves the natural structure the API already provides
- Combined: nest findings inside their review objects AND default to showing only the latest run per agent (with an optional `all_runs` parameter to see history)

### Why no backend/API changes are needed

The `ReviewDto` already contains all required fields. The data loss happens exclusively in the MCP tool's response mapping. This is a pure MCP-layer fix.

## Tasks

### TASK-001: Restructure get_findings response and add deduplication

**Scope:** mcp only

**Owned Paths:**
- `mcp/src/tools/get-findings.ts`
- `mcp/src/server.ts`

**Steps:**

1. **`mcp/src/server.ts`** -- Update the `get_findings` tool registration (lines 37-44):
   - Update description to: `"Get the latest review verdict and findings for a pull request, grouped by agent. Each review includes its findings nested inside. By default returns only the latest run per agent."`
   - Add optional `all_runs` parameter: `z.boolean().optional().default(false).describe("If true, return findings from all runs, not just the latest per agent")`
   - Update the args destructuring in the callback to pass `all_runs` through to `getFindings`

2. **`mcp/src/tools/get-findings.ts`** -- Restructure the tool:

   a. Update `ReviewRow` interface to include fields the API already returns but the tool currently ignores:
      - `id: string` (review ID)
      - `run_id: string | null`
      - `agent_name: string | null`
      - `model: string | null`
      - `created_at: string`

   b. Update function signature: `getFindings(client, args: { pr_id: string; all_runs?: boolean })`

   c. After fetching `result.data`, apply deduplication when `all_runs` is false (default):
      - Group reviews by `agent_id`
      - For each group with a non-null `agent_id`, keep only the review with the latest `created_at` (ISO 8601 strings sort lexicographically)
      - Reviews with `agent_id: null` are all kept (cannot group by agent)

   d. Map each surviving review to the nested output structure:
      ```typescript
      {
        review_id: r.id,
        agent_id: r.agent_id,
        agent_name: r.agent_name ?? null,
        run_id: r.run_id ?? null,
        verdict: r.verdict,
        summary: r.summary,
        score: r.score,
        model: r.model ?? null,
        created_at: r.created_at,
        findings: r.findings.map(f => ({
          severity: f.severity,
          category: f.category,
          title: f.title,
          file: f.file,
          start_line: f.start_line,
          rationale: f.rationale,
          suggestion: f.suggestion ?? null,
        }))
      }
      ```

   e. Return shape:
      ```json
      {
        "reviews": [ /* nested review objects as above */ ],
        "total_findings": 5
      }
      ```
      Where `total_findings` is the sum of `review.findings.length` across all returned reviews.

   f. Keep the existing error handling (mcpError for missing PR, no reviews).

**Acceptance Criteria:**
- [ ] AC-001: When a PR has 3 runs from the same agent, `get_findings` (default) returns only 1 review with findings from the latest run
- [ ] AC-002: When `all_runs: true`, all 3 reviews are returned with their respective findings
- [ ] AC-003: Each review object contains its nested findings -- no flat `findings` array at the top level
- [ ] AC-004: Each review object includes `review_id`, `run_id`, `agent_name`, `model`, and `created_at`
- [ ] AC-005: When a PR has runs from 2 different agents, default response returns 2 reviews (latest per agent)
- [ ] AC-006: `cd mcp && pnpm typecheck` passes with no errors

**Verification:**

| AC | How to measure |
|----|----------------|
| AC-001 | Run a review agent 3x on the same PR via DevDigest UI, then call `get_findings` via MCP -- response contains exactly 1 review entry for that agent |
| AC-002 | Call `get_findings` with `all_runs: true` -- response contains all 3 review entries |
| AC-003 | Inspect JSON response -- no top-level `findings` key; findings are nested under each `reviews[n].findings` |
| AC-004 | Each review object in response has non-undefined `review_id`, `run_id`, `created_at`, `model` fields |
| AC-005 | With 2 agents, default call returns exactly 2 review objects |
| AC-006 | `cd mcp && pnpm typecheck` exits 0 |

## Implementation Phases

### Phase 1: MCP Tool Changes (single phase -- no DB/backend/frontend work)

- [ ] `mcp/src/server.ts` -- add `all_runs` parameter to tool registration, update description
- [ ] `mcp/src/tools/get-findings.ts` -- update `ReviewRow` interface, add deduplication logic, restructure response format
- [ ] `cd mcp && pnpm typecheck` -- verify no type errors

### Phase 2: Manual Verification

- [ ] Start dev server with `./scripts/dev.sh`
- [ ] Invoke tool via MCP client with a PR that has multiple runs
- [ ] Verify default (deduplicated) response
- [ ] Verify `all_runs: true` response

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking change for existing MCP consumers that parse the flat `findings` array | This is an internal tool with no external consumers yet (v0.1.0). The new structure is strictly better for LLM consumption. Document the change in commit message. |
| Reviews with `agent_id: null` edge case (legacy or manually triggered reviews) | Keep all such reviews -- they cannot be grouped by agent. Deduplication only applies to reviews that share a non-null `agent_id`. |
| API response shape changes in the future | The `ReviewRow` interface in the MCP tool is manually defined (not imported from shared). Add a code comment noting it mirrors `ReviewDto` from `server/src/modules/reviews/helpers.ts`. |
| `created_at` comparison relies on ISO 8601 string ordering | The server always produces ISO 8601 via `toISOString()` (see `helpers.ts` line 72). ISO 8601 strings with `Z` suffix sort correctly via lexicographic comparison. |

## Out of Scope

- Adding tests to the MCP package (it currently has no test infrastructure)
- Changing the `GET /pulls/:id/reviews` API response format (it already provides all needed data)
- Adding pagination to findings
- Modifying `run_agent_on_pr.ts` (it already correctly scopes to a single run's findings)
- Frontend changes (the web UI has its own review rendering logic)

## Architecture Notes

- No backend changes required. The API (`GET /pulls/:id/reviews`) already returns `ReviewDto[]` with nested findings that include `review_id`. The data loss is entirely in the MCP tool's response mapping.
- The MCP package is standalone (`mcp/`) -- not part of the server module system. It communicates with the API over HTTP. No DI, no container, no shared imports.
- The `ReviewRow` interface in `get-findings.ts` is a local type mirroring `ReviewDto` from `server/src/modules/reviews/helpers.ts`. It must be updated to include `id`, `run_id`, `agent_name`, `model`, `created_at` fields that the API already sends but the MCP tool currently ignores.
- Deduplication is done client-side in the MCP tool (not via a new API endpoint) because this is a presentation concern specific to the MCP use case. The web UI handles this differently (shows all reviews with a timeline).
- The `run_agent_on_pr.ts` tool already does the right thing -- it finds the review matching a specific `run_id` and returns only that review's findings (see lines 120-149). The `get_findings` tool should adopt a similarly scoped approach.
