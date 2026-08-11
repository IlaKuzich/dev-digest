import type { PrMetricsRollup } from '@devdigest/shared';

/**
 * Pure PR metrics rollup aggregation — no DB/FS/network. Groups a PR's agent
 * runs by `agent_id` (each null-`agent_id` run is its own singleton — AC-11),
 * keeps the newest `status='done'` run per group, then rolls the retained
 * set up: SUM cost/tokens, MIN score. Findings counting is a separate step
 * (`countFindings`) over a pre-fetched, already-non-dismissed-filtered array.
 *
 * Traced to spec `2026-08-11-pr-brief-rollup-layout` AC-1…AC-6, AC-11, AC-19.
 */

/** One agent_runs row shaped for the rollup. Costs are already `Number()`-cast
 *  by the caller (repository) per the NUMERIC(12,6) convention (AC-19). */
export interface RollupRunRow {
  prId: string;
  runId: string;
  agentId: string | null;
  ranAt: Date | string | null;
  score: number | null;
  costUsd: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
}

/** The retained latest-done-run-per-agent set, rolled up for one PR. */
export interface PrRunAgg {
  runIds: string[];
  score: number | null;
  costUsd: number | null;
  tokensIn: number;
  tokensOut: number;
}

function ranAtMs(ranAt: Date | string | null): number {
  if (ranAt == null) return -Infinity; // missing ran_at sorts oldest (AC-1)
  const ms = ranAt instanceof Date ? ranAt.getTime() : Date.parse(ranAt);
  return Number.isNaN(ms) ? -Infinity : ms;
}

/**
 * Group runs per PR, then per agent (null `agent_id` = own singleton group,
 * never merged with another null-`agent_id` run — AC-11), retain only the
 * newest run in each group, and roll the retained set up per PR.
 */
export function rollupRunsByPr(rows: RollupRunRow[]): Map<string, PrRunAgg> {
  // prId -> groupKey -> newest row in that group so far
  const byPr = new Map<string, Map<string, RollupRunRow>>();

  for (const row of rows) {
    let groups = byPr.get(row.prId);
    if (!groups) {
      groups = new Map();
      byPr.set(row.prId, groups);
    }
    // A null agent_id run is its own singleton group, keyed by its own runId —
    // never merged with another null-agent_id run (AC-11).
    const groupKey = row.agentId ?? `__run__:${row.runId}`;
    const existing = groups.get(groupKey);
    if (!existing || ranAtMs(row.ranAt) > ranAtMs(existing.ranAt)) {
      groups.set(groupKey, row);
    }
  }

  const result = new Map<string, PrRunAgg>();
  for (const [prId, groups] of byPr) {
    const retained = [...groups.values()];
    const runIds: string[] = [];
    let scoreMin: number | null = null;
    let costSum: number | null = null;
    let tokensIn = 0;
    let tokensOut = 0;

    for (const run of retained) {
      runIds.push(run.runId);
      if (run.score != null) {
        scoreMin = scoreMin == null ? run.score : Math.min(scoreMin, run.score);
      }
      if (run.costUsd != null) {
        costSum = costSum == null ? run.costUsd : costSum + run.costUsd;
      }
      tokensIn += run.tokensIn ?? 0;
      tokensOut += run.tokensOut ?? 0;
    }

    result.set(prId, { runIds, score: scoreMin, costUsd: costSum, tokensIn, tokensOut });
  }

  return result;
}

/** Count pooled non-dismissed findings + CRITICAL blockers among them
 *  (severity === 'CRITICAL' && !dismissed_at — the query is expected to have
 *  already filtered to non-dismissed rows; AC-5/AC-6). */
export function countFindings(rows: { severity: string }[]): {
  findingsCount: number;
  blockers: number;
} {
  let blockers = 0;
  for (const row of rows) {
    if (row.severity === 'CRITICAL') blockers++;
  }
  return { findingsCount: rows.length, blockers };
}

/** Assemble the `PrMetricsRollup` DTO. `undefined` agg (empty set) → `null`
 *  (AC-10/16). */
export function toMetricsRollup(
  agg: PrRunAgg | undefined,
  counts: { findingsCount: number; blockers: number },
): PrMetricsRollup | null {
  if (!agg) return null;
  return {
    score: agg.score,
    findings_count: counts.findingsCount,
    blockers: counts.blockers,
    cost_usd: agg.costUsd,
    tokens_in: agg.tokensIn,
    tokens_out: agg.tokensOut,
  };
}
