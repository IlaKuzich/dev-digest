import type { CSSProperties } from "react";

export const s: Record<string, CSSProperties> = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 18,
    background: "var(--bg-elevated)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  summary: {
    fontSize: 14.5,
    fontStyle: "italic",
    color: "var(--text-primary)",
    lineHeight: 1.55,
    margin: 0,
  },
  listBlock: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  listLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  listItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    fontSize: 13.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  },
  mutedItem: {
    color: "var(--text-muted)",
  },
  checkIcon: {
    color: "var(--success, #22c55e)",
    flexShrink: 0,
  },
  xIcon: {
    color: "var(--text-muted)",
    flexShrink: 0,
  },
};
