import type { CSSProperties } from "react";

/** Co-located styles for CompareModal. */
export const s = {
  tiles: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, padding: "18px 24px 0" } satisfies CSSProperties,
  tile: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 14,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  tileLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  tileRow: { display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  oldValue: { fontSize: 14, color: "var(--text-muted)" } satisfies CSSProperties,
  newValue: { fontSize: 20, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  delta: { display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12.5, fontWeight: 600 } satisfies CSSProperties,
  diffSection: { padding: "18px 24px" } satisfies CSSProperties,
  diffLegend: { display: "flex", gap: 16, marginBottom: 10, fontSize: 12.5 } satisfies CSSProperties,
  diffLegendOld: { color: "var(--crit)" } satisfies CSSProperties,
  diffLegendNew: { color: "var(--ok)" } satisfies CSSProperties,
  diffBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-primary)",
    padding: 14,
    maxHeight: 260,
    overflow: "auto",
    fontSize: 12.5,
    lineHeight: 1.7,
  } satisfies CSSProperties,
  diffUnavailable: { color: "var(--text-muted)", fontSize: 13, padding: "8px 0" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;

export function diffLineStyle(type: "same" | "added" | "removed"): CSSProperties {
  if (type === "added") {
    return { background: "var(--ok-bg)", color: "var(--code-add-text, var(--ok))", padding: "1px 6px", borderRadius: 3 };
  }
  if (type === "removed") {
    return {
      background: "var(--crit-bg)",
      color: "var(--code-del-text, var(--crit))",
      padding: "1px 6px",
      borderRadius: 3,
      textDecoration: "line-through",
    };
  }
  return { color: "var(--text-secondary)" };
}
