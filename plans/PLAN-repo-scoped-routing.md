# Plan: Repo-Scoped Routing for Agents, Skills, and Conventions

> Status: DRAFT
> Created: 2026-07-03
> Spec: (no spec file — requirements confirmed via user-provided background research)
> Execution Mode: multi-agent (TASK-001 backend runs first through Phase 1+2; TASK-002 frontend runs in Phase 3; Phase 4 tests run after both)

## Requirements (VRF)
> Status: Confirmed (requirements provided directly by user; no gaps to resolve)

| ID | Requirement | Source |
|----|------------|--------|
| R1 | Add `repo_id` (uuid, NOT NULL, FK → repos.id, CASCADE DELETE) to `agents` table via two-step migration: nullable first, backfill via seed, then NOT NULL | Background |
| R2 | Add `repo_id` (uuid, NOT NULL, FK → repos.id, CASCADE DELETE) to `skills` table via same two-step migration | Background |
| R3 | All agents API endpoints move from `/agents/*` to `/repos/:repoId/agents/*`; sub-resources `/:agentId/skills` and `/:agentId/models` preserved under the new prefix | Background |
| R4 | All skills API endpoints move from `/skills/*` to `/repos/:repoId/skills/*`; sub-resources `/import`, `/import-url`, `/:skillId/stats`, `/:skillId/versions`, `/:skillId/restore` preserved and ordered correctly | Background |
| R5 | AgentsRepository: all queries replace `workspaceId` filter with `repoId` filter; `skillCountsForWorkspace(workspaceId)` renamed to `skillCountsForRepo(repoId)`; `InsertAgent` gains `repoId: string` | Background |
| R6 | SkillsRepository: all queries replace `workspaceId` filter with `repoId` filter; `InsertSkill` gains `repoId: string` | Background |
| R7 | AgentsService and SkillsService: all public methods replace `workspaceId` param with `repoId`; callers of `listEnabled(workspaceId)` (e.g., reviews module) must be identified and updated | Background |
| R8 | `Agent` Zod schema in `knowledge.ts` gains `repo_id: z.string().uuid()`; `Skill` Zod schema gains same field | Background |
| R9 | `toAgentDto` in `server/src/modules/agents/helpers.ts` maps `row.repoId` → `repo_id` in the returned DTO | Background |
| R10 | `client/src/vendor/ui/nav.ts` hrefs for `agents`, `skills`, and `conventions` items updated to `/repos/:repoId/agents`, `/repos/:repoId/skills`, `/repos/:repoId/conventions` | Background |
| R11 | Client agents pages restructured: `client/src/app/agents/` → `client/src/app/repos/[repoId]/agents/`; editor route segment renamed from `[id]` to `[agentId]` | Background |
| R12 | Client skills pages restructured: `client/src/app/skills/` → `client/src/app/repos/[repoId]/skills/`; editor route segment renamed from `[id]` to `[skillId]` | Background |
| R13 | Conventions page restructured: `client/src/app/conventions/` → `client/src/app/repos/[repoId]/conventions/` | Background |
| R14 | TanStack Query hooks `useAgents`, `useAgent`, `useCreateAgent`, `useUpdateAgent`, `useDeleteAgent`, `useSkills`, `useSkill`, and all variants accept `repoId` and pass it in API paths; query keys include `repoId` | Background |
| R15 | `updateAgentContextPaths` and `updateSkillContextPaths` in `client/src/lib/api.ts` accept `repoId` and call `/repos/${repoId}/agents/${id}` and `/repos/${repoId}/skills/${id}` | Background |
| R16 | `ContextTab.tsx` removes dependency on `useActiveRepo()`; reads `repoId` from `useParams<{ repoId: string }>()` directly | Background |
| R17 | `server/src/db/seed.ts` updated: demo agents and skills receive `repoId` pointing to the demo `acme/payments-api` repo row | Background |
| R18 | `pnpm typecheck` passes in `server/` and `client/` after all changes | Background |

## Open Questions & Recommendations

