import type { CSSProperties } from "react";

/** Co-located styles for MetricTrendChart. */
export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    padding: 18,
    marginBottom: 20,
  } satisfies CSSProperties,
  legend: { display: "flex", gap: 16, marginBottom: 4 } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  dot: { width: 8, height: 8, borderRadius: 99 } satisfies CSSProperties,
  empty: { padding: "24px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
} as const;
