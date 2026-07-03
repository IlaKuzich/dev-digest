# Plan: PR Why+Risk Brief

> Status: DRAFT
> Created: 2026-07-03
> Spec: specs/SPEC-2026-07-03-pr-why-risk-brief.md
> Execution Mode: multi-agent (TASK-001 backend ∥ TASK-002 frontend)

## Requirements (VRF)
> Status: Confirmed

| ID | Requirement | Source |
|----|------------|--------|
| R1 | `POST /pulls/:id/brief` без валідного кешу під поточний `headSha` → зібрати вхід (intent + blast summary + smart-diff stats по групах + linked issue якщо є + relevant specs), виконати рівно 1 structured LLM call, повернути `Brief{what,why,risk_level,risks[],review_focus[]}` | SPEC AC-1 |
| R2 | LLM payload НЕ містить diff bodies/hunks — лише похідні факти | SPEC AC-2 |
| R3 | Якщо вхід > 8000 токенів → усікати найменш пріоритетні секції (specs — першими), фінальний payload ≤ 8000 токенів | SPEC AC-3 |
| R4 | `risks[].file_refs`/`review_focus[].file_refs` з шляхом поза множиною відомих шляхів (Blast Radius ∪ Smart Diff) → відкинути ref | SPEC AC-4 |
| R5 | Після grounding: `review_focus` без валідних refs → відкинути елемент повністю; `risks` з порожнім `file_refs` → залишити | SPEC AC-5 |
| R6 | Поки `headSha` не змінився → повторний `POST` без `force` повертає кеш, 0 LLM-викликів | SPEC AC-6 |
| R7 | `headSha` змінився → кеш недійсний, наступний запит генерує новий Brief | SPEC AC-7 |
| R8 | `force=true` → новий LLM-виклик і перезапис кешу навіть при незмінному `headSha` | SPEC AC-8 |
| R9 | LLM-виклик падає → детермінована помилка (без stack trace), кеш НЕ оновлюється | SPEC AC-9 |
| R10 | Верхній блок `PrBriefCard`: колір банера за `risk_level`, текст `what`/`why` | SPEC AC-10 |
| R11 | Якщо є завершений `RunSummary` — показати його метрики поруч із текстом Brief (дані з `RunSummary`, НЕ з Brief) | SPEC AC-11 |
| R12 | Якщо Run Review ще не виконувався — показати повний контент Brief, а замість блоку метрик — nudge + кнопка, що перевикористовує існуючу дію Run Review | SPEC AC-12 (переписаний) |
| R13 | Паралельна генерація Brief для одного PR → advisory lock по `prId`, другий запит НЕ ініціює другий LLM-виклик | SPEC AC-17 (новий) |
| R14 | `risks[]` → акордеон усередині `IntentCard` (іконка за `kind`, `title`, клікабельні `file_refs`; розгортання → `explanation`) | SPEC AC-13 |
| R15 | Клік по `file_ref` → перемикає таб на "Files changed", скрол + підсвітка файлу (і рядка, якщо вказаний) | SPEC AC-14 |
| R16 | Окрема кнопка regenerate (відмінна від Run Review) → `POST /pulls/:id/brief {force:true}`, не зачіпає Run Review | SPEC AC-15 |
| R17 | `GET /pulls/:id/intent` більше не повертає `risk_areas`; `Risk.kind` приймає лише enum `RiskAreaKind` | SPEC AC-16 |

## Open Questions & Recommendations
> Resolved during VRF 0c, підтверджено координатором з дефолтами. Q3 уточнено на основі researcher-findings (STEP 1) — конкретний механізм реалізації змінився без зміни духу відповіді.

