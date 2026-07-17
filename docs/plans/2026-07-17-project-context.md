# Implementation Plan — Project Context (attach specs/docs/insights to reviewer prompts)

## Context & goal
Discover every Markdown document under a repo's `specs`/`docs`/`insights` roots, let a user
attach an ordered subset to an agent or skill (paths only, never text), and at run time read
those paths from the last-synced clone and fill the **already-existing** `## Project context`
prompt slot in `reviewer-core`. The engine seam is built and wired shut today: `reviewer-core`
accepts `specs`, wraps each untrusted, renders `## Project context`, and records `assembly.specs`
(`reviewer-core/src/prompt.ts:116-119,139,158`, `run.ts:60,140`), but the run-executor never passes
`specs` and hardcodes `specs_read: []` (`server/src/modules/reviews/run-executor.ts:215-241,311,461`).
This feature wires the injection, adds the discovery + attach surface, and surfaces the injected
docs in the run trace — with **zero new LLM/embedding calls**.

## Design reference
The discovery page is a **two-pane master-detail** layout (left file list + inline preview
pane), mirroring the Skills workbench. See the mockup and the layout breakdown in the spec:
`specs/assets/2026-07-17-project-context/project-context.png` and the spec's `## Design
reference` section. The mockup's `+`/upload/new-folder, Edit toggle, coverage ring, and chunk
count are intentionally NOT built (Non-goals).

## Requirements source
- Spec: `specs/2026-07-17-project-context.md` — the request itself points here.
- Spec ID: `2026-07-17-project-context` · Status: **approved** (header verified: line 1).
- Questions answered by the requester (all four resolved to the recommended defaults):
  - **Run shape** → multi-agent, ~3 lanes.
  - **AC-27 snapshot** → mirror skills exactly (capture context paths at the next config-change
    snapshot; no version bump on Context-tab save).
  - **AC-18 overflow** → pre-flight token estimate + a model→context-window constant map; fail
    before dispatch; do NOT rely on catching a provider error.
  - **Page nav** → a WORKSPACE nav item `/repos/:repoId/context`, mirroring Pull Requests.

## Criteria coverage
<!-- Every AC in the spec (AC-1 … AC-29) mapped to the task(s) that deliver it. -->
| AC | Task | Notes |
|---|---|---|
| AC-1 | T3, T5 | list `.md` under specs/docs/insights, path + root badge; roots server-configured |
| AC-2 | T3, T5 | `clone.present=false` when `clonePath` null → empty state names reason + Resync |
| AC-3 | T5 | empty-roots copy names roots; **corrects** the wrong `context.json` empty-state body |
| AC-4 | T3, T5 | footer: count, aggregate tokens, time-since-sync (last-synced snapshot) |
| AC-5 | T5 | loading + load-error(retry) states |
| AC-6 | T3, T5 | content endpoint + read-only Markdown; no edit/create/upload/delete affordance |
| AC-7 | T6 | Context tab rows: drag handle, checkbox, filename, dir, root badge, Preview |
| AC-8 | T6 | "N of M attached" |
| AC-9 | T6 | filter narrows visible rows only (no order/state change) |
| AC-10 | T3, T6 | POST persists paths + order + attached; never text |
| AC-11 | T3, T6 | skill attach; inherited by agents with that skill enabled at run time |
| AC-12 | T6 | live token estimate from already-fetched per-doc estimates; no network/model call |
| AC-13 | T6 | figure shown as `≈ N tokens`, never exact |
| AC-14 | T3, T4 | resolve skill-inherited then agent-attached, dedupe by path (first wins) → `specs` |
| AC-15 | T3 | lexical + lstat + realpath containment + ext re-check on realpath |
| AC-16 | T3 | guard reject → skip + log, run continues |
| AC-17 | T3 | missing/renamed → skip, surface as skipped, run completes |
| AC-18 | T4 | pre-flight estimate vs model→window map → fail naming project-context block + its token contribution |
| AC-19 | T3, T4 | zero LLM/embedding/network calls to discover/count/attach/inject |
| AC-20 | T1, T4 | nothing attached/inherited → prompt byte-identical to today (`context` defaults `[]`) |
| AC-21 | T4 | each doc wrapped untrusted in `## Project context`; system-side guard intact (existing) |
| AC-22 | T4 | fill `specs_read`; Configuration card "Specs read" row already renders it |
| AC-23 | T7 | Prompt-assembly entry labelled `Project context — attached specs (untrusted)`, copyable |
| AC-24 | T7 | display token volume of the `## Project context` block in the trace |
| AC-25 | T4 | invariant text present inside `## Project context` — release-gate integration test |
| AC-26 | T3, T5 | per-doc "used_by_agents" count |
| AC-27 | T3, T4 | attached paths recorded in agent version-config snapshot alongside `skills` |
| AC-28 | T6 | attach UI states docs are injected as untrusted block; preview names `## Project context` |
| AC-29 | T3 | size > ~5 MB → fail naming doc + size, never read into memory (crash guard) |

