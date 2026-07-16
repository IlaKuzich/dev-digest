import type { CSSProperties } from "react";

/** Co-located styles for BlastCard and its subcomponents (SymbolRow,
    ViewToggle, BlastGraph, PriorPrs) — inline style objects over CSS
    variables, matching the IntentCard sibling. Any dynamic style must be a
    standalone exported function returning `CSSProperties`, never a member of
    this map (client INSIGHTS.md:22). */
export const s: Record<string, CSSProperties> = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 18,
    background: "var(--bg-elevated)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  // ── stat strip ──────────────────────────────────────────────────────────
  statRow: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  stat: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 13,
    color: "var(--text-secondary)",
  },
  statValue: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  // Pushes the Tree/Graph toggle to the far end of the stat strip (mockup).
  statSpacer: {
    marginLeft: "auto",
  },

  // ── view toggle (segmented control) ─────────────────────────────────────
  toggleRail: {
    display: "inline-flex",
    padding: 2,
    gap: 2,
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg)",
  },

  // Coverage caveat — informational, NOT a degradation. Deliberately quieter
  // than the warn-coloured degraded banner: the index is healthy here.
  coverageNote: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    lineHeight: 1.45,
    color: "var(--text-muted)",
    margin: 0,
  },

  // ── degradation banner ──────────────────────────────────────────────────
  degradedBanner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
  },
  degradedText: {
    fontSize: 13,
    color: "var(--text-secondary)",
  },

  // ── tree ────────────────────────────────────────────────────────────────
  tree: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  noDownstream: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "8px 2px",
    margin: 0,
  },
  symbolCard: {
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    overflow: "hidden",
  },
  symbolHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
  },
  symbolToggle: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
    color: "inherit",
  },
  // Long symbol names truncate rather than shove the caller count into the
  // chips (they collide otherwise — the card is narrower than a full tab).
  symbolName: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
  symbolMeta: {
    fontSize: 12,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  symbolChips: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginLeft: "auto",
    flexShrink: 0,
  },
  symbolBody: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "0 14px 14px 38px",
  },
  callerList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  callerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "var(--text-secondary)",
    textDecoration: "none",
  },
  callerName: {
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  chipGroupLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 4,
  },

  // ── prior PRs footer ────────────────────────────────────────────────────
  priorSection: {
    borderTop: "1px solid var(--border)",
    paddingTop: 12,
  },
  priorToggle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
    color: "var(--text-secondary)",
    fontSize: 13,
  },
  priorList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    paddingTop: 10,
  },
  priorRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "var(--text-secondary)",
    textDecoration: "none",
  },
  priorNumber: {
    color: "var(--text-muted)",
    flexShrink: 0,
  },
  priorTitle: {
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  priorMeta: {
    color: "var(--text-muted)",
    marginLeft: "auto",
    flexShrink: 0,
  },

  // ── graph ───────────────────────────────────────────────────────────────
  graphEmpty: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "18px 2px",
    margin: 0,
    textAlign: "center",
  },

  // ── explain (T4) footer ─────────────────────────────────────────────────
  explainRow: {
    display: "flex",
    justifyContent: "flex-start",
  },
  summary: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    margin: 0,
  },
  explainError: {
    fontSize: 12.5,
    color: "var(--crit)",
    margin: 0,
  },
};

/** Chevron rotation for the SymbolRow / PriorPrs toggles (open vs collapsed). */
export function chevronFor(open: boolean): CSSProperties {
  return {
    transform: open ? "rotate(90deg)" : "rotate(0deg)",
    transition: "transform .12s",
    flexShrink: 0,
  };
}

/** One segment of the Tree/Graph control. Dynamic → standalone function, not
    a member of the `s` map (client INSIGHTS.md:22). */
export function toggleSegmentFor(active: boolean): CSSProperties {
  return {
    padding: "3px 12px",
    borderRadius: 5,
    border: "none",
    cursor: "pointer",
    font: "inherit",
    fontSize: 12,
    fontWeight: 600,
    background: active ? "var(--bg-elevated)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
    boxShadow: active ? "0 1px 2px rgba(0,0,0,.25)" : "none",
  };
}
