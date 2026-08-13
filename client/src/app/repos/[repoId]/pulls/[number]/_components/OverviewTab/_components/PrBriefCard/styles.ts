import type { CSSProperties } from "react";

/** Co-located styles for PrBriefCard — inline style objects over CSS
   variables, matching the IntentCard/BlastCard siblings. Three left-to-right
   regions (spec `2026-08-11-pr-brief-rollup-layout` AC-12): (1) risk
   indicator, (2) headline + badge + summary, (3) score/cost/tokens. */
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

  // ── the 3-region body row ────────────────────────────────────────────────
  body: {
    display: "flex",
    alignItems: "stretch",
    gap: 16,
  },

  // ── region 1: risk indicator alone, full card height ────────────────────
  region1: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    flexShrink: 0,
  },
  /** The filled/solid shape itself (AC-13) — background = the risk color, a
     contrasting glyph inside. Never the sole risk signal: region 2's label
     always renders alongside it. */
  riskDisc: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: "50%",
    flexShrink: 0,
  },

  // ── region 2: headline title row + badge, then what/why summary ─────────
  region2: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
    flex: 1,
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  riskLabel: {
    fontSize: 16,
    fontWeight: 700,
  },
  countsBadge: {
    fontSize: 13,
    color: "var(--text-muted)",
  },
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

  // ── region 3: score ring + label, then cost, then tokens ────────────────
  region3: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
    paddingLeft: 16,
    borderLeft: "1px solid var(--border)",
  },
  scoreLabel: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  },
  costLine: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: "var(--text-muted)",
  },
  tokensLine: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: "var(--text-muted)",
  },

  // ── error state actions ───────────────────────────────────────────────
  errorActions: {
    display: "flex",
    justifyContent: "center",
  },
};
