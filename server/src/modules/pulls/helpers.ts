import type { PrMeta, PrDetail } from '@devdigest/shared';
import type { PullRow } from '../../db/rows.js';
import { deriveReviewStatus } from './status.js';
import { SEV_ORDER, TOP_FINDINGS_LIMIT, type SevKey } from './constants.js';

/**
 * pulls PR-list transforms (pure — no DB / `this`, so they unit-test cleanly).
 * The repository returns rows newest-first; these helpers dedup/group/sort and
 * map rows → contract DTOs so `routes.ts` and `service.ts` stay logic-light.
 */

/** Trim a rationale to a ~120-char preview, cut on a word boundary. */
export function snippetOf(rationale: string): string {
  if (rationale.length <= 120) return rationale;
  return rationale.slice(0, 120).replace(/\s\S+$/, '') + '…';
}

export interface ReviewScoreRow {
  prId: string;
  score: number | null;
}

export interface RunCostRow {
  prId: string;
  costUsd: number | null;
}

export interface FindingRollupRow {
  prId: string;
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  startLine: number;
  endLine: number;
  confidence: number;
  rationale: string;
}

export interface TopFinding {
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  confidence: number;
  rationale_snippet: string;
}

export interface FindingsBucket {
  bySeverity: { CRITICAL: number; WARNING: number; SUGGESTION: number };
  top: TopFinding[];
}

/** First row seen per prId wins — pass rows already ordered newest-first. */
export function latestByPr<T extends { prId: string }>(rowsNewestFirst: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rowsNewestFirst) {
    if (!map.has(row.prId)) map.set(row.prId, row);
  }
  return map;
}

/** Group active findings per PR: severity tally + top-N preview (sorted). */
export function buildFindingsBuckets(rows: FindingRollupRow[]): Map<string, FindingsBucket> {
  const byPr = new Map<string, FindingsBucket>();
  for (const row of rows) {
    if (!byPr.has(row.prId)) {
      byPr.set(row.prId, { bySeverity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }, top: [] });
    }
    const bucket = byPr.get(row.prId)!;
    const sev = row.severity as SevKey;
    if (sev in bucket.bySeverity) bucket.bySeverity[sev]++;
    bucket.top.push({
      id: row.id,
      severity: row.severity,
      category: row.category,
      title: row.title,
      file: row.file,
      start_line: row.startLine,
      end_line: row.endLine,
      confidence: row.confidence,
      rationale_snippet: snippetOf(row.rationale),
    });
  }
  for (const bucket of byPr.values()) {
    bucket.top.sort((a, b) => {
      const sevDiff =
        (SEV_ORDER[a.severity as SevKey] ?? 3) - (SEV_ORDER[b.severity as SevKey] ?? 3);
      return sevDiff !== 0 ? sevDiff : b.confidence - a.confidence;
    });
    bucket.top = bucket.top.slice(0, TOP_FINDINGS_LIMIT);
  }
  return byPr;
}

export interface PrListRollups {
  review: Map<string, ReviewScoreRow>;
  cost: Map<string, RunCostRow>;
  findings: Map<string, FindingsBucket>;
}

/** Map a persisted PR row + rollups → the PrMeta list DTO. */
export function toPrMetaDto(row: PullRow, rollups: PrListRollups, now: number): PrMeta {
  const review = rollups.review.get(row.id);
  const bucket = rollups.findings.get(row.id);
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    author: row.author,
    branch: row.branch,
    base: row.base,
    head_sha: row.headSha,
    additions: row.additions,
    deletions: row.deletions,
    files_count: row.filesCount,
    status: deriveReviewStatus({
      ghStatus: row.status,
      lastReviewedSha: row.lastReviewedSha,
      headSha: row.headSha,
      updatedAt: row.updatedAt,
      now,
    }),
    opened_at: row.openedAt?.toISOString() ?? null,
    updated_at: row.updatedAt?.toISOString() ?? null,
    score: review ? review.score : null,
    latest_run_cost_usd: rollups.cost.get(row.id)?.costUsd ?? null,
    findings_by_severity: bucket?.bySeverity ?? null,
    top_findings: bucket?.top ?? null,
  };
}

/** GitHub detail wins; only the local PR id is substituted. */
export function prDetailFromGitHub(pr: PullRow, detail: PrDetail): PrDetail {
  return { ...detail, id: pr.id };
}

/** Build PrDetail from persisted rows when GitHub is unavailable (offline). */
export function prDetailFromPersisted(
  pr: PullRow,
  files: { path: string; additions: number; deletions: number; patch: string | null }[],
  commits: { sha: string; message: string; author: string; committedAt: Date | null }[],
): PrDetail {
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    branch: pr.branch,
    base: pr.base,
    head_sha: pr.headSha,
    additions: pr.additions,
    deletions: pr.deletions,
    files_count: pr.filesCount,
    status: pr.status as PrDetail['status'],
    opened_at: pr.openedAt?.toISOString() ?? null,
    updated_at: pr.updatedAt?.toISOString() ?? null,
    body: pr.body ?? null,
    files: files.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? null,
    })),
    commits: commits.map((c) => ({
      sha: c.sha,
      message: c.message,
      author: c.author,
      committed_at: c.committedAt?.toISOString() ?? null,
    })),
  };
}
