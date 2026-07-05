# Plan: Project Context

> Status: DRAFT
> Created: 2026-07-02
> Spec: specs/SPEC-2026-07-02-project-context.md
> Execution Mode: single-agent (sequential)

## Requirements (VRF)

> Status: Confirmed

| ID | Requirement | Source |
|----|------------|--------|
| R1 | Server recursively globs all `.md` files under `specs/`, `docs/`, `insights/` in the clone and returns `SpecFile[]` with path, size, updated_at, estimated_tokens | SPEC-2026-07-02 AC-1, AC-2 |
| R2 | `POST /repos/:repoId/context/reindex` re-reads clone FS and returns `ContextSummary { files_count, tokens_total, refreshed_at }` | SPEC-2026-07-02 AC-3 |
| R3 | Project Context page shows all found `.md` files with paths and token estimates | SPEC-2026-07-02 AC-4 |
| R4 | Selecting a file shows rendered markdown preview in the center panel | SPEC-2026-07-02 AC-5 |
| R5 | Footer shows `● N documents · X tokens total` on first load; ` · refreshed Xm ago` suffix added only after Reindex in current browser session | SPEC-2026-07-02 AC-21 + Q2 |
| R6 | Agent editor Context tab shows docs with checkboxes, drag handle, type badge (spec/doc/insight), Preview button | SPEC-2026-07-02 AC-6 |
| R7 | Toggling a checkbox saves updated `context_doc_paths` to agent via `PUT /agents/:id` | SPEC-2026-07-02 AC-7 |
| R8 | Drag-and-drop reorders and saves; order determines prompt insertion sequence | SPEC-2026-07-02 AC-8 |
| R9 | Attached docs footer shows total estimated tokens; non-blocking warning badge shown when total > 8k | SPEC-2026-07-02 AC-9 + Q1 |
| R10 | Skill editor has "Project context to use" section with same attach/detach + drag-and-drop | SPEC-2026-07-02 AC-10 |
| R11 | Agent inherits context docs from linked enabled skills; result is deduplicated (agent paths first, then skill paths; first occurrence wins) | SPEC-2026-07-02 AC-11 |
| R12 | Run executor reads files at stored paths, wraps content in `<untrusted>` delimiters, passes assembled `specs` array to `reviewPullRequest` as `## Project context` slot | SPEC-2026-07-02 AC-12 |
| R13 | Prompt insertion order matches user-defined order | SPEC-2026-07-02 AC-13 |
| R14 | Missing files skipped with `runLog.warn()` entry; review continues without error | SPEC-2026-07-02 AC-14 |
| R15 | Every doc in every list view shows `estimated_tokens` value | SPEC-2026-07-02 AC-15 |
| R16 | Spec tokens counted in `stats.tokens_in` (handled by reviewer-core prompt counting) | SPEC-2026-07-02 AC-16 |
| R17 | Completed run trace has `specs_read: string[]` with paths of successfully read files | SPEC-2026-07-02 AC-17 |
| R18 | Completed run trace has `prompt_assembly.specs: string \| null` with full untrusted-wrapped text | SPEC-2026-07-02 AC-18 |
| R19 | Run Trace → Prompt Assembly shows collapsible "Project context — attached specs (untrusted)" block | SPEC-2026-07-02 AC-19 |
| R20 | Run Trace → Configuration shows "Specs read" field listing `specs_read` paths | SPEC-2026-07-02 AC-20 |

## Open Questions & Recommendations

| # | Question | Answer | Type |
|---|----------|--------|------|
| Q1 | Token warning: what threshold, does it block the run? | 8k non-blocking — show badge in Agent Context tab when attached tokens > 8k; run is never blocked | gap |
| Q2 | `refreshed_at` display on first load? | No time on first load (`● N documents · X tokens total`); ` · refreshed Xm ago` added only after Reindex in current session (client-side state) | gap |
| Q3 | Pagination / search / "Used by N agents" badge? | All deferred — not in scope this sprint | gap |
| Q4 | Execution mode? | Single-agent — one implementer executes backend then frontend sequentially | gap |

## Pre-existing Stubs (already in codebase — no new contracts needed)

Research confirmed these are already in place from prior lessons. Do not recreate them.

