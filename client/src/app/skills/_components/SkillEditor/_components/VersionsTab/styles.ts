import type { CSSProperties } from "react";

/** Co-located styles for the Versions tab (dynamic `row` mirrors SkillCard). */
export const s = {
  wrap: { minWidth: 0, maxWidth: 860 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 } satisfies CSSProperties,
  title: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 18 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  row: (isCurrent: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    borderRadius: 8,
    border: "1px solid " + (isCurrent ? "var(--border-strong)" : "var(--border)"),
    background: isCurrent ? "var(--bg-hover)" : "var(--bg-elevated)",
  }),
  rowText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-primary)", marginBottom: 3 } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  currentTag: { fontSize: 12, fontWeight: 600, color: "var(--accent)" } satisfies CSSProperties,
} as const;
