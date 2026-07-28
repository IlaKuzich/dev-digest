# Evals Insights

Non-obvious discoveries from real sessions. Specific and actionable — pass the cold-read test.
See also: `insights/gotchas.md` for known quirks at project start.

---

## What Works

## What Doesn't Work

2026-07-26 — Running multiple `pnpm eval:repeat` invocations in parallel (e.g. one per A/B label) corrupts both the live console aggregation and the saved `results/repeat-<label>.json` files. `repeat.ts` tracks "new records since I started" via a global line-count checkpoint (`recordCount()` / `loadRecords(sinceLine)`) over the single shared `evals/results/records.jsonl`, not filtered by its own process/config/nodeid — so concurrent processes each pick up records the *other* processes appended in the same window. Symptom: printed pass counts exceed the requested `-n` (e.g. `7/8/10` instead of `5`), and some result blocks are byte-identical across different labels' output. ref: evals/src/repeat.ts:100-112, evals/src/records/stats.ts:59-72

## Codebase Patterns

## Tool & Library Notes

2026-07-26 — Despite the corruption above, each row written to `records.jsonl` is still individually correct — `record()` stamps every row with its own `run_id`, `config`, and full `nodeid` (test file path included). So a parallel-run mess is always recoverable after the fact: filter the raw JSONL by `(nodeid path, config, run_id)` to isolate one label's true records, then call `aggregate()` from `src/records/stats.ts` directly on that filtered list to rebuild a correct `results/repeat-<label>.json` (same shape `repeat.ts` writes: `{ label, git_sha, dirty, times, vitestArgs, tests }`). `eval:delta` then reads it correctly since it only trusts the saved JSON, not the live console output. ref: evals/src/records/record.ts:74-97, evals/src/records/stats.ts:98-135

## Recurring Errors & Fixes

## Session Notes

2026-07-26 — Ran 5x stability comparison (baseline / architecture-reviewer / architecture-reviewer-light) via `eval:repeat`, launched in parallel per user request → discovered the shared-`records.jsonl` race above, recovered clean per-label stats by filtering raw records and rebuilding the `repeat-*.json` files, then ran `eval:delta baseline architecture-reviewer` successfully. Practical takeaway: run `eval:repeat` labels sequentially when doing a baseline/candidate comparison — don't launch multiple `eval:repeat`/vitest processes concurrently against the same `evals/` checkout. Files: evals/src/repeat.ts, evals/results/records.jsonl.

## Open Questions
