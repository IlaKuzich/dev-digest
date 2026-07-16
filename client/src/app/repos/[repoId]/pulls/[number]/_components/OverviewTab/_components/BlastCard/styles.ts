import type { CSSProperties } from "react";

/** Co-located styles for BlastCard — inline style objects over CSS variables,
    matching the IntentCard sibling. Any dynamic style must be a standalone
    exported function returning `CSSProperties`, never a member of this map
    (client INSIGHTS.md:22). */
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
  statRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 16,
    flexWrap: "wrap",
  },
  stat: {
    display: "flex",
    alignItems: "baseline",
    gap: 5,
    fontSize: 13,
    color: "var(--text-secondary)",
  },
  statValue: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
};