| Artifact | Location | Status |
|----------|----------|--------|
| `PromptAssembly.specs: z.string().nullish()` | `server/src/vendor/shared/contracts/trace.ts:43` | Exists, always null today |
| `RunTrace.specs_read: z.array(z.string())` | `server/src/vendor/shared/contracts/trace.ts:88` | Exists, always `[]` today |
| `ReviewInput.specs?: string[]` | `reviewer-core/src/review/run.ts` | Exists — passed to assemblePrompt |
| `assemblePrompt()` specs section | `reviewer-core/src/prompt.ts` | Fully implemented — renders `## Project context` |
| `BuildTraceInput.specsRead` | `server/src/platform/trace-builder.ts` | Exists — needs to be passed non-empty array |
| `useContextFiles(repoId)` hook | `client/src/lib/hooks/context-files.ts` | Exists — fetches `GET /repos/:repoId/context` |
| `useReindexContext()` hook | `client/src/lib/hooks/context-files.ts` | Exists — currently returns `IndexStatus`; type changes to `ContextSummary` |

## Affected Modules

| Module | Path | Change Type |
|--------|------|-------------|
| DB schema — agents | `server/src/db/schema/agents.ts` | Modify |
| DB schema — skills | `server/src/db/schema/skills.ts` | Modify |
| DB migration | `server/src/db/migrations/` | Add (via `db:generate`) |
| Shared: platform contracts (server) | `server/src/vendor/shared/contracts/platform.ts` | Modify |
| Shared: knowledge contracts (server) | `server/src/vendor/shared/contracts/knowledge.ts` | Modify |
| Shared: platform contracts (client) | `client/src/vendor/shared/contracts/platform.ts` | Modify |
| Shared: knowledge contracts (client) | `client/src/vendor/shared/contracts/knowledge.ts` | Modify |
| backend: `context` module (new) | `server/src/modules/context/` | Add |
| backend: module registry | `server/src/modules/index.ts` | Modify |
| backend: DI container | `server/src/platform/container.ts` | Modify |
| backend: `agents` routes | `server/src/modules/agents/routes.ts` | Modify |
| backend: `agents` service | `server/src/modules/agents/service.ts` | Modify |
| backend: `agents` repository | `server/src/modules/agents/repository.ts` | Modify |
| backend: `agents` helpers | `server/src/modules/agents/helpers.ts` | Modify |
| backend: `skills` routes | `server/src/modules/skills/routes.ts` | Modify |
| backend: `skills` service | `server/src/modules/skills/service.ts` | Modify |
| backend: `skills` repository | `server/src/modules/skills/repository.ts` | Modify |
| backend: `reviews` run-executor | `server/src/modules/reviews/run-executor.ts` | Modify |
| frontend: context page (new) | `client/src/app/repos/[repoId]/project-context/page.tsx` | Add |
| frontend: context components (new) | `client/src/components/context/` | Add |
| frontend: agent editor | `client/src/app/agents/[id]/_components/AgentEditor/` | Modify |
| frontend: skill editor | `client/src/app/skills/[id]/_components/SkillEditor/` | Modify |
| frontend: run trace | `client/src/app/repos/[repoId]/pulls/[number]/` or trace drawer | Modify |
| frontend: api.ts | `client/src/lib/api.ts` | Modify |
| frontend: hooks | `client/src/lib/hooks/context-files.ts` | Modify |

## Tasks

> Execution mode: **single-agent** — all tasks are sequential.

---

### TASK-001: DB Schema — add `context_doc_paths` to agents and skills

**Scope:** backend

**Owned Paths:**
- `server/src/db/schema/agents.ts`
- `server/src/db/schema/skills.ts`
- `server/src/db/migrations/` (generated — never edit manually)

**Note:** Migrations live at `server/src/db/migrations/` (not `server/drizzle/`). Latest is `0012_superb_blink.sql`.

**Acceptance Criteria:**
- [ ] AC-001: `agents` Drizzle table definition has `contextDocPaths: text('context_doc_paths').array().notNull().default(sql\`ARRAY[]::text[]\`)`
- [ ] AC-002: `skills` Drizzle table definition has same column
- [ ] AC-003: `pnpm db:generate` produces a new `0013_*.sql` migration file
- [ ] AC-004: `pnpm db:migrate` applies cleanly

**Verification:**

| AC | How to measure |
|----|----------------|
| AC-001, AC-002 | Inspect generated migration SQL — both ALTER TABLE statements present |
| AC-003 | New file in `server/src/db/migrations/` after `db:generate` |
| AC-004 | `cd server && pnpm db:migrate` exits 0 |

---

### TASK-002: Shared Contracts — both vendor copies

**Scope:** backend + frontend (shared)

