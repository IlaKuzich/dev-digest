import type {
  AgentEvalDashboard,
  AgentEvalSummary,
  EvalBatchRun,
  EvalCase,
  EvalCompare,
  EvalCompareMetric,
  EvalDashboardHome,
  EvalOwnerKind,
  EvalTrendPoint,
  Provider,
} from '@devdigest/shared';
import { AgentVersionConfig } from '@devdigest/shared';
import { degradationAlert, type Located } from './scoring.js';
import type { AgentVersionRow } from '../../db/rows.js';
import type { AgentBatchGroup, AgentRow, EvalBatchRow, EvalCaseRow, EvalRunRow } from './repository.js';
import { SPARKLINE_LENGTH } from './constants.js';

/**
 * Pure helpers for the eval module — DB row ⇄ DTO mapping, safe JSON
 * extraction of `Located` shapes from untrusted `expected_output`/model
 * output, and the deterministic diff/skills/name-slug plumbing around
 * `reviewPullRequest`. No I/O.
 */

// ---------------------------------------------------------------------------
// eval_cases row → DTO
// ---------------------------------------------------------------------------

/** Compact summary of a case's most recent run — NOT part of the shared
 *  `EvalCase` contract; an additive field the case-list response carries so
 *  the Evals tab (AC-9/10/17) can render state without a second round trip.
 *  Response schemas aren't declared on this route, so this is a safe,
 *  backward-compatible superset of `EvalCase`. */
export interface EvalCaseLastRun {
  pass: boolean | null;
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  actual_output: unknown;
  ran_at: string;
  duration_ms: number | null;
  cost_usd: number | null;
}

export type EvalCaseDto = EvalCase & { last_run: EvalCaseLastRun | null };

export function toLastRunSummary(row: EvalRunRow): EvalCaseLastRun {
  return {
    pass: row.pass,
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    actual_output: row.actualOutput,
    ran_at: row.ranAt.toISOString(),
    duration_ms: row.durationMs,
    cost_usd: row.costUsd,
  };
}

export function toEvalCaseDto(row: EvalCaseRow, lastRun?: EvalRunRow): EvalCaseDto {
  return {
    id: row.id,
    owner_kind: row.ownerKind as EvalOwnerKind,
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_files: row.inputFiles,
    input_meta: row.inputMeta,
    expected_output: row.expectedOutput,
    notes: row.notes,
    last_run: lastRun ? toLastRunSummary(lastRun) : null,
  };
}

// ---------------------------------------------------------------------------
// eval_batches row → DTO
// ---------------------------------------------------------------------------

export function toEvalBatchRunDto(row: EvalBatchRow, agentName?: string | null): EvalBatchRun {
  return {
    id: row.id,
    agent_id: row.agentId,
    agent_name: agentName ?? null,
    agent_version: row.agentVersion,
    ran_at: row.ranAt.toISOString(),
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    traces_passed: row.tracesPassed,
    traces_total: row.tracesTotal,
    cost_usd: row.costUsd,
  };
}

function toEvalTrendPointDto(row: EvalBatchRow): EvalTrendPoint {
  return {
    ran_at: row.ranAt.toISOString(),
    recall: row.recall ?? 0,
    precision: row.precision ?? 0,
    citation_accuracy: row.citationAccuracy ?? 0,
    pass_rate: row.tracesTotal > 0 ? row.tracesPassed / row.tracesTotal : 0,
    cost_usd: row.costUsd,
  };
}

/** Per-agent dashboard (AC-8/23/24/25). `batches` is newest-first. */
export function toAgentEvalDashboard(agent: AgentRow, batches: EvalBatchRow[]): AgentEvalDashboard {
  const [latest, prior] = batches;

  const current = {
    recall: latest?.recall ?? 0,
    precision: latest?.precision ?? 1,
    citation_accuracy: latest?.citationAccuracy ?? 1,
    traces_passed: latest?.tracesPassed ?? 0,
    traces_total: latest?.tracesTotal ?? 0,
    cost_usd: latest?.costUsd ?? null,
  };

  const delta = {
    recall: prior ? current.recall - (prior.recall ?? 0) : 0,
    precision: prior ? current.precision - (prior.precision ?? 1) : 0,
    citation_accuracy: prior ? current.citation_accuracy - (prior.citationAccuracy ?? 1) : 0,
  };

  // Raw (nullable) values into the alert — never the defaulted `current`
  // numbers above, so a batch with an undefined recall never reads as a false
  // "recall dropped to 0" regression.
  const alert = latest
    ? degradationAlert(
        { recall: latest.recall, precision: latest.precision ?? 1 },
        prior ? { recall: prior.recall, precision: prior.precision ?? 1 } : null,
      )
    : null;

  return {
    agent_id: agent.id,
    agent_name: agent.name,
    provider: agent.provider as Provider,
    model: agent.model,
    current,
    delta,
    trend: [...batches].reverse().map(toEvalTrendPointDto),
    recent_runs: batches.map((b) => toEvalBatchRunDto(b, agent.name)),
    alert,
  };
}

