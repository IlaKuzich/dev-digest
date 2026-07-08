# Conventions → Skill (Extractor) + API Contract Reviewer experiment

**Date:** 2026-07-08
**Branch:** `2-SKILLS`
**Status:** Approved design → ready for implementation plan

## Summary

Two related deliverables that both turn *knowledge about a repo* into **skills** that
change real reviews:

- **Part A — Conventions Extractor** (the substantial build): scan a cloned repo,
  have a cheap model propose coding-convention candidates with evidence, **verify that
  evidence in code** (drop the ungrounded), let the user accept / reject / edit
  candidates, then merge the accepted ones into a single `repo-conventions` skill that
  is linked to an agent via the existing Skills mechanism.
- **Part B — API Contract Reviewer experiment** (authored content + protocol, no new
  backend): create an agent + 4 hand-written contract skills through the existing UI,
  and run a control experiment (PR reviewed with vs. without the skills).

Part A is a real feature (DB, module, UI). Part B exercises the *already shipped*
Skills + Agents machinery and is largely authored content plus an experiment protocol.

## Already exists (do not rebuild)

- **`repoIntel.getConventionSamples(repoId, n)`** — top-N files by rank, dropping
  tests / configs / migrations (`isJunkPath`). The "pick samples in code, no model"
  step is essentially done. (`server/src/modules/repo-intel/service.ts:630`)
- **LLM structured output** — `container.llm(id).completeStructured<T>({ schema, … })`
  takes a Zod schema and returns validated data with reprompt-on-error retries.
  (`server/src/vendor/shared/adapters.ts:55`)
- **Feature model `conventions`** — already registered
  (`resolveFeatureModel(container, ws, 'conventions')`, default `openai/gpt-5.4`) and
  selectable in Settings. (`server/src/modules/settings/feature-models.ts`)
- **Skills full loop** — `POST /skills` (`CreateSkillInput = {name, description, type,
  body}`, versioned), agent linking (`POST /agents/:id/skills`), prompt injection via
  `enabledSkillsForAgent`. `SkillType` already includes `'convention'`; `SkillSource`
  already includes `'extracted'`. (`server/src/vendor/shared/contracts/knowledge.ts:115`)
- **i18n `conventions.json`** — page + card strings already stubbed
  (`client/messages/en/conventions.json`).

## Scope

**In scope:**
- Part A — `conventions` table + `convention_scans` table, `conventions` server module,
  extract pipeline with **moderate grounding**, `/conventions` client page, and the
  "Create skill from conventions" merge → single `repo-conventions` skill.
- Part B — the API Contract Reviewer agent, 4 authored skills (one via import), and a
  documented with/without control experiment.
- Two product-quality enhancements folded into Part A v1 (configs-as-signal; category
  taxonomy).

**Out of scope (backlog, see Product enhancements):**
- One-skill-per-candidate output (v1 is always a single merged skill).
- Dedup against existing skills, good/bad example generation, embedding clustering,
  frequency-based confidence, reject-learning loop.

## Design

### A1. Schema (two new files + one migration)

Per server convention, add **new** schema files (never edit existing ones), then a
generated migration. **After `pnpm db:generate`, read the generated `.sql` before
committing** (project has a history of phantom/redundant ALTERs from hand-authored
migrations — see `server/INSIGHTS.md`).

- **`convention_scans`** — one row per extract run:
  `id, repo_id (fk repos), workspace_id, sample_count int, model text, created_at`.
- **`conventions`** — one row per candidate:
  `id, scan_id (fk convention_scans, ON DELETE CASCADE), repo_id, workspace_id,
  category text, rule text, evidence_file text, evidence_line_start int,
  evidence_line_end int, evidence_snippet text, confidence NUMERIC(4,3),
  status text ('candidate' | 'accepted' | 'rejected'), edited_rule text NULL,
  skill_id (fk skills NULL — set when materialized into a skill),
  created_at, updated_at`.
  - `confidence` is `NUMERIC` → Drizzle returns it as a **string**; add `Number()` on
    read and `String()` on write (see `server/INSIGHTS.md` NUMERIC note).