**Owned Paths:**
- `server/src/vendor/shared/contracts/platform.ts`
- `server/src/vendor/shared/contracts/knowledge.ts`
- `client/src/vendor/shared/contracts/platform.ts`
- `client/src/vendor/shared/contracts/knowledge.ts`

**Note:** Both server and client maintain their own copy of `@devdigest/shared`. Changes must be applied to BOTH independently. The files are structurally identical — apply the same edits to both.

**Note:** `PromptAssembly.specs` and `RunTrace.specs_read` already exist in `trace.ts` — do NOT change `trace.ts`.

**Acceptance Criteria:**
- [ ] AC-005: `SpecFile` Zod schema (platform.ts) gains `estimated_tokens: z.number().int().nonnegative().nullish()` — matches the `nullish()` convention used by other optional DTO fields (INSIGHTS.md 2026-06-17)
- [ ] AC-006: New exported `ContextSummary` Zod schema in platform.ts: `z.object({ files_count: z.number().int(), tokens_total: z.number().int(), refreshed_at: z.string() })`
- [ ] AC-007: `Agent` Zod schema (knowledge.ts ~line 194) gains `context_doc_paths: z.array(z.string()).default([])`
- [ ] AC-008: `Skill` Zod schema (knowledge.ts ~line 138) gains `context_doc_paths: z.array(z.string()).default([])`
- [ ] AC-009: All four files updated identically (server vendor + client vendor)
- [ ] AC-010: `cd server && pnpm typecheck` and `cd client && pnpm typecheck` pass

**Verification:**

| AC | How to measure |
|----|----------------|
| AC-005..010 | Both typechecks pass without errors |

---

### TASK-003: Context module (new backend module)

**Scope:** backend

**Owned Paths:**
- `server/src/modules/context/service.ts` (new)
- `server/src/modules/context/routes.ts` (new)
- `server/src/modules/index.ts` (register new plugin)
- `server/src/platform/container.ts` (add `contextService` getter)

**Note:** The endpoints `GET /repos/:repoId/context` and `POST /repos/:repoId/context/reindex` do NOT yet exist anywhere. They must be created in a new `context` module and registered via `server/src/modules/index.ts`.

**Acceptance Criteria:**
- [ ] AC-011: `ContextService` in `service.ts` — constructor receives `Container`; no DB access (pure filesystem)
- [ ] AC-012: `ContextService.listDocs(clonePath: string): Promise<SpecFile[]>` — recursively finds all `.md` files whose path starts with `specs/`, `docs/`, or `insights/` (relative to `clonePath`); returns empty array when `clonePath` is falsy or does not exist on disk
- [ ] AC-013: Each returned `SpecFile` has: `path` (relative), `content` (full text), `size` (bytes from stat), `updated_at` (ISO from stat `mtime`), `estimated_tokens` (`Math.ceil(content.length / 4)`)
- [ ] AC-014: `ContextService.reindex(clonePath: string): Promise<ContextSummary>` — calls `listDocs`, returns `{ files_count: files.length, tokens_total: sum of estimated_tokens, refreshed_at: new Date().toISOString() }`
- [ ] AC-015: `ContextService.readDocsByPaths(clonePath: string, paths: string[], onMissing?: (path: string) => void): Promise<Array<{path: string; content: string}>>` — reads each path via `readFile(join(clonePath, path), 'utf8')`; calls `onMissing` and skips for ENOENT; path traversal guard: skip any path containing `..` (calls `onMissing`)
- [ ] AC-016: `routes.ts` registers `GET /repos/:repoId/context` — calls `container.contextService.listDocs(repo.clonePath ?? '')`, returns `SpecFile[]`; when repo has no `clonePath` returns `[]`
- [ ] AC-017: `routes.ts` registers `POST /repos/:repoId/context/reindex` — calls `container.contextService.reindex(repo.clonePath ?? '')`, returns `ContextSummary`
- [ ] AC-018: Both routes require `params: { repoId: z.string().uuid() }` and call `getContext()` to scope to workspace; throw `NotFoundError` when repo not found in workspace
- [ ] AC-019: `container.contextService` lazy getter added to `platform/container.ts` — `private _contextService?: ContextService`; constructed as `new ContextService(this)` on first access
- [ ] AC-020: New plugin registered in `server/src/modules/index.ts` — follow the exact same pattern as other modules

**Verification:**

