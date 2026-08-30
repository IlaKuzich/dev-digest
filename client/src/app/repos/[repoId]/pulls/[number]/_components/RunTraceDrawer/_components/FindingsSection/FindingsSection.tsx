/* FindingsSection — the persisted findings of THIS run (same data as the
   "Review runs" list), rendered inside a collapsible TraceSection. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, MonoLink } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { s } from "../../styles";
import { TraceSection } from "../TraceSection";

const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--accent)",
};

export function FindingsSection({
  findings,
  onFileClick,
}: {
  findings: FindingRecord[];
  /** Opens the finding's file:line in the PR's own in-app diff view
   *  (2026-08-27 — this row had no click handling at all before). */
  onFileClick?: (file: string, line: number) => void;
}) {
  const t = useTranslations("runs");
  return (
    <TraceSection
      icon="AlertOctagon"
      title={t("trace.findings")}
      right={<Badge color="var(--text-muted)">{findings.length}</Badge>}
    >
      {findings.length === 0 ? (
        <span style={s.noToolCalls}>{t("trace.noFindings")}</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {findings.map((f) => (
            <div
              key={f.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "10px 12px",
                background: "var(--bg-surface)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Badge color={SEV_COLOR[f.severity] ?? "var(--text-muted)"} bg="transparent">
                  {f.severity}
                </Badge>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{f.title}</span>
              </div>
              <div style={{ fontSize: 11.5, marginBottom: 6 }}>
                <MonoLink onClick={onFileClick ? () => onFileClick(f.file, f.start_line) : undefined}>
                  {f.file}:{f.start_line}
                  {f.end_line !== f.start_line ? `-${f.end_line}` : ""}
                </MonoLink>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {f.rationale}
              </div>
              {f.suggestion && (
                <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5, marginTop: 6 }}>
                  <strong>{t("trace.suggestedFix")} </strong>
                  {f.suggestion}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </TraceSection>
  );
}
