# Workflow Retro Ledger

Trend file — one row per two-worktree (or single-workflow) `/workflow-retro` run. Append only,
never edit existing rows. This is distinct from `docs/agent-runs/README.md` (one-line pointer per
retro report): this ledger tracks the fan-out execution metrics — tokens, parallelism, tool-calls,
fix-loop iterations — needed to compare a parallel run's actual cost against itself over time.

| Date | Worktree / Feature | Tokens | Parallel | Agents | Tool-calls | Fix | Cost Est | Source retro |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-08-25→27 | A — Multi-Agent Review (`7-multiagent-review`, attribution feature `ingest` consumes) | 509.7M (orch 309.0M / sub 200.7M) | 2 concurrent implementers (T2‖T3, plan's own cap; solo T1, solo T4) | 10 distinct (10 cold + 4 warm resumes) | 628 | 1 (architecture-review pass — 3 WARNINGs, fixed + re-verified in one bounded loop) | $302.32 (orch $122.99 / sub $179.33) | [2026-08-25-multiagent-review.md](../agent-runs/2026-08-25-multiagent-review.md) |
| 2026-08-25→27 | B — Export to CI (`emdash/run-on-ci-h7wmw`, ingest/CI-runs feature) | 266.6M | up to 4 implementers started within a 13-min window (T1–T4); plan intended ≤2 concurrent — see retro's "design departure" note | 11 distinct (11 cold + 12 warm resumes) | 660 | 3 (relative-time WARNING dedup; yaml-editor typecheck; CRITICAL `permissions:` bypass caught by `pr-self-review` — each fixed by the warm owning implementer + re-checked by the finder) | ~$188 (est., list-price upper bound per retro) | [2026-08-25-export-to-ci.md](../agent-runs/2026-08-25-export-to-ci.md) |

## Parallel run — measured (not a sequential estimate)

Per the lab's own rule: compare measured quantities, not "parallel tokens" against an invented
sequential baseline.

- **Combined cost, both worktrees:** $302.32 + ~$188 ≈ **~$490**.
- **Combined tokens:** 509.7M + 266.6M = **776.3M**.
- **Wall-clock, start → green merge:** both sessions started within the same ~4-minute window on
  2026-08-25 (Worktree A `05:17 UTC`, Worktree B `05:21 UTC`, per each retro's own session header).
  The merge that lands both is `77b490a` ("Merge branch `emdash/run-on-ci-h7wmw` into
  `7-multiagent-review`"), committed **2026-08-27 08:44:55 +03:00**. Feature commits landed at
  `080a6a8` (Worktree A, 08:30:36 +03:00) and `74d2e97` (Worktree B, 08:39:10 +03:00) — 9 minutes
  apart, then merged 6 minutes after the later one. Total elapsed from first session start to green
  merge: **≈48h25m** (2026-08-25 05:17 UTC → 2026-08-27 05:44:55 UTC).
- **Human review time:** not separately tracked — neither retro records a timestamped
  human-review-only interval distinct from agent compute/wait time. Logging this as a gap rather
  than inventing a figure.
- **Re-runs (fix-loop iterations):** 1 (Worktree A) + 3 (Worktree B) = **4 total**, all resolved in
  a single fix→re-check pass each (no repeated/failed re-verification in either worktree).
- **Not counted as a fix-loop re-run, flagged separately:** Worktree A's implementer #4 was resumed
  by a channel outside the orchestrator for ~2 days post-completion, ballooning from ~127K to 65.0M
  tokens (>500x) with uncoordinated writes into three other tasks' file territory. This inflates
  Worktree A's token/cost/wall-clock figures above but is a channel-authorization failure, not a
  designed fix-loop cycle — see the source retro's "Where the run departed from the design" section.

## Conflicts observed during merge

Both worktrees' `Owns` file lists were disjoint per their respective plans (confirmed by
`plan-verifier` Mode A/B on each branch, both clean) — **0 merge conflicts** on file content. The
one real collision was the non-file-ownership one above (implementer #4 writing into T2/T3/T4
territory within its own worktree, not a cross-worktree conflict at merge time).
