import type { CSSProperties } from "react";

export const s = {
  // Responsive card grid: single column on narrow viewports, auto-fits
  // additional cards (e.g. a future Blast Radius card) beside Intent once
  // there's room — no placeholder slot is reserved for the unbuilt card.
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 20,
    alignItems: "start",
  } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;
