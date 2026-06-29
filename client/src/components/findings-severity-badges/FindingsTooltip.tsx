"use client";

import React from "react";
import ReactDOM from "react-dom";
import { Icon, SEV, CategoryTag, MonoLink, ConfidenceNum, type Category, type Severity } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import { FindingsSeverityBadges } from "./FindingsSeverityBadges";
import type { TopFinding } from "./types";

type BySeverity = { CRITICAL: number; WARNING: number; SUGGESTION: number };

const POPUP_WIDTH = 400;
const POPUP_GAP = 6;

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
  onFindingClick,
  onFileClick,
}: {
  bySeverity: BySeverity | null | undefined;
  findings: TopFinding[];
  repoFullName?: string | null;
  headSha?: string | null;
  onFindingClick?: (findingId: string) => void;
  /** Navigate a finding's file:line into the Files-changed diff (internal). */
  onFileClick?: (file: string, startLine: number) => void;
}) {
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const [popupStyle, setPopupStyle] = React.useState<React.CSSProperties | null>(null);

  const total = bySeverity
    ? bySeverity.CRITICAL + bySeverity.WARNING + bySeverity.SUGGESTION
    : findings.length;
  const hasContent = total > 0 || findings.length > 0;

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (popupStyle) {
      setPopupStyle(null);
      return;
    }
    if (!hasContent || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const rawLeft = rect.left;
    const maxLeft = window.innerWidth - POPUP_WIDTH - 8;
    const left = Math.min(rawLeft, Math.max(0, maxLeft));
    setPopupStyle({
      position: "fixed",
      top: rect.bottom + POPUP_GAP,
      left,
      width: POPUP_WIDTH,
      zIndex: 9999,
    });
  }

  // Close on outside mousedown (before click fires, so no flicker).
  React.useEffect(() => {
    if (!popupStyle) return;
    const onMouseDown = (e: MouseEvent) => {
      if (
        anchorRef.current?.contains(e.target as Node) ||
        popupRef.current?.contains(e.target as Node)
      ) return;
      setPopupStyle(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [popupStyle]);

  const popup = popupStyle ? (
    <div
      ref={popupRef}
      style={{
        ...popupStyle,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
        overflow: "hidden",
      }}
    >
      {/* header */}
      <div
        style={{
          padding: "9px 14px",
          borderBottom: "1px solid var(--border)",
          fontSize: 11,
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Icon.History size={13} />
        {total} FINDINGS
      </div>

      {/* scrollable list */}
      <div style={{ maxHeight: 360, overflowY: "auto" }}>
        {findings.map((f) => {
          const tok = SEV[f.severity as Severity];
          const SevIcon = tok ? Icon[tok.icon] : null;
          // Internal diff navigation takes precedence over the GitHub deep-link.
          const href =
            !onFileClick && repoFullName && headSha
              ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
              : undefined;
          return (
            <div
              key={f.id}
              onClick={
                onFindingClick
                  ? (e) => {
                      // Portaled popups bubble React events to the React-tree
                      // parent (e.g. the PRRow row / accordion header), so stop
                      // here or that ancestor's onClick hijacks the navigation.
                      e.stopPropagation();
                      setPopupStyle(null);
                      onFindingClick(f.id);
                    }
                  : undefined
              }
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                cursor: onFindingClick ? "pointer" : "default",
              }}
            >
              {/* severity icon */}
              {SevIcon && (
                <div style={{ paddingTop: 2, flexShrink: 0, color: tok.c }}>
                  <SevIcon size={16} />
                </div>
              )}

              {/* content */}
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                {/* title + category */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {f.title}
                  </span>
                  <CategoryTag category={f.category as Category} />
                </div>

                {/* file:line + confidence */}
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MonoLink
                    href={href}
                    onClick={
                      onFileClick
                        ? () => {
                            setPopupStyle(null);
                            onFileClick(f.file, f.start_line);
                          }
                        : undefined
                    }
                  >
                    {f.file}:{lineLabel(f)}
                  </MonoLink>
                  <ConfidenceNum value={f.confidence} />
                </div>

                {/* rationale — multi-line */}
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--text-muted)",
                    lineHeight: 1.5,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {f.rationale_snippet}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <>
      <div
        ref={anchorRef}
        style={{ position: "relative", display: "inline-flex", cursor: hasContent ? "pointer" : "default" }}
        onClick={(e) => handleClick(e)}
      >
        <FindingsSeverityBadges bySeverity={bySeverity} />
      </div>

      {popup && typeof document !== "undefined"
        ? ReactDOM.createPortal(popup, document.body)
        : null}
    </>
  );
}
