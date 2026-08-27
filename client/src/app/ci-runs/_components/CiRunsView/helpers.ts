/* helpers.ts — pure transforms for the CI Runs page (no React import).
   Findings arrive unordered from the `ci_run_findings` join (AC-24), so every
   render-side consumer sorts here rather than trusting server order. */
import type { CiRun, CiRunsQuery, Finding } from "@devdigest/shared";
import type { TopFinding } from "@/components/findings-severity-badges";

export type DateRangePreset = "7d" | "all";

export interface CiRunsFilters {
  range: DateRangePreset;
  agent: string;
  repo: string;
  status: string;
  source: string;
}

/** ci.json only ships a "Last 7 days" preset label (`runs.filters.last7Days`) —
 *  the date-range control is a fixed 7-day window in v1, matching the mockup's
 *  single depicted state; no other preset copy exists to build a picker from. */
export const DEFAULT_FILTERS: CiRunsFilters = {
  range: "7d",
  agent: "",
  repo: "",
  status: "",
  source: "",
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Build server-side `CiRunsQuery` params from the UI's active filters (AC-21). */
export function toCiRunsQuery(filters: CiRunsFilters): CiRunsQuery {
  const query: CiRunsQuery = {};
  if (filters.range !== "all") {
    query.from = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
  }
  if (filters.agent) query.agent = filters.agent;
  if (filters.repo) query.repo = filters.repo;
  if (filters.status) query.status = filters.status;
  if (filters.source) query.source = filters.source;
  return query;
}

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/** Render-side sort — severity, then file:line (AC-24: the artifact is unordered). */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const sevDiff = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
    if (sevDiff !== 0) return sevDiff;
    const fileDiff = a.file.localeCompare(b.file);
    if (fileDiff !== 0) return fileDiff;
    return a.start_line - b.start_line;
  });
}

export interface BySeverity {
  CRITICAL: number;
  WARNING: number;
  SUGGESTION: number;
}

export function severityCounts(findings: Finding[]): BySeverity {
  const counts: BySeverity = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity as keyof BySeverity]++;
  }
  return counts;
}

function snippet(rationale: string): string {
  return rationale.length > 120 ? rationale.slice(0, 120).replace(/\s\S+$/, "") + "…" : rationale;
}

/** Map CI-owned `Finding[]` (no `review_id`/accepted/dismissed) into the shape
 *  the shared `FindingsTooltip`/`FindingsSeverityBadges` primitives expect
 *  (AC-23 — reuse, don't reinvent, severity rendering), pre-sorted (AC-24). */
export function toTopFindings(findings: Finding[]): TopFinding[] {
  return sortFindings(findings).map((f) => ({
    id: f.id,
    severity: f.severity,
    category: f.category,
    title: f.title,
    file: f.file,
    start_line: f.start_line,
    end_line: f.end_line,
    confidence: f.confidence,
    rationale_snippet: snippet(f.rationale),
  }));
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function truncate(text: string | null | undefined, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

/** Distinct, sorted option values for a filter dropdown, derived from the
 *  unfiltered run set (there is no separate agents/repos list endpoint for
 *  this page — CI run repos need not match the studio's tracked repos). */
export function distinctValues(runs: CiRun[], pick: (r: CiRun) => string | null | undefined): string[] {
  const set = new Set<string>();
  for (const r of runs) {
    const v = pick(r);
    if (v) set.add(v);
  }
  return Array.from(set).sort();
}