## Execution mode
**Multi-agent (~3 lanes)** — chosen by the requester. Tasks have **disjoint file ownership**;
run the phases in `## Execution order`. No `test-writer` phase — see the note under `## Tasks`.

## Constraints from INSIGHTS & CLAUDE.md
- **Dual-vendor sync in ONE commit.** Any Zod contract change must land identically in
  `server/src/vendor/shared/` and `client/src/vendor/shared/` — no automation, manual by
  convention. Source: root `INSIGHTS.md:26`.
- **Unused i18n keys encode design scope.** `client/messages/en/context.json` `mode.edit`,
  `editor.save`, `editor.saving` are **deliberately unconsumed** (editing is a Non-goal) — leave
  them, do not delete. Its empty-state `body` ("Every agent and the PR brief read them…") is
  **WRONG per AC-3** and must be corrected. `agents.json` editor.tabs has **no `context` key** —
  the tab is genuinely new. Source: root `INSIGHTS.md:27`; spec §Non-goals.
- **IDOR trap on child tables keyed only by owner id.** `agent_skills` is PK'd on
  `(agent_id, skill_id)` with no `workspace_id` (`server/src/db/schema/agents.ts:51-64`). New
  `agent_context`/`skill_context` tables inherit this shape, so every repository read reachable
  from a route MUST join to the owning agent/skill and filter on its `workspace_id`. Source:
  `server/INSIGHTS.md:38`.
- **Path guard is not lexical-only.** A committed symlink (or symlinked parent) resolves
  lexically inside the clone but its realpath can be anywhere (e.g. `~/.devdigest/secrets.json`).
  Keep the lexical pre-filter, then `lstat` (reject symlink leaf), `realpath` both sides + re-check
  containment, and re-derive the extension allowlist from the **realpath'd** target. Source:
  `server/INSIGHTS.md:41`; `intent/service.ts:90-115`.
- **Two byte limits must never collapse into one.** There is **no token budget** (a long attached
  spec reaches the model in full or the run fails, AC-18); there is a **~5 MB crash-guard**
  read bound (AC-29). Do NOT reuse intent's `PLAN_SPEC_MAX_BYTES = 16 KB`
  (`intent/constants.ts:5`) — that value is a token budget and would silently truncate. Source:
  spec §Non-functional › Security.
- **Nothing re-indexes/re-syncs automatically.** Discovery reads the last-synced clone snapshot
  and labels its age; do not add a poller/fetch. Refresh now routes to resync. Source:
  `server/INSIGHTS.md:44,51`; spec §Non-goals.
- **Degraded AND empty must render the reason inside the empty branch**, not after an early
  return. Compute the "no clone / unreadable" explanation ABOVE the empty early-return and render
  it inside that branch. Source: `client/INSIGHTS.md:32`; spec Edge cases.
- **Vendored `Markdown` primitive styles only `p/strong/code/a`; `.dd-md` has no CSS.** Headings
  render flat in Preview — a known limitation, NOT a bug to chase; do not touch sealed
  `vendor/ui`. Source: `client/INSIGHTS.md:11`; spec Edge cases (AC-6).
- **No `@testing-library/user-event`.** Use `fireEvent` from `@testing-library/react`; controlled
  inputs via `fireEvent.change(el, { target: { value } })`; grab a textarea with
  `container.querySelector`. Source: `client/INSIGHTS.md:15,41`.
- **Non-nested interactive rows.** The Context row's drag handle + Preview + checkbox are
  separately focusable; do NOT wrap the whole row in one interactive container with inner buttons.
  Wrap only the toggle in a real `<button aria-expanded aria-label>` and keep siblings as flex
  children. Source: `client/INSIGHTS.md:46`; spec §Accessibility.
- **reviewer-core is a hard Non-goal** — the `specs` input, `## Project context` render, untrusted
  wrapping and `assembly.specs` exist and are shared with the CI runner. Do not touch it.
- **Server rules:** services receive `Container` (never `new` an adapter); routes declare Zod
  `params`/`body`; secrets via `SecretsProvider`; don't edit an existing schema file — add a new
  file + migration; a hand-written migration also needs a `_journal.json` entry
  (`server/INSIGHTS.md:49`); after `db:generate` read the generated `.sql` (`server/INSIGHTS.md:50`).