### A2. Contracts (`@devdigest/shared` — mirror into BOTH vendored copies, one commit)

Canonical: `server/src/vendor/shared/`; mirror into `client/src/vendor/shared/`. Missing
one side causes runtime Zod parse failures (`INSIGHTS.md` cross-cutting note).

- `ConventionStatus = z.enum(['candidate','accepted','rejected'])`.
- `Convention` — row DTO (ids, category, rule, edited_rule, evidence fields, confidence
  as number, status, skill_id, timestamps).
- `ConventionScan` — `{ id, repo_id, sample_count, model, created_at }`.
- `ConventionCandidate` — **the `completeStructured` schema**:
  `{ category: ConventionCategory, rule: string, evidence: { file: string, line:
  number, snippet: string }, confidence: number (0..1) }`.
- `ConventionCategory = z.enum(['naming','error-handling','structure','imports',
  'api-shape','testing'])` (enhancement #2, v1).
- `ExtractResult = { scan: ConventionScan, candidates: Convention[], dropped: number }`.
- `UpdateConventionInput = { status?: ConventionStatus, rule?: string,
  category?: ConventionCategory }` (accept/reject and/or edit).
- `CreateConventionSkillInput = { name: string, description: string, body: string }`.

### A3. Server module `conventions` (onion: routes → service → repository)

Register in `modules/index.ts`. Zod bodies/params on every route (no hand-rolled parse).

- `POST /repos/:id/conventions/extract` → run pipeline (A4), return `ExtractResult`.
- `GET  /repos/:id/conventions` → latest scan's candidates + persisted `accepted`.
- `PATCH /conventions/:id` (`UpdateConventionInput`) → accept / reject / edit.
- `POST /repos/:id/conventions/skill` (`CreateConventionSkillInput`) → create the merged
  skill via `SkillsService.create` with `source:'extracted'`, `type:'convention'`;
  stamp `skill_id` onto the accepted conventions it materialized (provenance).

Repository owns `conventions` + `convention_scans`.

### A4. Extract pipeline (service) — where quality lives

1. **Model:** `resolveFeatureModel(container, ws, 'conventions')`.
2. **Samples:** `repoIntel.getConventionSamples(repoId, 12)` → read those files from the
   clone, **plus** read config files directly (eslint / tsconfig / prettier /
   package.json) as extra signal (**enhancement #1, v1**). Record `sample_count`.
3. **Model call:** `llm.completeStructured({ schema: { candidates: [ConventionCandidate] },
   model, messages })` — prompt asks for house conventions with file+line+snippet
   evidence and a confidence.
4. **Grounding (moderate):** for each candidate, read `evidence.file` from the clone.
   - File missing → **drop**.
   - Normalize whitespace and search for `snippet` **anywhere in the file**; not found
     → **drop**; found → **refine** `evidence_line_start/end` to the actual matched
     line(s).
   - The model's `confidence` is stored but is **advisory only** (display / sort). The
     grounding check is the real gate — consistent with the server rule that a model's
     self-reported score is ignored.
5. **Persist** survivors as `status='candidate'` under the new `scan_id`; return
   `dropped` count.

**Re-scan semantics:** insert a new `convention_scans` row; delete the repo's prior
`candidate` + `rejected` rows; **keep** `accepted` rows; de-duplicate freshly proposed
candidates against existing `accepted` by normalized `(category + rule)` so already
accepted rules do not resurface.

### A5. Client — `/conventions` page + create-skill modal

TanStack Query hooks through `lib/api.ts` (never `fetch` from a component). Page-local
code under `_components/`.

- **Nav:** "Conventions" entry under *Skills Lab*; page reads the **active repo** (repo
  switcher). Empty state + "Run extraction" CTA (strings already in `conventions.json`).
- **List:** candidate cards — rule (editable inline), `file:line` + snippet, confidence
  bar, **Accept / Reject**. Header: "Detected from N sample files · last scan …",
  **Re-scan**, "X of Y accepted", **Create skill** (enabled when ≥1 accepted).
- **Create-skill modal:** client composes a default merged markdown body from accepted
  candidates (heading + one section per rule with `file:line` + snippet); everything is
  editable (name defaults to `${repo}-conventions`, type `convention`); submit →
  `POST /repos/:id/conventions/skill`. The resulting skill is then linked to an agent
  through the existing Agent editor **Skills** tab.
- **i18n:** extend the existing `conventions.json`.

### Part B — API Contract Reviewer experiment

Uses the already-shipped Skills + Agents features — **no new backend**.

- Create an **API Contract Reviewer** agent through the UI (its system prompt).
- Author 4 directive skills, each with a "good / bad" example:
  - `breaking-change` — changing or removing a public contract.
  - `response-schema` — changes to response shape (types, field requiredness).
  - `semver-discipline` — when a change requires a major bump.
  - `deprecation-policy` — how to mark deprecated instead of silent removal.
- Link the skills to the agent (Skills tab); bring **at least one in via import** to
  exercise that path.
- **Control experiment:** take/create a PR that renames a response field or changes a
  route signature. Run the agent **without** skills (misses it) vs **with** skills
  (catches the breaking change and comments). This spec records the protocol and the
  success criterion; it is not code.

## Product enhancements

**In v1 (two cheapest, already folded into Part A):**
1. Feed eslint / tsconfig / prettier / package.json as additional model signal (A4.2).
2. Fixed `category` taxonomy for grouping / filtering (A2).

**Backlog:**
- Dedup candidates against existing skills.
- A "good / bad" example per rule (a second cheap model call).
- Cross-file pattern frequency as an objective confidence signal.
- Embedding clustering of snippets to merge near-duplicate rules.
- Per-category sampling (guarantee coverage across categories).
- Reject-learning loop ("don't resurface things like this").

## Data flow (extract → skill)

```
/conventions "Run extraction"
  → POST /repos/:id/conventions/extract
  → resolveFeatureModel('conventions')
  → getConventionSamples(repoId,12) + config files  → sample_count
  → llm.completeStructured({ candidates:[ConventionCandidate] })
  → grounding: read evidence.file, match snippet, refine line | DROP
  → persist survivors (status='candidate') under new scan_id
  → ExtractResult { scan, candidates, dropped }

Accept / edit
  → PATCH /conventions/:id { status:'accepted' | rule | category }

Create skill
  → POST /repos/:id/conventions/skill { name, description, body }
  → SkillsService.create (source:'extracted', type:'convention', version:1)
  → stamp skill_id onto materialized conventions
  → link skill to agent (existing Skills tab) → injected into review prompt
```

## Testing (per TESTING.md)

- **Server unit** (mocked adapters): grounding drop logic (missing file / snippet not
  found / line refinement); extract pipeline with a mock LLM.
- **Server `*.it.test.ts`** (testcontainers): conventions CRUD; extract → persist;
  accept / reject / edit round-trip; create-skill provenance (`skill_id` stamped,
  `source='extracted'`); re-scan semantics (candidates/rejected cleared, accepted kept,
  de-dup against accepted).
- **Client RTL** (fetch mocked): candidate list + accept/reject; create-skill modal
  (merged body composition + submit payload). Mock `AppShell` as a passthrough for the
  page-level view test (see `client/INSIGHTS.md`).
- **i18n:** extend `messages/en/conventions.json`.

## Risks / open notes

- **Moderate grounding trade-off:** matching the snippet anywhere in the file (not only
  at the claimed line) accepts more candidates than strict line-matching, at some risk
  of a coincidental match. We refine the stored line to the real match to keep the UI
  citation honest. Revisit if false positives are noticeable.
- **Agent version replay:** as in the skills core loop, `agent_versions.config.skills`
  stores skill *ids*, not bodies — replaying an old agent version uses current skill
  bodies. Acceptable here; noted for a future eval-reproducibility slice.
- **Vendored contracts:** the `Convention*` contracts must land in both
  `server/src/vendor/shared/` and `client/src/vendor/shared/` in the same commit.
- **Migration hygiene:** read the generated `.sql` after `pnpm db:generate`; a
  hand-authored migration anywhere in history can make an auto-generated one redundant.
