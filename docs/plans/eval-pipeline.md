# Implementation Plan — Eval Pipeline (deterministic eval harness)

## Context & goal
DevDigest lets users tune reviewer **agents** (system prompt, skills, model) and already snapshots
every config change into `agent_versions`, but there is no way to tell whether an edit made an agent
better or worse. This feature turns on the pre-seeded eval substrate: one-click capture of a real
finding into a frozen eval case, a per-agent Evals tab, a standalone cross-agent Eval Dashboard, a
per-agent detail with trend/compare/promote, and a **100% deterministic** scoring engine (zero LLM in
the scoring path) that reuses the existing `reviewPullRequest` engine seam and the `groundFindings`
citation gate. Traced entirely to spec `specs/eval-pipeline.md` (Spec ID `eval-pipeline`, Status: approved).

## Requirements source
- Spec: `specs/eval-pipeline.md` — Spec ID: `eval-pipeline` · Status: **approved** (cross-module).
- Design assets: `specs/assets/eval-pipeline/01..06` (six screenshots) — all present on disk, verified.
- Questions answered by the requester: see **Requirements review** in the report; two items flagged
  (AC-7 button positioning; do-not-touch vs AC-43 `eval_runs` FK column) — resolved with defaults noted
  below, awaiting confirmation but **not blocking** (approved spec, unambiguous intent).

## Criteria coverage
| AC | Task | Notes |
|---|---|---|
| AC-1 | T4 | capture endpoint sets owner_kind='agent', owner_id=review.agent_id |
| AC-2 | T4 | freeze input_diff = diff of finding.file only, at creation |
| AC-3 | T4 | accepted → expected_output = [finding subset] (must_find) |
| AC-4 | T4 | dismissed → expected_output = [] (must_not_flag) |
| AC-5 | T4, T5 | toast + no change to accept/dismiss state (T5 renders toast) |
| AC-6 | T4 | reject when review has no agent_id |
| AC-7 | T5 | button between Learn/Reply per screenshot 01; disabled until accepted/dismissed |
| AC-8 | T4, T6 | tab tiles from AgentEvalDashboard.current |
| AC-9 | T6 | case list: name, glyph, "expected N got M", severity·category / empty [] tag |
| AC-10 | T6 | "P / T passing" pill |
| AC-11 | T4, T6 | Run all evals → batch run + refresh |
| AC-12 | T4, T6 | per-case Run (▷) |
| AC-13 | T6 | case editor modal (Name / Input tabs / Expected JSON) |
| AC-14 | T6 | valid/invalid JSON indicator + block Save |
| AC-15 | T6 | Finding skeleton inserts template |
| AC-16 | T4, T6 | Run on save → run after persist + result strip |
| AC-17 | T6 | "never run" neutral glyph |
| AC-18 | T4, T7 | dashboard home per-agent rows |
| AC-19 | T4, T7 | recent runs · all agents table (batch rows) |
| AC-20 | T4, T7 | Run all agents |
| AC-21 | T7 | row → agent detail navigation |
| AC-22 | T1 | nav entry (SKILLS LAB); activeKeyFor("eval") already present, NOT duplicated |
| AC-23 | T4, T7 | metric cards + mini trend + Metric trend chart |
| AC-24 | T2, T4, T7 | Recent runs table reads eval_batches aggregate rows |
| AC-25 | T3, T4, T7 | degradation banner (≥2pp precision or recall drop) |
| AC-26 | T7 | Compare enabled at exactly 2 selected |
| AC-27 | T4, T7 | compare deltas + prompt diff |
| AC-28 | T4, T7 | prompt diff from recorded AgentVersionConfig snapshots |
| AC-29 | T4 | Promote = forward-only re-apply → new highest version |
| AC-30 | T4, T6, T7 | new active version reflected everywhere |
| AC-31 | T4 | promote non-existent version → error |
| AC-32 | T4 | execute via parseUnifiedDiff + reviewPullRequest (same engine path) |
| AC-33 | T3 | file+line-overlap only; zero LLM; no free-text compare |
| AC-34 | T3 | overlap predicate `max(0,min(endA,endB)-max(startA,startB)+1)>0` |
| AC-35 | T3 | one-to-one assignment |
| AC-36 | T3 | recall=TP/(TP+FN), precision=TP/(TP+FP) |
| AC-37 | T3, T4 | citation_accuracy from grounding survivors; 1.0 when zero produced |
| AC-38 | T3 | must_not_flag: recall term omitted, precision 1.0 when none produced |
| AC-39 | T3 | case-type-aware pass (must_find FN=0; must_not_flag FP=0) |
| AC-40 | T3 | micro-average aggregate with zero-division convention |
| AC-41 | T2, T4 | batch records agent_version; per-case rows link to batch |
| AC-42 | T4 | per-case LLM failure isolated; set continues |
| AC-43 | T2 | new eval_batches table + batch_id on eval_runs (new file + new migration) |
| AC-44 | T1 | eval-ci.ts byte-identical across vendor copies; drift reconciled |
| AC-45 | T1 | reuse eval.json namespace; add nav + SHORTCUTS |
| AC-46 | T4 | onion module + DI container getter + single registration |
| AC-47 | TT1 | old vs new prompt → metrics differ (sensitivity) |
| AC-48 | TT1 | corrupted over-flagging prompt → precision drop + banner |

## Execution mode
**Multi-agent (N parallel implementers)**, partitioned by disjoint file ownership, in three
dependency waves plus a test-writer phase. Chosen by the requester; the planner concurs — the work
spans server + client + shared contracts with clean seams and genuine parallelism in Wave 1 (4 tasks).
reviewer-core needs **zero** changes (reused as a library only), so it is not a task.

## Constraints from INSIGHTS & CLAUDE.md
- **Dual-vendor contract sync is manual and byte-for-byte.** Every edit to a `contracts/*.ts` lands in
  BOTH `server/src/vendor/shared/` and `client/src/vendor/shared/` in the same task — source: root
  INSIGHTS.md:26, AC-44. `diff` the two copies before editing — a type can be one-sided (INSIGHTS.md:29).