## Architecture sketch
```mermaid
flowchart LR
  subgraph client
    P[Project Context page<br/>repos/:repoId/context] -->|useContextDocs| H[lib/hooks/context.ts]
    CT[Context attach tab<br/>agent + skill editors] -->|useContextDocs / set*Context| H
    TR[RunTraceDrawer · TraceBody] -.reads.-> RT[(run_traces)]
  end
  subgraph server
    H -->|GET /repos/:id/context-docs<br/>GET .../content| CM[context module]
    H -->|GET/POST /agents/:id/context<br/>GET/POST /skills/:id/context| CM
    CM --> CR[context repository]
    CR --> AC[(agent_context)]
    CR --> SC[(skill_context)]
    CM --> G[_shared/path-guard.ts]
    CM --> TK[container.tokenizer]
    CM --> FS[repo clone<br/>last-synced]
    RE[reviews/run-executor] -->|resolveForAgent| CM
    RE -->|specs: string[]| PE[reviewer-core assemblePrompt<br/>UNCHANGED]
    RE -->|snapshot context paths| AR[agents/repository snapshotVersion]
    RE --> RT
  end
```

## Shared contracts (define FIRST, before parallel work) — T1
New file `contracts/context.ts` in **both** vendored copies, exported from **both** barrels
(`server/src/vendor/shared/index.ts:17-27`, client equivalent). Shapes (Zod, `snake_case` fields):
- `ContextRoot = z.enum(['specs','docs','insights'])`.
- `ContextDoc = { path: z.string(), root: ContextRoot, bytes: z.number().int(), token_estimate: z.number().int(), used_by_agents: z.number().int() }` — `path` repo-relative.
- `ContextDocsResponse = { docs: z.array(ContextDoc), clone: z.object({ synced_at: z.string().nullable(), present: z.boolean() }) }`.
- `ContextDocContent = { path: z.string(), text: z.string() }`.
- `ContextAttachment = { path: z.string(), order: z.number().int(), attached: z.boolean() }` — owner (agent/skill) implied by the route.
- `SetContextBody = { docs: z.array(z.object({ path: z.string(), attached: z.boolean() })) }` — full ordered set (mirrors `POST /agents/:id/skills`).
- Extend **existing** `AgentVersionConfig` (`contracts/knowledge.ts:307-317`) with
  `context: z.array(z.string()).default([])` — **defaulted** so old `agent_versions` rows without
  the field still parse (AC-20 / replay).

## Tasks
**No `test-writer` phase for this feature** — `test-writer` is disabled this session and must not
be invoked or spawned. Every Task therefore owns and writes its own test files, and its `Verify`
command is the release gate for its ACs: the implementer iterates until that scoped command is
green. The T3/T4 (backend integration) and T5/T6 (frontend flow) test scopes below carry the
coverage that would otherwise have been separate test tasks.

### T1 — Shared contracts + AgentVersionConfig extension (GATE)
- **Area:** Full-stack (contracts)
- **Satisfies:** AC-20 (context defaults `[]`); enables AC-10/11/26/27 and all UI.
- **Owns (files):**
  - `server/src/vendor/shared/contracts/context.ts` (new)
  - `client/src/vendor/shared/contracts/context.ts` (new — byte-identical)
  - `server/src/vendor/shared/index.ts` (add `export * from './contracts/context.js'`)
  - `client/src/vendor/shared/index.ts` (same)
  - `server/src/vendor/shared/contracts/knowledge.ts` (extend `AgentVersionConfig`)
  - `client/src/vendor/shared/contracts/knowledge.ts` (same)
  - `server/test/context-contract.test.ts` (new — hermetic)
- **Depends on:** none
- **Skills to invoke:** security, zod, typescript-expert
- **Steps:**
  1. Add the `## Shared contracts` shapes above to both `contracts/context.ts` files (identical).
  2. Add the barrel export line to both `index.ts` barrels.
  3. Add `context: z.array(z.string()).default([])` to `AgentVersionConfig` in both `knowledge.ts`
     copies. Do not reorder existing fields.
  4. Write `context-contract.test.ts`: `parse` a sample `ContextDoc`, `ContextDocsResponse`,
     `SetContextBody`; assert `AgentVersionConfig.parse({ …no context… })` yields `context: []`.
- **Verify:** `cd server && pnpm exec vitest run test/context-contract.test.ts`
- **Out of scope:** DB tables, routes, UI, any `.js` emit. No behavior change to other contracts.

### T2 — DB schema + migration (context tables)
- **Area:** Backend
- **Satisfies:** storage for AC-10/11/26/27 (no AC directly — scaffolding).
- **Owns (files):**
  - `server/src/db/schema/context.ts` (new — `agent_context`, `skill_context`)
  - `server/src/db/schema.ts` (barrel — add `export * from './schema/context.js'`)
  - `server/src/db/migrations/<next>_project_context.sql` (new)
  - `server/src/db/migrations/meta/_journal.json` (append entry) + generated snapshot
