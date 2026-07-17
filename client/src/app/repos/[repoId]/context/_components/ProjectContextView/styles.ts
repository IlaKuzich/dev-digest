import type { CSSProperties } from "react";

/** Co-located styles for the Project Context discovery page. */
export const s = {
  pageHeader: {
    padding: "24px 32px 10px",
    display: "flex",
    alignItems: "flex-end",
    gap: 16,
  } satisfies CSSProperties,
  pageTitle: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: "-0.02em",
  } satisfies CSSProperties,
  pageSubtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    marginTop: 4,
  } satisfies CSSProperties,
  tableCard: {
    margin: "14px 32px 0",
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 20px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  rowMain: {
    minWidth: 0,
    flex: 1,
    display: "flex",
    alignItems: "baseline",
    gap: 10,
  } satisfies CSSProperties,
  rowFilename: {
    fontSize: 14,
    fontWeight: 550,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  rowDir: {
    fontSize: 12,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  usedBy: {
    fontSize: 12,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  footer: {
    margin: "0 32px 44px",
    padding: "12px 20px",
    display: "flex",
    gap: 20,
    fontSize: 12,
    color: "var(--text-muted)",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  loadingStack: {
    margin: "14px 32px 44px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  emptyCard: {
    margin: "14px 32px 44px",
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  previewBody: {
    padding: "18px 24px",
  } satisfies CSSProperties,
} as const;
