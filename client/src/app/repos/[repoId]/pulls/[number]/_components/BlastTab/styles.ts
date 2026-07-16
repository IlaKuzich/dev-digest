import type { CSSProperties } from "react";

/** Co-located styles for BlastTab + SymbolRow (inline style objects over CSS
    variables — matches the diff-viewer collapsible-row precedent). Any
    dynamic style is a standalone exported function returning `CSSProperties`,
    never a member of this map (client INSIGHTS.md:22). */
export const s = {
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  statStrip: {
    display: "flex",
    alignItems: "center",
    gap: 18,
    flexWrap: "wrap",
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  stat: {
    display: "flex",
    alignItems: "baseline",
    gap: 5,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  statValue: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  degradedBanner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
  } satisfies CSSProperties,
  degradedText: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  tree: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  noDownstream: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "8px 2px",
  } satisfies CSSProperties,
  symbolCard: {
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  symbolHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
  } satisfies CSSProperties,
  symbolToggle: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
    color: "inherit",
  } satisfies CSSProperties,
  symbolName: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  symbolMeta: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  symbolChips: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginLeft: "auto",
  } satisfies CSSProperties,
  symbolBody: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "0 14px 14px 38px",
  } satisfies CSSProperties,
  callerList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  callerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "var(--text-secondary)",
    textDecoration: "none",
  } satisfies CSSProperties,
  callerName: {
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  } satisfies CSSProperties,
  chipGroupLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 4,
  } satisfies CSSProperties,
} as const;

/** Chevron rotation for the SymbolRow toggle (open vs. collapsed). */
export function chevronFor(open: boolean): CSSProperties {
  return {
    transform: open ? "rotate(90deg)" : "rotate(0deg)",
    transition: "transform .12s",
    flexShrink: 0,
  };
}
