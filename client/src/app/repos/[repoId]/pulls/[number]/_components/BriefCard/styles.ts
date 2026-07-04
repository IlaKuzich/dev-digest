import type { CSSProperties } from "react";

/** Co-located styles for BriefCard + sub-components. */
export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: "16px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,

  loadingCard: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } satisfies CSSProperties,
  loadingText: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  errorCard: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 24,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  errorText: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,

  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  } satisfies CSSProperties,

  banner: (color: string, bg: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: bg,
    color,
    borderRadius: 6,
    padding: "3px 10px",
    fontSize: 12,
    fontWeight: 600,
  }),

  regenerateBtn: {
    fontSize: 11,
    color: "var(--text-muted)",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
  } satisfies CSSProperties,

  body: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  } satisfies CSSProperties,

  textCol: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  what: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  why: {
    margin: 0,
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,

  metricsCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 6,
    flexShrink: 0,
  } satisfies CSSProperties,
  metricsRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  scoreCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
  } satisfies CSSProperties,
  scoreLabel: {
    fontSize: 10,
    color: "var(--text-muted)",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  } satisfies CSSProperties,

  nudge: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 8,
    flexShrink: 0,
  } satisfies CSSProperties,
  nudgeText: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  reviewFocus: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  reviewFocusHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  reviewFocusLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  reviewFocusBadge: {
    fontSize: 11,
    fontWeight: 600,
    lineHeight: "16px",
    padding: "0 5px",
    borderRadius: 4,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  reviewFocusListEl: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  reviewFocusItem: {
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "baseline",
    gap: 6,
    fontSize: 13,
  } satisfies CSSProperties,
  reviewFocusBullet: {
    color: "var(--text-muted)",
    userSelect: "none" as const,
    flexShrink: 0,
  } satisfies CSSProperties,
  reviewFocusText: { color: "var(--text-secondary)" } satisfies CSSProperties,
  reviewFocusSep: {
    color: "var(--text-muted)",
    userSelect: "none" as const,
    flexShrink: 0,
  } satisfies CSSProperties,
  reviewFocusRefs: {
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "baseline",
    gap: 0,
  } satisfies CSSProperties,
  reviewFocusRefSep: {
    color: "var(--text-muted)",
    fontSize: 12,
  } satisfies CSSProperties,
  reviewFocusRefBtn: {
    fontFamily: "monospace",
    fontSize: 11,
    fontWeight: 500,
    color: "var(--accent-text, #60a5fa)",
    background: "rgba(96, 165, 250, 0.10)",
    border: "none",
    borderRadius: 4,
    padding: "1px 6px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
