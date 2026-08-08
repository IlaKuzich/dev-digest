import type { RiskSeverity } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Risk-level headline: icon + color + i18n label key, one per RiskSeverity.
   Color is never the only signal (AC-2) — the icon+label always render too. */
export const RISK_META: Record<RiskSeverity, { icon: IconName; color: string; labelKey: string }> = {
  high: { icon: "AlertOctagon", color: "var(--crit)", labelKey: "riskLevel.high" },
  medium: { icon: "AlertTriangle", color: "var(--warn)", labelKey: "riskLevel.medium" },
  low: { icon: "CheckCircle", color: "var(--ok)", labelKey: "riskLevel.low" },
};