| AC | How to measure |
|----|----------------|
| AC-011..015 | Create `server/src/modules/context/service.test.ts` using `node:fs` temp dir fixtures; `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' src/modules/context/` passes |
| AC-016, AC-017 | With server running: `curl http://localhost:3001/repos/:repoId/context` → 200 `SpecFile[]`; `curl -X POST .../reindex` → 200 `ContextSummary` shape |
| AC-018 | `curl .../context` with a repoId not in workspace → 404 |
| AC-019 | `cd server && pnpm typecheck` — no errors |

---

### TASK-004: Extend agents module — `context_doc_paths`

**Scope:** backend

**Owned Paths:**
- `server/src/modules/agents/routes.ts`
- `server/src/modules/agents/service.ts`
- `server/src/modules/agents/repository.ts`
- `server/src/modules/agents/helpers.ts`

**Acceptance Criteria:**
- [ ] AC-021: `UpdateAgentBody` in `routes.ts` gains `context_doc_paths: z.array(z.string()).optional()`
- [ ] AC-022: `UpdateAgentInput` interface in `service.ts` gains `context_doc_paths?: string[]`
- [ ] AC-023: `UpdateAgent` interface in `repository.ts` gains `contextDocPaths?: string[]`
- [ ] AC-024: `AgentsRepository.update()` — maps `patch.contextDocPaths` to Drizzle set; add to the spread if defined (follow existing `...(patch.repoIntel !== undefined ? { repoIntel: ... } : {})` pattern)
- [ ] AC-025: `toAgentDto()` in `helpers.ts` maps `row.contextDocPaths` → `context_doc_paths` in the returned `Agent` DTO; defaults to `[]` when null
- [ ] AC-026: `isConfigChange()` in `helpers.ts` — changing `contextDocPaths` DOES bump version (it changes agent behaviour); add to the comparison
- [ ] AC-027: `GET /agents/:id` response includes `context_doc_paths: string[]`
- [ ] AC-028: `PUT /agents/:id { context_doc_paths: ["specs/foo.md"] }` → saved and round-trips on GET
- [ ] AC-029: `agentsRepo.linkedSkills()` returns `LinkedSkillRow[]` where each `skill` object includes `contextDocPaths` — verify the Drizzle query uses `t.skills` which will auto-include new column after migration; no query change needed if `select({ skill: t.skills, ... })` is used

**Verification:**

| AC | How to measure |
|----|----------------|
| AC-021..029 | `curl -X PUT /agents/:id -d '{"context_doc_paths":["specs/a.md"]}' && curl /agents/:id` → round-trip; `cd server && pnpm typecheck` — passes |

---

### TASK-005: Extend skills module — `context_doc_paths`

**Scope:** backend

**Owned Paths:**
- `server/src/modules/skills/routes.ts`
- `server/src/modules/skills/service.ts`
- `server/src/modules/skills/repository.ts`

**Acceptance Criteria:**
- [ ] AC-030: `UpdateSkillBody` in `routes.ts` gains `context_doc_paths: z.array(z.string()).optional()`
- [ ] AC-031: Service and repository updated to persist and return `context_doc_paths` (same pattern as agents — TASK-004)
- [ ] AC-032: `GET /skills/:id` response includes `context_doc_paths: string[]`
- [ ] AC-033: `PUT /skills/:id { context_doc_paths: [...] }` round-trips correctly

**Note:** Skills versioning in `SkillsRepository.update()` only bumps on `body` changes (INSIGHTS 2026-06-21) — changing `context_doc_paths` should NOT bump version (it is metadata, not body).

**Verification:**

| AC | How to measure |
|----|----------------|
| AC-030..033 | `curl -X PUT /skills/:id -d '{"context_doc_paths":["docs/arch.md"]}' && curl /skills/:id` — round-trip; `cd server && pnpm typecheck` passes |

---

### TASK-006: Run executor — specs injection + trace population

**Scope:** backend

**Owned Paths:**
- `server/src/modules/reviews/run-executor.ts`

**Context:** `reviewPullRequest` already accepts `specs?: string[]` and `assemblePrompt` already handles the `## Project context` slot. The trace fields `specs_read` and `prompt_assembly.specs` are already in the schema. The run-executor already uses `trace-builder.ts`'s `buildRunTrace()` which accepts `specsRead: string[]`. All three stubs just need to be populated.

