# INSIGHTS — server

Append-only engineering log for this package (includes `src/modules/repo-intel`).
Read before answering (per CLAUDE.md); appended via the `engineering-insights` skill.
One finding per entry, actionable "cold" with `file:line` evidence. Append under the
matching section — never reorder or overwrite existing entries (correct a stale one
with a new dated note). Prune obsolete entries only during a deliberate review.

## What Works
## What Doesn't Work
## Codebase Patterns
## Tool & Library Notes
## Decisions
## Recurring Errors & Fixes
## Session Notes
## Open Questions

## Decisions
- 2026-06-25 — Use `NUMERIC(12,6)` not `double precision` for any financial column (cost_usd). `double precision` drifts for financial values; `NUMERIC` is exact. Drizzle's `numeric()` returns values as **strings** at runtime — add `Number()` casts in every read path (`run.costUsd != null ? Number(run.costUsd) : null`) and `String()` casts on write. See `server/src/db/schema/runs.ts:32`, `server/src/modules/reviews/repository/run.repo.ts`, and `server/src/modules/pulls/routes.ts`.

## Codebase Patterns
- 2026-06-25 — `ReviewRepository` in `server/src/modules/reviews/repository.ts` is a thin wrapper around `run.repo.ts` but defines its **own inline parameter types**. When you extend `completeAgentRun` in `run.repo.ts`, you must also update the matching inline type in the wrapper class or TypeScript will error at the call site in `run-executor.ts`. These two files must stay in sync manually.
- 2026-06-25 — `latestCostByPr` and `latestReviewByPr` in `server/src/modules/pulls/routes.ts` both use an O(all-done-runs) fetch + JS-side dedup pattern. Acceptable at current scale but should eventually be replaced with a `DISTINCT ON (pr_id)` subquery. Filed as tech debt.
- 2026-07-03 — (updates the 2026-06-25 note above) The O(all-done-runs) fetch + JS dedup rollup logic moved out of `pulls/routes.ts` during the pulls onion refactor. It now lives as newest-first repo queries `reviewScoresForPrs`/`activeFindingsForPrs` in `server/src/modules/reviews/repository/review.repo.ts` and `doneRunCostsForPrs` in `.../repository/run.repo.ts` (deduped JS-side via `latestByPr` in `server/src/modules/pulls/helpers.ts`). These three queries are now the single place to swap in a `DISTINCT ON (pr_id)` (or `inArray`-scoped window) query — routes.ts no longer contains any SQL.

## Recurring Errors & Fixes
- 2026-06-25 — When re-adding a column that a previous migration dropped (migration 0009 dropped `cost_usd`), create a new migration (0010, then 0011) rather than editing the original. The DB has already applied 0009; editing it would cause `pnpm db:migrate` to silently skip the edit.
- 2026-06-25 — **Manually created `.sql` migration files are invisible to `pnpm db:migrate` unless added to `server/src/db/migrations/meta/_journal.json`.** Drizzle's migrator reads the journal, not the filesystem. Only `pnpm db:generate` adds journal entries automatically. If you hand-write a `.sql` file, you must also append an entry to `_journal.json` with the correct `idx`, `tag` (filename without `.sql`), `version: "7"`, `breakpoints: true`, and a `when` timestamp. Missing this causes "column does not exist" 500 errors at runtime even after `pnpm db:migrate` succeeds.
- 2026-07-04 — Migrations `0010_add_cost_usd_agent_runs.sql` and `0011_change_cost_usd_to_numeric.sql` were hand-authored (per the note above) and never got a matching `meta/0010_snapshot.json` / `0011_snapshot.json`. Because `drizzle-kit generate` diffs against the LATEST snapshot file on disk (not the actual DB or a full re-scan), the next `pnpm db:generate` after those two (migration `0012`, `server/src/db/migrations/0012_wandering_runaways.sql`) diffed against the stale `0009_snapshot.json` and phantom-regenerated `ALTER TABLE "agent_runs" ADD COLUMN "cost_usd" numeric(12,6)` — a column that already exists — which would fail on any DB that already ran 0010/0011. Caught by manually inspecting the generated SQL before committing; fixed by deleting the stray statement (the new `0012_snapshot.json` drizzle-kit writes alongside it IS a full-state snapshot matching current `schema.ts`, so it repairs the chain going forward — confirmed by re-running `pnpm db:generate` afterward and getting "No schema changes, nothing to migrate"). **Lesson: after ANY `pnpm db:generate`, read the generated `.sql` before committing — a hand-authored migration anywhere in the history can make a later auto-generated one silently redundant/wrong.**