- **Confirmed drift to reconcile (AC-44):** `client/src/vendor/shared/contracts/eval-ci.ts` is missing the
  `AgentManifest` block, imports only `EvalRun, EvalOwnerKind, Conformance` (server also imports
  `Provider, CiFailOn`), and its `ConformanceInput.provider` enum is `['openai','anthropic']` vs server's
  `['openai','anthropic','openrouter']` (client eval-ci.ts:220). `knowledge.ts` copies BOTH already contain
  `AgentVersionConfig`/`AgentVersion` (client knowledge.ts:301) — verify parity, reconcile only if `diff` shows drift.
- **Pre-seeded assets are the design's standing signal.** `client/messages/en/eval.json` already ships
  `dashboard`/`caseEditor`/`evalsTab`/`page` sections — reuse them; add only missing keys (root INSIGHTS.md:27).
  `activeKeyFor` already returns `"eval"` for `/eval*` (client app-shell/helpers.ts:35) — do NOT duplicate it
  (client INSIGHTS.md:54).
- **Do-not-touch schema rule vs AC-43:** never edit an existing migration; new tables go in a new schema
  file (server INSIGHTS.md:54, e.g. `schema/project-context.ts`). AC-43 requires a `batch_id` FK column ON
  the existing `eval_runs` table — the schema barrel explicitly sanctions "extend with their own new
  columns/tables via their own migrations" (schema.ts:9-11). Resolution: put `eval_batches` in a NEW file
  `schema/eval-batches.ts`; add the one `batchId` column to `schema/eval.ts` in the SAME migration task
  (T2 solely owns both files → no collision). See Requirements review, GAP-2.
- **Migrations are explicit + journal-driven.** After `pnpm db:generate`, READ the generated `.sql` before
  committing — a prior hand-authored migration can make a later generated one phantom-redundant (server
  INSIGHTS.md:59). `pnpm db:generate` writes the `meta/_journal.json` + snapshot; never hand-edit them.
- **IDOR for child tables.** `eval_runs` has no `workspace_id`; a query filtering by `case_id`/`batch_id`
  alone is NOT tenant-scoped (server INSIGHTS.md:46). Every eval read reachable from a route joins to the
  owning `agents`/`eval_cases` row and filters `workspace_id`. `eval_batches` (new) carries `workspace_id`
  directly so batch reads scope without a join.
- **Services receive the DI Container; never `new` an adapter.** Routes declare Zod params/body. The eval
  module registers once in `modules/index.ts` and gets a lazy getter in `platform/container.ts`
  (server CLAUDE.md, AC-46).
- **reviewer-core stays pure and is consumed as source.** Do NOT modify it. `reviewPullRequest`,
  `groundFindings`, and (via server) `parseUnifiedDiff` already exist and are the only seams used
  (reviewer-core/src/review/run.ts, src/grounding.ts, exported from src/index.ts).
- **Client hooks + fetch.** All server state through TanStack Query hooks in `src/lib/hooks/*`; never
  `fetch` from a component (client CLAUDE.md). `@testing-library/user-event` is NOT installed — use
  `fireEvent` from `@testing-library/react` (client INSIGHTS.md:19,48).
- **Money/precision:** the existing `eval_runs.cost_usd` / new `eval_batches.cost_usd` are `doublePrecision`
  (0..1 metric-style, not a financial ledger) — keep them as `doublePrecision`, matching the existing
  `eval_cases`/`eval_runs` file; the `NUMERIC(12,6)` rule (server INSIGHTS.md:35) applies to `agent_runs`, not here.
- **Tokenizer worst-case:** the eval executor calls `reviewPullRequest` on a frozen diff; if any pre-flight
  token counting is added, guard the `TiktokenTokenizer` worst case (server INSIGHTS.md:22-23). Default: do
  NOT add a pre-flight token check in the eval path (out of scope) — the engine handles the model call.

## Architecture sketch
```mermaid
flowchart TD
  subgraph client [client/ — Wave 1]
    FC[FindingCard + FindingsPanel<br/>Turn into eval case · T5]
    ET[AgentEditor Evals tab +<br/>Case editor modal · T6]
    DH[/eval dashboard home +<br/>agent detail · T7/]
    HC[lib/hooks: eval-capture.ts,<br/>eval-cases.ts, eval.ts]
  end
  subgraph shared [vendored contracts + i18n + nav — Wave 0]
    C[eval-ci.ts / knowledge.ts<br/>both copies · nav.ts · eval.json · T1]
  end
  subgraph server [server/ — Wave 1/2]
    SC[scoring.ts — pure<br/>match/recall/precision/aggregate/alert · T3]
    EM[modules/eval routes/service/repository<br/>+ DI + registration · T4]
    RC[[@devdigest/reviewer-core<br/>reviewPullRequest + groundFindings<br/>UNCHANGED]]
  end
  subgraph db [Postgres — Wave 0]
    T[eval_cases · eval_runs +batch_id · eval_batches · T2]
  end
  FC --> HC --> C
  ET --> HC
  DH --> HC
  EM --> C
  EM --> SC
  EM --> RC
  EM --> T
  SC --> C
```

## Shared contracts (define FIRST, before parallel work — all in T1, both vendor copies byte-identical)
All ADDITIVE to `contracts/eval-ci.ts` (re-exported by the existing `vendor/shared/index.ts` `export *`).
Field names below are the contract; T2's `eval_batches` columns MUST match them (snake_case ⇄ camelCase row).
- **`EvalBatchRun`** — one `eval_batches` row: `{ id, agent_id, agent_name (nullish), agent_version:int,
  ran_at, recall:number|null, precision:number|null, citation_accuracy:number|null, traces_passed:int,
  traces_total:int, cost_usd:number|null }`. (AC-24, AC-19)
- **`EvalBatchResult`** — `POST /agents/:id/eval-runs` response: `{ batch: EvalBatchRun, results: EvalRunResult[] }`.
- **`AgentEvalSummary`** — dashboard-home per-agent row: `{ agent_id, agent_name, provider: Provider,
  model, last_version:int|null, last_ran_at:string|null, traces_passed:int, traces_total:int,
  recall:number|null, precision:number|null, citation_accuracy:number|null, sparkline: number[] }`. (AC-18)
