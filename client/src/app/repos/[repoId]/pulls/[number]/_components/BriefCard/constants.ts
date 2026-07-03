import type { IconName } from "@devdigest/ui";
import type { Brief } from "@devdigest/shared";

/** Per-risk-level visual meta for the top banner. `labelKey` resolves under
   the `riskLevel` namespace. Mirrors VerdictBanner's VERDICT_META pattern. */
export const RISK_LEVEL_META: Record<
  Brief["risk_level"],
  { c: string; bg: string; icon: IconName; labelKey: string }
> = {
  high: { c: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle", labelKey: "high" },
  medium: { c: "var(--warn)", bg: "var(--warn-bg)", icon: "AlertTriangle", labelKey: "medium" },
  low: { c: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle", labelKey: "low" },
};
