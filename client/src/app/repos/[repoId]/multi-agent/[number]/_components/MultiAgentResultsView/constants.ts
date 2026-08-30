/** Constants for MultiAgentResultsView. */

export const VIEW_MODES = ["columns", "tabs"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

/** Severity → CSS colour token (mirrors FindingCard's own local constant —
   duplicated rather than imported since FindingCard/constants.ts belongs to
   a different task's file ownership boundary). */
export const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
  INFO: "var(--info)",
};
export const SEV_COLOR_FALLBACK = "var(--text-muted)";
