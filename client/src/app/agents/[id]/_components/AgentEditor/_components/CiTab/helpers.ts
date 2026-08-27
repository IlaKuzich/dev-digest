/* helpers.ts — pure display helpers for the CI tab (AC-17/18). No React import
   (client-project-structure: business/display logic stays out of the component
   body so it's unit-testable in isolation). */
import type { CiTarget } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Human label for a CI target/platform badge. Only "gha" is real in v1 —
 *  the others never appear on an installed row today, but the map stays
 *  total so a future target renders sensibly instead of falling through. */
const TARGET_LABELS: Record<CiTarget, string> = {
  gha: "GitHub Actions",
  circle: "CircleCI",
  jenkins: "Jenkins",
  cli: "Generic CLI",
};

export function targetLabel(target: CiTarget): string {
  return TARGET_LABELS[target] ?? target;
}

/** Maps a raw `last_run_status` value to the `ci.runs.status.*` i18n key
 *  (already shipped by T2 for the CI Runs page) — `null` for an unrecognized
 *  value, so the caller falls back to rendering the raw string. */
const STATUS_I18N_KEY: Record<string, string> = {
  succeeded: "succeeded",
  failed: "failed",
  no_findings: "noFindings",
  running: "running",
};

export function statusI18nKey(status: string): string | null {
  return STATUS_I18N_KEY[status] ?? null;
}

export interface StatusStyle {
  color: string;
  bg: string;
  icon: IconName;
}

/** Status-pill styling, keyed by the raw `last_run_status` value — mirrors
 *  the outcome-color pattern in `RunHistory.tsx`'s `outcomeOf`. */
export function statusStyle(status: string): StatusStyle {
  switch (status) {
    case "succeeded":
      return { color: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle" };
    case "failed":
      return { color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" };
    case "running":
      return { color: "var(--accent)", bg: "var(--accent-bg)", icon: "RefreshCw" };
    case "no_findings":
      return { color: "var(--text-muted)", bg: "var(--bg-hover)", icon: "Check" };
    default:
      return { color: "var(--text-muted)", bg: "var(--bg-hover)", icon: "Info" };
  }
}