- **Depends on:** none (parallel with T1)
- **Skills to invoke:** drizzle-orm-patterns, postgresql-table-design, security, zod, typescript-expert
- **Steps:**
  1. Define two tables mirroring `agent_skills` (`schema/agents.ts:51-64`): `agent_context`
     (`agent_id uuid → agents.id ON DELETE cascade`, `path text notNull`, `order integer notNull default 0`,
     PK `(agent_id, path)`) and `skill_context` (`skill_id uuid → skills.id ON DELETE cascade`,
     `path text notNull`, `order integer notNull default 0`, PK `(skill_id, path)`). Add an index on
     the FK column (`agent_id` / `skill_id`) — PG does not auto-index FKs.
  2. Note in a file comment: **no `workspace_id` column** — tenancy is enforced by the repository
     joining to the owning agent/skill (see `server/INSIGHTS.md:38`), the same shape as `agent_skills`.
  3. Prefer `pnpm db:generate` to author the SQL + snapshot; if hand-writing, add the `_journal.json`
     entry (`server/INSIGHTS.md:49`) and read the generated SQL before finishing (`:50`).
- **Verify:** `cd server && pnpm exec vitest run test/context-contract.test.ts` *(no DB test of its
  own; correctness is proven by T3's `.it.test.ts` which creates these tables via migration — see
  End-to-end verification. If preferred, add a trivial `schema/context.ts` import test and scope
  Verify to it.)*
- **Out of scope:** editing any existing schema file; the module code; workspace_id columns.

### T3 — Context backend module (discovery, content, attach, run-time resolution)
- **Area:** Backend
- **Satisfies:** AC-1, AC-2, AC-4, AC-6, AC-10, AC-11, AC-14, AC-15, AC-16, AC-17, AC-19, AC-26, AC-27(read side), AC-29
- **Owns (files):**
  - `server/src/modules/context/{routes,service,repository,helpers,constants}.ts` (new)
  - `server/src/modules/_shared/path-guard.ts` (new — lift pure `safeRepoPath`, `isRealPathContained`)
  - `server/src/modules/intent/helpers.ts` (edit: re-export the two guards from `_shared/path-guard.js`; keep names/signatures so intent imports/tests stay green)
  - `server/src/adapters/tokenizer/index.ts` (edit: widen the scope comment at `:11` to include the project-context module — see Decision R1)
  - `server/src/modules/index.ts` (register `context`)
  - `server/test/context.it.test.ts` (new — DB-backed) and `server/test/context-guard.test.ts` (new — hermetic guard unit test)
