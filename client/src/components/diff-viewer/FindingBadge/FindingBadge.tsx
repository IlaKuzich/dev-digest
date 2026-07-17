/* FindingBadge — one inline finding badge (icon + severity label) pinned to
   its code line. Clicking opens a portaled detail popover: title, category,
   file:line, confidence, rationale + suggestion (markdown). Mirrors the
   established popup mechanism from `findings-severity-badges/FindingsTooltip`
   — fixed-position portal anchored under the clicked element, closes on
   outside mousedown, stops propagation so the click doesn't bubble to the
   line's own click handlers (comment "+" affordance, file-card toggle). */
"use client";

import React from "react";
import ReactDOM from "react-dom";
import { SeverityBadge, CategoryTag, ConfidenceNum, Markdown, type Category } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FINDING_LABEL } from "../constants";

const POPUP_WIDTH = 380;
const POPUP_GAP = 6;

function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

export function FindingBadge({
  finding,
  onFocusLine,
}: {
  finding: FindingRecord;
  /** Also re-triggers this line's deep-link focus/scroll/flash (existing
      DiffFocus mechanism) — harmless no-op when the line is already visible. */
  onFocusLine?: () => void;
}) {
  const anchorRef = React.useRef<HTMLButtonElement>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const [popupStyle, setPopupStyle] = React.useState<React.CSSProperties | null>(null);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    onFocusLine?.();
    if (popupStyle) {
      setPopupStyle(null);
      return;
    }
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const maxLeft = window.innerWidth - POPUP_WIDTH - 8;
    setPopupStyle({
      position: "fixed",
      top: rect.bottom + POPUP_GAP,
      left: Math.min(rect.left, Math.max(0, maxLeft)),
      width: POPUP_WIDTH,
      zIndex: 9999,
    });
  }

  // Close on outside mousedown (before click fires, so no flicker) — same
  // pattern as FindingsTooltip.
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
      onClick={(e) => e.stopPropagation()}
      style={{
        ...popupStyle,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", flex: 1, minWidth: 0 }}>
          {finding.title}
        </span>
        <CategoryTag category={finding.category as Category} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
        <span className="mono">
          {finding.file}:{lineLabel(finding)}
        </span>
        <ConfidenceNum value={finding.confidence} />
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
        <Markdown>{finding.rationale}</Markdown>
      </div>
      {finding.suggestion && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 4,
            }}
          >
            Suggested fix
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
            <Markdown>{finding.suggestion}</Markdown>
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={handleClick}
        aria-label={`${FINDING_LABEL[finding.severity]} finding: ${finding.title} — show details`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          flexShrink: 0,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "0 8px 0 4px",
        }}
      >
        <SeverityBadge severity={finding.severity} />
      </button>
      {popup && typeof document !== "undefined" ? ReactDOM.createPortal(popup, document.body) : null}
    </>
  );
}
