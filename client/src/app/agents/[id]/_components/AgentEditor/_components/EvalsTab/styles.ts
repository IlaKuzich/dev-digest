import type { CSSProperties } from "react";

/** Co-located styles for EvalsTab + CaseRow. */
export const s = {
  wrap: { maxWidth: 960 } satisfies CSSProperties,
  metricsHeader: { display: "flex", alignItems: "center", marginBottom: 10 } satisfies CSSProperties,
  sectionLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  dashboardLink: {
    marginLeft: "auto",
    fontSize: 13,
    color: "var(--accent)",
    textDecoration: "none",
  } satisfies CSSProperties,
  tiles: { display: "flex", gap: 12, marginBottom: 24 } satisfies CSSProperties,
  tile: {
    flex: 1,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 16,
  } satisfies CSSProperties,
  tileLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  tileValue: { fontSize: 26, fontWeight: 700, marginTop: 8 } satisfies CSSProperties,
  casesHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } satisfies CSSProperties,
  h3: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  headerActions: { marginLeft: "auto", display: "flex", gap: 10 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  rowBody: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 } satisfies CSSProperties,
  rowName: { fontSize: 13, fontWeight: 700 } satisfies CSSProperties,
  rowSubtitle: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  rowActions: { display: "flex", gap: 2, flexShrink: 0 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "24px 0" } satisfies CSSProperties,
} as const;
