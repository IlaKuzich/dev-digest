import type { CSSProperties } from "react";

export const ms: Record<string, CSSProperties> = {
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 },
  body: { display: "flex", flexDirection: "column", gap: 14 },
  note: {
    fontSize: 13,
    color: "var(--text-secondary)",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
  },
  preview: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "12px 14px",
    maxHeight: 220,
    overflowY: "auto",
    background: "var(--bg)",
  },
};
