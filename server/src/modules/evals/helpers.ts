import { z } from 'zod';
import {
  ExpectedFinding,
  type EvalCase,
  type EvalRunRecord,
  type EvalDashboard,
  type EvalTrendPoint,
  type EvalBatchSummary,
  type EvalOwnerKind,
} from '@devdigest/shared';
import type { EvalCaseRow, EvalRunRow, EvalRunJoinedRow } from './repository.js';
import { caseTypeOf } from './scoring.js';
import { RECENT_RUNS_LIMIT } from './constants.js';

/**
 * Pure application-layer helpers for the evals module: DB row ⇄ DTO mapping
 * and dashboard/batch aggregation math. No Drizzle, no Fastify — everything
 * here operates on already-fetched rows (repository.ts owns all SQL).
 */

// ---- expected_output parsing ------------------------------------------------

/** Safely parse `eval_cases.expected_output` (stored as untyped jsonb) into
 *  `ExpectedFinding[]`. Malformed/missing data degrades to `[]` (treated as a
 *  must_not_flag case) rather than throwing. */
export function parseExpectedOutput(raw: unknown): ExpectedFinding[] {
  const parsed = z.array(ExpectedFinding).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

// ---- DTO mappers ------------------------------------------------------------

export function toEvalCaseDto(row: EvalCaseRow): EvalCase {
  return {
    id: row.id,
    owner_kind: row.ownerKind as EvalOwnerKind,
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_files: row.inputFiles ?? null,
    input_meta: row.inputMeta ?? null,
    expected_output: row.expectedOutput ?? [],
    notes: row.notes ?? null,
  };
}

export function toEvalRunRecordDto(row: EvalRunRow, caseName: string | null): EvalRunRecord {
  return {
    id: row.id,
    case_id: row.caseId,
    case_name: caseName,
    ran_at: row.ranAt.toISOString(),
    actual_output: row.actualOutput ?? null,
    pass: row.pass ?? null,
    recall: row.recall ?? null,
    precision: row.precision ?? null,
    citation_accuracy: row.citationAccuracy ?? null,
    duration_ms: row.durationMs ?? null,
    cost_usd: row.costUsd ?? null,
    batch_id: row.batchId ?? null,
    agent_version: row.agentVersion ?? null,
  };
}

// ---- batch grouping + macro-average ----------------------------------------

export interface BatchGroup {
  batchId: string;
  ranAt: Date;
  runs: EvalRunJoinedRow[];
}

/** Group runs by `batch_id` (a legacy/ungrouped row with no batch_id becomes
 *  its own singleton batch, keyed by its run id), sorted latest-batch-first. */
export function groupByBatch(runs: EvalRunJoinedRow[]): BatchGroup[] {
  const map = new Map<string, BatchGroup>();
  for (const r of runs) {
    const key = r.run.batchId ?? r.run.id;
    const existing = map.get(key);
    if (existing) {
      existing.runs.push(r);
      if (r.run.ranAt > existing.ranAt) existing.ranAt = r.run.ranAt;
    } else {
      map.set(key, { batchId: key, ranAt: r.run.ranAt, runs: [r] });
    }
  }
  return [...map.values()].sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime());
}

export interface MacroAverage {
  recall: number;
  precision: number;
  citation_accuracy: number;
  traces_passed: number;
  traces_total: number;
  cost_usd: number | null;
}

const ZERO_AVERAGE: MacroAverage = {
  recall: 0,
  precision: 0,
  citation_accuracy: 0,
  traces_passed: 0,
  traces_total: 0,
  cost_usd: null,
};

/** Macro-average (mean of PER-CASE metrics, not re-summed tp/fp/fn) across a
 *  batch's runs — the aggregation rule AC-6/AC-7 require. */
export function macroAverage(runs: EvalRunRow[]): MacroAverage {
  const n = runs.length;
  if (n === 0) return ZERO_AVERAGE;
  const sum = (f: (r: EvalRunRow) => number | null) =>
    runs.reduce((s, r) => s + (f(r) ?? 0), 0);
  const tracesPassed = runs.filter((r) => r.pass === true).length;
  const allCostsNull = runs.every((r) => r.costUsd == null);
  return {
    recall: sum((r) => r.recall) / n,
    precision: sum((r) => r.precision) / n,
    citation_accuracy: sum((r) => r.citationAccuracy) / n,
    traces_passed: tracesPassed,
    traces_total: n,
    cost_usd: allCostsNull ? null : sum((r) => r.costUsd),
  };
}

