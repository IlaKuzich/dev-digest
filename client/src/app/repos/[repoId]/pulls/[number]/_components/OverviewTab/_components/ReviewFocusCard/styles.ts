import type { CSSProperties } from "react";

/** Co-located styles for ReviewFocusCard — inline style objects over CSS
   variables, matching the IntentCard/BlastCard/PrBriefCard siblings. */
export const s: Record<string, CSSProperties> = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 18,
    background: "var(--bg-elevated)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  list: {
    display: "flex",
    flexDirection: "column",
  },
  // Each entry is a single real <button> — never a <div onClick> wrapping
  // other interactives (nested-interactives rule, client INSIGHTS.md).
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    width: "100%",
    background: "none",
    border: "none",
    borderRadius: 6,
    padding: "8px 6px",
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
    color: "inherit",
  },
  rowIcon: {
    flexShrink: 0,
    marginTop: 2,
    color: "var(--text-muted)",
  },
  location: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--accent)",
    flexShrink: 0,
  },
  reason: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  },
  empty: {
    fontSize: 13.5,
    color: "var(--text-muted)",
    padding: "8px 2px",
    margin: 0,
  },
};
