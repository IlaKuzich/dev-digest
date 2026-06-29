"use client";

import React from "react";
import { SeverityBadge, type Severity } from "@devdigest/ui";

type BySeverity = { CRITICAL: number; WARNING: number; SUGGESTION: number };

const SEVS: { key: keyof BySeverity; sev: Severity }[] = [
  { key: "CRITICAL", sev: "CRITICAL" },
  { key: "WARNING",  sev: "WARNING"  },
  { key: "SUGGESTION", sev: "SUGGESTION" },
];

export function FindingsSeverityBadges({ bySeverity }: { bySeverity: BySeverity | null | undefined }) {
  const active = SEVS.filter(({ key }) => (bySeverity?.[key] ?? 0) > 0);
  if (!bySeverity || active.length === 0) {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }
  return (
    <div style={{ display: "inline-flex", gap: 6 }}>
      {active.map(({ key, sev }) => (
        <SeverityBadge key={key} severity={sev} count={bySeverity[key]} compact />
      ))}
    </div>
  );
}