| # | Question | Answer | Type |
|---|----------|--------|------|
| Q1 | Does the reviews module call `AgentsService.listEnabled(workspaceId)` and pass `workspaceId` as the scope? | **Confirmed YES** — `reviews/service.ts:58` calls `this.agents.listEnabled(workspaceId)` and `this.agents.getById(workspaceId, agentId)` in `resolveTargets()`. PRs always carry `repo_id` so `repoId` is available at the call site. **Not a blocker.** `reviews/service.ts` added to TASK-001 owned paths. | risk ✅ resolved |
| Q2 | Should old `/agents` and `/skills` routes be kept for backwards compatibility? | No. This is an internal refactor with the UI as the only consumer. Remove old routes entirely. | gap |

## Affected Modules

| Module | Path | Change Type |
|--------|------|-------------|
| DB schema: agents | `server/src/db/schema/agents.ts` | Modify |
| DB schema: skills | `server/src/db/schema/skills.ts` | Modify |
| Shared contracts | `server/src/vendor/shared/contracts/knowledge.ts` | Modify |
| backend: agents | `server/src/modules/agents/` | Modify |
| backend: skills | `server/src/modules/skills/` | Modify |
| backend: seed | `server/src/db/seed.ts` | Modify |
| frontend: nav | `client/src/vendor/ui/nav.ts` | Modify |
| frontend: api layer | `client/src/lib/api.ts` | Modify |
| frontend: agents hooks | `client/src/lib/hooks/agents.ts` | Modify |
| frontend: skills hooks | `client/src/lib/hooks/skills.ts` | Modify |
| frontend: agents pages | `client/src/app/agents/` | Move + Modify |
| frontend: skills pages | `client/src/app/skills/` | Move + Modify |
| frontend: conventions pages | `client/src/app/conventions/` | Move + Modify |
| frontend: new agents pages | `client/src/app/repos/[repoId]/agents/` | Add |
| frontend: new skills pages | `client/src/app/repos/[repoId]/skills/` | Add |
| frontend: new conventions pages | `client/src/app/repos/[repoId]/conventions/` | Add |

---

## Tasks

### TASK-001: Backend — Repo-scoped DB schema and API routes

**Scope:** backend

**Owned Paths:**
- `server/src/db/schema/agents.ts`
- `server/src/db/schema/skills.ts`
- `server/src/vendor/shared/contracts/knowledge.ts`
- `server/src/modules/agents/helpers.ts`
- `server/src/modules/agents/repository.ts`
- `server/src/modules/agents/service.ts`
- `server/src/modules/agents/routes.ts`
- `server/src/modules/skills/repository.ts`
- `server/src/modules/skills/service.ts`
- `server/src/modules/skills/routes.ts`
- `server/src/modules/reviews/service.ts`
- `server/src/db/seed.ts`

**Acceptance Criteria:**
- [ ] AC-001: `GET /repos/:repoId/agents` returns 200 `Agent[]` filtered to that repo; agents from a different repo are absent
- [ ] AC-002: `POST /repos/:repoId/agents` creates an agent with `repo_id` set to `:repoId`; returns 201 with the new `Agent` (including `repo_id`)
- [ ] AC-003: `GET /repos/:repoId/agents/:agentId` returns 404 when `:agentId` does not belong to `:repoId`
- [ ] AC-004: `PUT /repos/:repoId/agents/:agentId` updates the agent; returns updated `Agent`
- [ ] AC-005: `DELETE /repos/:repoId/agents/:agentId` removes agent; returns `{ ok: true }`
- [ ] AC-006: `GET /repos/:repoId/agents/:agentId/skills` returns the linked `AgentSkillLink[]` for that agent
- [ ] AC-007: `POST /repos/:repoId/agents/:agentId/skills` sets/reorders skill links; returns updated `AgentSkillLink[]`
- [ ] AC-008: `GET /repos/:repoId/agents/:agentId/models` returns `ModelInfo[]` for the agent's provider
- [ ] AC-009: All `/repos/:repoId/skills/*` endpoints mirror the agents pattern above (R4); sub-resource ordering preserved (import before `:skillId`)
- [ ] AC-010: `Agent` Zod schema includes `repo_id: z.string().uuid()`; `Skill` Zod schema includes `repo_id: z.string().uuid()`; `tsc --noEmit` passes
- [ ] AC-011: `pnpm exec vitest run --exclude '**/*.it.test.ts'` in `server/` passes with no new failures
- [ ] AC-012: `pnpm typecheck` passes in `server/`
- [ ] AC-013: `pnpm db:seed` completes without errors; demo agents and skills rows in the DB have `repo_id` set (not NULL)

