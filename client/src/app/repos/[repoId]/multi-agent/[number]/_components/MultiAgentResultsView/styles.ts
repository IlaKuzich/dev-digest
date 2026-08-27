import type { CSSProperties } from "react";

/** Co-located styles for MultiAgentResultsView + its subcomponents. */
export const s = {
  page: {
    padding: "24px 32px 48px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
    maxWidth: 1280,
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
  buttonRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  pageTitle: { fontSize: 20, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  pageSubtitle: { fontSize: 13, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  prLine: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
  } satisfies CSSProperties,
  prNumber: { fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  prTitle: { color: "var(--text-secondary)" } satisfies CSSProperties,
  totalsLine: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  toggleGroup: {
    display: "flex",
    border: "1px solid var(--border-strong)",
    borderRadius: 7,
    overflow: "hidden",
  } satisfies CSSProperties,
  toggleBtn: (active: boolean): CSSProperties => ({
    padding: "7px 16px",
    fontSize: 13,
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
    background: active ? "var(--accent)" : "var(--bg-elevated)",
    color: active ? "#fff" : "var(--text-secondary)",
  }),
  columnsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 16,
    alignItems: "start",
  } satisfies CSSProperties,
  column: (borderColor: string): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    borderRadius: 10,
    border: "1px solid var(--border)",
    borderTopWidth: 3,
    borderTopColor: borderColor,
    background: "var(--bg-elevated)",
    overflow: "hidden",
    // A `1fr` grid item's default min-width is `auto` (its content's natural
    // width), not 0 — without this a long file path in `columnFindingLoc`
    // pushes the whole column wider instead of truncating.
    minWidth: 0,
  }),
  columnHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "14px 14px 12px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  columnAgentName: { fontSize: 14, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  columnMeta: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  columnBody: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 12,
    flex: 1,
    minHeight: 60,
  } satisfies CSSProperties,
  columnSummary: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    marginBottom: 4,
  } satisfies CSSProperties,
  columnFinding: (sevColor: string): CSSProperties => ({
    borderLeft: `3px solid ${sevColor}`,
    borderRadius: 4,
    background: "var(--bg-hover)",
    padding: "8px 10px",
    fontSize: 12.5,
    minWidth: 0,
  }),
  columnFindingTitle: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  // A long file path must never push past the column's own width — the
  // column is a CSS grid track, so this needs BOTH an explicit overflow
  // rule here AND `minWidth: 0` on every ancestor up to the grid item
  // (`columnFinding` above, `column` below); a flex/grid child's default
  // `min-width: auto` otherwise refuses to shrink below its content's
  // natural width and the ellipsis never kicks in.
  columnFindingLoc: {
    color: "var(--text-muted)",
    marginTop: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  columnFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    borderTop: "1px solid var(--border)",
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  columnFailedNote: {
    fontSize: 12.5,
    color: "var(--crit)",
    background: "var(--crit-bg)",
    borderRadius: 6,
    padding: "8px 10px",
  } satisfies CSSProperties,
  columnLiveNote: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,
  spin: { animation: "ddspin 1s linear infinite" } satisfies CSSProperties,
  tabsBody: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    paddingTop: 16,
  } satisfies CSSProperties,
  tabSummary: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  tabSummaryMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  tabSummaryVerdict: { fontSize: 15, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  tabSummaryBody: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.5 } satisfies CSSProperties,
  tabSummaryMeta: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 6,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  findingsList: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  disagreement: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  disagreementHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } satisfies CSSProperties,
  disagreementTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  toggleRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  conflictCard: {
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  conflictHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    borderBottom: "1px solid var(--border)",
    fontSize: 13,
  } satisfies CSSProperties,
  conflictTakes: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  } satisfies CSSProperties,
  conflictTake: {
    padding: "12px 14px",
    borderRight: "1px solid var(--border)",
    borderTop: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  conflictAgent: { fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  conflictVerdictIgnored: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  conflictNote: { fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
} as const;

/** Dynamic per-severity pill for a conflict take's active verdict — kept as a
   standalone function (not part of the static `s` map) since a
   `Record<string, CSSProperties>` cannot hold a parameterized member
   (client INSIGHTS 2026-07-08). */
export function conflictVerdictSeverity(color: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color,
  };
}
