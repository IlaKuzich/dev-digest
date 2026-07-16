import type { CSSProperties } from "react";

/** Co-located styles for the Preview tab. */
export const s = {
  wrap: { minWidth: 0 } satisfies CSSProperties,
  header: { marginBottom: 18 } satisfies CSSProperties,
  title: { fontSize: 16, fontWeight: 700, marginBottom: 4 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
    padding: 28,
    minWidth: 0,
    overflowX: "auto",
  } satisfies CSSProperties,
  empty: {
    border: "1px dashed var(--border-strong)",
    borderRadius: 10,
    padding: 40,
    textAlign: "center",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
