import type { CSSProperties } from "react";

/** Co-located styles for SkillEditorView. */
export const s = {
  wrap: { padding: "16px 28px 44px", maxWidth: 1040, margin: "0 auto" } satisfies CSSProperties,
  header: { marginBottom: 10 } satisfies CSSProperties,
  backLink: {
    background: "none",
    border: "none",
    color: "var(--text-secondary)",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
  } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 20 } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 } satisfies CSSProperties,
  form: { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 } satisfies CSSProperties,
  preview: {
    borderLeft: "1px solid var(--border)",
    paddingLeft: 28,
    minWidth: 0,
    overflow: "auto",
  } satisfies CSSProperties,
  previewLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    marginBottom: 10,
    textTransform: "uppercase",
  } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, marginTop: 4 } satisfies CSSProperties,
  savedNote: { fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
} as const;
