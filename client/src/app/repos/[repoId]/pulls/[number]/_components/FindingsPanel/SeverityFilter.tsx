"use client";

import React from "react";
import { SEV, Icon, type Severity } from "@devdigest/ui";

export type SevKey = "CRITICAL" | "WARNING" | "SUGGESTION";

const SEVS: SevKey[] = ["CRITICAL", "WARNING", "SUGGESTION"];

export interface SeverityFilterProps {
  counts: { CRITICAL: number; WARNING: number; SUGGESTION: number };
  active: SevKey | null;
  onToggle: (sev: SevKey) => void;
}

export function SeverityFilter({ counts, active, onToggle }: SeverityFilterProps) {
  const visible = SEVS.filter((s) => counts[s] > 0);
  if (visible.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 6 }}>
      {visible.map((sev) => {
        const tok = SEV[sev as Severity];
        const I = Icon[tok.icon];
        const isActive = sev === active;
        return (
          <button
            key={sev}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(sev)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 10px",
              borderRadius: 5,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              border: `1.5px solid ${tok.c}`,
              color: tok.c,
              background: isActive ? tok.bg : "transparent",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              transition: "background 0.1s",
            }}
          >
            <I size={12} />
            {counts[sev]}{" "}
            {sev}
          </button>
        );
      })}
    </div>
  );
}