| # | Question | Answer | Type |
|---|----------|--------|------|
| Q1 | Advisory lock — Postgres чи in-process mutex? | **Postgres `pg_advisory_xact_lock`**, ключ = hash від `prId` (UUID → bigint через `hashtext()`), всередині `db.transaction()`. Instance-safe за горизонтального масштабування API. | 🚩 gap → confirmed |
| Q2 | Поведінка очікуючого запиту, якщо перша генерація впала з помилкою | Після звільнення lock очікуючий запит перечитує кеш; якщо кеш все ще невалідний — сам генерує Brief (fair retry, без каскадування помилки). AC-17 "обидва отримують однаковий Brief" стосується тільки success-шляху. | 🚩 gap → confirmed |
| Q3 | Як nudge-кнопка (AC-12) перевикористовує Run Review | Підтверджено з уточненням від researcher: **`RunReviewDropdown` — вже самодостатній компонент**, що приймає `size`/`kind`-варіанти саме для вбудовування в інші місця (`client/.../PrDetailHeader/RunReviewDropdown.tsx`). Замість проброса raw-handler з `page.tsx`, nudge у `BriefCard` рендерить `<RunReviewDropdown prId={prId} .../>` напряму — `prId` вже доступний у скоупі `OverviewTab`. Це **прибирає потребу в prop-threading з `page.tsx`** для AC-12 (спрощує frontend-таск, `page.tsx` НЕ в owned paths). Implementer має звірити точний перелік required/optional пропів `RunReviewDropdown` перед вбудовуванням. | gap → confirmed + refined |
| Q4 | Backfill `head_sha` для існуючих `pr_brief`-рядків | `ADD COLUMN head_sha text` nullable, БЕЗ backfill і БЕЗ truncate. `NULL` трактується сервісом як "кеш невалідний" — той самий код-шлях, що й mismatch headSha. | gap → confirmed |

💡 Додаткові знахідки researcher-а, що впливають на план (не потребують підтвердження користувача, фіксую як нотатки):
- `client/src/vendor/shared/` — **НЕ symlink**, окрема копія файлів (`client/tsconfig.json:1` вказує на власну `./src/vendor/shared/index.ts`). `CLAUDE.md`-твердження "via TS alias to server tree" — застаріле/невірне. Зміни контрактів (`brief.ts`) мають вноситись вручну в ОБИДВА дерева.
- `AC-14` deep-link URL-shape вже частково існує: `SymbolList.tsx` (у `BlastRadiusCard`) пише `?tab=diff&file=<path>&line=<n>` при кліку по caller, але жоден компонент це не читає — reader-сторону треба будувати з нуля, дотримуючись цього ж shape для консистентності.
- `linked_issue` на `PrDetail` — контрактне поле, яке **ніде в кодовій базі не заповнюється** (ні GitHub-refresh, ні offline-гілка `pulls/routes.ts`, ні `recalculateIntent`). Brief-модуль читатиме його коректно (завжди `undefined` сьогодні) — це прийнятний gap, edge case "Немає прив'язаного issue" у спеці вже покриває цю поведінку. Не блокер, але варто зафіксувати як accepted risk.
- `PrBrief` composed тип (`brief.ts:214-221`) підтверджено мертвим: `blast: BlastRadius` посилається на unused-тип, жоден код не продукує `BlastRadius`-shaped об'єкт. Безпечно видаляти повністю.

## Affected Modules

| Module | Path | Change Type |
|--------|------|-------------|
| backend: `brief` (new) | `server/src/modules/brief/` | Add |
| backend: `reviews` (intent-deriver) | `server/src/modules/reviews/intent-deriver.ts` | Modify |
| backend: `reviews` (repository) | `server/src/modules/reviews/repository.ts`, `server/src/modules/reviews/repository/pull.repo.ts` | Modify |
| backend: `reviews` (routes) | `server/src/modules/reviews/routes.ts` | Verify (response shape after contract change) |
| backend: shared contracts | `server/src/vendor/shared/contracts/brief.ts` | Modify |
| backend: shared contracts (client copy — no symlink, manual sync) | `client/src/vendor/shared/contracts/brief.ts` | Modify |
| backend: db schema | `server/src/db/schema/reviews.ts` | Modify |
| backend: migrations | `server/src/db/migrations/` | Add (generated via `pnpm db:generate`) |
| frontend: `IntentCard` | `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx` | Modify |
| frontend: `BriefCard` (new) | `client/src/app/repos/[repoId]/pulls/[number]/_components/BriefCard/` | Add |
| frontend: `OverviewTab` | `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx` | Modify |
| frontend: `DiffTab` / diff viewers | `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx` (+ `SmartDiffViewer`/`DiffViewer` as needed) | Modify |
| frontend: api/hooks | `client/src/lib/api.ts`, `client/src/lib/hooks/pulls.ts` | Modify |
| frontend: i18n | `client/messages/en/*.json` (namespace TBD — follow existing per-domain convention, e.g. sibling to `agents.json`/`context.json`) | Modify |

## Tasks

