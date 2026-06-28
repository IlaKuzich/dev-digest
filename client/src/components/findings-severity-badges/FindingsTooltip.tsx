"use client";

import React from "react";
import { CategoryTag, MonoLink, ConfidenceNum, type Category } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import { FindingsSeverityBadges } from "./FindingsSeverityBadges";
import type { TopFinding } from "./types";

type BySeverity = { CRITICAL: number; WARNING: number; SUGGESTION: number };

function lineLabel(f: Pick<TopFinding, "start_line" | "end_line">): string {
  return f.start_line === f.end_line
    ? `${f.start_line}`
    : `${f.start_line}-${f.end_line}`;
}

export function FindingsTooltip({
  bySeverity,
  findings,
  repoFullName,
  headSha,
}: {
  bySeverity: BySeverity | null | undefined;
  findings: TopFinding[];
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const [open, setOpen] = React.useState(false);

  const total = bySeverity
    ? bySeverity.CRITICAL + bySeverity.WARNING + bySeverity.SUGGESTION
    : findings.length;
  const hasContent = total > 0 || findings.length > 0;

  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => { if (hasContent) setOpen(true); }}
      onMouseLeave={() => setOpen(false)}
    >
      <FindingsSeverityBadges bySeverity={bySeverity} />

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            width: 380,
            zIndex: 50,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            overflow: "hidden",
          }}
        >
          {/* header */}
          <div
            style={{
              padding: "8px 14px",
              borderBottom: "1px solid var(--border)",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {total} FINDINGS
          </div>

          {/* scrollable list */}
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {findings.map((f) => {
              const href =
                repoFullName && headSha
                  ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
                  : undefined;
              return (
                <div
                  key={f.id}
                  style={{
                    padding: "9px 14px",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={f.title}
                    >
                      {f.title}
                    </span>
                    <CategoryTag category={f.category as Category} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <MonoLink href={href}>
                      {f.file}:{lineLabel(f)}
                    </MonoLink>
                    <ConfidenceNum value={f.confidence} />
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--text-muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={f.rationale_snippet}
                  >
                    {f.rationale_snippet}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