- **`EvalDashboardHome`** — `GET /eval-dashboard`: `{ agents: AgentEvalSummary[], recent_runs: EvalBatchRun[] }`. (AC-18/19)
- **`AgentEvalDashboard`** — `GET /agents/:id/eval-dashboard`: `{ agent_id, agent_name, provider, model,
  current: { recall, precision, citation_accuracy, traces_passed:int, traces_total:int, cost_usd:number|null },
  delta: { recall, precision, citation_accuracy }, trend: EvalTrendPoint[], recent_runs: EvalBatchRun[],
  alert: string|null }`. Used by BOTH the Evals tab tiles (AC-8) and the detail page (AC-23/24/25).
- **`EvalCompareMetric`** = `{ old:number|null, new:number|null, delta:number|null }`.
  **`EvalCompare`** — `GET /agents/:id/eval-runs/compare`: `{ a: EvalBatchRun, b: EvalBatchRun,
  recall, precision, citation_accuracy, cost: EvalCompareMetric each, old_config: AgentVersionConfig|null,
  new_config: AgentVersionConfig|null }`. Client computes the prompt diff from the two `system_prompt`
  snapshots; `null` config degrades gracefully (AC-28 edge case). (AC-27/28)
- **`EvalPromoteInput`** = `{ version: z.number().int() }` → returns existing `Agent`. (AC-29)
- Reused verbatim (already present both copies): `EvalCaseInput`, `EvalCase`, `EvalRun`, `EvalRunRecord`,
  `EvalRunResult`, `EvalTrendPoint`, `EvalOwnerKind`, `AgentVersionConfig`, `AgentVersion`, `Finding`,
  `FindingActionKind`, `Provider`.

## Tasks

### T1 — Shared contracts (dual-vendor) + i18n + nav foundation
- **Area:** Full-stack (pure contract/data/config files)
- **Satisfies:** AC-44, AC-45, AC-22 (nav half)
- **Owns (files):**
  `server/src/vendor/shared/contracts/eval-ci.ts`,
  `client/src/vendor/shared/contracts/eval-ci.ts`,
  `server/src/vendor/shared/contracts/knowledge.ts`,
  `client/src/vendor/shared/contracts/knowledge.ts`,
  `client/messages/en/eval.json`,
  `client/src/vendor/ui/nav.ts`,
  `server/test/eval-contracts.test.ts` (new)
- **Depends on:** none
- **Skills to invoke:** zod, security, typescript-expert
- **Steps:**
  1. `diff` the two `eval-ci.ts` copies and the two `knowledge.ts` copies (INSIGHTS.md:29). Record what differs.
  2. In `client/src/vendor/shared/contracts/eval-ci.ts`, reconcile the confirmed drift to match server
     byte-for-byte: import `Provider, CiFailOn` from `./knowledge.js`; add the full `AgentManifest` +
     `AgentManifestInput` block; change `ConformanceInput.provider` to `z.enum(['openai','anthropic','openrouter']).nullish()`.
  3. Add the ADDITIVE shapes from **Shared contracts** above (`EvalBatchRun`, `EvalBatchResult`,
     `AgentEvalSummary`, `EvalDashboardHome`, `AgentEvalDashboard`, `EvalCompareMetric`, `EvalCompare`,
     `EvalPromoteInput`) to BOTH `eval-ci.ts` copies, in the same place, identical text. Export each schema
     AND its inferred type. If step 1 found `knowledge.ts` drift, reconcile that too (both copies identical).
  4. In `client/messages/en/eval.json`, add ONLY missing copy keys the design needs but the namespace lacks
     — at minimum: a `capture` section (`button`: "Turn into eval case", `success`: toast text,
     `needsDecision`: disabled tooltip); `dashboard.runAllAgents`, `dashboard.title`, `dashboard.subtitle`,
     `dashboard.agentsHeading`, `dashboard.recentAllAgents`; detail/compare/promote/banner keys
     (`compare.*`, `promote.*`, `banner.*`). Keep existing keys; do not rename. (root INSIGHTS.md:27)
  5. In `client/src/vendor/ui/nav.ts`: add to the "SKILLS LAB" `NAV` group
     `{ key: "eval", label: "Eval Dashboard", icon: "Gauge", href: "/eval", gKey: "e" }`, and add a
     `SHORTCUTS` row `{ keys: "g e", label: "Go to Eval Dashboard", group: "Navigation" }`. Verify `"Gauge"`
     exists in the vendored `IconName` registry (`vendor/ui/icons`); if not, pick another existing glyph
     (AC-45 permits it) — do NOT touch `activeKeyFor` (already returns "eval").
  6. Write `server/test/eval-contracts.test.ts` (hermetic; no DB): read both `eval-ci.ts` files with
     `fs.readFileSync` and assert they are **byte-identical** (AC-44); assert each new schema `.parse(...)`
     accepts a valid sample and rejects a malformed one (e.g. `EvalBatchRun`, `EvalCompare`, `EvalPromoteInput`).
- **Verify:** `cd server && pnpm exec vitest run test/eval-contracts.test.ts`
- **Out of scope:** any server module code, any DB schema, any page/component. Do NOT edit `activeKeyFor`.
  Do NOT add hooks. If a UI task later needs a key you did not add, that is a reported gap, not a re-edit here.

### T2 — DB schema: `eval_batches` + `eval_runs.batch_id` + migration
- **Area:** Backend (DB)
- **Satisfies:** AC-43, AC-41 (persistence half), AC-24 (storage half)
- **Owns (files):**
  `server/src/db/schema/eval-batches.ts` (new),
  `server/src/db/schema/eval.ts` (add one column),
  `server/src/db/schema.ts` (barrel: import + `export *` + `schema` object entry),
  `server/src/db/migrations/0016_*.sql` (+ `meta/_journal.json` + `meta/0016_snapshot.json`, generated)