### TASK-001: Brief backend module — generation, cache, grounding, contract cleanup

**Scope:** backend

**Owned Paths:**
- `server/src/modules/brief/` (new: `routes.ts`, `service.ts`, `repository.ts`, `helpers.ts` as needed)
- `server/src/modules/reviews/intent-deriver.ts`
- `server/src/modules/reviews/repository.ts`
- `server/src/modules/reviews/repository/pull.repo.ts`
- `server/src/modules/reviews/routes.ts`
- `server/src/vendor/shared/contracts/brief.ts`
- `client/src/vendor/shared/contracts/brief.ts` (shared-contract mirror — no symlink exists, see Architecture Notes)
- `server/src/db/schema/reviews.ts`
- `server/src/db/migrations/` (generated)

**Acceptance Criteria:**
- [ ] AC-001: `POST /pulls/:id/brief` with no valid cache for current `headSha` collects input from intent (`reviews` service) + blast summary (`blast/service.ts` `BlastService.getForPr`) + smart-diff stats by group (`pulls/service.ts` `PullsService.buildSmartDiff`) + `linked_issue` if present + specs via `container.contextService.readDocsByPaths` (mirroring `run-executor.ts:336-368` agent-context-path resolution), performs exactly one `llm.completeStructured` call using `resolveFeatureModel(container, wsId, "risk_brief")`, and returns `Brief{what,why,risk_level,risks[],review_focus[]}` — maps to R1
- [ ] AC-002: assembled LLM payload contains no diff hunk lines (`@@`, `+`/`-` bodies) — only derived-fact text — maps to R2
- [ ] AC-003: if assembled input exceeds 8000 tokens, service truncates least-priority sections first (Context Folder specs dropped before other sections) until payload ≤ 8000 tokens — maps to R3
- [ ] AC-004: grounding-gate step rejects any `risks[].file_refs`/`review_focus[].file_refs` entry whose file path is not in the known-paths set (`BlastRepository.getChangedFilePaths` ∪ smart-diff file list), path-only comparison — maps to R4
- [ ] AC-005: after grounding, a `review_focus` item with zero remaining `file_refs` is dropped entirely; a `risks` item with empty `file_refs` is kept as-is — maps to R5
- [ ] AC-006: repeat `POST` without `force` while `pr_brief.head_sha === pull.headSha` returns cached Brief with 0 new LLM calls — maps to R6
- [ ] AC-007: `POST` when `pr_brief.head_sha !== pull.headSha` (including `head_sha IS NULL`, per Q4) triggers a new generation and cache overwrite — maps to R7
- [ ] AC-008: `POST` with `force=true` triggers new generation and cache overwrite regardless of `headSha` match — maps to R8
- [ ] AC-009: LLM call failure returns a deterministic error response (no stack trace in body) and leaves the existing cache row untouched — maps to R9
- [ ] AC-010: two concurrent `POST /pulls/:id/brief` for the same PR acquire a Postgres advisory lock (`pg_advisory_xact_lock`, key derived from `prId` via `hashtext`) such that only one LLM call executes; the second request waits for lock release then re-reads cache (success path: both return the same Brief; failure path per Q2: waiter retries its own generation) — maps to R13
- [ ] AC-011: `GET /pulls/:id/intent` response no longer includes `risk_areas`; `Risk.kind` in `brief.ts` is typed as `RiskAreaKind` enum (not `z.string()`); `pr_intent.risk_areas` column is dropped via migration; `pr_brief.head_sha` column is added (nullable, no backfill) via migration — maps to R17

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001 | `server/src/modules/brief/brief.it.test.ts` — `POST /pulls/:id/brief` on seeded PR → 200 with `Brief` shape; `MockLLMProvider` call-count assertion = 1 |
| AC-002 | `server/src/modules/brief/brief.test.ts` — unit: intercept assembled payload passed to `llm.completeStructured`, assert no `@@`/hunk-body substrings |
| AC-003 | `server/src/modules/brief/brief.test.ts` — unit: inflate mock specs input, measure final payload token count ≤ 8000 |
| AC-004 / AC-005 | `server/src/modules/brief/brief.test.ts` — unit: stub `MockLLMProvider` to return a hallucinated file path → assert ref/item dropped; risk with empty `file_refs` → assert kept |
| AC-006 / AC-007 / AC-008 | `server/src/modules/brief/brief.it.test.ts` — sequential calls with LLM call-counter; change `pull.headSha` between calls; `force=true` call |
| AC-009 | `server/src/modules/brief/brief.test.ts` — unit: `MockLLMProvider` throws → assert 5xx response body has no stack trace, cache row unchanged |
| AC-010 | `server/src/modules/brief/brief.it.test.ts` — two concurrent `POST` via `Promise.all`, real Postgres (testcontainers) → LLM call-counter = 1 |
| AC-011 | `pnpm exec vitest run server/src/modules/reviews/reviews.test.ts` (contract regression) — `GET /pulls/:id/intent` response has no `risk_areas` key; `Risk` schema rejects a `kind` value outside `RiskAreaKind` |