/** Cross-agent dashboard home (AC-18/19). */
export function toEvalDashboardHome(
  groups: AgentBatchGroup[],
  recent: { batch: EvalBatchRow; agentName: string | null }[],
): EvalDashboardHome {
  const agents: AgentEvalSummary[] = groups.map(({ agent, batches }) => {
    const [latest] = batches;
    const sparkline = batches
      .slice(0, SPARKLINE_LENGTH)
      .reverse()
      .map((b) => (b.tracesTotal > 0 ? b.tracesPassed / b.tracesTotal : 0));
    return {
      agent_id: agent.id,
      agent_name: agent.name,
      provider: agent.provider as Provider,
      model: agent.model,
      last_version: latest?.agentVersion ?? null,
      last_ran_at: latest ? latest.ranAt.toISOString() : null,
      traces_passed: latest?.tracesPassed ?? 0,
      traces_total: latest?.tracesTotal ?? 0,
      recall: latest?.recall ?? null,
      precision: latest?.precision ?? null,
      citation_accuracy: latest?.citationAccuracy ?? null,
      sparkline,
    };
  });

  return {
    agents,
    recent_runs: recent.map((r) => toEvalBatchRunDto(r.batch, r.agentName)),
  };
}

/** Parse an `agent_versions.config_json` snapshot defensively — a
 *  missing/malformed snapshot degrades to `null` rather than a 500
 *  (spec Edge cases: "Eval run references an agent version whose snapshot is
 *  missing/malformed", AC-28/AC-31). */
export function safeParseVersionConfig(row: AgentVersionRow | undefined): AgentVersionConfig | null {
  if (!row) return null;
  try {
    return AgentVersionConfig.parse(row.configJson);
  } catch {
    return null;
  }
}

function toCompareMetric(a: number | null, b: number | null): EvalCompareMetric {
  return { old: a, new: b, delta: a != null && b != null ? b - a : null };
}

export function toEvalCompare(
  a: EvalBatchRow,
  b: EvalBatchRow,
  agentName: string | null,
  oldConfig: AgentVersionConfig | null,
  newConfig: AgentVersionConfig | null,
): EvalCompare {
  return {
    a: toEvalBatchRunDto(a, agentName),
    b: toEvalBatchRunDto(b, agentName),
    recall: toCompareMetric(a.recall, b.recall),
    precision: toCompareMetric(a.precision, b.precision),
    citation_accuracy: toCompareMetric(a.citationAccuracy, b.citationAccuracy),
    cost: toCompareMetric(a.costUsd, b.costUsd),
    old_config: oldConfig,
    new_config: newConfig,
  };
}

// ---------------------------------------------------------------------------
// Untrusted-data extraction + prompt plumbing (pure)
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Safely pull the minimal `{file, start_line, end_line}` shape the scoring
 *  engine needs out of untrusted JSON (a case's `expected_output`, or model
 *  output) — malformed entries are skipped rather than throwing (AC-33: only
 *  file+line-range ever drive matching; nothing here is executed/evaluated). */
export function toLocatedArray(json: unknown): Located[] {
  if (!Array.isArray(json)) return [];
  const out: Located[] = [];
  for (const item of json) {
    if (!isRecord(item)) continue;
    const file = item.file;
    const start = item.start_line;
    const end = item.end_line;
    if (typeof file === 'string' && typeof start === 'number') {
      out.push({ file, start_line: start, end_line: typeof end === 'number' ? end : start });
    }
  }
  return out;
}

/** Reconstruct a single-file unified diff from persisted `pr_files` patches —
 *  the frozen `input_diff` covers ONLY `filePath` (AC-2), never the whole PR. */
export function buildSingleFileDiff(
  files: { path: string; patch: string | null }[],
  filePath: string,
): string {
  const f = files.find((x) => x.path === filePath);
  if (!f || !f.patch) return '';
  return [`diff --git a/${filePath} b/${filePath}`, `--- a/${filePath}`, `+++ b/${filePath}`, f.patch].join(
    '\n',
  );
}

/** Same labeled-block format `reviews/helpers.ts` uses for the live review
 *  prompt — kept as its own copy here (a one-line pure transform) rather than
 *  importing across modules. */
export function formatSkillsForPrompt(rows: { name: string; body: string }[]): string[] {
  return rows.map((r) => `### ${r.name}\n${r.body}`);
}

/** Derive a short, url/file-safe case name from a finding's title (matches
 *  the `stripe-key-leak` style names in screenshot 03). */
export function slugifyCaseName(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'eval-case';
}
