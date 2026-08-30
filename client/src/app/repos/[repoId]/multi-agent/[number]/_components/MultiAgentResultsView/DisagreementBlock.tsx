/* DisagreementBlock — "Where agents disagree" (AC-21/AC-22/AC-23). Each
   `file:line` conflict is rendered as a plain (non-collapsible) card — no
   toggle-to-expand here, so there is no risk of the nested-interactive-
   controls bug documented in client INSIGHTS 2026-07-16 (SymbolRow/FileCard):
   a card with its own actionable "did not flag" rows is simplest as a static
   card, not a collapsible header. All agent-authored text (conflict title,
   take notes) is untrusted model output and goes through the vendored
   Markdown primitive (AC-27). Only this run's own agents ever appear here —
   `run.conflicts[].takes` is already scoped server-side to the run's
   participants (AC-22). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Markdown, Toggle } from "@devdigest/ui";
import type { Conflict } from "@devdigest/shared";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "./constants";
import { filterConflicts } from "./helpers";
import { conflictVerdictSeverity, s } from "./styles";

export function DisagreementBlock({
  conflicts,
  onlyConflicts,
  onToggleOnlyConflicts,
}: {
  conflicts: Conflict[];
  onlyConflicts: boolean;
  onToggleOnlyConflicts: (v: boolean) => void;
}) {
  const t = useTranslations("multiAgent");
  const shown = filterConflicts(conflicts, onlyConflicts);

  return (
    <div style={s.disagreement}>
      <div style={s.disagreementHeaderRow}>
        <div style={s.disagreementTitle}>
          <Icon.Workflow size={14} aria-hidden />
          {t("results.disagreementTitle")}
        </div>
        <div style={s.toggleRow}>
          {t("results.showOnlyConflicts")}
          <Toggle on={onlyConflicts} onChange={onToggleOnlyConflicts} size={16} />
        </div>
      </div>

      {shown.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("results.noConflicts")}</div>
      ) : (
        shown.map((c) => (
          <div key={`${c.file}:${c.line}`} style={s.conflictCard}>
            <div style={s.conflictHeader}>
              <Icon.Code size={14} style={{ color: "var(--text-muted)" }} aria-hidden />
              <span className="mono" style={{ color: "var(--text-muted)" }}>
                {c.file}:{c.line}
              </span>
              <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                <Markdown>{c.title}</Markdown>
              </div>
            </div>
            <div style={s.conflictTakes}>
              {c.takes.map((take) => {
                const ignored = take.verdict === "ignored";
                const color = ignored ? SEV_COLOR_FALLBACK : (SEV_COLOR[take.verdict] ?? SEV_COLOR_FALLBACK);
                return (
                  <div key={take.agent_id} style={s.conflictTake}>
                    <div style={s.conflictAgent}>{take.persona}</div>
                    {ignored ? (
                      <div style={s.conflictVerdictIgnored}>
                        <Icon.Dot size={14} aria-hidden />
                        {t("results.didNotFlag")}
                      </div>
                    ) : (
                      <div style={conflictVerdictSeverity(color)}>{take.verdict}</div>
                    )}
                    <div style={s.conflictNote}>
                      <Markdown>{take.note}</Markdown>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
