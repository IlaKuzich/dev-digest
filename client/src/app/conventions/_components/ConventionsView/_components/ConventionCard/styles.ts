import type { CSSProperties } from "react";

export const confFill = (pct: number, strong: boolean): CSSProperties => ({
  width: `${pct}%`,
  height: "100%",
  borderRadius: 999,
  background: strong ? "var(--success, #22c55e)" : "var(--warning, #f59e0b)",
});

export const cs: Record<string, CSSProperties> = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    background: "var(--bg-elevated)",
  },
  cardAccepted: { borderColor: "var(--accent, #3b82f6)" },
  topRow: { display: "flex", alignItems: "flex-start", gap: 12, justifyContent: "space-between" },
  ruleWrap: { display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 },
  rule: { fontSize: 15, fontWeight: 600, fontStyle: "italic", color: "var(--text-primary)", margin: 0 },
  ruleInput: {
    fontSize: 15,
    fontWeight: 600,
    width: "100%",
    padding: 8,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text-primary)",
    fontFamily: "inherit",
    resize: "vertical",
  },
  actions: { display: "flex", gap: 6, flexShrink: 0 },
  evidence: {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12,
    color: "var(--text-muted)",
  },
  code: {
    margin: 0,
    padding: "10px 12px",
    borderRadius: 8,
    background: "var(--bg)",
    border: "1px solid var(--border)",
    overflowX: "auto",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12.5,
    color: "var(--text-secondary)",
  },
  codeLink: {
    display: "block",
    textDecoration: "none",
    cursor: "pointer",
  },
  confRow: { display: "flex", alignItems: "center", gap: 10 },
  confLabel: { fontSize: 12, color: "var(--text-muted)" },
  confTrack: { flex: 1, maxWidth: 220, height: 6, borderRadius: 999, background: "var(--border)" },
  confPct: { fontSize: 12, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" },
  category: { display: "flex", gap: 8, alignItems: "center" },
};
