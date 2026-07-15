/** Constants for the DiffViewer. */
import type { Severity } from "@devdigest/shared";

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Opt-in inline-findings overlay: the badge word shown for each severity's
    accessible label (e.g. "blocker finding: <title> — show details"). Only
    used when a consumer (SmartDiffViewer) passes `findings`/`findingsByFile`
    — absent ⇒ no badges render and this map is unused. */
export const FINDING_LABEL: Record<Severity, string> = {
  CRITICAL: "blocker",
  WARNING: "warning",
  SUGGESTION: "suggestion",
};