**Verification:**

| AC | How to measure |
|----|----------------|
| AC-001 | `curl -s localhost:3001/repos/<repoId>/agents` → 200, JSON array |
| AC-002 | `curl -s -X POST localhost:3001/repos/<repoId>/agents -H "content-type: application/json" -d '{"name":"T","provider":"openai","model":"gpt-4o","system_prompt":"x"}'` → 201, body contains `repo_id` |
| AC-003 | `curl -s localhost:3001/repos/<wrongRepoId>/agents/<agentId>` → 404 |
| AC-009 | `curl -s localhost:3001/repos/<repoId>/skills` → 200, JSON array |
| AC-010 | `cd server && pnpm typecheck` → 0 errors |
| AC-011 | `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` → 0 failures |
| AC-013 | `cd server && pnpm db:seed` → exits 0; `SELECT repo_id FROM agents WHERE repo_id IS NULL` → 0 rows |

---

### TASK-002: Frontend — Route restructuring and repo-scoped hooks

**Scope:** frontend

**Owned Paths:**
- `client/src/vendor/ui/nav.ts`
- `client/src/lib/api.ts`
- `client/src/lib/hooks/agents.ts`
- `client/src/lib/hooks/skills.ts`
- `client/src/app/agents/` (source — all contents moved out; directory deleted after move)
- `client/src/app/skills/` (source — all contents moved out; directory deleted after move)
- `client/src/app/conventions/` (source — all contents moved out; directory deleted after move)
- `client/src/app/repos/[repoId]/agents/` (destination — new directory tree)
- `client/src/app/repos/[repoId]/skills/` (destination — new directory tree)
- `client/src/app/repos/[repoId]/conventions/` (destination — new directory tree)
- `client/src/components/app-shell/helpers.ts`
- `client/src/lib/hooks/context-files.ts`

**Acceptance Criteria:**
- [ ] AC-020: `nav.ts` — `agents` item `href` is `/repos/:repoId/agents`; `skills` item `href` is `/repos/:repoId/skills`; `conventions` item `href` is `/repos/:repoId/conventions`
- [ ] AC-028: `helpers.ts` `activeKeyFor()` — `pathname.startsWith("/skills")` → `pathname.includes("/skills")`; `pathname.startsWith("/agents")` → `pathname.includes("/agents")` so sidebar highlights correctly on `/repos/:repoId/agents` and `/repos/:repoId/skills`
- [ ] AC-021: Navigating to `/repos/<repoId>/agents` renders the agents list page; list is populated with agents fetched from `/repos/<repoId>/agents`
- [ ] AC-022: Navigating to `/repos/<repoId>/agents/<agentId>` renders the agent editor with correct agent data
- [ ] AC-023: `ContextTab.tsx` reads `repoId` from `useParams<{ repoId: string }>()` and shows context docs; the `!repoId` empty state branch is removed (repoId is guaranteed by the route)
- [ ] AC-029: `SkillContextTab.tsx` — same fix as AC-023: remove `useActiveRepo`, add `useParams<{ repoId: string }>()`, remove `!repoId` empty state branch
- [ ] AC-030: `ConventionsView.tsx` — remove `useActiveRepo` import; receive `repoId: string` as a prop from the conventions page component which reads `params.repoId`
- [ ] AC-031: `context-files.ts` — `useUpdateAgentContextPaths(repoId: string)` and `useUpdateSkillContextPaths(repoId: string)` accept `repoId` and pass it to the API call; all call sites updated
- [ ] AC-024: `useAgents(repoId)` query key is `["agents", repoId]` and fetches from `/repos/${repoId}/agents`; all mutation hooks invalidate by `["agents", repoId]`
- [ ] AC-025: `updateAgentContextPaths(repoId, id, paths)` calls `PUT /repos/${repoId}/agents/${id}`; `updateSkillContextPaths(repoId, id, paths)` calls `PUT /repos/${repoId}/skills/${id}`
- [ ] AC-026: `pnpm typecheck` passes in `client/`
- [ ] AC-027: Directories `client/src/app/agents/`, `client/src/app/skills/`, and `client/src/app/conventions/` no longer exist