- **Depends on:** none
- **Skills to invoke:** drizzle-orm-patterns, postgresql-table-design, zod, security, typescript-expert
- **Steps:**
  1. Create `server/src/db/schema/eval-batches.ts` defining `evalBatches` (`pgTable('eval_batches', …)`):
     `id uuid pk defaultRandom`; `workspaceId uuid notNull references(workspaces.id, onDelete:'cascade')`;
     `agentId uuid notNull references(agents.id, onDelete:'cascade')`; `agentVersion integer notNull`;
     `ranAt timestamptz defaultNow notNull`; `recall / precision / citationAccuracy doublePrecision` (nullable);
     `tracesPassed integer notNull default 0`; `tracesTotal integer notNull default 0`;
     `costUsd doublePrecision` (nullable). Add an index on `(workspaceId, agentId)` (FK columns aren't
     auto-indexed — postgresql-table-design).
  2. In `server/src/db/schema/eval.ts`, add ONE nullable column to `evalRuns`:
     `batchId: uuid('batch_id').references(() => evalBatches.id, { onDelete: 'cascade' })` (import `evalBatches`
     from `./eval-batches`; no import cycle — eval-batches does not import eval). This is the sanctioned
     minimal edit per the constraint note; it is additive and T2 is the sole owner of this file.
  3. In `server/src/db/schema.ts`: `export * from './schema/eval-batches'`; import `evalBatches` and add it to
     the `schema` object.
  4. Run `cd server && pnpm db:generate`. READ the generated `0016_*.sql` (server INSIGHTS.md:59): confirm it
     contains exactly `CREATE TABLE "eval_batches"`, the index, and `ALTER TABLE "eval_runs" ADD COLUMN "batch_id"`
     + its FK — and NO phantom statements against unrelated tables. `db:generate` updates `meta/_journal.json`
     and writes `0016_snapshot.json` automatically — do not hand-edit them.
  5. Apply with `cd server && pnpm db:migrate` against a running Postgres to confirm it applies cleanly.
- **Verify:** `cd server && pnpm db:generate` (SQL matches step 4, no phantom statements) `&& pnpm db:migrate`
  (applies clean). This is a migration task; its runtime behaviour is exercised by T4's `eval.it.test.ts`
  and TT1.
- **Out of scope:** any module/service/route/contract code, any client file. Do NOT edit an existing
  migration or another schema file. Do NOT add `workspace_id` to `eval_runs` (link via batch/case join instead).

### T3 — Pure deterministic scoring module
- **Area:** Backend (pure TS — no DB/HTTP/framework)
- **Satisfies:** AC-33, AC-34, AC-35, AC-36, AC-37 (metric fn), AC-38, AC-39, AC-40, AC-25 (alert fn)
- **Owns (files):**
  `server/src/modules/eval/scoring.ts` (new),
  `server/test/eval-scoring.test.ts` (new)
- **Depends on:** T1 (Finding contract)
- **Skills to invoke:** security, zod, typescript-expert
- **Steps:**
  1. Define minimal inputs: `type Located = { file: string; start_line: number; end_line: number }`.
  2. `overlaps(a: Located, b: Located): boolean` — `a.file === b.file && Math.max(0, Math.min(a.end_line,
     b.end_line) - Math.max(a.start_line, b.start_line) + 1) > 0` (AC-34).
  3. `matchFindings(produced: Located[], expected: Located[]): { tp: number; fp: number; fn: number }` —
     build the overlap-compatibility bipartite graph and resolve a **one-to-one** maximum assignment
     (optimal; sets are tiny — a small Hungarian/augmenting-path or exhaustive match is fine, NO external
     dep). `tp` = matched pairs, `fp` = unmatched produced, `fn` = unmatched expected (AC-35). Compare ONLY
     file + line range — never title/rationale/text, and make ZERO LLM/network calls (AC-33).
  4. `scoreCase({ produced, expected }): { caseType: 'must_find'|'must_not_flag'; tp; fp; fn;
     recall: number|null; precision: number; pass: boolean }`. `caseType` = `expected.length === 0 ?
     'must_not_flag' : 'must_find'`. `recall = tp/(tp+fn)` for must_find, `null` for must_not_flag (AC-38).
     `precision`: `must_not_flag` with zero produced → `1.0`; otherwise `tp/(tp+fp)` with `0/0 → 1.0`
     convention (AC-36/38). `pass`: must_find ⇔ `fn === 0` (extras tolerated); must_not_flag ⇔ `fp === 0` (AC-39).
  5. `citationAccuracy(keptCount: number, droppedCount: number): number` — `keptCount + droppedCount === 0
     ? 1.0 : keptCount / (keptCount + droppedCount)` (AC-37; zero produced → 1.0).
  6. `microAggregate(perCase: { tp; fp; fn; caseType }[]): { recall: number|null; precision: number;
     tracesPassed: number; tracesTotal: number }` — sum tp/fp/fn across cases, dividing once; recall
     denominator EXCLUDES must_not_flag cases' fn (omit the term); `null` recall when the denominator is 0;
     precision uses the `0/0 → 1.0` convention (AC-40).
  7. `degradationAlert(latest: { recall; precision }, prior: { recall; precision } | null): string | null`
     — `null` when no prior or neither metric dropped ≥ 0.02; else a message naming the metric and the drop
     size in points (e.g. `"Precision dipped 2pts…"`) (AC-25). Precision OR recall triggers.
  8. Write `server/test/eval-scoring.test.ts` covering the spec's **Edge cases** table: empty-expected pass;
     must_not_flag with a produced finding fails; must_find + extra passes but lowers aggregate precision;
     must_find zero produced fails; range-tie one-to-one credits one; zero produced → citation 1.0;
     all-must_not_flag set recall omitted; degradation ≥2pp fires and <2pp does not.
- **Verify:** `cd server && pnpm exec vitest run test/eval-scoring.test.ts`
- **Out of scope:** any DB/route/service, calling `reviewPullRequest` or `groundFindings` (that wiring is
  T4). Do NOT import from a feature module. This module is pure and framework-free.

### T4 — Server eval module (routes/service/repository/helpers/constants) + DI + registration + integration
- **Area:** Backend
- **Satisfies:** AC-1, AC-2, AC-3, AC-4, AC-5 (server), AC-6, AC-8 (data), AC-11, AC-12, AC-16 (run), AC-18,
  AC-19, AC-20, AC-23 (data), AC-24, AC-25 (compute), AC-27, AC-28, AC-29, AC-30 (data), AC-31, AC-32,
  AC-37 (wire), AC-41, AC-42, AC-46