Key lines to fill:
- Line ~340: `reviewPullRequest({ ..., specs? })` call — add `specs` when non-empty
- Line ~444: `specs_read: []` hardcoded — pass actual `specsRead` array
- `traceFromBuffer()` at line ~623: `specs: null` — pass `assembly.specs` from outcome (only reachable if there is an outcome; for error paths the stub null is acceptable)

**Acceptance Criteria:**
- [ ] AC-034: After fetching `linkedSkills`, derive `allContextPaths` = deduplicated merge of `agent.contextDocPaths ?? []` + all `s.skill.contextDocPaths ?? []` from enabled linked skills; agent paths first; use insertion-order Set
- [ ] AC-035: Validate each path: skip (call `runLog.warn(\`Skipping context doc — invalid path: \${path}\`)`) for any path containing `..`
- [ ] AC-036: Call `container.contextService.readDocsByPaths(repo.clonePath ?? '', validPaths, (p) => runLog.warn(\`Context doc not found at \${p} — skipping\`))` to get `{ path, content }[]`
- [ ] AC-037: Each read doc assembled as one untrusted block: `` `<untrusted source="spec:${doc.path}">\n${doc.content.replaceAll("</untrusted>", "<\\/untrusted>")}\n</untrusted>` `` — this matches the existing skill wrapping pattern in run-executor.ts:326
- [ ] AC-038: `specContents: string[]` = array of individual untrusted blocks (one per doc, in order)
- [ ] AC-039: `reviewPullRequest({ ..., ...(specContents.length > 0 ? { specs: specContents } : {}) })` — pass when non-empty
- [ ] AC-040: `specsRead` = array of successfully read paths (from `readDocsByPaths` return)
- [ ] AC-041: `trace.specs_read = specsRead` (replacing the hardcoded `[]` at line ~444)
- [ ] AC-042: `trace.prompt_assembly = outcome.assembly` (already the case); `outcome.assembly.specs` is automatically non-null when `specs` were passed — no extra assignment needed

**Verification:**

| AC | How to measure |
|----|----------------|
| AC-034..042 | `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' src/modules/reviews/` — unit tests pass (mock `contextService` via `ContainerOverrides`) |
| AC-041 | `GET /runs/:id` on a completed run with attached docs → `trace.specs_read` is non-empty |
| AC-042 | Same run → `trace.prompt_assembly.specs` is non-null |

---

### TASK-007: Frontend — API additions

**Scope:** frontend

**Owned Paths:**
- `client/src/lib/api.ts`
- `client/src/lib/hooks/context-files.ts`

**Note:** `useContextFiles(repoId)` and `useReindexContext()` hooks already exist in `context-files.ts`. The `useReindexContext` hook currently types its return as `IndexStatus` — this must change to `ContextSummary`. Verify whether `fetchContextFiles` already exists in `api.ts` or only in the hook file.

**Acceptance Criteria:**
- [ ] AC-043: `api.ts` has (or gains) `fetchContextFiles(repoId: string): Promise<SpecFile[]>` — `api.get(\`/repos/\${repoId}/context\`)`
- [ ] AC-044: `api.ts` has (or gains) `reindexContext(repoId: string): Promise<ContextSummary>` — `api.post(\`/repos/\${repoId}/context/reindex\`)` (no body per `apiFetch` pattern for bodyless POSTs)
- [ ] AC-045: `api.ts` gains `updateAgentContextPaths(id: string, paths: string[]): Promise<Agent>` — `api.put(\`/agents/\${id}\`, { context_doc_paths: paths })`
- [ ] AC-046: `api.ts` gains `updateSkillContextPaths(id: string, paths: string[]): Promise<Skill>` — analogous
- [ ] AC-047: `useReindexContext()` in `context-files.ts` returns `ContextSummary` (not `IndexStatus`) — update type annotation and `queryFn` return type
- [ ] AC-048: `SpecFile`, `ContextSummary`, `Agent`, `Skill` imported from `@devdigest/shared` — not redefined locally
- [ ] AC-049: `cd client && pnpm typecheck` passes

**Verification:**

| AC | How to measure |
|----|----------------|
| AC-043..049 | `cd client && pnpm typecheck` — zero errors |

---

### TASK-008: Frontend — Project Context page

**Scope:** frontend

**Owned Paths:**
- `client/src/app/repos/[repoId]/project-context/page.tsx` (new)
- `client/src/components/context/ContextDocList.tsx` (new)
- `client/src/components/context/ContextDocPreview.tsx` (new)
- `client/src/components/context/ContextStatusFooter.tsx` (new)