// ---- alert algorithm (AC-19) ------------------------------------------------

/**
 * Compare the last two distinct batches: pick the first (by case name
 * ascending) case whose `pass` differs between them. Only a true→false flip
 * produces an alert message (the reverse is an improvement — silent, even if
 * a later-sorted case regressed). Fewer than 2 batches → null.
 */
export function computeAlert(batches: BatchGroup[]): string | null {
  const [latest, prev] = batches;
  if (!latest || !prev) return null;

  const prevByCase = new Map(prev.runs.map((r) => [r.run.caseId, r]));
  const flips = latest.runs
    .filter((r) => prevByCase.has(r.run.caseId))
    .filter((r) => (r.run.pass ?? false) !== (prevByCase.get(r.run.caseId)!.run.pass ?? false))
    .sort((a, b) => a.caseName.localeCompare(b.caseName));

  const first = flips[0];
  if (!first) return null;

  const prevEntry = prevByCase.get(first.run.caseId)!;
  const wentTrueToFalse = prevEntry.run.pass === true && first.run.pass === false;
  if (!wentTrueToFalse) return null; // false→true is an improvement — no alert

  const caseType = caseTypeOf(parseExpectedOutput(first.caseExpectedOutput));
  return caseType === 'must_not_flag'
    ? `New false positive: case '${first.caseName}' now flags a finding it previously didn't.`
    : `Regression: case '${first.caseName}' no longer finds the expected issue.`;
}

// ---- dashboard aggregation ---------------------------------------------------

export function buildDashboard(
  ownerKind: EvalOwnerKind,
  ownerId: string,
  casesTotal: number,
  allRuns: EvalRunJoinedRow[],
  recentRuns: EvalRunRecord[],
): EvalDashboard {
  const batches = groupByBatch(allRuns);
  const [latest, prev] = batches;

  const current = latest ? macroAverage(latest.runs.map((r) => r.run)) : ZERO_AVERAGE;
  const prevAvg = prev ? macroAverage(prev.runs.map((r) => r.run)) : null;
  const delta = prevAvg
    ? {
        recall: current.recall - prevAvg.recall,
        precision: current.precision - prevAvg.precision,
        citation_accuracy: current.citation_accuracy - prevAvg.citation_accuracy,
      }
    : { recall: 0, precision: 0, citation_accuracy: 0 };

  const trend: EvalTrendPoint[] = [...batches].reverse().map((b) => {
    const avg = macroAverage(b.runs.map((r) => r.run));
    return {
      ran_at: b.ranAt.toISOString(),
      recall: avg.recall,
      precision: avg.precision,
      citation_accuracy: avg.citation_accuracy,
      pass_rate: avg.traces_total === 0 ? 0 : avg.traces_passed / avg.traces_total,
      cost_usd: avg.cost_usd,
    };
  });

  return {
    owner_kind: ownerKind,
    owner_id: ownerId,
    cases_total: casesTotal,
    current,
    delta,
    trend,
    recent_runs: recentRuns.slice(0, RECENT_RUNS_LIMIT),
    alert: computeAlert(batches),
  };
}

/** Cross-agent batch summaries for the workspace landing page — groups ALL
 *  agents' runs by batch_id (each batch belongs to exactly one agent, since
 *  batch_id is only ever shared within one "Run all evals" / single-case
 *  invocation for ONE agent), macro-averages each, sorts desc, caps at `limit`. */
export function buildRecentBatchSummaries(
  runs: EvalRunJoinedRow[],
  limit: number,
): EvalBatchSummary[] {
  const map = new Map<string, EvalRunJoinedRow[]>();
  for (const r of runs) {
    const key = r.run.batchId ?? r.run.id;
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }
  const summaries: EvalBatchSummary[] = [...map.entries()].map(([batchId, rows]) => {
    const avg = macroAverage(rows.map((r) => r.run));
    return {
      batch_id: batchId,
      agent_id: rows[0]!.ownerId,
      agent_version: rows[0]!.run.agentVersion ?? null,
      ran_at: rows[0]!.run.ranAt.toISOString(),
      cases_total: rows.length,
      recall: avg.recall,
      precision: avg.precision,
      citation_accuracy: avg.citation_accuracy,
      traces_passed: avg.traces_passed,
      cost_usd: avg.cost_usd,
    };
  });
  return summaries
    .sort((a, b) => new Date(b.ran_at).getTime() - new Date(a.ran_at).getTime())
    .slice(0, limit);
}