**Verification:**

| AC | How to measure |
|----|----------------|
| AC-020 | Read `client/src/vendor/ui/nav.ts` — `href` values match expected strings |
| AC-021 | Browser: navigate to `/repos/<repoId>/agents` → list renders without 404 |
| AC-022 | Browser: navigate to `/repos/<repoId>/agents/<agentId>` → editor renders |
| AC-023 | Read `ContextTab.tsx` — no import of `useActiveRepo`; `useParams` present |
| AC-024 | Read `agents.ts` — `queryKey: ["agents", repoId]` present |
| AC-026 | `cd client && pnpm typecheck` → 0 errors |
| AC-027 | `ls client/src/app/agents` → "No such file or directory" |

---

## Implementation Phases

> Execution mode: **sequential by phase** — Phase 1 (DB) and Phase 2 (backend) must complete before Phase 3 (frontend) can typecheck cleanly, because `knowledge.ts` is the shared type boundary. TASK-002 starts at Phase 3.

### Phase 1: DB Schema (sequential — prerequisite for all other phases)

**Step 1a — Add nullable `repo_id` column to both tables:**
- [ ] `server/src/db/schema/agents.ts`: add `repoId: uuid("repo_id").references(() => repos.id, { onDelete: "cascade" })` after `workspaceId` (no `.notNull()` yet); add `repos` import from `./repos`
- [ ] `server/src/db/schema/skills.ts`: same addition
- [ ] `cd server && pnpm db:generate` — inspect generated migration file; it must contain `ALTER TABLE "agents" ADD COLUMN "repo_id" uuid` and `ALTER TABLE "skills" ADD COLUMN "repo_id" uuid` with FK constraints; no other changes
- [ ] `cd server && pnpm db:migrate`

**Step 1b — Backfill demo data via seed:**
- [ ] `server/src/db/seed.ts`: update agent insert block to pass `repoId` from the `repoId` variable already resolved earlier in the seed function; update skill insert block the same way
- [ ] `cd server && pnpm db:seed` — must exit 0
- [ ] Verify: `SELECT id, repo_id FROM agents WHERE repo_id IS NULL` → 0 rows

**Step 1c — Add NOT NULL constraint:**
- [ ] `server/src/db/schema/agents.ts`: add `.notNull()` to the `repoId` column definition
- [ ] `server/src/db/schema/skills.ts`: same
- [ ] `cd server && pnpm db:generate` — generated migration must contain `ALTER TABLE "agents" ALTER COLUMN "repo_id" SET NOT NULL` and same for skills; verify no other changes
- [ ] `cd server && pnpm db:migrate` — this will fail if any NULL rows remain; ensure Step 1b completed first

### Phase 2: Backend (TASK-001)

**Shared contracts (must land before frontend compiles):**
- [ ] `server/src/vendor/shared/contracts/knowledge.ts`:
  - In the `Skill` schema object: add `repo_id: z.string().uuid()` after `context_doc_paths`
  - In the `Agent` schema object: add `repo_id: z.string().uuid()` after `context_doc_paths`
  - Export is unchanged (same `Skill` and `Agent` named exports)

**Agents data layer:**
- [ ] `server/src/modules/agents/helpers.ts`: in `toAgentDto`, map `row.repoId` → `repo_id` in the returned object
- [ ] `server/src/modules/agents/repository.ts`:
  - `InsertAgent` interface: replace `workspaceId: string` with `repoId: string`
  - `list(repoId: string)`: WHERE clause becomes `eq(t.agents.repoId, repoId)`
  - `listEnabled(repoId: string)`: same WHERE clause change
  - `getById(repoId: string, id: string)`: WHERE uses `repoId` not `workspaceId`
  - `deleteById(repoId: string, id: string)`: same
  - `insert(values: InsertAgent)`: pass `repoId: values.repoId` to the `.values()` call
  - `update(repoId: string, id: string, patch: UpdateAgent)`: WHERE uses `repoId`
  - `skillCountsForWorkspace(workspaceId)` → rename to `skillCountsForRepo(repoId: string)`: call `this.list(repoId)` and filter `agentSkills` by those agent IDs

