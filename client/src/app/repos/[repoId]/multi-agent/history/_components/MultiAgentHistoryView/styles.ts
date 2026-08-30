import type { CSSProperties } from "react";

/** Co-located styles for MultiAgentHistoryView. */
export const s = {
  page: {
    padding: "24px 32px 48px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
    maxWidth: 900,
    margin: "0 auto",
  } satisfies CSSProperties,
  topRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  titleBlock: { flex: 1, minWidth: 200 } satisfies CSSProperties,
  pageTitle: { fontSize: 20, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  pageSubtitle: { fontSize: 13, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  rowMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  // PR name is the primary line (requester feedback, 2026-08-27); the run
  // date moved down to the secondary line alongside the agent/duration/cost
  // summary (or "Running…"/"Failed" when not settled).
  rowPr: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  rowPrNumber: { color: "var(--text-muted)", marginRight: 6 } satisfies CSSProperties,
  rowSecondary: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "var(--text-muted)",
    marginTop: 2,
  } satisfies CSSProperties,
} as const;