**Note:** The existing route segment is `repos/[repoId]/pulls/` — so `repos/[repoId]/` is already established. Add `project-context/` inside it. Verify the exact `[repoId]` spelling from existing folder names before creating.

**Note on markdown renderer:** Check `client/package.json` for an existing markdown renderer (`react-markdown`, `remark`, `marked`). Use whichever is already installed. Do not add a new dependency.

**Acceptance Criteria:**
- [ ] AC-050: Page calls `useContextFiles(repoId)` from existing hook; renders `ContextDocList` with each file's `path` and `estimated_tokens`
- [ ] AC-051: Clicking a doc row sets it as active; `ContextDocPreview` renders `file.content` as markdown (content is in the `SpecFile` object from the list response)
- [ ] AC-052: `ContextStatusFooter` always shows `● {count} documents · {total} tokens total`
- [ ] AC-053: Footer appends ` · refreshed {N}m ago` only when local state `refreshedAt: Date | null` is non-null; `N` = minutes since `refreshedAt`
- [ ] AC-054: "Reindex" button calls `useReindexContext()` mutation; on success, `setRefreshedAt(new Date(data.refreshed_at))`
- [ ] AC-055: Empty state renders "No documents found" when list is empty
- [ ] AC-056: All strings via `useTranslations()`; no hardcoded English in JSX
- [ ] AC-057: `cd client && pnpm test` component tests pass

**Verification:**

| AC | How to measure |
|----|----------------|
| AC-050..057 | `cd client && pnpm test` — new tests pass; `cd client && pnpm typecheck` — no errors |

---

### TASK-009: Frontend — Agent Context tab

**Scope:** frontend

**Owned Paths:**
- `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`
- `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`
- `client/src/components/context/ContextDocAttachList.tsx` (new — reusable for agent + skill)

**Note:** Inspect `constants.ts` to find the TABS array; follow the same `{ key, labelKey, icon }` shape. Inspect `AgentEditor.tsx` to see how existing tabs render their content pane.

**Note on drag-and-drop:** Check `client/package.json` for an existing DnD library (`@dnd-kit/core`, `react-dnd`, etc.). Use it if present. If none, use HTML5 `draggable` attribute — do not install a new dependency.

**Acceptance Criteria:**
- [ ] AC-058: `constants.ts` — new entry `{ key: "context", labelKey: "editor.tabs.context", icon: "..." }` added to TABS (use an icon already in the project)
- [ ] AC-059: `AgentEditor.tsx` — renders `<ContextTab agentId={agent.id} repoId={activeRepoId} />` when `tab === "context"` (get `activeRepoId` from existing workspace/repo context; search for how `SkillsTab` gets repo-scoped data for reference)
- [ ] AC-060: `ContextDocAttachList` is a Client Component (`"use client"` directive); receives `allDocs: SpecFile[]`, `attachedPaths: string[]`, `onUpdate(newPaths: string[]): void` as props
- [ ] AC-061: Each doc row: checkbox (checked when path is in `attachedPaths`), path text, type badge (first path segment: `specs/` → "spec", `docs/` → "doc", `insights/` → "insight"), `estimated_tokens` count, Preview button
- [ ] AC-062: Toggle checkbox → calls `onUpdate()` with new ordered list (add to end when checked, remove when unchecked)
- [ ] AC-063: Drag handle on each attached doc; drag-and-drop reorders; on drop calls `onUpdate()` with new order
- [ ] AC-064: Footer shows `~ {sum} tokens` where sum is `estimated_tokens` of currently attached docs
- [ ] AC-065: When `sum > 8000`, show a visible badge/warning (amber text or icon) — non-blocking, no UI state changes
- [ ] AC-066: `ContextTab` component calls `updateAgentContextPaths(agentId, newPaths)` inside `onUpdate` handler; uses `useMutation` pattern consistent with existing editor mutations
- [ ] AC-067: All strings via `useTranslations()`

**Verification:**

| AC | How to measure |
|----|----------------|
| AC-058..067 | `cd client && pnpm typecheck` — zero errors; `cd client && pnpm test` passes |

---

### TASK-010: Frontend — Skill Context section

**Scope:** frontend

**Owned Paths:**
- `client/src/app/skills/[id]/_components/SkillEditor/SkillEditor.tsx` (add section)
- Reuses `client/src/components/context/ContextDocAttachList.tsx` from TASK-009

**Note:** Before editing, read `SkillEditor.tsx` fully to see its existing section structure (Config, Preview, Stats, Versions tabs).