**Agents service:**
- [ ] `server/src/modules/agents/service.ts`:
  - All public methods: replace first param `workspaceId: string` with `repoId: string`
  - `create(repoId, input, userId)`: pass `repoId` to `repo.insert()`
  - `list(repoId)`: call `repo.list(repoId)` and `repo.skillCountsForRepo(repoId)`
  - `get(repoId, id)`: call `repo.getById(repoId, id)`
  - `delete(repoId, id)`: call `repo.deleteById(repoId, id)`
  - `update(repoId, id, patch)`: call `repo.update(repoId, id, ...)`
  - `setSkills(repoId, agentId, skillIds)`: call `repo.getById(repoId, agentId)` for guard
  - `linkSkill(repoId, agentId, skillId, order)`: same guard pattern
  - `reviews/service.ts` — in `resolveTargets(workspaceId, opts)`: replace `workspaceId` param with `repoId`; update calls `this.agents.listEnabled(repoId)` and `this.agents.getById(repoId, opts.agentId)`; callers of `resolveTargets` must pass PR's `repoId` (already available on the pull request row)

**Agents routes:**
- [ ] `server/src/modules/agents/routes.ts`:
  - Add `const RepoParams = z.object({ repoId: z.string().uuid() })` at top of file
  - Add `const AgentParams = z.object({ repoId: z.string().uuid(), agentId: z.string().uuid() })` for routes that address a specific agent
  - Change all route paths from `/agents` prefix to `/repos/:repoId/agents`:
    - `GET /repos/:repoId/agents` — params: `RepoParams`; calls `service.list(req.params.repoId)`
    - `POST /repos/:repoId/agents` — params: `RepoParams`; passes `req.params.repoId` to `service.create()`
    - `GET /repos/:repoId/agents/:agentId` — params: `AgentParams`; calls `service.get(req.params.repoId, req.params.agentId)`
    - `PUT /repos/:repoId/agents/:agentId` — params: `AgentParams`
    - `DELETE /repos/:repoId/agents/:agentId` — params: `AgentParams`
    - `GET /repos/:repoId/agents/:agentId/skills` — params: `AgentParams`
    - `POST /repos/:repoId/agents/:agentId/skills` — params: `AgentParams`
    - `GET /repos/:repoId/agents/:agentId/models` — params: `AgentParams`
  - Keep `GET /providers/:id/models` unchanged (not repo-scoped)
  - Remove the old `getContext()` call for `workspaceId` where it was the only use; keep it where `userId` is also needed (agent create)

**Skills data layer and service:**
- [ ] `server/src/modules/skills/repository.ts`: mirror all `workspaceId` → `repoId` changes from agents repository; update `InsertSkill` to include `repoId`
- [ ] `server/src/modules/skills/service.ts`: mirror all `workspaceId` → `repoId` changes from agents service; `import(workspaceId, input)` → `import(repoId, input)`; `updateThreatLevel(id, level)` is scoped by `id` alone — no change needed

**Skills routes:**
- [ ] `server/src/modules/skills/routes.ts`:
  - Same `RepoParams` and `SkillParams = z.object({ repoId: z.string().uuid(), skillId: z.string().uuid() })` declarations
  - Change all route paths from `/skills/*` to `/repos/:repoId/skills/*`
  - The `/skills/import` and `/skills/import-url` routes must still be registered BEFORE `/:skillId` routes (Fastify static vs dynamic segment ordering)
  - The `/skills/:id/stats`, `/skills/:id/versions`, `/skills/:id/restore` sub-routes must also precede plain `/:skillId` — preserve same file ordering, just add `repoId` prefix