---

### TASK-002: Brief frontend — top card, Risk accordion, file navigation, regenerate

**Scope:** frontend

**Owned Paths:**
- `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx`
- `client/src/app/repos/[repoId]/pulls/[number]/_components/BriefCard/` (new)
- `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx`
- `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx`
- `client/src/app/repos/[repoId]/pulls/[number]/_components/SmartDiffViewer/` and/or `DiffViewer/` (whichever renders file rows — add scroll/highlight target)
- `client/src/lib/api.ts`
- `client/src/lib/hooks/pulls.ts`
- `client/messages/en/*.json` (new/extended namespace for Brief copy)

> Note: does NOT touch `page.tsx` (tab switching and Brief-card `prId` are handled via `useRouter()`/`usePathname()` and props already in scope inside `OverviewTab`/`BriefCard`/`IntentCard`, per Q3 refinement) and does NOT touch `client/src/vendor/shared/contracts/` (owned by TASK-001).

**Acceptance Criteria:**
- [ ] AC-001: `BriefCard` (in `OverviewTab`, replacing `PrBriefPlaceholder` at current lines 22-144/155) renders a banner colored by `risk_level` (high/medium/low) and the `what`/`why` text from the fetched `Brief` — maps to R10
- [ ] AC-002: where a completed `RunSummary` exists for the PR (fetched independently — `OverviewTab` currently fetches none, needs a new data path), `BriefCard` shows its metrics (`findings_count`, `blockers`, `score`, `cost_usd`, `tokens_in`→`tokens_out`) alongside the Brief text, sourced from `RunSummary`, not from `Brief` — maps to R11
- [ ] AC-003: where no completed Run Review exists, `BriefCard` still renders full Brief content and shows a nudge ("Review not run yet") with an embedded `<RunReviewDropdown prId={prId} .../>` (reused component, not a new hook) in place of the metrics block — maps to R12
- [ ] AC-004: `risks[]` from Brief renders as an accordion inside `IntentCard` (replacing the `riskChips` block at lines 248-271), reusing the `RISK_ICONS` mapping (lines 9-19) per `kind`, showing `title` + clickable `file_refs`, expanding to show `explanation`; new `risks: Risk[]` prop added to `IntentCard` — maps to R14
- [ ] AC-005: clicking a `file_ref` (in Risk accordion or Review Focus list) navigates via `router.push` with `?tab=diff&file=<path>&line=<n>` (matching the existing dead-link shape already written by `SymbolList.tsx`), and `DiffTab`/viewer reads these params on mount to scroll into view and highlight the target file (and line, if present) — maps to R15
- [ ] AC-006: `BriefCard` shows a separate "Regenerate Brief" button (distinct from Run Review) that calls the new brief-mutation hook with `force: true`, and does not trigger `useRunReview()` — maps to R16
- [ ] AC-007: edge cases — 0 `risks` hides the accordion (no empty state); 0 `review_focus` hides that section; loading state matches `IntentCard`'s "Recalculating…" disabled-button pattern; error state matches `BlastRadiusCard`'s `ErrorBoundary` "Failed to load..." pattern with a retry via the regenerate button — maps to spec Edge Cases

