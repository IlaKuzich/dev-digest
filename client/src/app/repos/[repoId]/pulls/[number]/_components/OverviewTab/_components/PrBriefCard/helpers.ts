/* Pure helpers for PrBriefCard — no React, no I/O, unit-testable directly. */
import type { RunSummary } from "@devdigest/shared";

export interface BriefMetrics {
  score: number;
  blockers: number;
  findingsCount: number;
  costUsd: number | null;
  tokensIn: number;
  tokensOut: number;
}

/** The top-card metrics (findings, blockers, score, cost, tokens) come from
   the latest COMPLETED review run, not from the Brief LLM output (spec
   Contracts table). `runs` is newest-first (server ordering) — find the
   first `status === "done"` row. No done run (or a done run with no score
   yet persisted) → null, which drives the "omit run metrics" branch (AC-20). */
export function latestDoneMetrics(runs: RunSummary[] | undefined): BriefMetrics | null {
  const run = runs?.find((r) => r.status === "done");
  if (!run || run.score == null) return null;
  return {
    score: run.score,
    blockers: run.blockers ?? 0,
    findingsCount: run.findings_count ?? 0,
    costUsd: run.cost_usd,
    tokensIn: run.tokens_in ?? 0,
    tokensOut: run.tokens_out ?? 0,
  };
}
