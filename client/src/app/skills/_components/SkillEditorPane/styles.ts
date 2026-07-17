import type { CSSProperties } from "react";

/** Co-located styles for SkillEditorPane (pane chrome; tab bodies own their own).
    No max-width/centering — the pane fills the workbench's right column. */
export const s = {
  wrap: {
    padding: "16px 28px 44px",
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
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
