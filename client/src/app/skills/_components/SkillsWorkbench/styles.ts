import type { CSSProperties } from "react";

/** Co-located styles for SkillsWorkbench (list column + right pane).
    The pane's contents own their own styles. */
export const s = {
  /* 52px is the AppShell header — the row must fill exactly the rest of the
     viewport so the two columns scroll independently rather than the page. */
  row: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,

  listCol: {
    width: 280,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
    minHeight: 0,
  } satisfies CSSProperties,
  listHeader: { padding: "16px 16px 12px", flexShrink: 0 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-base)",
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  listScroll: { flex: 1, minHeight: 0, overflow: "auto", padding: "0 12px 12px" } satisfies CSSProperties,
  listStates: { padding: "0 12px", display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,

  /* minWidth/minHeight 0 are load-bearing: without them this flex child refuses to
     shrink below its content, so the editor's <pre> body widens the page instead
     of scrolling inside the pane. */
  pane: { flex: 1, minWidth: 0, minHeight: 0, overflow: "auto" } satisfies CSSProperties,
  paneEmpty: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 32,
    textAlign: "center",
  } satisfies CSSProperties,
  paneEmptyTitle: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  paneEmptyBody: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
