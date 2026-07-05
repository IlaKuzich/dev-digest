# Plan: Onboarding Generator (Onboarding Tour)

> Status: DRAFT
> Created: 2026-07-04
> Spec: specs/SPEC-2026-07-04-onboarding-generator.md
> Execution Mode: multi-agent (backend ∥ frontend)

## Requirements (VRF)
> Status: Confirmed (corrections folded in per pre-planning research — see Open Questions)

| ID | Requirement | Source |
|----|------------|--------|
| R1 | `POST /repos/:id/onboarding` collects deterministic facts, makes exactly one `llm.completeStructured` call for all 5 sections, applies the grounding-gate, returns `Onboarding{repoName, filesIndexed, generatedAt, sections{...}}` | SPEC AC-1 |
| R2 | Exactly one structured LLM call covers all 5 sections — never one call per section | SPEC AC-2 |
| R3 | WHILE `headSha` is unchanged since the cached generation, a repeat `POST` without `force` returns cache, 0 new LLM calls | SPEC AC-3 |
| R4 | WHEN `headSha` changed relative to the cached value, cache is invalidated and a new generation runs on next request | SPEC AC-4 |
| R5 | WHEN `POST ...?force=true`, a new LLM call runs and overwrites cache even if `headSha` is unchanged | SPEC AC-5 |
| R6 | `GET /repos/:id/onboarding` returns cached Onboarding, or 404 if none exists | SPEC AC-6 |
| R7 | `POST /repos/:id/onboarding` is rate-limited `{max:10, timeWindow:"1 minute"}`, mirroring `brief`'s exact config shape | SPEC AC-7 |
| R8 | After the structured call, `log.info` logs the LLM-reported cost in cents (`costUsd`) | SPEC AC-8 |
| R9 | WHILE a generation for a given `repoId` is in flight, an advisory lock keyed on `repoId` (mirroring `brief`'s `withAdvisoryLock` pattern) ensures a concurrent `POST` never triggers a second LLM call — both requests observe the same result | SPEC AC-31 |
| R10 | Any LLM-returned file/package/service reference not present in the known-facts set (real paths from rank/edges, package names from package.json, service names from docker-compose) is stripped by the grounding-gate before the response leaves the server | SPEC AC-9 |
| R11 | Critical Paths section admits only `kind:'file'` items; any `kind:'service'` item the LLM returns there is dropped | SPEC AC-10 |
| R12 | WHERE diagram candidate nodes exceed the 5-8 upper bound, the system deterministically keeps top-N by centrality and collapses the rest into exactly one generic overflow node — no LLM-driven clustering | SPEC AC-11 |
| R13 | Ranking is computed as `combinedRank = percentile × (1 + hotness)`, where `hotness` comes from `getCommitActivity(repo, paths, sinceDays)` computed **only** for the top-N percentile candidates (see Open Questions Q2 for how `percentile` substitutes for "pagerank" against the real repo-intel facade) | SPEC AC-12 |
| R14 | IF `getCommitActivity` errors or is rate-limited, THEN the system degrades to `hotness = 0` (pure percentile ranking) and does not fail the whole generation | SPEC AC-13 |
| R15 | WHEN any feature-model call (onboarding included — 6 call sites total) resolves a model and the workspace has no override in Settings → Feature Models, the system throws `ValidationError` (422) with message `"No model selected for {label} — choose one in Settings → Feature Models"` (label from `FEATURE_MODELS`) instead of silently falling back to a registry default | SPEC AC-14 |
| R16 | After the retrofit, `resolveFeatureModel`, `defaultFeatureModel`, and `DEFAULTS` no longer exist anywhere in `server/src` | SPEC AC-15 |
| R17 | WHERE lockfile / package.json scripts / docker-compose / orchestration scripts are available, How to Run Locally is built fully mechanically and works even with 0 LLM calls (degraded mode) | SPEC AC-16 |
| R18 | Guided Reading Path is derived from `repoIntel.getCriticalPaths(repoId)` (BFS by rank+edges from the top-ranked root, ~3 hops), each item with a one-line reason and a clickable link | SPEC AC-17 |
| R19 | First Tasks shows 2-3 items sourced only from real detected gaps (missing-test, missing-doc via `ContextService` doc-discovery, missing-pattern from a v1 3-item style-conditional checklist: health/readiness + rate-limiting for backend packages, error boundary/loading state for frontend packages); `suggestedPath` is a new, convention-derived location, never an existing file; ties are broken round-robin first by gap-type then by package | SPEC AC-18 |
| R20 | Complexity badge = deterministic base by gap-type (missing-doc→Low, missing-pattern→Low, missing-test→Medium), bumped one level when target fan-in is high; mapping is a TS constant in code, never DB/config | SPEC AC-19 |
| R21 | WHERE a repo has multiple packages (distinct `package.json` roles), Critical Paths (5-8) and First Tasks (2-3) reserve at least 1-2 slots per detected package before filling the rest by global rank | SPEC AC-20 |
| R22 | IF the repo index is degraded/failed, THEN the system uses the existing `IndexStatus`/`DegradedReason` contract and applies a per-section fallback: architecture → top-level dir listing only (no prose/diagram); criticalPaths/readingPath → rank data or entrypoint heuristic; howToRun → fully mechanical; firstTasks → skipped with an honest message | SPEC AC-21 |
| R23 | IF the structured LLM call fails after facts are collected, THEN the system returns a deterministic skeleton (all sections from facts, no prose/diagram/First Tasks, `narrativeUnavailable: true`, honest message) — never a 5xx for the whole page, and the cache is not written with a broken result; client offers Regenerate | SPEC AC-22 |
| R24 | Onboarding page header shows `Onboarding for {repo.name}`, subheader `Generated from index of N files · last refreshed X ago`, Regenerate and Share link buttons | SPEC AC-23 |
| R25 | Exactly 5 collapsible accordion sections render, each with its own icon, title, and a chevron (▲/▼) toggle in the header | SPEC AC-24 |
| R26 | Clicking a sticky scroll-spy "On this page" nav item scrolls to (`scrollIntoView`) and expands the target section if collapsed; the active marker is driven by `IntersectionObserver` | SPEC AC-25 |
| R27 | Clicking Open next to a file in Critical Paths / Reading Path opens the GitHub blob page in a new tab via `githubBlobUrl(repoFullName, repo.defaultBranch, file)` | SPEC AC-26 |
| R28 | The architecture diagram supports 3-level drill-down: (1) inline simplified `MermaidDiagram`; (2) click a top node → modal with a detailed file-level diagram for that node; (3) click the overflow node → modal with a scrollable list, each item opening its own detail view | SPEC AC-27 |
| R29 | Clicking the copy button next to a How to Run Locally command copies the command text to clipboard (mirrors `PromptBlock`'s pattern) | SPEC AC-28 |
| R30 | Clicking Regenerate sends `POST ...?force=true`; clicking Share link copies the internal page URL (`/repos/:id/onboarding`) to clipboard | SPEC AC-29 |
| R31 | The First Tasks card shows `title`, `suggestedPath`, a one-line grounded rationale, a `patternPointer` to a real sibling file, a complexity badge (Low/Medium/High), and a verification hint; the card itself is never clickable | SPEC AC-30 |

## Open Questions & Recommendations

| # | Question | Answer | Type |
|---|----------|--------|------|
| Q1 | Does the retrofit of the 5 existing `resolveFeatureModel` call sites reduce to a simple rename? | No. Verified `server/src/modules/settings/feature-models.ts:36-57`: `getFeatureModelOverride` already exists and returns `FeatureModelChoice \| undefined`; `resolveFeatureModel` (line 51) is a thin wrapper that adds `?? DEFAULTS[id]`. The retrofit must (a) add one new exported function, e.g. `resolveFeatureModelStrict(container, workspaceId, id): Promise<FeatureModelChoice>` that calls `getFeatureModelOverride` and throws `new ValidationError(\`No model selected for ${label} — choose one in Settings → Feature Models\`)` (label looked up from `FEATURE_MODELS`) when `undefined`, (b) swap all 6 call sites (5 existing + new onboarding) from `resolveFeatureModel` to this new function, (c) delete `resolveFeatureModel`, `defaultFeatureModel`, `DEFAULTS`. Confirmed via grep: exactly 5 call sites exist today — `brief/service.ts:62`, `conventions/service.ts:58`, `blast/service.ts:63` (reuses the `"review_intent"` id, not a blast-specific one), `reviews/intent-deriver.ts:51`, `reviews/run-executor.ts:264` (only inside the `if (agent.featureModelId)` branch — the no-override agent-default path is untouched, it's a different, legitimate mechanism). No other file imports `defaultFeatureModel`/`DEFAULTS`. `ValidationError` already exists at `server/src/platform/errors.ts:25-29` (422, code `validation_error`) — no new error class needed. | 🚩 red flag → resolved, folded into TASK-002 |
| Q2 | Since `repo-intel`'s public facade doesn't expose raw pagerank (only `getFileRank(repoId, paths): FileRankRow[]` = `{path, percentile}`, and `getTopFilesByRank` returns bare ordered `string[]` with no numeric field at all — confirmed in `server/src/modules/repo-intel/types.ts:119-122` and `service.ts:417-422,639-656`), how should `rank = pagerank × (1 + hotness)` actually be computed? | Substitute `percentile` (0-1, from `getFileRank`) for "pagerank" in the formula: `combinedRank = percentile × (1 + normalizedHotness)`. Concretely: (1) `getTopFilesByRank(repoId, N_CANDIDATES)` to get an over-fetched candidate pool (junk-filtered already), (2) `getFileRank(repoId, candidatePaths)` for percentiles, (3) `getCommitActivity(repo, candidatePaths, sinceDays=90)` for hotness on that same candidate pool only (satisfies AC-12's "top-N only"), (4) normalize hotness 0-1 across the candidate pool, (5) re-sort by `combinedRank` descending. This requires **no change to repo-intel's public API** (non-goal preserved) — onboarding only consumes `getFileRank`/`getTopFilesByRank`/`getCriticalPaths`, all already public. | 🚩 red flag → resolved, folded into TASK-001 |
| Q3 | Is `client/src/vendor/shared/` an alias/symlink to `server/src/vendor/shared/`, as `CLAUDE.md`'s package table implies ("— (alias only)")? | No — confirmed via `ls -la` (no `->` symlink marker) and `stat` (different inode numbers) that these are two **physically independent copies**. They are already drifted today: `contracts/brief.ts` happens to match byte-for-byte, but `adapters.ts` and `index.ts` do not (server's `adapters.ts` has extra fields/methods — `sessionId`, `'openrouter'` provider id, `CommitFile`/`CommitFilesPayload`, `commitFiles`/`findOpenPr`/`sync` — plus `.js`-suffixed relative imports client's copy lacks). Any new/changed Zod contract onboarding needs (see Q4) must be **written to both locations** as an explicit task step — one edit does not cover both. `CLAUDE.md`'s "(alias only)" description is inaccurate for the actual repo state; this plan does not fix that doc (out of scope), just accounts for it. | 🚩 red flag → resolved, folded into TASK-001 (backend task owns the client-side vendor sync step) |
| Q4 | 🆕 (found during verification, not flagged by the prior crashed planning pass) Does an `Onboarding` Zod contract already exist, and if so does its shape match the spec's data model? | Yes, and **no, it does not match**. `server/src/vendor/shared/contracts/knowledge.ts:32-51` already exports `Onboarding = { sections: OnboardingSection[] }` where `OnboardingSection = { kind: string, title: string, body: string, diagram?: string, links: OnboardingLink[] }` — a generic, untyped-per-kind shape matching the *existing* `server/src/prompts/onboarding.system.md`'s `{{sections}}`/generic-body-diagram-links prompt convention. The spec's data model requires a structurally different, richly-typed contract: `{repoName, filesIndexed, generatedAt, headSha, narrativeUnavailable?, sections: {architecture, criticalPaths, howToRun, readingPath, firstTasks}}` with typed sub-shapes (`ArchitectureSection` with `nodes`/`edges` graph objects, `CriticalPathItem`, `HowToRunSection`, `ReadingPathItem`, `FirstTask` with `gapType`/`complexity` enums). Per the user's "no dead fields when replacing" convention: **replace** `Onboarding`/`OnboardingSection`/`OnboardingLink` in-place with the new shape and delete the old one — do not leave the old generic types as unused dead exports. Nothing currently consumes them (`modules/onboarding/` doesn't exist yet, confirmed via `modules/index.ts`), so this is a clean replace, not a breaking change to a live consumer. **Implementer must grep-confirm zero other importers of `OnboardingSection`/`OnboardingLink` before deleting** (this research pass did not exhaustively check every file, only confirmed the module itself is unregistered). | 🚩 red flag → resolved, folded into TASK-001 |
| Q5 | Does `server/src/prompts/onboarding.system.md` need a full rewrite (per spec wording) or just interpolation wiring (per one research finding)? | Both, reconciled: the file is a **complete, well-formed prompt** (not an empty scaffold) with real content — grounding rules, an `<untrusted>` prompt-injection convention, mermaid formatting rules, i18n via `{{language}}`. These conventions should be **preserved**. But its `{{sections}}` placeholder assumes the *old* generic per-section `body`/`diagram`/`links` shape (Q4) — which is being replaced with 5 named, richly-typed sections. So the section-output instructions **do need rewriting** to describe the new schema (architecture nodes/edges, criticalPaths file+whyItMatters, howToRun commands/envVars, readingPath order+reason, firstTasks gapType/complexity/etc.), while the security/grounding/mermaid/formatting/localization conventions are kept as-is. | 💡 recommendation → resolved, folded into TASK-001 |
| Q6 | Should `OnboardingService` get a `platform/container.ts` getter (like `contextService`/`repoIntel`), or be instantiated directly per-request in `routes.ts` (like `BriefService`, which has no container getter at all)? | Add a lightweight getter, `get onboarding(): OnboardingService`, mirroring `contextService`'s lazy-init pattern (`this._onboarding ??= new OnboardingService(this)`) — satisfies the spec's explicit wording ("під'єднаний у `platform/container.ts` поруч із `get repoIntel()`") while still matching `BriefService`'s internal service logic (advisory lock, cache-then-generate). No other module currently needs cross-module access to it, but the getter costs nothing and keeps DI consistent with `repoIntel`/`contextService`. | 💡 recommendation → resolved, folded into TASK-001 |
| Q7 | Migration folder path — is it `drizzle/` (per top-level `CLAUDE.md` and `server/docs/architecture.md`) or something else? | Neither doc is accurate. Confirmed via `drizzle.config.ts:8-9`: `out: './src/db/migrations'`. Actual folder is `server/src/db/migrations/`, currently `0000_init.sql` … `0016_deep_big_bertha.sql` — next number is `0017_*.sql` (drizzle-kit auto-names it, e.g. `0017_<adjective>_<noun>.sql`; never hand-authored). This plan uses the real path throughout; fixing the stale docs is out of scope. | gap → resolved |

## Affected Modules

| Module | Path | Change Type |
|--------|------|-------------|
| backend: `onboarding` (new) | `server/src/modules/onboarding/` | Add |
| backend: module registry | `server/src/modules/index.ts` | Modify (register onboarding) |
| backend: DB schema | `server/src/db/schema/context.ts` | Modify (add `headSha` to `onboarding` table) |
| backend: migrations | `server/src/db/migrations/0017_*.sql` | Add (generated) |
| backend: GitHub adapter | `server/src/adapters/github/octokit.ts` | Modify (add `getCommitActivity`) |
| backend: test doubles | `server/src/adapters/mocks.ts` | Modify (add `getCommitActivity` to `MockGitHubClient`) |
| shared contracts | `server/src/vendor/shared/adapters.ts` | Modify (add `getCommitActivity` to `GitHubClient` interface) |
| shared contracts | `server/src/vendor/shared/contracts/knowledge.ts` | Modify (replace `Onboarding`/`OnboardingSection`/`OnboardingLink`) |
| shared contracts (client copy) | `client/src/vendor/shared/contracts/knowledge.ts` | Modify (sync — see Q3) |
| backend: prompt | `server/src/prompts/onboarding.system.md` | Modify (rewrite section-output instructions, keep conventions) |
| backend: DI | `server/src/platform/container.ts` | Modify (add `get onboarding()`) |
| backend: feature-models (cross-cutting) | `server/src/modules/settings/feature-models.ts` | Modify (strict resolver, delete dead code) |
| backend: brief (cross-cutting) | `server/src/modules/brief/service.ts` | Modify (swap resolver) |
| backend: conventions (cross-cutting) | `server/src/modules/conventions/service.ts` | Modify (swap resolver) |
| backend: blast (cross-cutting) | `server/src/modules/blast/service.ts` | Modify (swap resolver) |
| backend: reviews intent (cross-cutting) | `server/src/modules/reviews/intent-deriver.ts` | Modify (swap resolver) |
| backend: reviews run-executor (cross-cutting) | `server/src/modules/reviews/run-executor.ts` | Modify (swap resolver, conditional branch only) |
| frontend: onboarding page (new) | `client/src/app/repos/[repoId]/onboarding/` | Add |
| frontend: api/hooks | `client/src/lib/api.ts`, `client/src/lib/hooks/onboarding.ts` | Modify / Add |
| frontend: i18n | `client/messages/en/onboarding.json` (or added to existing namespace) | Add |

Not touched (confirmed via research): `server/docs/architecture.md`/`api-contracts.md` doc drift (pre-existing, out of scope to fully fix — see Risks), `repo-intel` public API (non-goal, preserved per Q2), `reviewer-core/` (unrelated pipeline).

## Tasks

### TASK-001: Backend — Onboarding module (routes, service, facts, hotness, grounding, prompt, migration, DI)

**Scope:** backend

**Owned Paths:**
- `server/src/modules/onboarding/routes.ts` (new)
- `server/src/modules/onboarding/service.ts` (new)
- `server/src/modules/onboarding/repository.ts` (new)
- `server/src/modules/onboarding/facts-collector.ts` (new)
- `server/src/modules/onboarding/grounding.ts` (new)
- `server/src/modules/onboarding/constants.ts` (new — complexity mapping, style-conditional checklist, diagram node caps)
- `server/src/modules/onboarding/*.test.ts` / `*.it.test.ts` (new)
- `server/src/modules/index.ts`
- `server/src/db/schema/context.ts`
- `server/src/db/migrations/0017_*.sql` (generated, not hand-written)
- `server/src/adapters/github/octokit.ts`
- `server/src/adapters/mocks.ts`
- `server/src/vendor/shared/adapters.ts`
- `server/src/vendor/shared/contracts/knowledge.ts`
- `client/src/vendor/shared/contracts/knowledge.ts` (sync step — see Q3, this task owns this path even though it's under `client/`, so the frontend task never touches vendor/shared)
- `server/src/prompts/onboarding.system.md`
- `server/src/platform/container.ts`
- `server/docs/api-contracts.md` (add an Onboarding section, following the existing table format — optional but low-cost)

**Current state (from research):**
- `server/src/modules/index.ts` already names `onboarding` in a roadmap comment (line 26: "brief/context/onboarding") but has no import/registry entry — mirror the `brief` import (line 13) and registry entry (line 42) exactly.
- `onboarding` table exists today at `server/src/db/schema/context.ts:120-126`: `{ repoId: uuid PK → repos.id, json: jsonb NOT NULL, generatedAt: timestamp NOT NULL default now() }`. No writing code exists anywhere (module unregistered), so adding `headSha: text('head_sha').notNull()` requires no backfill — table has zero rows in practice.
- `FeatureModelId "onboarding"` already exists in `server/src/vendor/shared/contracts/platform.ts:14-20,43-50` with `defaultProvider: "openrouter"`, `defaultModel: "deepseek/deepseek-v4-flash"` — no new registry entry needed, just call the new strict resolver (see TASK-002) with `"onboarding"`.
- `Onboarding`/`OnboardingSection`/`OnboardingLink` already exist in `server/src/vendor/shared/contracts/knowledge.ts:32-51` with an incompatible generic shape — see Q4. Must be replaced, not extended.
- `repo-intel`'s public facade (`server/src/modules/repo-intel/types.ts`, `service.ts`) exposes exactly: `getIndexState`, `getFileRank(repoId, paths): FileRankRow[]` (`{path, percentile}`), `getSymbolsInFiles`, `getCallerSignatures`, `getUnresolvedReferences`, `getConventionSamples`, `getTopFilesByRank(repoId, n, opts?): string[]` (junk-filtered, no numeric field), `getCriticalPaths(repoId): string[][]` (BFS chains, already rank-ordered internally). Raw pagerank is never exposed — see Q2's resolution.
- `GitHubClient` interface (`server/src/vendor/shared/adapters.ts:143-167`) has no `getCommitActivity` method. `OctokitGitHubClient` (`server/src/adapters/github/octokit.ts`) wraps every call in `withRetry(() => withTimeout(..., TIMEOUT))` — mirror this exactly for the new method, using `this.octokit.rest.repos.listCommits({owner, repo, path, since})` per candidate path (loop over `paths`, since GitHub's commits endpoint is single-path-scoped).
- `brief/repository.ts:40-52` has the exact advisory-lock pattern to mirror: `withAdvisoryLock<T>(db, key, fn)` using `db.transaction(tx => { tx.execute(sql\`SELECT pg_advisory_xact_lock(hashtext(${key}::text))\`); return fn(); })`. Do **not** import this from `brief/repository.ts` (cross-module repository import is an onion-architecture violation) — copy the ~12-line function into `onboarding/repository.ts` keyed on `repoId` instead of `prId`.
- `brief/routes.ts` (full file, 67 lines) is the exact route-shape template: one plugin function registering `POST /pulls/:id/brief` (with `config: { rateLimit: { max: 10, timeWindow: "1 minute" } }`, `querystring: z.object({ force: z.coerce.boolean().default(false) })`) and `GET /pulls/:id/brief` (cache-only, 404 via `NotFoundError`). Onboarding's routes mirror this exactly, swapping `/pulls/:id/brief` → `/repos/:id/onboarding` and `IdParams` still applies (repo id param).
- `brief/service.ts:32-258` is the exact service-shape template: constructor takes `Container`, `generate()` wraps its whole body in `withAdvisoryLock`, cache-check happens *inside* the lock, resolves the LLM, builds prompt sections, calls `completeStructured`, applies grounding, persists, returns. Onboarding's `OnboardingService.generate()` mirrors this control flow.
- `server/src/prompts/onboarding.system.md` (full 45-line content) already has grounding rules, `<untrusted>` convention, mermaid formatting rules, `{{language}}` — needs its section-output instructions rewritten for the new 5-named-section schema (see Q5), not a from-scratch rewrite of its security/formatting conventions.
- `ContextService.listDocsForRepo`/`listDocs` (`server/src/modules/context/service.ts`) is the existing doc-discovery mechanism to call for the "missing-doc" First Tasks detector (AC-18) — read-only reuse via `container.contextService`, no changes needed there.
- Services in this codebase take the **whole `Container`** as a single constructor arg (`new XService(this)`), not individually-injected ports — follow this exact pattern, not `architecture.md`'s stale individually-injected example.

**Required changes:**
1. **Shared contract** (`server/src/vendor/shared/contracts/knowledge.ts`): replace `Onboarding`/`OnboardingSection`/`OnboardingLink` with the spec's Data Model — `DiagramNode{id,label,kind:'file'|'package'|'service',isOverflow?,detail?}`, `DiagramEdge{from,to,label?}`, `ArchitectureSection{overview,style,nodes[],edges[]}`, `CriticalPathItem{file,whyItMatters,openUrl}`, `HowToRunSection{packageManager,commands[],envVars[],entrypoint}`, `ReadingPathItem{order,file,reason,openUrl}`, `FirstTask{title,suggestedPath,gapType:'missing-test'|'missing-doc'|'missing-pattern',rationale,patternPointer,complexity:'Low'|'Medium'|'High',verificationHint,packageId?}`, `Onboarding{repoName,filesIndexed,generatedAt,headSha,narrativeUnavailable?,sections:{architecture,criticalPaths:CriticalPathItem[],howToRun,readingPath:ReadingPathItem[],firstTasks:FirstTask[]}}`. Grep-confirm no other importer of the old `OnboardingSection`/`OnboardingLink` before deleting them (Q4).
2. Sync the same replacement into `client/src/vendor/shared/contracts/knowledge.ts` (Q3 — physically independent copy, no symlink).
3. **`server/src/vendor/shared/adapters.ts`**: add `getCommitActivity(repo: RepoRef, paths: string[], sinceDays: number): Promise<Record<string, number>>` (path → commit count in window) to the `GitHubClient` interface.
4. **`server/src/adapters/github/octokit.ts`**: implement `getCommitActivity`, looping `paths` and calling `this.octokit.rest.repos.listCommits({owner, repo, path, since: <ISO date sinceDays ago>, per_page: 100})`, counting results per path, wrapped in the same `withRetry(withTimeout(...))` style as every other method here. Must not throw on a per-path failure that should degrade rather than fail the whole batch — catch per-path and treat as 0, but the *whole method* can still surface a thrown error if e.g. auth fails entirely (AC-13's degrade-to-0 is the service layer's responsibility, not necessarily the adapter's — service must catch whatever this throws).
5. **`server/src/adapters/mocks.ts`**: add `getCommitActivity` to `MockGitHubClient`, configurable via a new `MockGitHubOptions.commitActivity?: Record<string, number>` field (defaults to `{}` or a small fixture), so unit tests can simulate both "has activity" and "throws" scenarios.
6. **DB schema** (`server/src/db/schema/context.ts:120-126`): add `headSha: text('head_sha').notNull()` to the `onboarding` table definition. Run `pnpm db:generate` → produces `server/src/db/migrations/0017_*.sql`; then `pnpm db:migrate`. No backfill needed (table has zero rows — module unregistered today).
7. **`server/src/modules/onboarding/repository.ts`** (new): `getCachedOnboarding(db, repoId)`, `upsertOnboarding(db, repoId, onboarding, headSha)` (mirrors `brief/repository.ts`'s cache read/write), and a copied (not imported) `withAdvisoryLock(db, repoId, fn)` keyed on `repoId`.
8. **`server/src/modules/onboarding/facts-collector.ts`** (new): pure deterministic functions — `detectPackageManager(clonePath)` (lockfile presence: `pnpm-lock.yaml`→pnpm, `yarn.lock`→yarn, `package-lock.json`→npm, `bun.lockb`→bun), `findPackageJsons(clonePath)` (root + each top-level dir, depth-0/1 scan — analogous style to `ContextService.collectRootMd`/`collectModuleRootMd`, but do not import from `context/service.ts`; this is a fresh, onboarding-local implementation per onion-architecture module independence), `parseDockerCompose(clonePath)` (top-level `services:` keys from `docker-compose.yml`/`.yaml`/`compose.yml` — pick a lightweight YAML parser dependency if none already exists in `server/package.json`, flag as an implementation-detail decision), `parseEnvExample(clonePath)` (var names only, never values, from `.env.example`), `findOrchestrationScripts(clonePath)` (`scripts/dev.sh`, `Makefile`, `justfile` presence).
9. **`server/src/modules/onboarding/grounding.ts`** (new): the grounding-gate — given the known-facts set (real paths from rank/edges, package names, docker-compose service names) and the raw LLM output, strip any file/package/service reference not in the known set (AC-9), enforce `criticalPaths` items are `kind:'file'` only (AC-10 — drop any `kind:'service'` the LLM may have placed there), and the diagram node-cap/overflow logic (AC-11 — deterministic top-N by `combinedRank`, collapse the rest into one `isOverflow: true` node, never LLM-driven).
10. **`server/src/modules/onboarding/constants.ts`** (new): complexity base-by-gap-type map (`missing-doc`→Low, `missing-pattern`→Low, `missing-test`→Medium, +1 level on high fan-in — AC-19), the v1 3-item style-conditional checklist (health/readiness + rate-limiting for backend-role packages, error boundary/loading-state for frontend-role packages — AC-18), diagram node cap bounds (5-8 + 1 overflow — AC-11).
11. **`server/src/modules/onboarding/service.ts`** (new) — `OnboardingService.generate(workspaceId, repoId, force, log)`:
    - Wrap the whole body in the copied `withAdvisoryLock(db, repoId, fn)` (AC-31).
    - Inside the lock: resolve repo, cache-check via `getCachedOnboarding` — if `!force && cached.headSha === repo.headSha` return cached (AC-3/AC-4).
    - Resolve model via the new strict resolver from TASK-002 with id `"onboarding"` (AC-14) — this task's code must call the NEW function directly, not the soon-to-be-deleted `resolveFeatureModel`, so TASK-001 has no ordering dependency on TASK-002's deletion step.
    - Collect facts (facts-collector) + rank/critical-paths/index-state (`container.repoIntel`) + hotness (`container.github().getCommitActivity(...)`, top-N candidates only per Q2's resolution, catch-and-degrade-to-0 per AC-13) + doc-discovery (`container.contextService`) for the missing-doc detector.
    - IF `getIndexState(repoId)` reports degraded/failed → apply the per-section fallback (AC-21) and skip the LLM call entirely for the affected sections (howToRun still runs mechanically).
    - Build the prompt payload (interpolate `{{sections}}`/`{{language}}` into the rewritten `onboarding.system.md`), call `llm.completeStructured` **exactly once** (AC-1/AC-2), catch failures → deterministic skeleton with `narrativeUnavailable: true`, do not write cache (AC-22).
    - On success: apply the grounding-gate (module 9 above), log `costUsd` in cents via `log.info` (AC-8), `upsertOnboarding` with the current `headSha`, return.
12. **`server/src/modules/onboarding/routes.ts`** (new): mirror `brief/routes.ts` exactly — `POST /repos/:id/onboarding` (rate-limited `{max:10,timeWindow:"1 minute"}`, `querystring: z.object({force: z.coerce.boolean().default(false)})`, catches `NotFoundError`→404 and `ValidationError`→422 explicitly, else 500) and `GET /repos/:id/onboarding` (cache-only, 404 via `NotFoundError` if absent).
13. **`server/src/platform/container.ts`**: add `private _onboarding?: OnboardingService;` + `get onboarding(): OnboardingService { return (this._onboarding ??= new OnboardingService(this)); }`, mirroring `contextService`'s exact lazy-init shape (Q6).
14. **`server/src/modules/index.ts`**: add `import onboarding from "./onboarding/routes.js";` and an `onboarding,` entry in the `modules` registry object, mirroring the `brief` import/entry.
15. **`server/src/prompts/onboarding.system.md`**: rewrite the section-output instructions to describe the 5 named, typed sections (architecture nodes/edges; criticalPaths file+whyItMatters+kind:'file' only; howToRun packageManager/commands/envVars/entrypoint; readingPath order+reason; firstTasks title/suggestedPath/gapType/rationale/patternPointer/complexity/verificationHint), while preserving the file's existing security (`<untrusted>`), grounding, mermaid-formatting, and `{{language}}` localization conventions verbatim (Q5).
16. **`server/docs/api-contracts.md`**: add an "Onboarding" section following the existing table format (this doc currently has no `brief` section either — pre-existing drift, out of scope to fully close, but don't compound it for the new module).

**Acceptance Criteria:**
- [ ] AC-001: `it` — `POST /repos/:id/onboarding` on a seeded repo returns 200 with all 5 sections; mock LLM adapter call counter = 1 (maps to R1, R2)
- [ ] AC-002: `it` — two sequential `POST`s with unchanged `headSha` → second call makes 0 LLM calls, returns identical cached result (maps to R3)
- [ ] AC-003: `it` — mutate `repo.headSha` between two `POST`s → second call makes a new LLM call (maps to R4)
- [ ] AC-004: `it` — two `POST ?force=true` calls → both make new LLM calls, cache overwritten each time (maps to R5)
- [ ] AC-005: `it` — `GET` before any generation → 404; `GET` after a successful `POST` → 200 with the cached body (maps to R6)
- [ ] AC-006: `it` — 11th `POST` within 1 minute on the same route → 429 (maps to R7)
- [ ] AC-007: `unit` — stub LLM returning a fixed `costUsd` → intercept `log.info` call and assert the logged message contains the cost in cents (maps to R8)
- [ ] AC-008: `it` — two concurrent `POST`s on the same `repoId` → LLM adapter call counter = 1 total, both requests resolve to the same result (maps to R9)
- [ ] AC-009: `unit` — stub LLM output containing a hallucinated file path / package name not in the known-facts set → absent from the returned `Onboarding` (maps to R10)
- [ ] AC-010: `unit` — stub LLM output placing a `kind:'service'` item in `criticalPaths` → dropped from the response (maps to R11)
- [ ] AC-011: `unit` — 12 candidate diagram nodes fed to the grounding-gate → result has ≤8 real nodes + exactly 1 `isOverflow: true` node (maps to R12)
- [ ] AC-012: `it` — stub `getCommitActivity` with varying activity across candidate paths → resulting rank order differs from pure-percentile order (maps to R13)
- [ ] AC-013: `unit` — stub `getCommitActivity` to throw → generation completes, ranking falls back to pure percentile (`hotness=0`), no exception propagates (maps to R14)
- [ ] AC-014: `unit` — facts-only `howToRun` built with 0 LLM calls → non-empty commands/envVars/entrypoint (maps to R17)
- [ ] AC-015: `unit` — stub `getCriticalPaths` chains → `readingPath` mirrors the traversal order with one-line reasons + links (maps to R18)
- [ ] AC-016: `unit` — repo fixture with a file missing a test → First Tasks includes a `missing-test` item with `suggestedPath` in a real test directory; a fixture with tied scores across two gap-types → final set includes both types (maps to R19)
- [ ] AC-017: `unit` — `missing-test` gap with high target fan-in → badge = `High`; mapping read from the `constants.ts` map (maps to R20)
- [ ] AC-018: `unit` — 3-package repo fixture → each package represented by ≥1 item in `criticalPaths` (maps to R21)
- [ ] AC-019: `it` — degraded index fixture → 200 with skeleton; `firstTasks` empty with an honest message, `howToRun` non-empty (maps to R22)
- [ ] AC-020: `unit` — stub LLM throws after facts collected → service returns a skeleton with `narrativeUnavailable: true`; cache is not written (assert `getCachedOnboarding` still returns the prior value or nothing) (maps to R23)

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001..AC-006, AC-008, AC-012, AC-019 | `cd server && pnpm exec vitest run src/modules/onboarding/onboarding.it.test.ts` (real Postgres via testcontainers) |
| AC-007, AC-009..AC-011, AC-013..AC-018, AC-020 | `cd server && pnpm exec vitest run src/modules/onboarding/service.test.ts src/modules/onboarding/grounding.test.ts` (hermetic, `MockLLMProvider`/`MockGitHubClient` from `adapters/mocks.ts`) |
| All | `cd server && pnpm typecheck` clean after the contract replacement |

---

### TASK-002: Backend (cross-cutting) — Feature-model strict resolution retrofit

**Scope:** backend

**Owned Paths:**
- `server/src/modules/settings/feature-models.ts`
- `server/src/modules/brief/service.ts`
- `server/src/modules/conventions/service.ts`
- `server/src/modules/blast/service.ts`
- `server/src/modules/reviews/intent-deriver.ts`
- `server/src/modules/reviews/run-executor.ts`
- Corresponding existing test files for the above 5 modules (update fixtures/expectations, no new test files required unless the implementer finds coverage gaps)

**Current state (from research — see Q1 for full detail):**
- `getFeatureModelOverride(container, workspaceId, id)` already exists (`feature-models.ts:36-47`) and is the correct building block — unchanged.
- `resolveFeatureModel` (`feature-models.ts:51-57`) = `getFeatureModelOverride(...) ?? DEFAULTS[id]` — the silent-fallback function being removed.
- `defaultFeatureModel` (`feature-models.ts:26-28`) and `DEFAULTS` (`feature-models.ts:21-23`) have zero external importers (confirmed via grep) — safe to delete alongside `resolveFeatureModel`.
- 5 call sites, each with slightly different surrounding error handling (see Q1 snippets):
  - `brief/service.ts:62` — wrapped in its own try/catch around `container.llm(provider)`, already rethrows a descriptive `Error`. Runs inside an HTTP route handler — a thrown `ValidationError` propagates naturally to `routes.ts`'s catch, which must add a `ValidationError` branch (currently only catches `NotFoundError`).
  - `conventions/service.ts:58` — no try/catch around the call at all today.
  - `blast/service.ts:63` — inside a try block, reuses `"review_intent"` as its feature-model id (not blast-specific — leave this id choice unchanged, only swap the function).
  - `reviews/intent-deriver.ts:51` — already degrades gracefully today (catches `container.llm()` failures and logs+skips via `runLog.info`, does not propagate). **Runs inside a background review pipeline, not a direct HTTP handler** — see Risks: extend its existing try/catch to also catch the new strict resolver's `ValidationError` and degrade the same way (skip intent derivation, log, continue), rather than letting it crash the whole review run.
  - `reviews/run-executor.ts:264` — **only** inside `if (agent.featureModelId) { ... }`; the no-override agent-default path (its own `provider`/`model` fields) is untouched. Same background-pipeline caveat as intent-deriver — confirm with the existing run-executor error-handling convention whether a thrown `ValidationError` here should abort just this agent's run or the whole batch, and catch accordingly.

**Required changes:**
1. In `feature-models.ts`: add `export async function resolveFeatureModelStrict(container: Container, workspaceId: string, id: FeatureModelId): Promise<FeatureModelChoice>` — calls `getFeatureModelOverride`, and if `undefined`, throws `new ValidationError(\`No model selected for ${FEATURE_MODELS.find(f => f.id === id)!.label} — choose one in Settings → Feature Models\`)` (import `ValidationError` from `../../platform/errors.js`). Delete `resolveFeatureModel`, `defaultFeatureModel`, `DEFAULTS` (AC-15).
2. Swap all 5 call sites from `resolveFeatureModel` → `resolveFeatureModelStrict`, updating imports accordingly.
3. `brief/routes.ts`: add a `ValidationError` catch branch (422) alongside the existing `NotFoundError` (404) branch, since `brief/service.ts` can now throw it.
4. `conventions/service.ts` and `blast/service.ts`: confirm their route handlers (routes.ts for each) similarly propagate a thrown `ValidationError` to a 422 response — add a catch branch if missing (these run inside HTTP handlers too, same shape as brief).
5. `reviews/intent-deriver.ts` and `reviews/run-executor.ts`: extend existing try/catch to catch `ValidationError` specifically and degrade (log + skip / abort just that agent) rather than let it bubble as an unhandled rejection into the review pipeline — this is a deliberate deviation from AC-14's literal "throw 422" for these two non-HTTP call sites, needed to preserve the pipeline's existing degrade-first philosophy; document the decision inline with a comment.
6. Update/extend each module's existing unit tests to assert: (a) no-override → the new error, not the old silent default; (b) `resolveFeatureModel`/`defaultFeatureModel`/`DEFAULTS` no longer appear anywhere in `server/src` (a grep-based test or manual verification step).

**Acceptance Criteria:**
- [ ] AC-021: `unit` — for a feature id with no workspace override, `resolveFeatureModelStrict` throws `ValidationError` (422) with the exact expected message (maps to R15)
- [ ] AC-022: `unit`/manual grep — none of the 6 call sites (5 existing + onboarding from TASK-001) call `resolveFeatureModel`; `server/src` contains zero references to `resolveFeatureModel`/`defaultFeatureModel`/`DEFAULTS` (maps to R15, R16)
- [ ] AC-023: `it` — `POST /pulls/:id/brief` (and the equivalent for conventions/blast) for a workspace with no override → 422 response with the expected error body (maps to R15)
- [ ] AC-024: `unit` — `intent-deriver`/`run-executor` with no override → the pipeline continues (does not crash the run), consistent with their existing graceful-degrade tests (maps to R15, documented deviation)

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-021 | `cd server && pnpm exec vitest run src/modules/settings/feature-models.test.ts` |
| AC-022 | `grep -rn "resolveFeatureModel\|defaultFeatureModel\|DEFAULTS" server/src` → no matches outside historical comments; `pnpm typecheck` green |
| AC-023 | `cd server && pnpm exec vitest run src/modules/brief/brief.it.test.ts src/modules/conventions/conventions.it.test.ts src/modules/blast/blast.it.test.ts` |
| AC-024 | `cd server && pnpm exec vitest run src/modules/reviews/intent-deriver.test.ts src/modules/reviews/run-executor.test.ts` |

---

### TASK-003: Frontend — Onboarding Tour page

**Scope:** frontend

**Owned Paths:**
- `client/src/app/repos/[repoId]/onboarding/page.tsx` (new)
- `client/src/app/repos/[repoId]/onboarding/_components/*.tsx` (new)
- `client/src/lib/api.ts` (modify — add onboarding fetch functions)
- `client/src/lib/hooks/onboarding.ts` (new)
- `client/messages/en/onboarding.json` (new, or a new namespace inside an existing shared messages file — implementer's choice, follow existing `next-intl` convention)
- `client/src/app/repos/[repoId]/onboarding/**/*.test.tsx` (new)

**Current state (from research):**
- `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/PriorPrsAccordion.tsx` — minimal accordion: `const [open, setOpen] = useState(false)`, plain `▲`/`▼` text glyphs, `<button onClick={() => setOpen(v => !v)}>`.
- `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx` — richer accordion: `defaultOpen` prop, `rootRef` for `scrollIntoView`, header is `<div role="button" tabIndex={0} onClick onKeyDown>` with `@devdigest/ui`'s `Icon.ChevronDown` rotated via CSS transition (`transform: open ? "rotate(180deg)" : "none"`). **This is the pattern to mirror for onboarding's 5 sections** (AC-24/AC-25 need scroll-to + expand, which `PriorPrsAccordion`'s simpler shape doesn't support).
- `client/src/components/mermaid-diagram/MermaidDiagram.tsx` — `"use client"`, props = `{ chart: string }` only, lazy `useEffect`-imports `mermaid`, validates via a keyword regex before `mermaid.parse(..., {suppressErrors:true})` then `mermaid.render(...)`, injects SVG via `ref.current.innerHTML`. Confirmed existing-but-unused elsewhere — trivial to invoke: `<MermaidDiagram chart={mermaidString} />`.
- `.../BlastRadiusCard/BlastGraphLightbox.tsx` — the modal shell to reuse: `createPortal(..., document.body)`, `fixed inset-0 z-50 bg-black/80 backdrop-blur-sm` overlay closing on click, inner panel `e.stopPropagation()`, ESC-key listener via `useEffect`. Props are `{ data, onClose }` (parent-controlled open state) — reuse this portal/overlay/ESC shell for the drill-down modals (AC-27), but do **not** reuse its `ResizeObserver`-driven D3 dimension logic (that's `BlastGraph.tsx`-specific).
- `.../BlastRadiusCard/BlastGraph.tsx` — confirmed D3 force-graph (`d3.forceSimulation`, drag/zoom). Confirmed **not** the diagram approach for onboarding — use `MermaidDiagram.tsx` instead, per spec non-goal.
- `.../RunTraceDrawer/_components/PromptBlock/PromptBlock.tsx` — copy pattern: `navigator.clipboard?.writeText(text)`, `copied` boolean flips an icon for 1200ms via `setTimeout`. Mirror this exactly for How to Run Locally's command copy buttons (AC-28) and the Share link button (AC-29).
- `client/src/lib/utils/githubUrls.ts:24-37` — `githubBlobUrl(repoFullName: string, sha: string, file: string, startLine?: number, endLine?: number): string`, builds `https://github.com/{owner}/{repo}/blob/{sha}/{file}#L{start}[-L{end}]`, percent-encodes path segments individually. Call as `githubBlobUrl(repo.full_name, repo.defaultBranch, file)` per AC-26 (no line numbers needed for Onboarding's Open buttons).
- `client/src/app/repos/[repoId]/` currently has `pulls/` and `project-context/` as sibling route directories — `onboarding/` is a new sibling.
- `client/src/lib/api.ts:108-118` + `client/src/lib/hooks/pulls.ts:73-100` — the exact fetch+hook pattern to mirror: `postPrBrief(prId, opts?: {force?: boolean})` builds the query string and calls `api.post`; `useBrief`/`useRegenerateBrief` use TanStack Query with key `["brief", prId]`, `enabled: prId != null`, a 404-aware `retry` function, and an optimistic `setQueryData` + `invalidateQueries` pattern on the regenerate mutation.

**Required changes:**
1. `client/src/lib/api.ts`: add `postOnboarding(repoId: string, opts?: {force?: boolean}): Promise<Onboarding>` and `getOnboarding(repoId: string): Promise<Onboarding>`, mirroring `postPrBrief`'s URL-building/force-query-param shape exactly. Import `Onboarding` type from `@devdigest/shared`.
2. `client/src/lib/hooks/onboarding.ts` (new): `useOnboarding(repoId)` (query key `["onboarding", repoId]`, `enabled: repoId != null`, 404-aware retry mirroring `useBrief`) and `useRegenerateOnboarding(repoId)` (mutation calling `postOnboarding(repoId, {force:true})`, optimistic `setQueryData` + `invalidateQueries` mirroring `useRegenerateBrief`).
3. `client/src/app/repos/[repoId]/onboarding/page.tsx` (new): Server Component shell fetching repo metadata, delegating data-fetching for Onboarding itself to a Client Component that uses `useOnboarding` (per this repo's Server-by-default / push-"use client"-deep convention).
4. `_components/OnboardingHeader.tsx`: title `Onboarding for {repo.name}` (blue monospace per AC-23), subtitle `Generated from index of {filesIndexed} files · last refreshed {relative time}`, Regenerate button (calls `useRegenerateOnboarding`), Share link button (copies `/repos/{repoId}/onboarding` via the `PromptBlock`-style clipboard pattern).
5. `_components/AccordionSection.tsx`: generic wrapper mirroring `ReviewRunAccordion.tsx`'s shape (`open`/`setOpen` state, `role="button"` header, `Icon.ChevronDown` rotation, `rootRef` for `scrollIntoView`, accepts a `targetNonce`-style prop so the scroll-spy nav can force-expand+scroll a specific section) — used by all 5 sections (Architecture, Critical Paths, How to Run, Reading Path, First Tasks), each with its own icon (AC-24).
6. `_components/ScrollSpyNav.tsx`: sticky "On this page" list; `IntersectionObserver` watches each section's root element to set the active marker; clicking an item calls the target `AccordionSection`'s expand-and-`scrollIntoView` (AC-25).
7. `_components/ArchitectureSection.tsx`: renders `overview` prose + inline `<MermaidDiagram chart={...} />`; clicking a top (non-overflow) node opens a drill-down modal (reusing `BlastGraphLightbox.tsx`'s portal/overlay/ESC shell, not its D3/ResizeObserver logic) showing that node's `detail` as another `MermaidDiagram`; clicking the overflow node opens a different modal — a scrollable list where each item opens its own detail view (AC-27, 3 levels).
8. `_components/CriticalPathsSection.tsx` / `ReadingPathSection.tsx`: list items with `whyItMatters`/`reason` one-liners and an Open button using `githubBlobUrl(repo.full_name, repo.defaultBranch, file)`, `target="_blank"` (AC-26).
9. `_components/HowToRunSection.tsx`: renders `packageManager`, ordered `commands[]` each with a `PromptBlock`-pattern copy button, `envVars[]` names only, `entrypoint` (AC-28).
10. `_components/FirstTasksSection.tsx`: non-clickable cards showing `title`, `suggestedPath`, `rationale`, `patternPointer`, a complexity badge (Low/Medium/High — reuse an existing badge/chip component if one exists, e.g. check `@devdigest/ui`'s `Badge`), `verificationHint` (AC-30 — explicitly no `onClick`/`href`).
11. i18n: every string above through `useTranslations()` from a new `onboarding` namespace in `client/messages/en/onboarding.json` — no hardcoded strings in JSX, per `client/CLAUDE.md`.
12. Loading/error states: a loading indicator consistent with existing repo-card patterns while `useOnboarding` is pending; on a `GET` 5xx (not generation-time), an error message with a Regenerate affordance (spec's edge cases, not a numbered AC but stated as a `shall`).

**Acceptance Criteria:**
- [ ] AC-025: `component` (RTL) — mock `Onboarding` fixture → header shows `repo.name`, subtitle shows `filesIndexed`, both Regenerate and Share link buttons render (maps to R24)
- [ ] AC-026: `component` — exactly 5 `AccordionSection`s render; clicking a header toggles its expanded state (maps to R25)
- [ ] AC-027: `E2E` — clicking a scroll-spy nav item for a collapsed section scrolls it into view and expands it; active marker updates on manual scroll (maps to R26)
- [ ] AC-028: `component` — clicking Open on a Critical Paths / Reading Path item → resulting `<a>` has `href = githubBlobUrl(...)` and `target="_blank"`, using `repo.defaultBranch` as the sha (maps to R27)
- [ ] AC-029: `component` — clicking a top diagram node opens a modal containing a `MermaidDiagram`; clicking the overflow node opens a modal containing a scrollable list (maps to R28)
- [ ] AC-030: `component` — clicking a How to Run command's copy button → clipboard mock receives the command text (maps to R29)
- [ ] AC-031: `component` — clicking Regenerate triggers a `force=true` request; clicking Share link → clipboard mock receives the internal route string (maps to R30)
- [ ] AC-032: `component` — mock First Task → all fields (`title`, `suggestedPath`, rationale, `patternPointer`, complexity badge, `verificationHint`) render; no `onClick`/`href` present on the card (maps to R31)

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-025, AC-026, AC-028..AC-032 | `cd client && pnpm test -- onboarding` (RTL component tests colocated under `_components/`) |
| AC-027 | `./scripts/e2e.sh` — new onboarding scroll-spy flow |
| All | `cd client && pnpm typecheck` clean against the replaced `Onboarding` contract |

## Implementation Phases

> ⚙️ Execution mode: **multi-agent** — TASK-001 + TASK-002 (one backend implementer instance, run sequentially or in either order — no shared owned paths) ∥ TASK-003 (one frontend implementer instance). The frontend instance depends on TASK-001's shared-contract replacement (`Onboarding` type in `client/src/vendor/shared/contracts/knowledge.ts`) landing before its own typecheck will pass — coordinate so TASK-001's contract step (Required change #1/#2) lands first, or the frontend instance stubs the type locally until it does.

### Phase 1: DB / Schema
- [ ] `server/src/db/schema/context.ts` — add `headSha` (NOT NULL, no backfill) to the `onboarding` table
- [ ] `cd server && pnpm db:generate` → produces `server/src/db/migrations/0017_*.sql`
- [ ] `cd server && pnpm db:migrate`

### Phase 2: Backend — shared contracts + adapter (TASK-001, do first — unblocks frontend typecheck)
- [ ] `server/src/vendor/shared/contracts/knowledge.ts` — replace `Onboarding`/`OnboardingSection`/`OnboardingLink`
- [ ] `client/src/vendor/shared/contracts/knowledge.ts` — sync the same replacement
- [ ] `server/src/vendor/shared/adapters.ts` — add `getCommitActivity` to `GitHubClient`
- [ ] `server/src/adapters/github/octokit.ts` — implement `getCommitActivity`
- [ ] `server/src/adapters/mocks.ts` — add `getCommitActivity` to `MockGitHubClient`

### Phase 3: Backend — onboarding module (TASK-001)
- [ ] `server/src/modules/onboarding/facts-collector.ts`, `grounding.ts`, `constants.ts`, `repository.ts`, `service.ts`, `routes.ts`
- [ ] `server/src/prompts/onboarding.system.md` — rewrite section-output instructions
- [ ] `server/src/platform/container.ts` — `get onboarding()`
- [ ] `server/src/modules/index.ts` — register the module
- [ ] `server/docs/api-contracts.md` — add Onboarding section

### Phase 4: Backend — feature-model retrofit (TASK-002)
- [ ] `server/src/modules/settings/feature-models.ts` — add `resolveFeatureModelStrict`, delete `resolveFeatureModel`/`defaultFeatureModel`/`DEFAULTS`
- [ ] `server/src/modules/brief/service.ts`, `routes.ts` — swap + 422 catch branch
- [ ] `server/src/modules/conventions/service.ts` (+ routes) — swap + 422 catch branch
- [ ] `server/src/modules/blast/service.ts` (+ routes) — swap + 422 catch branch
- [ ] `server/src/modules/reviews/intent-deriver.ts` — swap + degrade-catch
- [ ] `server/src/modules/reviews/run-executor.ts` — swap (conditional branch only) + degrade-catch

### Phase 5: Frontend (TASK-003)
- [ ] `client/src/lib/api.ts`, `client/src/lib/hooks/onboarding.ts`
- [ ] `client/src/app/repos/[repoId]/onboarding/page.tsx` + `_components/*`
- [ ] `client/messages/en/onboarding.json`

### Phase 6: Tests
- [ ] `server/src/modules/onboarding/service.test.ts`, `grounding.test.ts`, `onboarding.it.test.ts`
- [ ] `server/src/modules/settings/feature-models.test.ts` + updated tests in brief/conventions/blast/reviews
- [ ] `client/src/app/repos/[repoId]/onboarding/**/*.test.tsx`
- [ ] `./scripts/e2e.sh` scroll-spy flow

### Phase 7: Full verification
- [ ] `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` — hermetic suite green
- [ ] `cd server && pnpm exec vitest run .it.test` — integration suite green (Postgres)
- [ ] `cd server && pnpm typecheck`
- [ ] `cd client && pnpm test && pnpm typecheck`
- [ ] Real prompt run: confirm exactly one LLM call per generation, cost logged in cents (process-level acceptance criteria from the spec, not an EARS AC)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `resolveFeatureModelStrict` throwing inside `intent-deriver.ts`/`run-executor.ts` (background pipeline call sites, not HTTP handlers) could crash an entire review run instead of degrading gracefully, unlike brief/conventions/blast where a 422 naturally reaches the client | TASK-002 explicitly extends each site's *existing* try/catch to also catch `ValidationError` and degrade (skip/log) — documented as a deliberate deviation from AC-14's literal "throw" wording, consistent with these two modules' existing degrade-first philosophy |
| The `Onboarding`/`OnboardingSection`/`OnboardingLink` contract replacement (Q4) could silently break an unknown consumer if grep isn't exhaustive | Implementer must grep-confirm zero other importers before deleting; `modules/onboarding/` is unregistered today so no live route depends on the old shape |
| `client/src/vendor/shared/` and `server/src/vendor/shared/` are independently duplicated and already drifted (confirmed on `adapters.ts`/`index.ts`) — easy to edit only one side and get a silent client/server type mismatch that only surfaces at `pnpm typecheck` time, or not at all if the field is optional | Task-001 explicitly owns and lists the client-side sync step; Phase 2 orders the contract change before any frontend work starts so `pnpm typecheck` in `client/` catches drift immediately |
| `getCommitActivity`'s GitHub API calls (per-path `listCommits`) could be slow/rate-limited on repos with many top-N candidates | Explicitly scoped to top-N percentile candidates only (never the whole repo), and AC-13 requires a hard degrade-to-0 path so a rate-limit never fails the whole generation |
| No existing YAML-parsing dependency confirmed for `docker-compose.yml` facts-collection | Flagged as an implementation-detail decision in TASK-001 step 8 — implementer picks a lightweight, already-common YAML lib and adds it as a `server/package.json` dependency if none exists |
| Migrations folder path is documented incorrectly in both `CLAUDE.md` and `server/docs/architecture.md` (both say `drizzle/`; actual path per `drizzle.config.ts` is `server/src/db/migrations/`) | This plan uses the verified real path throughout; fixing the stale docs is out of scope but flagged here so implementers don't get misdirected by the doc |
| `server/docs/api-contracts.md` has no section for `brief`/`conventions`/`blast`/`context` either — pre-existing doc drift, not onboarding-specific | TASK-001 adds only the Onboarding section (low-cost, keeps this plan from silently worsening an already-known gap); fully closing the pre-existing gap is out of scope |

## Out of Scope

- Non-JS/TS repo support for import-graph sections (existing dependency-cruiser limitation — degraded skeleton is the accepted path)
- Rewriting the indexing/shallow-clone pipeline — hotness only calls GitHub API for top-N, never touches indexing
- Read-progress tracking ("mark as read") in Guided Reading Path
- Clickable First Tasks cards (no navigation target for a not-yet-created file)
- D3 force-graph (`BlastGraph.tsx`) reuse for the architecture diagram
- A new cache table or a new `FeatureModelId` registry entry — both already exist in scaffold
- Storing complexity-mapping / gap-detectors in Postgres or a config file — TS constants only
- Fully closing the pre-existing `server/docs/api-contracts.md` doc-drift for `brief`/`conventions`/`blast`/`context` (only the new Onboarding section is added)
- Fixing `CLAUDE.md`/`architecture.md`'s stale "drizzle/" migration-path wording
- Accessibility (A11y) — out of scope for this project per prior confirmed preference; scroll-spy `IntersectionObserver` is a functional UX requirement, not an A11y one

## Architecture Notes

- **Onion layering for the new module:** `onboarding/routes.ts` (presentation) → `onboarding/service.ts` (application/orchestration, no direct SQL, no adapter instantiation) → `onboarding/repository.ts` (infrastructure, Drizzle queries + the copied advisory-lock helper). `facts-collector.ts`/`grounding.ts`/`constants.ts` are pure-function helpers the service calls — no Fastify, no Drizzle imports in any of them.
- **Container injection:** every service in this codebase takes the whole `Container` as a single constructor argument (`new OnboardingService(this)`), never individually-injected ports — follow the *actual* current pattern (confirmed in `contextService`/`repoIntel`/`BriefService`), not `server/docs/architecture.md`'s stale individually-injected example.
- **Cross-module reuse rule:** `onboarding/repository.ts` copies (does not import) `brief/repository.ts`'s `withAdvisoryLock` shape — importing a sibling module's `repository.ts` directly would violate module independence ("new feature = new module, no existing code touched"). The ~12-line duplication is the correct cost here, not a shared platform utility extraction (that would be a separate, unrequested refactor).
- **Repo-intel facade boundary:** `onboarding/service.ts` only calls `repoIntel`'s already-public methods (`getFileRank`, `getTopFilesByRank`, `getCriticalPaths`, `getIndexState`) — no new repo-intel method, no raw-pagerank exposure, per the spec's explicit non-goal. The hotness formula's "pagerank" term is satisfied by `percentile` (Q2).
- **Grounding gate is a second, independent barrier** on top of the prompt's own `<untrusted>` convention (defense in depth) — even if untrusted repo text (README/CLAUDE.md prose, package.json content) manipulates the LLM into inventing paths/packages/services, `grounding.ts` strips anything not in the deterministic known-facts set before the response ever leaves the server.
- **Two independent `@devdigest/shared` copies:** every future contract change to files touched by this plan (`knowledge.ts`, `adapters.ts`) must be applied to both `server/src/vendor/shared/` and `client/src/vendor/shared/` — there is no build step or symlink that propagates one to the other today (Q3). This plan explicitly assigns that sync step to the backend task so the frontend task's owned paths stay clean of vendor/shared edits.
