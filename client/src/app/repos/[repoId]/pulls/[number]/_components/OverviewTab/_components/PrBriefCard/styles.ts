import type { CSSProperties } from "react";

/** Co-located styles for PrBriefCard — inline style objects over CSS
   variables, matching the IntentCard/BlastCard siblings. */
export const s: Record<string, CSSProperties> = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 18,
    background: "var(--bg-elevated)",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },

  // ── headline row: risk level + counts (left) / score (right) ────────────
  headlineRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  headlineLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    minWidth: 0,
  },
  riskLabel: {
    fontSize: 16,
    fontWeight: 700,
  },
  countsBadge: {
    fontSize: 13,
    color: "var(--text-muted)",
  },
  scoreBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  scoreLabel: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  },

  // ── summary block ─────────────────────────────────────────────────────
  summaryBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  summary: {
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
    margin: 0,
  },

  // ── cost/tokens line ──────────────────────────────────────────────────
  costLine: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "var(--text-muted)",
  },

  // ── error state actions ───────────────────────────────────────────────
  errorActions: {
    display: "flex",
    justifyContent: "center",
  },
};
