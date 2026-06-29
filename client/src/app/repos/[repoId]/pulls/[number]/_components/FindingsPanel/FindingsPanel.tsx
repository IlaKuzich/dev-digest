/* FindingsPanel — severity filter + hide-low-confidence + j/k navigation + FindingCard list,
   wiring the accept/dismiss action hook. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { KEY_TO_ACTION } from "./constants";
import { visibleFindings } from "./helpers";
import { s } from "./styles";
import { SeverityFilter, type SevKey } from "./SeverityFilter";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
  focusFindingId = null,
  focusNonce = 0,
  onFileClick,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Deep-link target finding to scroll to + highlight (clicking a tooltip row). */
  focusFindingId?: string | null;
  focusNonce?: number;
  /** Navigate a finding's file:line into the Files-changed diff (internal). */
  onFileClick?: (file: string, line: number) => void;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [activeSev, setActiveSev] = React.useState<SevKey | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);

  // Counts exclude dismissed findings (see client INSIGHTS 2026-06-29).
  const bySeverity = React.useMemo(
    () => ({
      CRITICAL: findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length,
      WARNING: findings.filter((f) => f.severity === "WARNING" && !f.dismissed_at).length,
      SUGGESTION: findings.filter((f) => f.severity === "SUGGESTION" && !f.dismissed_at).length,
    }),
    [findings],
  );

  const hasPills = bySeverity.CRITICAL > 0 || bySeverity.WARNING > 0 || bySeverity.SUGGESTION > 0;

  const shown = React.useMemo(() => {
    let result = visibleFindings(findings, hideLow);
    if (activeSev != null) result = result.filter((f) => f.severity === activeSev);
    return result;
  }, [findings, hideLow, activeSev]);

  React.useEffect(() => { setFocusIdx(0); }, [activeSev]);

  // Deep-link focus: clear filters so the target is visible, then scroll to +
  // highlight its card. Guarded by nonce so it fires once per click (and never
  // on the initial render, where focusNonce is 0).
  React.useEffect(() => {
    if (!focusFindingId) return;
    setHideLow(false);
    setActiveSev(null);
  }, [focusFindingId, focusNonce]);

  const handledFocus = React.useRef(0);
  React.useEffect(() => {
    if (!focusFindingId || focusNonce === handledFocus.current) return;
    const idx = shown.findIndex((f) => f.id === focusFindingId);
    if (idx < 0) return; // not visible yet — re-runs when `shown` updates after the filter reset
    handledFocus.current = focusNonce;
    setFocusIdx(idx);
    const raf = requestAnimationFrame(() => {
      document
        .getElementById(`finding-${focusFindingId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(raf);
  }, [focusFindingId, focusNonce, shown]);

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  const handleToggleSev = (sev: SevKey) =>
    setActiveSev((prev) => (prev === sev ? null : sev));

  return (
    <div>
      <div style={s.toolbar}>
        {hasPills && (
          <SeverityFilter counts={bySeverity} active={activeSev} onToggle={handleToggleSev} />
        )}
        {hasPills && <div style={s.divider} />}
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onFileClick={onFileClick}
              expandSignal={f.id === focusFindingId ? focusNonce : undefined}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
