import type { CSSProperties } from "react";

/** Co-located styles for RecentRunsTable. */
export const s = {
  wrap: {
    border: "1px solid var(--border)",
    borderRadius: 9,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    padding: "10px 14px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  td: {
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  checkboxCell: { padding: "10px 14px", borderBottom: "1px solid var(--border)", width: 1 } satisfies CSSProperties,
  agentName: { color: "var(--text-primary)", fontWeight: 600 } satisfies CSSProperties,
  version: { color: "var(--accent)", fontWeight: 600 } satisfies CSSProperties,
  pass: { color: "var(--text-primary)", fontWeight: 700 } satisfies CSSProperties,
  barCell: { display: "flex", alignItems: "center", gap: 8, minWidth: 130 } satisfies CSSProperties,
  barTrack: {
    flex: 1,
    height: 8,
    background: "var(--bg-hover)",
    borderRadius: 3,
    overflow: "hidden",
  } satisfies CSSProperties,
  barPct: { fontSize: 12, fontWeight: 600, color: "var(--text-primary)", width: 34, textAlign: "right" } satisfies CSSProperties,
  empty: { padding: "28px 14px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
  /** Visually-hidden but screen-reader-visible label for the bare per-row checkbox. */
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0,0,0,0)",
    whiteSpace: "nowrap",
    border: 0,
  } satisfies CSSProperties,
} as const;

export function barFill(pct: number | null, color: string): CSSProperties {
  return {
    width: `${Math.max(0, Math.min(100, (pct ?? 0) * 100))}%`,
    height: "100%",
    background: color,
    borderRadius: 3,
  };
}
