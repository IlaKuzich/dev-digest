import type { CSSProperties } from "react";

/** Co-located styles for SkillEditorView (page chrome; tab bodies own their own). */
export const s = {
  wrap: {
    padding: "16px 28px 44px",
    maxWidth: 1040,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  } satisfies CSSProperties,
  header: { marginBottom: 10 } satisfies CSSProperties,
  backLink: {
    background: "none",
    border: "none",
    color: "var(--text-secondary)",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
  } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