**Acceptance Criteria:**
- [ ] AC-068: Skill editor has a "Project context to use" section (add as new tab or collapsible section — follow the existing pattern in SkillEditor)
- [ ] AC-069: Section renders `<ContextDocAttachList>` with `skill.context_doc_paths` as `attachedPaths`
- [ ] AC-070: `onUpdate` calls `updateSkillContextPaths(skillId, newPaths)` via `useMutation`
- [ ] AC-071: All strings via `useTranslations()`

**Verification:**

| AC | How to measure |
|----|----------------|
| AC-068..071 | `cd client && pnpm typecheck` — zero errors |

---

### TASK-011: Frontend — Run Trace

**Scope:** frontend

**Owned Paths:**
- The Run Trace component in `client/src/app/repos/[repoId]/pulls/[number]/` or its drawer component (locate by grepping for `prompt_assembly` in `client/src/`)

**Acceptance Criteria:**
- [ ] AC-072: Run Trace → Prompt Assembly section shows "Project context — attached specs (untrusted)" block when `trace.prompt_assembly.specs` is non-null and non-empty
- [ ] AC-073: Block is collapsible (collapsed by default); expanded state shows the full text of `prompt_assembly.specs`
- [ ] AC-074: Block hidden when `prompt_assembly.specs` is null
- [ ] AC-075: Run Trace → Configuration section shows "Specs read" field listing paths from `trace.specs_read`
- [ ] AC-076: "Specs read" field hidden when `trace.specs_read` is empty
- [ ] AC-077: All strings via `useTranslations()`

**Verification:**

| AC | How to measure |
|----|----------------|
| AC-072..077 | `cd client && pnpm typecheck` — zero errors; render with fixture trace data → specs block visible/hidden correctly |

---

## Implementation Phases

> Execution mode: **single-agent** — sequential

### Phase 1: DB / Schema

- [ ] Modify `server/src/db/schema/agents.ts` — add `contextDocPaths` column (TASK-001)
- [ ] Modify `server/src/db/schema/skills.ts` — add `contextDocPaths` column (TASK-001)
- [ ] `cd server && pnpm db:generate`
- [ ] `cd server && pnpm db:migrate`

### Phase 2: Shared Contracts (both vendor copies)

- [ ] Modify `server/src/vendor/shared/contracts/platform.ts` — add `estimated_tokens` to SpecFile, add `ContextSummary` (TASK-002)
- [ ] Modify `server/src/vendor/shared/contracts/knowledge.ts` — add `context_doc_paths` to Agent and Skill schemas (TASK-002)
- [ ] Mirror same changes to `client/src/vendor/shared/contracts/platform.ts` and `knowledge.ts` (TASK-002)
- [ ] `cd server && pnpm typecheck` — must pass

### Phase 3: Context Module (backend)

- [ ] Create `server/src/modules/context/service.ts` — `ContextService` (TASK-003)
- [ ] Create `server/src/modules/context/routes.ts` — GET /context + POST /reindex (TASK-003)
- [ ] Register in `server/src/modules/index.ts` (TASK-003)
- [ ] Add `contextService` getter to `server/src/platform/container.ts` (TASK-003)
- [ ] Write `server/src/modules/context/service.test.ts`
- [ ] `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' src/modules/context/`

### Phase 4: Agents + Skills Extension (backend)

- [ ] Modify agents module: routes.ts, service.ts, repository.ts, helpers.ts (TASK-004)
- [ ] Modify skills module: routes.ts, service.ts, repository.ts (TASK-005)
- [ ] `cd server && pnpm typecheck` — must pass

### Phase 5: Run Executor (backend)

- [ ] Modify `server/src/modules/reviews/run-executor.ts` — inject specs, populate `specs_read` (TASK-006)
- [ ] `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' src/modules/reviews/`
- [ ] `cd server && pnpm typecheck` — final backend typecheck

### Phase 6: Frontend