**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001 | RTL component test on `BriefCard` — mock `Brief{risk_level:"high"}` → assert red banner class/style + `what`/`why` text rendered |
| AC-002 | RTL component test — mock `RunSummary` present → assert metrics block visible with `RunSummary` values (not Brief values) |
| AC-003 | RTL component test — mock Brief without `RunSummary` → assert nudge text + `RunReviewDropdown` rendered instead of metrics; click triggers the same mutation as the header's Run Review button |
| AC-004 | RTL component test on `IntentCard` — mock `risks` prop → assert accordion header per risk (icon/title/refs), click expands `explanation` |
| AC-005 | `./scripts/e2e.sh` (e2e/ scope, not this task's test-writer scope) — open PR → click review-focus link → "Files changed" tab active, target file in viewport and highlighted |
| AC-006 | RTL component test — click regenerate → assert `POST /pulls/:id/brief {force:true}` mutation called; assert `useRunReview` mutation NOT called |
| AC-007 | RTL component tests — empty `risks`/`review_focus` arrays → sections absent; loading/error snapshot states |

---

## Implementation Phases

> ⚙️ Execution mode: **multi-agent** (TASK-001 ∥ TASK-002 — owned paths do not overlap)

### Phase 1: DB / Schema (TASK-001, before Phase 2 route/service work)
- [ ] `server/src/db/schema/reviews.ts` — `prIntent`: remove `riskAreas` jsonb column; `prBrief`: add `headSha: text("head_sha")` nullable column
- [ ] `pnpm db:generate` (server/) — produces next sequential migration (`0016_<generated-name>.sql`, per existing `0000`–`0015` convention)
- [ ] Review generated SQL: confirm `DROP COLUMN risk_areas` on `pr_intent` and `ADD COLUMN head_sha` (nullable, no default) on `pr_brief`
- [ ] `pnpm db:migrate` (server/)

### Phase 2: Backend (TASK-001)
- [ ] `server/src/vendor/shared/contracts/brief.ts` — add `Brief`, `ReviewFocusItem`; change `Risk.kind` to `RiskAreaKind`; remove `risk_areas` field from `Intent`; remove `RiskArea` type if orphaned after this change (verify no other consumers first); delete composed `PrBrief` type entirely (lines ~214-221); verify `BlastRadius` type (lines ~60-65) has no remaining consumers after `PrBrief` removal — if orphaned, remove as additional dead-code cleanup (optional, matches spec's "заміна мертвого коду" goal)
- [ ] `client/src/vendor/shared/contracts/brief.ts` — mirror the exact same changes (manual sync, no symlink — see Architecture Notes)
- [ ] `server/src/modules/reviews/intent-deriver.ts` — remove `risk_areas` generation from the prompt/schema passed to `completeStructured`
- [ ] `server/src/modules/reviews/repository.ts` / `repository/pull.repo.ts` — remove `riskAreas` read/write in `upsertIntent`/`getIntent`
- [ ] `server/src/modules/reviews/routes.ts` — verify `GET /pulls/:id/intent` response no longer surfaces `risk_areas` (should follow automatically once contract + repository change, but confirm no hardcoded field mapping remains)
- [ ] `server/src/modules/brief/repository.ts` — `getCachedBrief(prId)`, `upsertBrief(prId, brief, headSha)`; advisory-lock helper wrapping `db.transaction()` + `db.execute(sql`select pg_advisory_xact_lock(hashtext($1::text))`)`, keyed by `prId`
- [ ] `server/src/modules/brief/service.ts` — orchestration mirroring `intent-deriver.ts`'s cache-check + soft-fail pattern (lines 54-59, 61-77, 111-123): input assembly (intent + blast + smart-diff + linked_issue + specs), token-budget truncation (AC-003 — check for an existing tokenizer utility in `reviewer-core`/adapters before adding a new dependency), one `completeStructured` call via `resolveFeatureModel(container, wsId, "risk_brief")`, grounding-gate filter, advisory-lock-guarded cache read/write
- [ ] `server/src/modules/brief/routes.ts` — `POST /pulls/:id/brief`, constructed as `new BriefService(container)` ad-hoc (mirrors `blast/routes.ts`, `pulls/routes.ts` — no `container.ts` getter needed per existing pattern)
- [ ] `server/src/platform/container.ts` — **no change expected**; do not add a `briefService` getter unless a genuine cross-module consumer emerges during implementation (see Architecture Notes)

### Phase 3: Frontend (TASK-002)
- [ ] `client/src/lib/api.ts` — `postPrBrief(prId, { force }?): Promise<Brief>` following the `fetchSmartDiff`-style named-helper convention
- [ ] `client/src/lib/hooks/pulls.ts` — `useBrief(prId)` (query, calls `postPrBrief` without force on mount, mirrors `usePullIntent`'s 404-aware retry); `useRegenerateBrief(prId)` (mutation, calls `postPrBrief(prId, {force:true})`, invalidates `["brief", prId]` on success, mirrors `useRecalculateIntent`)
- [ ] `client/src/app/repos/[repoId]/pulls/[number]/_components/BriefCard/` — new component folder (mirrors `BlastRadiusCard/` structure): top banner + what/why, metrics-or-nudge block, Review Focus list, Regenerate button
- [ ] `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx` — remove `PrBriefPlaceholder` (lines 22-144, usage at 155); render `<ErrorBoundary fallback={...}><BriefCard .../></ErrorBoundary>` (same wrapping pattern used for `BlastRadiusCard` at lines 179-190); pass `risks` from Brief into `<IntentCard risks={...} .../>`
- [ ] `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx` — remove `riskChips` block (lines 248-271), add accordion using `RISK_ICONS` (lines 9-19) and new `risks: Risk[]` prop
- [ ] `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx` (+ `SmartDiffViewer`/`DiffViewer`) — read `file`/`line` search params on mount, scroll target file into view, apply highlight; match the `?tab=diff&file=<path>&line=<n>` shape already written (unused) by `SymbolList.tsx`
- [ ] `client/messages/en/*.json` — add translation keys for Brief copy (banner text, nudge text, regenerate button, "Failed to load Brief") — no hardcoded strings in JSX, per `client/CLAUDE.md`

### Phase 4: Tests
- [ ] `server/src/modules/brief/brief.test.ts` — unit (hermetic): AC-002, AC-003, AC-004, AC-005, AC-009
- [ ] `server/src/modules/brief/brief.it.test.ts` — integration (real Postgres): AC-001, AC-006, AC-007, AC-008, AC-010
- [ ] `server/src/modules/reviews/reviews.test.ts` (extend existing) — AC-011 contract regression (`GET /pulls/:id/intent` shape, `Risk.kind` enum rejection)
- [ ] `client/src/app/repos/[repoId]/pulls/[number]/_components/BriefCard/BriefCard.test.tsx` — AC-001, AC-002, AC-003, AC-006, AC-007
- [ ] `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.test.tsx` (extend existing) — AC-004
- [ ] AC-005 (file navigation) is an E2E scenario per spec's own Verification hints — belongs to `e2e/` (`./scripts/e2e.sh`), out of `test-writer` agent's scope (defers to `e2e` agent); reference `e2e/docs/flows.md` for flow conventions

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| No `pg_advisory_xact_lock` precedent anywhere in codebase — net-new pattern | `prId` is a `uuid` column; advisory-lock functions take `bigint` — convert via `hashtext(prId::text)`. Collision only causes unnecessary serialization (still correct, just slower), not a correctness break, since the lock is purely advisory. |
| `client/src/vendor/shared/contracts/` is a separate, manually-synced copy (not a symlink) — contradicts `CLAUDE.md`'s stated alias behavior | TASK-001 owns both copies of `brief.ts` explicitly (see Owned Paths) to avoid split ownership across parallel tasks. Flag doc drift in `CLAUDE.md`/`gotchas.md` as a follow-up (out of this plan's scope to fix). |
| `linked_issue` on `PrDetail` is a defined contract field that is never populated by any existing code path (GitHub-refresh or offline branch) | Accepted gap — spec's own edge case ("Немає прив'язаного issue") already covers this as a normal path. Brief will simply never receive issue input until a separate fix wires `linked_issue` population (out of scope here). |
| "Active review-agent" resolution for Context Folder spec selection is not a single documented concept — closest precedent is `run-executor.ts:336-368`'s per-agent `contextDocPaths` merge | Backend implementer must trace how `run-executor.ts` resolves the `agent` object for a given PR/repo (likely via `reviews/service.ts`) and reuse the identical resolution call for brief's spec-selection step — do not invent a new "active agent" concept. |
| Spec's error shape `{error: string}` (AC-9) matches neither existing convention in the codebase: generic Fastify `{statusCode,error,message}` (per `server/docs/api-contracts.md`) nor `reviews` module's `{error:{code,message}}` (used by `GET /pulls/:id/intent` 404) | **Follow the approved spec literally: `{ error: string }`** (Contracts section, AC-9) — this plan implements the committed spec, it does not amend it. If the object shape is genuinely preferred later, that requires an explicit spec revision, not a silent plan-level substitution. |
| Token-budget enforcement (AC-3, ≤8000 tokens) needs a tokenizer — none confirmed to exist yet in `server/` | Check `reviewer-core/` and existing LLM adapter code for a token-counting utility before adding a new dependency (e.g. `tiktoken`); if none exists, this is a new small utility, not a new architectural layer. |
| `OverviewTab.tsx` currently fetches zero `RunSummary`/run data (needed for AC-011/R11) — this is new data-fetching, not just UI wiring | `BriefCard`/`OverviewTab` needs its own `RunSummary` query (likely reusing `usePrReviews`/`usePrRuns` hooks already used in `page.tsx`, called again here — TanStack Query dedupes by query key so this is not a duplicate network call in practice). |

## Out of Scope
- WhyTimeline (stretch feature) — separate future spec
- Diff bodies/hunks in the LLM input (explicitly excluded by AC-2)
- Wiring `linked_issue` population from GitHub (accepted gap, see Risks)
- Changing Blast Radius card's own rendering logic, Run Review logic, or Smart Order tab behavior — only an additive `file`/`line` deep-link *consumer* is added to the diff-viewing tab for AC-14 (does not modify existing diff-rendering logic, consistent with the spec's non-goal)
- Model configuration for `risk_brief` — already registered in `platform.ts` (both server and client copies), no new config needed
- Accessibility (explicitly out of scope per spec)
- Fixing `CLAUDE.md`/`client/insights/gotchas.md` doc drift about the `@devdigest/shared` alias (flagged as a risk, not remediated here)

## Architecture Notes

- **Module boundary**: `brief` is a new, self-contained module under `server/src/modules/brief/` per `server/CLAUDE.md` convention — reads other modules exclusively through their public service methods (`BlastService.getForPr`, `PullsService.buildSmartDiff`, `container.contextService.readDocsByPaths`, `reviews` intent read path) and writes nothing to them.
- **DI pattern**: follow the "ad-hoc construction in routes.ts" pattern used by `reviews`, `pulls`, and `blast` (`new BriefService(container)` inside `brief/routes.ts`) rather than adding a `container.ts` getter — no existing module needs to call into `brief` from server-side code, so a getter is premature. `container.ts` is expected to require **zero changes** for this feature.
- **Advisory lock placement**: the lock acquire/release belongs in `brief/repository.ts` (infrastructure layer — it's a DB mechanism), invoked by `brief/service.ts` as an orchestration step wrapping the "check cache → call LLM → grounding → upsert" sequence. Do not leak `pg_advisory_xact_lock` SQL into `service.ts`.
- **Error-handling convention**: `intent-deriver.ts` uses a soft-fail pattern (catch, log, return `undefined`, caller continues) while `conventions/extractor.ts` lets errors propagate. `brief` should follow `intent-deriver.ts`'s soft-fail-at-the-boundary style for LLM-call failures specifically (AC-9 requires a clean deterministic error response, not a propagated exception with stack trace), but this "soft fail" surfaces as an explicit 5xx to the HTTP caller — it is not silent like intent's fallback-to-undefined.
- **Shared contracts duplication**: this is the one place this plan deviates from strict Onion module ownership — `server/src/vendor/shared/contracts/brief.ts` and `client/src/vendor/shared/contracts/brief.ts` are two independent files (confirmed: no symlink, `client/tsconfig.json` points at the client's own local copy) and both must change together. Assigning both to TASK-001 avoids a race/overlap between the two parallel implementer tasks.
- **Frontend data flow for AC-14**: no prop-threading through `page.tsx` is required — `SymbolList.tsx` already demonstrates that deeply-nested components can call `useRouter()`/`router.push()` directly to manipulate the `?tab=` URL param that `page.tsx` reads (`page.tsx:75`). `BriefCard`'s Review Focus list and `IntentCard`'s Risk accordion should do the same.
- **RunReviewDropdown reuse (AC-12)**: embed the component directly (`<RunReviewDropdown prId={prId} .../>`) rather than prop-drilling a callback — it's already designed to accept `size`/`kind` variants for embedding in multiple locations (currently used in `PrDetailHeader`). Implementer must verify which of `RunReviewDropdown`'s props (`warnMerged`, `onRunStart`, `onRunsStarted`) are required vs optional before wiring into `BriefCard`.