- **Depends on:** T1 (contracts), T2 (tables)
- **Skills to invoke:** onion-architecture, fastify-best-practices, drizzle-orm-patterns, postgresql-table-design, security, zod, typescript-expert
- **Steps:**
  1. **Guard lift (R2):** move the pure `safeRepoPath` + `isRealPathContained` bodies to
     `_shared/path-guard.ts`; in `intent/helpers.ts` replace their definitions with
     `export { safeRepoPath, isRealPathContained } from '../_shared/path-guard.js'`.
  2. **Constants:** `context/constants.ts` — `CONTEXT_ROOTS = ['specs','docs','insights'] as const`
     (server-configured default set — AC-1), `CONTEXT_ALLOWED_EXTENSIONS = ['.md'] as const`,
     `CONTEXT_MAX_DOC_BYTES = 5 * 1024 * 1024` (crash guard — AC-29; **distinct** from intent's 16 KB).
  3. **Repository** (`context/repository.ts`): workspace-scoped throughout.
     - `getRepoClonePath(workspaceId, repoId)` — join `repos` filtered on `workspace_id` (IDOR guard);
       return `clonePath` + last-sync marker. (Check `repos` schema for a synced-at column; if none,
       derive from the row's `updated_at` and label it "last synced" — acceptable per AC-4's
       "last-synced snapshot" wording.)
     - `agentContext(agentId)` / `skillContext(skillId)` — ordered rows; each **joins** to
       `agents`/`skills` filtered on `workspace_id` (AC + `server/INSIGHTS.md:38`).
     - `setAgentContext(agentId, [{path,order}])` / `setSkillContext(...)` — delete-all + insert
       ordered set (mirror `agents/repository.ts:setSkills`).
     - `usedByAgentsCounts(workspaceId, repoId)` — count of distinct agents attaching each path
       (for AC-26). Scope to the workspace.
     - `resolvePathsForAgent(workspaceId, agentId)` — skill-inherited paths (from the agent's
       **enabled** skills, ordered) followed by agent-attached paths, **deduped by path, first wins**
       (AC-14).
  4. **Service** (`context/service.ts`, receives `Container`):
     - `listDocs(workspaceId, repoId)`: if `clonePath` null → `{ docs: [], clone: { present:false, synced_at } }`
       (AC-2). Else walk each existing root recursively for `*.md` (roots only, not whole tree — perf
       AC / Non-functional 400 ms), collect repo-relative path + `bytes`; `token_estimate` via
       `this.container.tokenizer.count(text)` (R1) — read each doc once, guarded (step 6). Compute
       `used_by_agents`. Return `ContextDocsResponse` (AC-1, AC-4, AC-26).
     - `getDocContent(workspaceId, repoId, path)`: path-guarded read (step 6), return `{ path, text }`
       (AC-6). Reject guard failures with a 400/404 (no bytes leaked).
     - `getAgentContext` / `setAgentContext` / `getSkillContext` / `setSkillContext`: validate every
       POSTed path against the discovered doc set before persisting (untrusted-inputs note); persist
       **paths + order + attached** only (AC-10, AC-11). Return `ContextAttachment[]`.
     - `resolveForAgent(workspaceId, agentId, clonePath)` → `{ injected: {path,text}[], skipped: {path,reason}[] }`:
       for each resolved path run the **full guard sequence** (step 6); on guard reject / missing →
       push to `skipped` and continue (AC-16, AC-17); on `size > CONTEXT_MAX_DOC_BYTES` → **throw** a
       typed `ContextDocTooLargeError(path, size)` (AC-29, do NOT read bytes); else read WHOLE (no
       truncation) and push to `injected`. This method is called by T4.
  5. **Routes** (`context/routes.ts`, Zod `params`/`body`; `getContext` for workspace):
     `GET /repos/:repoId/context-docs`, `GET /repos/:repoId/context-docs/content` (query `path`),
     `GET /agents/:id/context`, `POST /agents/:id/context` (body `SetContextBody`),
     `GET /skills/:id/context`, `POST /skills/:id/context`. Use a local params schema for the
     `repoId`/`id` segment names (`server/INSIGHTS.md:37` — `IdParams` is keyed `id`).
  6. **Guard sequence** (I/O, in service — NOT reusing intent's byte cap): `safeRepoPath(root,rel)` →
     `lstat` reject symlink leaf → `realpath` root+target + `isRealPathContained` → re-check ext
     allowlist on the realpath → `stat.size` check vs `CONTEXT_MAX_DOC_BYTES` → read. Mirror
     `intent/service.ts:90-115` but with context's own bound and fail-loud-on-oversize.
  7. Register `context` in `modules/index.ts`.
  8. **Tests (this Task's release gate — must be green):**
     - `context-guard.test.ts` (hermetic) — lexical `..`/absolute escape rejected; symlink leaf
       rejected; symlinked-parent escape rejected via realpath; ext re-check on the realpath'd
       target (`.md` symlink → `.env` target rejected). (AC-15/AC-16 unit level.)
     - `context.it.test.ts` (DB, mirror `server/test/skills.it.test.ts` harness
       `startPg`+`seed`+`buildApp`): seed a clone dir with nested `specs/**/*.md` + `docs/*.md`;
       assert list shape, root badges, per-doc `token_estimate`, `used_by_agents` count (AC-1/4/26);
       content endpoint returns text + is path-guarded (AC-6); POST then GET agent **and** skill
       context persists **paths + order + attached only** (AC-10/11); **cross-workspace agent/skill
       id → 404** (IDOR, `server/INSIGHTS.md:38`); **empty-clone `present:false`** and empty-roots
       `docs:[]` (AC-2/3 data side); `resolveForAgent` dedupe skill-then-agent first-wins (AC-14),
       skip-on-missing (AC-17), and throws `ContextDocTooLargeError` on an oversized file (AC-29,
       assert **no bytes read**). These scenarios are the coverage the removed test task carried.
- **Verify:** `cd server && pnpm exec vitest run test/context-guard.test.ts test/context.it.test.ts`
  *(the `.it.test.ts` needs Docker)*
- **Out of scope:** run-executor injection (T4); the AC-27 **write** into the version snapshot
  (T4 edits `agents/repository.ts`); any UI; reviewer-core.

### T4 — Run-time injection + version snapshot (AC-27 write)
- **Area:** Backend
- **Satisfies:** AC-14(pass), AC-18, AC-19, AC-20, AC-21, AC-22, AC-25, AC-27(write)
- **Owns (files):**
  - `server/src/modules/reviews/run-executor.ts` (edit)
  - `server/src/modules/agents/repository.ts` (edit `snapshotVersion` — include context paths)
  - `server/test/context-injection.it.test.ts` (new — DB-backed)
- **Depends on:** T1, T3 (uses `ContextService.resolveForAgent` + `resolvePathsForAgent`)
- **Skills to invoke:** onion-architecture, fastify-best-practices, drizzle-orm-patterns, security, zod, typescript-expert
- **Steps:**
  1. In `runOneAgent` (`run-executor.ts:157-241`): after resolving skills, call
     `new ContextService(this.container).resolveForAgent(workspaceId, agent.id, repo.clonePath)`.
     Guard `clonePath` null → `{ injected: [], skipped: [] }` (no clone → nothing to inject).
  2. Pass `...(injected.length ? { specs: injected.map(d => d.text) } : {})` into
     `reviewPullRequest(...)` (`:215-241`) — the **existing** `specs` seam. When empty, omit → prompt
     byte-identical to today (AC-20).
  3. Fill the trace (`:311`): `specs_read: injected.map(d => d.path)` (AC-22); log each `skipped`
     entry via `runLog.info` (AC-16, AC-17). `prompt_assembly.specs` is already populated by the
     engine (AC-21/23 source).
  4. **AC-29:** catch `ContextDocTooLargeError` from `resolveForAgent` → fail the run with a message
     naming the document + size (do not fall through to a generic error).
  5. **AC-18 — pre-flight estimate + model→window map (decided):** before dispatch, estimate the
     project-context contribution with `this.container.tokenizer.count` over the joined injected
     texts, and estimate the whole assembled prompt (system + skills + diff + injected, same
     `cl100k_base` approximation). Compare against the target model's context window from a **small
     constant map** — location: `server/src/modules/context/constants.ts`
     (`MODEL_CONTEXT_WINDOWS: Record<string, number>`, keyed by the model ids the agents actually
     run, e.g. `gpt-4.1`, the OpenRouter/DeepSeek ids). **Fallback for an unknown model: SKIP the
     overflow check** — a false-positive failure is worse than a missed edge, and AC-13 already
     frames the estimate as inexact. **Margin, because the number is inexact:** only fail when the
     estimate exceeds `window * OVERFLOW_MARGIN` where `OVERFLOW_MARGIN = 0.9` (i.e. leave ~10%
     headroom) — never an exact `>= window` comparison against an approximate token count; document
     the margin's rationale in a comment. On a fail, name the `## Project context` block + its token
     contribution (AC-18). Prefer this pre-flight path; do **not** implement AC-18 by catching a
     provider context-length error.
  6. **AC-27 — mirror skills exactly (decided):** in `agents/repository.ts:snapshotVersion`
     (`:155-174`), read the agent's attached context paths (direct `agent_context` query) and add
     `context: <paths>` into `configJson` alongside `skills`. **No version bump on Context-tab
     save** — the paths are captured at the next config-change snapshot, exactly as linked skills
     are today. The `AgentVersionConfig.context` default `[]` (T1) keeps pre-existing snapshots
     valid.
  7. **Tests (this Task's release gate — must be green; carries the removed test task's coverage):**
     `context-injection.it.test.ts` (DB + mock LLM via `overrides.llm`): (a) **AC-25 release gate** —
     attach a doc with a known invariant string, run a review, assert `prompt_assembly.specs` / the
     user message contains that text inside `## Project context`; (b) **AC-20** — no attachments →
     `specs_read: []` and assembly byte-identical to a no-context run; (c) **AC-14** — same doc on
     agent + enabled skill → injected once at the skill-inherited position; (d) **AC-16/AC-17** —
     attached-then-deleted and guard-rejected paths → skipped, surfaced as skipped in the trace, run
     completes; (e) **AC-29** — oversized attached doc → run fails naming the doc + size, no bytes
     read; (f) **AC-18** — attach enough text to exceed a small test model's mapped window → run
     fails naming the project-context block + token contribution; unknown model → check skipped;
     (g) **AC-19** — assert no embedder call and no LLM calls beyond the review itself; (h) **AC-27**
     — after attach + a config edit, `agent_versions.config_json.context` holds the paths.
- **Verify:** `cd server && pnpm exec vitest run test/context-injection.it.test.ts` *(Docker)*
- **Out of scope:** touching reviewer-core; discovery/attach endpoints (T3); UI.

### T5 — Project Context page (discovery UI)
- **Area:** Frontend
- **Satisfies:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-26
- **Owns (files):**
  - `client/src/app/repos/[repoId]/context/page.tsx` (new — thin)
  - `client/src/app/repos/[repoId]/context/_components/ProjectContextView/*` (new: `.tsx`, `helpers.ts`, `constants.ts`, `styles.ts`, `index.ts`, `ProjectContextView.test.tsx`)
  - `client/src/lib/hooks/context.ts` (new — **all** context query/mutation hooks: `useContextDocs`, `useContextDocContent`, `useAgentContext`, `useSetAgentContext`, `useSkillContext`, `useSetSkillContext`)
  - `client/src/vendor/ui/nav.ts` (edit — add WORKSPACE nav item `/repos/:repoId/context`)
  - `client/src/components/app-shell/helpers.ts` (edit — map the new key in `activeKeyFor`)
  - `client/messages/en/context.json` (edit — **correct** empty-state body per AC-3; add page keys)
- **Depends on:** T1 (contracts). Provides `lib/hooks/context.ts` consumed by T6.
- **Skills to invoke:** next-best-practices, react-best-practices, react-testing-library, client-project-structure, security, zod, typescript-expert
- **Steps:**
  1. `lib/hooks/context.ts`: TanStack Query hooks over `src/lib/api.ts` for every context endpoint
     (docs, content, agent/skill get+set). Infer types from `vendor/shared` — never redefine.
  2. `ProjectContextView`: list rows (path + root badge, AC-1), footer (count, aggregate
     `≈` token estimate, time-since-sync, AC-4). Preview renders content read-only via the vendored
     `Markdown` primitive (AC-6) — no edit/create/upload/delete affordance; accept flat headings as a
     known limitation (`client/INSIGHTS.md:11`).
  3. **States:** loading + load-error(retry) (AC-5); **compute the degraded/empty explanation ABOVE
     the empty early-return** and render it inside the empty branch (`client/INSIGHTS.md:32`):
     clone-absent names the reason + offers Resync (AC-2); empty-roots names the searched roots and
     describes the **manual-attach** model (AC-3) — must NOT claim automatic reading.
  4. `context.json`: rewrite the empty-state `body` to the manual-attach wording (AC-3); leave
     `mode.edit`/`editor.save`/`editor.saving` untouched; add the new keys the view needs.
  5. Nav (decided): add the item to the **WORKSPACE** section of `NAV` (route `/repos/:repoId/context`,
     mirroring Pull Requests) + a `SHORTCUTS` row if giving it a `gKey`; map its key in `activeKeyFor`
     (`client/INSIGHTS.md:39`).
  6. **Test (this Task's release gate — must be green; `fireEvent`, not `userEvent`):**
     `ProjectContextView.test.tsx` — loaded list with root badges + footer (count/tokens/age)
     (AC-1/4); user opens a doc → read-only Markdown preview, no edit/create affordance (AC-6);
     **degraded+empty corner** — no clone → reason + Resync rendered **inside** the empty branch, not
     a bare empty list (AC-2, `client/INSIGHTS.md:32`); empty-roots → manual-attach copy that does
     **not** claim automatic reading (AC-3); loading + load-error-with-retry (AC-5). Mock `AppShell`
     passthrough + `next/navigation` per `client/INSIGHTS.md:37`. These corners are the coverage the
     removed test task carried.
- **Verify:** `cd client && pnpm exec vitest run src/app/repos/[repoId]/context/_components/ProjectContextView/ProjectContextView.test.tsx`
- **Out of scope:** the attach tab (T6); the run trace (T7); backend.

### T6 — Context attach tab (agent + skill editors)
- **Area:** Frontend
- **Satisfies:** AC-7, AC-8, AC-9, AC-10(UI), AC-11(UI), AC-12, AC-13, AC-28
- **Owns (files):**
  - `client/src/components/context-attach/*` (new shared component: `ContextAttachTab.tsx`, `helpers.ts`, `constants.ts`, `styles.ts`, `types.ts`, `index.ts`, `ContextAttachTab.test.tsx`, `helpers.test.ts`) — lifted to `components/` because used by 2+ routes (agent + skill editors), per client-project-structure.
  - `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` (edit — add `{ key:'context', labelKey:'editor.tabs.context', icon:'FileText' }` to `TABS`)
  - `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx` (edit — render `ContextAttachTab` for the `context` tab)
  - the skill editor mount file(s) under `client/src/app/skills/_components/**` (edit — add a Context tab rendering the same component; implementer locates the skill editor tab host)
  - `client/messages/en/agents.json` (edit — add `editor.tabs.context`)
  - `client/messages/en/context-attach.json` (new — shared tab strings: order hint, filter, "N of M attached", `≈ {n} tokens`, the untrusted-block notice naming `## Project context`)
- **Depends on:** T1 (contracts), T5 (`lib/hooks/context.ts`)
- **Skills to invoke:** next-best-practices, react-best-practices, react-testing-library, client-project-structure, security, zod, typescript-expert
- **Steps:**
  1. Build `ContextAttachTab` mirroring `AgentEditor/_components/SkillsTab` (drag handle, checkbox,
     filename, repo-relative directory, root badge, Preview affordance — AC-7), ordered by stored
     order with unattached after attached. Accept an `owner` prop (`{ kind:'agent'|'skill', id }`) so
     it drives the right hook (`useAgentContext`/`useSkillContext` + set-mutation).
  2. "N of M attached" (AC-8); filter narrows visible rows only, leaving order/attached untouched
     (AC-9) — keep filtering display-only in `helpers.ts` (pure, unit-tested).
  3. **Live token estimate (AC-12/13):** sum `token_estimate` of the currently-attached docs from
     the already-fetched `useContextDocs` data — **no network/model call** — and render as
     `≈ {n} tokens`, never exact.
  4. **AC-28:** show a line stating the docs are injected as an **untrusted** block into every run of
     the agent, and any serialization preview names the heading `## Project context`.
  5. **Accessibility (AC / `client/INSIGHTS.md:46`):** drag handle + Preview + checkbox are separate
     focusable controls; the row is NOT one interactive container; checkbox carries an accessible
     name identifying its document; reorder reachable without a pointer.
  6. Save posts the full ordered `SetContextBody` (paths + attached, AC-10/11 UI side).
  7. **Tests (this Task's release gate — must be green; `fireEvent`, not `userEvent`; carries the
     removed test task's coverage):** `helpers.test.ts` (pure) — filter narrows without reordering
     (AC-9), token-sum arithmetic over attached docs (AC-12). `ContextAttachTab.test.tsx` (flow) —
     toggle + reorder + save calls the set-mutation with paths **in order** (AC-7/10); "N of M
     attached" updates (AC-8); token estimate updates on toggle **without a network call**, shown as
     `≈ N tokens` never exact (AC-12/13); the untrusted-block notice naming `## Project context` is
     present (AC-28); checkbox has an accessible name and the row does not nest interactives (AC /
     `client/INSIGHTS.md:46`).
- **Verify:** `cd client && pnpm exec vitest run src/components/context-attach/ContextAttachTab.test.tsx src/components/context-attach/helpers.test.ts`
- **Out of scope:** the discovery page (T5); backend; the run trace (T7). Do not delete the
  deliberately-unconsumed `context.json` editing keys.

### T7 — Run trace visibility (Prompt-assembly label + token volume)
- **Area:** Frontend
- **Satisfies:** AC-23, AC-24
- **Owns (files):**
  - `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx` (edit)
  - `client/messages/en/runs.json` (edit — `trace.prompt.specs` label wording + a token-volume label)
  - `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.test.tsx` (new/edit)
- **Depends on:** none (contracts already carry `specs`/`specs_read`); safe to run any time
- **Skills to invoke:** next-best-practices, react-best-practices, react-testing-library, client-project-structure, security, zod, typescript-expert
- **Steps:**
  1. AC-23: the existing specs `PromptBlock` (`TraceBody.tsx:85-87`) — relabel via `runs.json` to
     `Project context — attached specs (untrusted)`; it is already expandable + the drawer's Copy
     footer copies raw output. If per-block copy is required, confirm the `PromptBlock` API supports
     it before extending (do not touch sealed vendor).
  2. AC-24: near the specs block, show the token volume of `prompt_assembly.specs` — approximate,
     client-side (`≈ ceil(chars/4)`), labelled as an approximation (consistent with AC-13). No server
     round-trip.
  3. Test: given a trace with a non-null `prompt_assembly.specs` + non-empty `specs_read`, the
     Configuration "Specs read" row lists the paths (AC-22 already wired) and the Prompt-assembly
     section shows the relabelled block + a token figure; given empty, neither appears.
- **Verify:** `cd client && pnpm exec vitest run src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.test.tsx`
- **Out of scope:** touching `PromptBlock`/`vendor/ui` internals; backend token accounting.

## Execution order
Multi-agent, ~3 lanes. Every task's tests are owned by that task (no separate test-writer phase).
- **Phase 0 (parallel):** T1 (contracts), T2 (DB schema). No file overlap.
- **Phase 1:** T3 (needs T1 + T2). In parallel: **T5** (needs T1), **T7** (independent).
- **Phase 2:** T4 (needs T3). In parallel: **T6** (needs T1 + T5's `lib/hooks/context.ts`).
- Lanes: **Lane A (backend)** T1→T3→T4; **Lane B (client)** T5→T6; **Lane C** T2 (early) + T7 (any
  time). Each task is done only when its scoped `Verify` is green.

## End-to-end verification (after all tasks merge)
```
cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm typecheck
cd server && pnpm exec vitest run .it.test        # Docker: context + injection integration
cd client && pnpm test && pnpm typecheck
```
→ expect: all green, plus the observable proof — attach a `specs/*.md` stating an invariant to an
agent, run a review, and confirm (a) the run trace's `Specs read` row lists the doc, (b) Prompt
assembly shows the `Project context — attached specs (untrusted)` block containing the invariant
text, and (c) an agent with nothing attached produces a byte-identical prompt to before (AC-20/25).

## Planning notes
- **Insight candidate (root `INSIGHTS.md`, cross-cutting):** this feature is the fourth to hit the
  "contract already partly ships pre-vendored" pattern — but here the DTOs (`ContextDoc`,
  `ContextAttachment`) were genuinely absent while the *i18n namespace* (`context.json`) and the
  *engine seam* (`specs`) shipped ahead. The durable lesson: pre-seeded assets split across three
  layers (contracts / i18n / engine) can each independently be present-or-absent, so grep all three
  before scoping — the presence of one (i18n) does not imply the others. Flagged for the
  `engineering-insights` flow; not written here (outside this agent's write scope).
- **Two byte limits (crash-guard vs token-budget)** is the single most likely place an implementer
  will "helpfully" reuse `PLAN_SPEC_MAX_BYTES` and silently reintroduce truncation. It is called out
  in T3 Steps, Constraints, and the spec — worth a reviewer's explicit check.
```
