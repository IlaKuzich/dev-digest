import type { CSSProperties } from "react";

/** Co-located styles for the Project Context discovery page (two-pane
    master-detail: file list + inline preview). */

export const s = {
  /* 52px is the AppShell header — the row fills exactly the rest of the
     viewport so the two columns scroll independently (mirrors SkillsWorkbench). */
  row: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,

  listCol: {
    width: 300,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
    minHeight: 0,
  } satisfies CSSProperties,
  listHeader: { padding: "16px 16px 10px", flexShrink: 0 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  listLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  roots: {
    marginTop: 5,
    fontSize: 12,
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono)",
  } satisfies CSSProperties,

  listScroll: { flex: 1, minHeight: 0, overflow: "auto", padding: "6px 10px 10px", display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  docRow: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 10px",
    borderRadius: 7,
    border: "1px solid transparent",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
  } satisfies CSSProperties,
  docRowSelected: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    cursor: "pointer",
    textAlign: "left",
  } satisfies CSSProperties,
  docIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  docMain: { minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 1 } satisfies CSSProperties,
  docFilename: {
    fontSize: 13,
    fontWeight: 550,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  docDir: {
    fontSize: 11,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,

  listFooter: {
    flexShrink: 0,
    borderTop: "1px solid var(--border)",
    padding: "10px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 3,
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  footerLine: { display: "flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  footerDot: { width: 7, height: 7, borderRadius: "50%", background: "var(--ok, #3fb950)", flexShrink: 0 } satisfies CSSProperties,
  footerSep: { opacity: 0.6 } satisfies CSSProperties,

  /* minWidth/minHeight 0 are load-bearing: without them this flex child refuses
     to shrink below its content, so wide preview code widens the page instead
     of scrolling inside the pane. */
  pane: { flex: 1, minWidth: 0, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column" } satisfies CSSProperties,
  detailHeader: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 24px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  detailFilename: { fontSize: 14, fontWeight: 600, fontFamily: "var(--font-mono)" } satisfies CSSProperties,
  previewPill: {
    fontSize: 12,
    fontWeight: 500,
    padding: "3px 10px",
    borderRadius: 6,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  detailUsedBy: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  detailBody: { flex: 1, minHeight: 0, padding: "22px 28px", overflow: "auto" } satisfies CSSProperties,
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
  paneEmptyBody: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,

  /* Retained full-area states (loading / error / empty render outside the
     two-pane frame). */
  pageHeader: { padding: "24px 32px 10px", display: "flex", alignItems: "flex-end", gap: 16 } satisfies CSSProperties,
  pageTitle: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  loadingStack: { margin: "14px 32px 44px", display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  emptyCard: {
    margin: "14px 32px 44px",
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
} as const;