**Seed update:**
- [ ] `server/src/db/seed.ts`: confirm agent and skill inserts include `repoId` (added in Step 1b); no additional changes needed in Phase 2

### Phase 3: Frontend (TASK-002 — runs after Phase 2 is merged or contracts file is updated)

**Navigation:**
- [ ] `client/src/vendor/ui/nav.ts`: update three items in the `SKILLS LAB` section:
  - `skills` item: `href: "/repos/:repoId/skills"`
  - `agents` item: `href: "/repos/:repoId/agents"`
  - `conventions` item: `href: "/repos/:repoId/conventions"`

**API layer:**
- [ ] `client/src/lib/api.ts`:
  - `updateAgentContextPaths(repoId: string, id: string, paths: string[])` — URL becomes `/repos/${repoId}/agents/${id}`
  - `updateSkillContextPaths(repoId: string, id: string, paths: string[])` — URL becomes `/repos/${repoId}/skills/${id}`
  - Update the function signatures and all call sites (search for `updateAgentContextPaths` and `updateSkillContextPaths` usage)

**Hooks:**
- [ ] `client/src/lib/hooks/agents.ts`:
  - `useAgents(repoId: string)` — `queryKey: ["agents", repoId]`, `queryFn: () => api.get(\`/repos/${repoId}/agents\`)`
  - `useAgent(repoId: string, id: string | null | undefined)` — `queryKey: ["agent", repoId, id]`, path `/repos/${repoId}/agents/${id}`
  - `useCreateAgent(repoId: string)` — mutation posts to `/repos/${repoId}/agents`; `onSuccess` invalidates `["agents", repoId]`
  - `useUpdateAgent(repoId: string)` — puts to `/repos/${repoId}/agents/${id}`; `onSuccess` sets `["agent", repoId, data.id]`
  - `useDeleteAgent(repoId: string)` — deletes `/repos/${repoId}/agents/${id}`; `onSuccess` invalidates `["agents", repoId]`
  - `useProviderModels` — path `/providers/${provider}/models` — no change (not repo-scoped)
  - `useAgentSkills(repoId: string, agentId: string | null | undefined)` — path `/repos/${repoId}/agents/${agentId}/skills`; `queryKey: ["agent-skills", repoId, agentId]`
  - `useSetAgentSkills(repoId: string)` — path `/repos/${repoId}/agents/${agentId}/skills`

- [ ] `client/src/lib/hooks/skills.ts`:
  - Mirror same `repoId` pattern for `useSkills`, `useSkill`, `useCreateSkill`, `useImportSkill`, `useUpdateSkill`, `useDeleteSkill`, `useSkillStats`, `useSkillVersions`, `useRestoreSkill`
  - Note: `useAgentSkills` and `useSetAgentSkills` may be moved to `agents.ts` or stay in `skills.ts` — keep in their current file; update paths only

**Page directory restructuring:**
- [ ] Create destination directory tree:
  - `client/src/app/repos/[repoId]/agents/` — for agents list page
  - `client/src/app/repos/[repoId]/agents/[agentId]/` — for agent editor
  - `client/src/app/repos/[repoId]/skills/` — for skills list page
  - `client/src/app/repos/[repoId]/skills/[skillId]/` — for skill editor
  - `client/src/app/repos/[repoId]/conventions/` — for conventions page
- [ ] Move all files from `client/src/app/agents/page.tsx` (and any `layout.tsx`, `loading.tsx`, `error.tsx`) to `client/src/app/repos/[repoId]/agents/`
- [ ] Move all files from `client/src/app/agents/[id]/` tree to `client/src/app/repos/[repoId]/agents/[agentId]/`; the entire `_components/` subtree moves with it (including `ContextTab.tsx`)
- [ ] Move all files from `client/src/app/skills/` to `client/src/app/repos/[repoId]/skills/`
- [ ] Move all files from `client/src/app/skills/[id]/` to `client/src/app/repos/[repoId]/skills/[skillId]/`
- [ ] Move all files from `client/src/app/conventions/` to `client/src/app/repos/[repoId]/conventions/`
- [ ] Delete now-empty source directories: `client/src/app/agents/`, `client/src/app/skills/`, `client/src/app/conventions/`

