/* Pure helpers for MultiAgentResultsView — no React import
   (client-project-structure). Kept unit-testable without rendering. */
import type { AgentColumn, Conflict } from "@devdigest/shared";

/** "8.2s" for a duration in ms, "—" for a still-running/failed column with no
   duration yet (AC-16 edge case: failed runs have null score/cost/duration). */
export function formatDurationMs(ms: number | null): string {
  if (ms == null) return "—";
  const seconds = ms / 1000;
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
}

/** Number of ACTIVE (non-'ignored') takes on a conflict — i.e. how many of
   this run's participating agents actually flagged the location, as opposed
   to reviewing it and taking no issue. */
export function activeTakesCount(c: Conflict): number {
  return c.takes.filter((t) => t.verdict !== "ignored").length;
}

/**
 * "Show only conflicts" (AC-23) restricts the disagreement view to locations
 * where MULTIPLE agents actively took a stance (whether the same or a
 * divergent severity) — as opposed to a location only one agent in the run
 * flagged and the rest simply reviewed-and-ignored. The server's
 * `conflicts[]` already only contains genuine disagreements (AC-22), so this
 * toggle narrows further to the strongest form of disagreement: an actual
 * multi-agent split, not a single agent's solo catch.
 */
export function isMultiAgentDisagreement(c: Conflict): boolean {
  return activeTakesCount(c) >= 2;
}

export function filterConflicts(conflicts: Conflict[], onlyConflicts: boolean): Conflict[] {
  return onlyConflicts ? conflicts.filter(isMultiAgentDisagreement) : conflicts;
}

/** Whether any column in the run is still executing (drives polling + the
   "N running" hint in the header). */
export function hasRunningColumn(columns: AgentColumn[]): boolean {
  return columns.some((c) => c.status === "running");
}