- [ ] Update `client/src/lib/api.ts` and `context-files.ts` (TASK-007)
- [ ] Create Project Context page + components (TASK-008)
- [ ] Create `ContextDocAttachList`; add Agent Context tab (TASK-009)
- [ ] Add Skill Context section (TASK-010)
- [ ] Update Run Trace component (TASK-011)
- [ ] `cd client && pnpm typecheck` — must pass
- [ ] `cd client && pnpm test` — must pass

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `context-files.ts` hooks may already import `IndexStatus` — changing return type breaks existing callers | Search for all usages of `useReindexContext` before changing; verify no other component depends on the old return type |
| `ContextDocAttachList` needs `"use client"` — importing it in an RSC page without a boundary causes a hydration error | Ensure the component file has `"use client"` at the top; the page itself can be RSC as long as it renders the client component in a leaf position |
| `agentsRepo.linkedSkills()` uses `select({ skill: t.skills, ... })` — Drizzle `$inferSelect` auto-includes new columns after migration, so no query change is needed | Verify this assumption by reading the actual query; if the SELECT enumerates columns explicitly, add `contextDocPaths` |
| Both vendor copies of shared contracts must stay in sync | Apply edits to server vendor first, then mirror to client vendor in the same commit |
| Path traversal: `context_doc_paths` stored via user UI could contain `../etc/passwd`-style paths | Validate with `path.includes('..')` check in BOTH `ContextService.readDocsByPaths` (primary guard) and run-executor (secondary guard) |
| The active repo context for the Agent Context tab (`repoId` needed to fetch docs) may not be readily available in AgentEditor | Find how `SkillsTab` gets repo-scoped data; the workspace context likely provides an active repo; read `client/src/lib/contexts/` before implementing |
| Glob implementation: `node:fs` has no built-in glob in Node 22 LTS | Check if `glob` npm package is in `server/package.json`; if not, implement recursive readdir manually (simple: 3 top-level dirs, any depth below) |

## Out of Scope

- Auto-selection of documents for a specific PR (flash-selector)
- Vector search or semantic ranking of documents
- Editing `.md` files via UI (read-only preview only)
- Creating new `.md` files via UI
- Pagination or search on the document list
- "Used by N agents" badge on documents
- Blocking review run when token budget exceeded (Q1 decision: non-blocking badge only)
- A separate `GET /repos/:repoId/context/:path` endpoint — content comes from the list response

## Architecture Notes

### What is already done (do not re-implement)

The following are confirmed to exist and must not be recreated:
1. `PromptAssembly.specs` field in `trace.ts` — pre-stubbed
2. `RunTrace.specs_read` field in `trace.ts` — pre-stubbed
3. `ReviewInput.specs?: string[]` in reviewer-core — pre-implemented
4. `assemblePrompt()` specs rendering in `reviewer-core/src/prompt.ts` — pre-implemented; wraps each element of `specs[]` with `wrapUntrusted()` and renders `## Project context` section
5. `BuildTraceInput.specsRead` in `trace-builder.ts` — pre-implemented
6. `useContextFiles(repoId)` and `useReindexContext()` in `client/src/lib/hooks/context-files.ts` — pre-stubbed

### reviewer-core `specs` parameter shape

`ReviewInput.specs` is `string[]` — an **array of pre-escaped blocks**, one per document. The run-executor wraps each doc individually in `<untrusted>` delimiters before adding to the array. `assemblePrompt` joins them and renders the section.

This is NOT a single concatenated string — pass an array, not a joined string.

### ContextService — placement

`ContextService` is a pure filesystem service (no DB). It lives in `server/src/modules/context/service.ts` and is accessible via `container.contextService`. The run-executor uses it via `this.container.contextService.readDocsByPaths(...)`.

### Token counting

Always server-side: `Math.ceil(content.length / 4)`. No LLM tokenizer. The client renders `estimated_tokens` from the server response — never computes it independently.

### `refreshed_at` session behavior (Q2 answer)

```tsx
const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
// onSuccess of reindex mutation:
setRefreshedAt(new Date(data.refreshed_at));
// footer render:
const minutesAgo = refreshedAt ? Math.floor((Date.now() - refreshedAt.getTime()) / 60000) : null;
```

State is intentionally ephemeral — lost on navigation (per Q2).

### 8k token badge (Q1 answer)

```tsx
const attachedSum = allDocs
  .filter(d => attachedPaths.includes(d.path))
  .reduce((n, d) => n + (d.estimated_tokens ?? 0), 0);
const TOKEN_WARNING_THRESHOLD = 8000;
```

Badge is a UI-only constant. No backend enforcement. Does not disable save or run.

### Deduplication logic (AC-11)

```ts
const allPaths = [
  ...(agent.contextDocPaths ?? []),
  ...linkedSkills
    .filter(s => s.skill.enabled)
    .flatMap(s => s.skill.contextDocPaths ?? []),
];
const dedupedPaths = [...new Set(allPaths)]; // insertion-order, agent first
```