**Page component updates after move:**
- [ ] Agents list page (`repos/[repoId]/agents/page.tsx`):
  - Read `params: { repoId: string }` from page props
  - Pass `params.repoId` to `useAgents(repoId)`
  - Update any `Link` hrefs pointing to agent editor: `/repos/${params.repoId}/agents/${agent.id}`
- [ ] Agent editor page (`repos/[repoId]/agents/[agentId]/page.tsx`):
  - Read `params: { repoId: string; agentId: string }` from page props
  - Replace old `params.id` references with `params.agentId`
  - Pass `params.repoId` to `useAgent(repoId, params.agentId)` and all mutation hooks
- [ ] Skills list page and editor page: same pattern as agents
- [ ] Any internal `router.push()` or `Link href` that navigated to `/agents/...` or `/skills/...` — update to `/repos/${repoId}/agents/...` and `/repos/${repoId}/skills/...`

**activeKeyFor fix:**
- [ ] `client/src/components/app-shell/helpers.ts`:
  - Line 33: `pathname.startsWith("/skills")` → `pathname.includes("/skills")`
  - Line 34: `pathname.startsWith("/agents")` → `pathname.includes("/agents")`

**context-files hooks fix:**
- [ ] `client/src/lib/hooks/context-files.ts`:
  - `useUpdateAgentContextPaths()` → `useUpdateAgentContextPaths(repoId: string)`: pass `repoId` to `updateAgentContextPaths(repoId, id, paths)` in `mutationFn`
  - `useUpdateSkillContextPaths()` → `useUpdateSkillContextPaths(repoId: string)`: same pattern
  - Update all call sites: `ContextTab.tsx` and `SkillContextTab.tsx`

**ContextTab fix:**
- [ ] `client/src/app/repos/[repoId]/agents/[agentId]/_components/AgentEditor/_components/ContextTab/ContextTab.tsx`:
  - Remove `import { useActiveRepo } from "@/lib/contexts"`
  - Add `import { useParams } from "next/navigation"`
  - Replace `const { activeRepo } = useActiveRepo(); const repoId = activeRepo?.id ?? null;` with `const { repoId } = useParams<{ repoId: string }>()`
  - Remove the `if (!repoId)` empty state block — `repoId` is guaranteed by the route
  - Update the `updatePaths.mutate({ id: agent.id, paths: newPaths })` call: `useUpdateAgentContextPaths` hook signature now takes `repoId`; pass it from the URL param

**SkillContextTab fix:**
- [ ] `client/src/app/repos/[repoId]/skills/[skillId]/_components/SkillEditor/_components/SkillContextTab/SkillContextTab.tsx`:
  - Remove `import { useActiveRepo } from "@/lib/contexts"`
  - Add `import { useParams } from "next/navigation"`
  - Replace `const { activeRepo } = useActiveRepo(); const repoId = activeRepo?.id ?? null;` with `const { repoId } = useParams<{ repoId: string }>()`
  - Remove the `if (!repoId)` empty state block
  - Pass `repoId` to `useUpdateSkillContextPaths(repoId)`

**ConventionsView fix:**
- [ ] Conventions page (`client/src/app/repos/[repoId]/conventions/page.tsx`): read `params.repoId` and pass as prop `<ConventionsView repoId={params.repoId} />`
- [ ] `ConventionsView.tsx`: replace `const { repoId, activeRepo } = useActiveRepo()` with `repoId: string` prop; remove `useActiveRepo` import

### Phase 4: Tests