- **Owns (files):**
  `server/src/modules/eval/routes.ts`, `server/src/modules/eval/service.ts`,
  `server/src/modules/eval/repository.ts`, `server/src/modules/eval/helpers.ts`,
  `server/src/modules/eval/constants.ts`,
  `server/src/modules/index.ts` (one import + one registry entry — sole eval-feature editor),
  `server/src/platform/container.ts` (one lazy getter — sole eval-feature editor),
  `server/test/eval.it.test.ts` (new)
- **Depends on:** T1 (contracts), T2 (schema), T3 (scoring)
- **Skills to invoke:** fastify-best-practices, drizzle-orm-patterns, postgresql-table-design,
  onion-architecture, security, zod, typescript-expert
- **Steps:**
  1. **Repository** (`repository.ts`, the only DB layer): owns `eval_cases`, `eval_runs`, `eval_batches`.
     Every read reachable from a route is workspace-scoped (server INSIGHTS.md:46): case reads filter
     `eval_cases.workspace_id`; batch reads filter `eval_batches.workspace_id`; per-case `eval_runs` reads
     JOIN `eval_cases` and filter its `workspace_id`. Methods: `listCasesForAgent(ws, agentId)`,
     `getCase(ws, caseId)`, `insertCase(ws, EvalCaseInput-ish)`, `updateCase(ws, caseId, patch)`,
     `deleteCase(ws, caseId)`, `insertRun(row)`, `lastRunByCase(ws, agentId)` (latest `eval_runs` per case),
     `insertBatch(row)`, `listBatches(ws, agentId)` (newest first), `getBatch(ws, batchId)`,
     `latestBatch(ws, agentId)` + `priorBatch`, and cross-agent `listAgentSummaries(ws)` /
     `recentBatchesAllAgents(ws)`. Map rows → DTOs in `helpers.ts` (Drizzle rows never leave the repository).
  2. **helpers.ts** (pure): `toEvalCaseDto`, `toEvalBatchRunDto`, `toAgentEvalDashboard`,
     `toEvalDashboardHome`, `toEvalCompare`. Parse historical snapshots through `AgentVersionConfig.parse`
     for compare (mirror `agents/helpers.ts:39`); a malformed snapshot yields `null` config rather than a 500
     (AC-28 edge case).
  3. **service.ts** (receives `Container`; never `new`s an adapter):
     - **Capture** `captureFromFinding(ws, findingId)` (AC-1..6): call `container.reviewRepo.findingContext(findingId)`;
       reject if missing/other-workspace (404) or `review.agentId == null` (AC-6, explanatory error). Build the
       frozen `input_diff` = the diff of **only** `finding.file` (reuse `diffFromPrFiles` semantics /
       `container.reviewRepo.getPrFiles` filtered to that path, then a unified-diff string). Derive
       `expected_output`: accepted → `[{ severity, category, title, file, start_line, end_line }]` (must_find);
       dismissed → `[]` (must_not_flag). Insert an `eval_cases` row owner_kind='agent', owner_id=agentId. Do NOT
       mutate the finding's accept/dismiss state (AC-5).
     - **Case CRUD**: create/list/update/delete via repository; owner resolved from the route param.
     - **Run one case** `runCase(ws, caseId)` (AC-32, AC-12/16): load the agent (its current
       `{systemPrompt, model, strategy}` + enabled skills via `container.agentsRepo.enabledSkillsForAgent`),
       resolve `llm = await container.llm(agent.provider)`, `parseUnifiedDiff(case.input_diff)`
       (import from `adapters/git/diff-parser`), call `reviewPullRequest({ systemPrompt, model, diff, llm,
       strategy, skills })`. Produced set for matching = the grounded `outcome.review.findings` mapped to
       `{file,start_line,end_line}`; citation = `citationAccuracy(outcome.review.findings.length,
       outcome.dropped.length)` (AC-37). Score with T3's `scoreCase`; persist an `eval_runs` row (pass,
       recall, precision, citation_accuracy, duration_ms, cost_usd, actual_output, batch_id nullable).
     - **Run all / batch** `runBatch(ws, agentId)` (AC-11, AC-41): create an `eval_batches` row stamped with the
       agent's CURRENT `agents.version`; run every case in fixed order; per-case failure is caught, recorded as
       a failed run with reason, and the loop CONTINUES (AC-42); after all cases, `microAggregate` → update the
       batch's aggregate recall/precision/citation + pass X/Y + cost; link every per-case run's `batch_id`.
       Return `EvalBatchResult`.
     - **Run all agents** `runAllAgents(ws)` (AC-20): one batch per enabled agent, sequentially (perf note in
       spec allows it); return `EvalDashboardHome`.
     - **Agent dashboard** `agentDashboard(ws, agentId)` (AC-8/23/24/25): current from latest batch, delta vs
       prior batch, trend = batches as `EvalTrendPoint[]`, recent_runs = `EvalBatchRun[]`, `alert =
       degradationAlert(latest, prior)` (T3).
     - **Dashboard home** `dashboardHome(ws)` (AC-18/19): per-agent summaries + recent batches across agents.
     - **Compare** `compare(ws, agentId, a, b)` (AC-27/28): two batches + their two version snapshots
       (`container.agentsRepo.getVersion(agentId, batch.agentVersion)` → `AgentVersionConfig`), metric deltas.
     - **Promote** `promote(ws, agentId, version)` (AC-29/30/31): look up version N's `AgentVersionConfig`
       (404 → error, unchanged, AC-31); re-apply it through the normal update path
       (`container.agentsRepo.update` / `AgentsService.update`) so a NEW highest version is appended equal to
       N's config — forward-only, mirroring skills restore (server INSIGHTS.md:33). Never decrement
       `agents.version`; never rewrite `agent_versions`. Return the updated `Agent`.
  4. **routes.ts** (Zod params/body only; delegate; map status): register the 13 endpoints from the spec's
     Contracts table — `POST /findings/:id/eval-case`, `POST|GET /agents/:id/eval-cases`,
     `PUT|DELETE /eval-cases/:id`, `POST /eval-cases/:id/run`, `POST|GET /agents/:id/eval-runs`,
     `GET /agents/:id/eval-dashboard`, `GET /eval-dashboard`, `POST /eval/run-all`,
     `GET /agents/:id/eval-runs/compare?a=&b=`, `POST /agents/:id/promote`. Each resolves `workspaceId` via
     `getContext`. Use local Zod params schemas where the segment isn't `id` (server INSIGHTS.md:45).
  5. **DI**: add a lazy getter to `platform/container.ts` if the module needs a shared repo handle (follow the
     `contextRepo` getter pattern); the service otherwise reaches `container.reviewRepo` / `container.agentsRepo`
     which already exist. **Register** the module in `modules/index.ts` (`import eval from './eval/routes.js'`
     + one `eval` entry — the comment there already names "eval/ci/hooks" as the add point).
  6. **eval.it.test.ts** (DB-backed, testcontainers — mirror `server/test/skills.it.test.ts` harness,
     server INSIGHTS.md:42): stub the LLM via `overrides.llm = { openai: stubProvider }` returning a
     deterministic `Review`. Cover: capture from an accepted finding → must_find case with frozen diff (AC-1/2/3);
     capture from dismissed → `[]` (AC-4); capture on an agent-less review → rejected (AC-6); run a case →
     grounded scoring persisted; run a batch → `eval_batches` aggregate + version stamp + per-case `batch_id`
     (AC-24/41); one failing case does not abort the batch (AC-42); promote appends a new highest version
     (AC-29/30); promote a non-existent version → error (AC-31); a cross-workspace case/batch id → 404 (IDOR).