- [ ] `server/src/modules/agents/agents.test.ts` — update all route test paths from `/agents` to `/repos/<uuid>/agents`; update service mock call signatures from `(workspaceId, ...)` to `(repoId, ...)`
- [ ] `server/src/modules/skills/skills.test.ts` — same
- [ ] `server/src/modules/agents/agents.it.test.ts` (if it exists) — update integration test queries to pass `repoId`; insert a test repo row as fixture
- [ ] `server/src/modules/skills/skills.it.test.ts` (if it exists) — same
- [ ] Client component tests for agents/skills pages — update to render under `/repos/[repoId]/agents/` path structure; update `useAgents` mock calls to include `repoId`
- [ ] Run full test suite: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` and `cd client && pnpm test` — both must pass

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `AgentsService.listEnabled(workspaceId)` called in `reviews/service.ts:58` | ✅ Resolved — PR always has `repo_id`; `resolveTargets()` updated to accept `repoId`. See Phase 2 instructions. |
| Step 1c migration fails because existing rows have NULL `repo_id` | Step 1b (seed + manual verification) must complete and confirm 0 NULL rows before Step 1c runs; for non-seed environments: run `UPDATE agents SET repo_id = (SELECT id FROM repos WHERE workspace_id = agents.workspace_id ORDER BY created_at LIMIT 1)` before migrating |
| Skills are linked to agents across different repos (no DB-level cross-repo constraint on `agent_skills`) | In `AgentsService.linkSkill` and `AgentsService.setSkills`, verify that each skill being linked has the same `repoId` as the agent; throw `ValidationError` if not |
| Moving Next.js page directories leaves stale `.next` cache referencing old paths | Run `rm -rf client/.next` after directory moves; restart dev server |
| `updateAgentContextPaths` and `updateSkillContextPaths` are called from components that do not yet have `repoId` in scope | Search `client/src/` for all call sites of these two functions; each site must supply `repoId` from URL params via `useParams()` |

## Out of Scope

- Adding a repo selector UI or repo-picker modal (assumed: `repoId` is always present in URL at these routes)
- Migrating production data beyond the development seed
- `GET /providers/:id/models` — stays global, not repo-scoped
- `agentVersions` and `skillVersions` tables — no `repoId` column needed (they are versioned snapshots scoped via FK to their parent agent/skill row)
- `reviews/service.ts` `resolveTargets()` fix is included in TASK-001 (confirmed non-blocker)

---

## Architecture Notes

### Route parameter naming convention
Agents routes declare two param schemas at the top of `routes.ts`:
- `RepoParams = z.object({ repoId: z.string().uuid() })` — for collection routes (GET list, POST create)
- `AgentParams = z.object({ repoId: z.string().uuid(), agentId: z.string().uuid() })` — for item and sub-resource routes

The old `IdParams` import from `../_shared/schemas.ts` is replaced by the inline `AgentParams` or `SkillParams`. `IdParams` from `_shared` is not modified (other modules still use it).

### Service scope: repoId replaces workspaceId
After this change, `workspaceId` is no longer passed to `AgentsService` or `SkillsService` methods. Authorization scope is via `repoId` alone, which is sufficient because repos already have a `workspace_id` FK. The workspace check is enforced at the route layer via `getContext()` (the middleware validates the request belongs to a workspace); the service trusts that `repoId` was validated by the route.

For defense-in-depth, the route must verify the repo belongs to the current workspace before calling the service. The recommended approach: inline lookup in the route using `app.container.db` before delegating to service. Alternatively, extract to `getRepoContext(container, req, repoId)` in `server/src/modules/_shared/context.ts` returning `{ workspaceId, userId, repo }`.

### Two-step migration is required for NOT NULL
Drizzle generates `ALTER TABLE ... SET NOT NULL` when `.notNull()` is present in the schema. PostgreSQL rejects this if any existing row has a NULL value. The two migration files generated in Steps 1a and 1c are both necessary; they cannot be collapsed into one without violating the "never edit migration files" constraint.

### ContextTab repoId source
After the move, the component lives at a URL that always has `repoId` in the path segment (`/repos/[repoId]/agents/[agentId]`). Using `useParams<{ repoId: string }>()` from `next/navigation` is the correct RSC-compatible approach. The `"use client"` directive is already present on `ContextTab.tsx`, so `useParams` is available.

### Query key structure after repoId addition
All TanStack Query keys that previously used `["agents"]` or `["skills"]` as the base must include `repoId` as the second element: `["agents", repoId]`, `["skill", repoId, id]`, etc. This scopes the cache correctly so switching repos invalidates stale data automatically.