- **Verify:** `cd server && pnpm exec vitest run test/eval.it.test.ts`
- **Out of scope:** the pure scoring math (import T3's `scoring.ts`, do not re-implement). Any client file.
  Any other module's routes/repository (reach shared repos via the Container). reviewer-core (import only).
  Editing another schema/migration (T2 owns those).

### T5 — Capture UI: "Turn into eval case" on the finding card
- **Area:** Frontend
- **Satisfies:** AC-7, AC-5 (toast)
- **Owns (files):**
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx`,
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.test.tsx`,
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx`,
  `client/src/lib/hooks/eval-capture.ts` (new)
- **Depends on:** T1 (contracts + `eval.json` `capture.*` keys)
- **Skills to invoke:** next-best-practices, react-best-practices, react-testing-library,
  client-project-structure, security, zod, typescript-expert
- **Steps:**
  1. **Design reference:** open `specs/assets/eval-pipeline/01-pr-detail-finding-turn-into-eval-case.png`.
     The flask-icon "Turn into eval case" button sits in the finding's action row. Match it (design is source
     of truth where in doubt).
  2. Create `client/src/lib/hooks/eval-capture.ts`: `useCaptureEvalCase()` — a TanStack `useMutation`
     posting `api.post('/findings/${findingId}/eval-case')`, on success `notify` the `capture.success` toast.
     Never call `fetch`/`api` from the component (client CLAUDE.md).
  3. In `FindingCard.tsx`, add the button to the existing `s.actions` row (currently Accept + Dismiss). Wire
     `onClick` to the capture handler passed from `FindingsPanel`. Per AC-7 the button is **disabled/inert while
     the finding is neither accepted nor dismissed** (`!f.accepted_at && !f.dismissed_at`), with the
     `capture.needsDecision` tooltip. Use an existing `IconName` flask/beaker glyph (verify in `vendor/ui/icons`;
     fall back to an existing glyph if none). Give the icon-only affordance an `aria-label` (react a11y).
     **Position:** see GAP-1 — place it immediately after Dismiss (Learn/Reply are NOT wired, per spec Non-goals);
     do NOT add inert Learn/Reply buttons.
  4. In `FindingsPanel.tsx`, thread the capture handler down to each `FindingCard` (mirror how the existing
     accept/dismiss `onAction` is threaded). Keep accept/dismiss behaviour byte-identical.
  5. Update `FindingCard.test.tsx` (use `fireEvent`, NOT `userEvent` — client INSIGHTS.md:19): assert the button
     is disabled on an undecided finding and enabled once `accepted_at`/`dismissed_at` is set, and that clicking
     it fires the capture mutation without altering accept/dismiss state.
- **Verify:** `cd client && pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.test.tsx"`
- **Out of scope:** wiring the `learn`/`reply` actions (spec Non-goal). The server capture endpoint (T4).
  The Evals tab / dashboard.

### T6 — Evals tab + case editor modal (Surface B)
- **Area:** Frontend
- **Satisfies:** AC-8 (render), AC-9, AC-10, AC-11 (UI), AC-12 (UI), AC-13, AC-14, AC-15, AC-16 (UI), AC-17, AC-30 (tab)
- **Owns (files):**
  `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`,
  `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`,
  `client/messages/en/agents.json` (add `editor.tabs.evals` key only),
  `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/**` (new tree: `EvalsTab.tsx`,
  `CaseRow.tsx`, `CaseEditorModal.tsx`, `helpers.ts`, `styles.ts`, `index.ts`, `EvalsTab.test.tsx`,
  `CaseEditorModal.test.tsx`),
  `client/src/lib/hooks/eval-cases.ts` (new)
- **Depends on:** T1 (contracts + `eval.json` `evalsTab`/`caseEditor` keys)
- **Skills to invoke:** next-best-practices, react-best-practices, react-testing-library,
  client-project-structure, security, zod, typescript-expert
- **Steps:**
  1. **Design references:** `specs/assets/eval-pipeline/03-agents-evals-tab.png` (tab + tiles + case rows) and
     `05-eval-case-detail-modal.png` (case editor). Match glyph states, the `3/5 passing` pill, tags, and the
     result strip.
  2. Create `client/src/lib/hooks/eval-cases.ts`: `useEvalCases(agentId)`, `useCreateEvalCase(agentId)`,
     `useUpdateEvalCase()`, `useDeleteEvalCase()`, `useRunEvalCase()`, `useRunAllEvals(agentId)`, and
     `useAgentEvalDashboard(agentId)` (GET `/agents/:id/eval-dashboard` for the tiles). NOTE: a same-named
     `useAgentEvalDashboard` also lives in T7's `eval.ts` for the detail page — this is a deliberate thin-hook
     duplication to keep T6/T7 file ownership disjoint; both wrap the identical endpoint/DTO. Invalidate the
     relevant query keys on each mutation.
  3. Add the Evals tab: in `AgentEditor/constants.ts` append `{ key: "evals", labelKey: "editor.tabs.evals",
     icon: "Gauge" }` to `TABS` (VALID_TABS derives automatically — client INSIGHTS.md:32). Add
     `editor.tabs.evals` to `client/messages/en/agents.json`. In `AgentEditor.tsx` render `<EvalsTab agent={agent}/>`
     when `tab === "evals"`.
  4. `EvalsTab.tsx`: four metric tiles from `useAgentEvalDashboard.current` (AC-8); "View full dashboard →" link
     to `/eval/${agent.id}`; "Eval cases" heading with the "P / T passing" pill (AC-10, computed from cases whose
     last run passed / cases with a last run); "Run all evals" + "New eval case" buttons. Render a `CaseRow` per
     case (AC-9): state glyph (pass/fail/never-run — AC-17 neutral glyph + "never run"), mono name, "expected N
     got M" subtitle, severity·category tag or `empty []` tag when `expected_output` is `[]`, and real per-row
     `run(▷)/edit/delete` controls — each an individually-labelled control, NOT nested in a row-level button
     (spec Accessibility; client INSIGHTS.md:53).
  5. `CaseEditorModal.tsx` (AC-13/14/15/16): Name field; Input area with Diff / Files / PR meta tabs; an
     Expected-output JSON editor. Show "valid JSON"/"invalid JSON" and BLOCK Save while invalid (AC-14 — parse
     with `JSON.parse` in a try/catch; never `eval`, spec Security). "Finding skeleton" inserts a template object
     exposing `severity, category, title, file, start_line` (AC-15). "Run on save" toggle: when on, run the case
     immediately after persist and show the result strip "Last run passed/failed · expected N, got M ·
     <duration>s · $<cost>" (AC-16).
  6. Tests (`fireEvent`): tab renders tiles + cases from a mocked `useAgentEvalDashboard`/`useEvalCases`;
     invalid JSON blocks Save; Finding skeleton inserts a template; a `never-run` case shows the neutral glyph.
- **Out of scope:** the `/eval` standalone pages (T7). Server endpoints (T4). Do NOT edit `AgentEditorView.tsx`
  (the `?tab=` allowlist derives from `TABS`). Do NOT add hooks to `client/src/lib/hooks/eval.ts` (T7 owns it).
- **Verify:** `cd client && pnpm exec vitest run "src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab"`

### T7 — Eval Dashboard home + agent detail (Surfaces C & D)
- **Area:** Frontend
- **Satisfies:** AC-18 (render), AC-19 (render), AC-20 (UI), AC-21, AC-23, AC-24 (render), AC-25 (render),
  AC-26, AC-27 (render), AC-28 (render), AC-30 (dashboard/detail)
- **Owns (files):**
  `client/src/app/eval/page.tsx` (new),
  `client/src/app/eval/[agentId]/page.tsx` (new),
  `client/src/app/eval/_components/**` (new: `DashboardHome/`, `AgentDetail/`, `MetricTrendChart/`,
  `RecentRunsTable/`, `CompareModal/`, `WarningBanner/`, `Sparkline/` — each with its component, `styles.ts`,
  `index.ts`, and colocated `*.test.tsx`),
  `client/src/lib/hooks/eval.ts` (new)
- **Depends on:** T1 (contracts + `eval.json` `dashboard`/`compare`/`promote`/`banner` keys)
- **Skills to invoke:** next-best-practices, react-best-practices, react-testing-library,
  client-project-structure, security, zod, typescript-expert
- **Steps:**
  1. **Design references:** `04-eval-dashboard-home.png` (home), `06-agent-detail-metric-trend-compare.png`
     (detail trend + compare), `02-agent-detail-compare-runs-promote.png` (compare modal + Promote). Match the
     colored metric bars (recall blue / precision green / citation orange), sparklines, the amber warning banner,
     the multi-series trend chart (use `recharts`, already a client dep), and the compare tiles + prompt diff.
  2. Create `client/src/lib/hooks/eval.ts`: `useEvalDashboardHome()`, `useRunAllAgents()`,
     `useAgentEvalDashboard(agentId)`, `useEvalBatches(agentId)`, `useEvalCompare(agentId, a, b)` (enabled only
     when both ids set), `usePromoteVersion(agentId)`, `useRunAgentEval(agentId)`. Invalidate query keys on mutation.
  3. `app/eval/page.tsx` (thin) → `<DashboardHome/>` (RSC boundary: `'use client'` at the interactive leaf, not
     the page root — next-best-practices). DashboardHome (AC-18/19/20): "Run all agents" button; per-agent rows
     (icon, name, model chip, "Last run vN · date · X/Y pass", sparkline, RECALL/PREC/CITE) each navigating to
     `/eval/${agent_id}` on click/chevron (AC-21); a "Recent eval runs · all agents" table of batch rows. Bars
     must not encode state by color alone — pair each with its numeric % (spec Accessibility).
  4. `app/eval/[agentId]/page.tsx` → `<AgentDetail agentId=…/>` (AC-23/24/25/26/27/28): breadcrumb
     "Skills Lab › Eval Dashboard › <name>", "‹ All agents" back link, three metric cards with change-vs-prior +
     mini trend, the multi-series "Metric trend" chart, the amber `WarningBanner` rendered from
     `AgentEvalDashboard.alert` (AC-25 — server-computed; render only), and a "Recent runs" table with per-row
     checkboxes; the "Compare" control is enabled ONLY when exactly two rows are selected (AC-26).
  5. `CompareModal` (AC-27/28): open on two selected batches via `useEvalCompare`; four tiles (Recall / Precision /
     Citation / Cost) showing old→new + signed delta; a "SYSTEM PROMPT DIFF" block computed client-side from
     `old_config.system_prompt` vs `new_config.system_prompt` (degrade gracefully when a config is `null`); a
     primary "Promote vN" button calling `usePromoteVersion` (AC-29 forward-only — server does the work), then
     invalidate dashboards so the new active version shows (AC-30).
  6. Tests (`fireEvent`, mock the hooks and `next/navigation`; mock `AppShell` as a passthrough per client
     INSIGHTS.md:44): home renders agent rows + navigates on row click; Compare disabled until exactly 2 selected
     then enabled; the warning banner renders when `alert` is non-null.
- **Out of scope:** server endpoints (T4). The Evals tab / case editor (T6). Do NOT edit `nav.ts` or
  `activeKeyFor` (T1 owns nav; `activeKeyFor("eval")` already exists). Do NOT edit `eval-cases.ts` (T6 owns it).
- **Verify:** `cd client && pnpm exec vitest run "src/app/eval"`

## Test tasks (executed by `test-writer`, after every T-task)
### TT1 — Sensitivity & regression integration coverage
- **Owns (files):** `server/test/eval-sensitivity.it.test.ts` (new)
- **Covers:** AC-47, AC-48
- **Runs after:** T1–T4 (and any fix from an architecture review)
- **Skills to invoke:** fastify-best-practices, drizzle-orm-patterns, security, zod, typescript-expert
- **Steps (for `test-writer`):** DB-backed harness (mirror `server/test/eval.it.test.ts`). Inject a stub LLM whose
  produced findings depend on the agent's `system_prompt`. (AC-47) Run one agent's set against an "old" prompt,
  update the prompt so it changes behaviour on ≥1 case's frozen diff, run again → assert at least one of
  recall/precision/citation differs between the two `eval_batches` rows. (AC-48) Deliberately corrupt the prompt
  so the stub over-flags (introduces false positives), run again → assert aggregate **precision** drops vs the
  prior batch, and that `agentDashboard.alert` fires when the drop is ≥ 2pp.
- **Verify:** `cd server && pnpm exec vitest run test/eval-sensitivity.it.test.ts`
- **Out of scope:** any product code — a testability fix is reported, not made.

## Execution order
- **Wave 0 (foundation, parallel):** T1 ∥ T2 (disjoint files). Everything else waits on the substrate it uses.
- **Wave 1 (parallel):** T3 (server, needs T1) ∥ T5 (client, needs T1) ∥ T6 (client, needs T1) ∥ T7 (client, needs T1).
- **Wave 2 (integration):** T4 (needs T1 + T2 + T3).
- **Test-writer phase (after Wave 2 + any architecture-review fix):** TT1 (needs T1–T4).
- Phase boundary: `test-writer` runs only after every T-task is merged — do NOT parallelize TT1 with the T-phase.

## File-ownership matrix (proves no two concurrent tasks share a file)
| File / tree | Owner | Wave |
|---|---|---|
| `server|client/src/vendor/shared/contracts/eval-ci.ts`, `…/knowledge.ts` | T1 | 0 |
| `client/messages/en/eval.json`, `client/src/vendor/ui/nav.ts`, `server/test/eval-contracts.test.ts` | T1 | 0 |
| `server/src/db/schema/eval-batches.ts`, `…/schema/eval.ts`, `…/schema.ts`, `migrations/0016_*` (+meta) | T2 | 0 |
| `server/src/modules/eval/scoring.ts`, `server/test/eval-scoring.test.ts` | T3 | 1 |
| `…/FindingCard/FindingCard.tsx` (+`.test`), `…/FindingsPanel/FindingsPanel.tsx`, `lib/hooks/eval-capture.ts` | T5 | 1 |
| `…/AgentEditor/AgentEditor.tsx`, `…/AgentEditor/constants.ts`, `client/messages/en/agents.json`, `…/EvalsTab/**`, `lib/hooks/eval-cases.ts` | T6 | 1 |
| `client/src/app/eval/**`, `client/src/lib/hooks/eval.ts` | T7 | 1 |
| `server/src/modules/eval/{routes,service,repository,helpers,constants}.ts`, `modules/index.ts`, `platform/container.ts`, `server/test/eval.it.test.ts` | T4 | 2 |
| `server/test/eval-sensitivity.it.test.ts` | TT1 | test-writer |

No file appears under two concurrent (same-wave) owners. `modules/index.ts` and `platform/container.ts` are
edited only by T4 (Wave 2, alone). `client/messages/en/eval.json` is T1-only; `agents.json` is T6-only. The
same-named `useAgentEvalDashboard` in `eval-cases.ts` (T6) and `eval.ts` (T7) is a deliberate thin-hook
duplication in DISTINCT files — not a shared file.

## End-to-end verification (after all tasks merge)
```
cd server && pnpm db:migrate
cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm typecheck
cd server && pnpm exec vitest run .it.test          # incl. eval.it.test.ts + eval-sensitivity.it.test.ts (Docker)
cd client && pnpm test && pnpm typecheck
```
→ expect: all green. Manual smoke (design sources are the source of truth): accept a finding → "Turn into eval
case" (disabled until decided) → case appears on the agent's Evals tab → "Run all evals" fills the four tiles and
the P/T pill → the standalone `/eval` dashboard lists the agent with metrics + sparkline → its detail shows the
trend chart; corrupt the prompt, re-run, and the amber banner fires; select two runs → Compare shows deltas +
prompt diff → "Promote vN" appends a new highest version reflected in the tab/dashboard/detail headers.

## Planning notes
- **reviewer-core needs zero changes** — a pleasant surprise worth recording: `reviewPullRequest`,
  `groundFindings`, and the server's `parseUnifiedDiff` cover the whole engine seam, and `outcome.dropped` +
  `outcome.review.findings` give both the grounding-survivor count (citation_accuracy) and the grounded produced
  set (matching) without touching the pure package. Keeping the scoring module in the server (`modules/eval/
  scoring.ts`) rather than reviewer-core avoids modifying a package shared with the CI runner.
- The `AgentEvalDashboard` DTO serves BOTH the Evals-tab tiles (AC-8) and the detail page (AC-23) — one endpoint,
  two consumers — which is why the thin `useAgentEvalDashboard` hook is duplicated across T6/T7's disjoint files
  rather than shared (a shared hooks file would collide in the parallel wave).
</content>
</invoke>
