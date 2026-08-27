import type { CSSProperties } from "react";

/** Co-located styles for the Export Wizard + its steps. Kept as a static
 *  `Record<string, CSSProperties>` map — dynamic per-value styles (e.g. the
 *  radio dot below) are exported as standalone functions instead of map
 *  entries, per client INSIGHTS.md 2026-07-08 (a function member widens every
 *  sibling literal's inferred type and breaks `style` assignment). */
export const s = {
  stepper: { padding: "18px 24px 0" } satisfies CSSProperties,
  body: { padding: "20px 24px", minHeight: 320 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", width: "100%" } satisfies CSSProperties,

  // Target step
  targetGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 } satisfies CSSProperties,
  targetCard: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    textAlign: "left",
    padding: "14px 16px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    cursor: "pointer",
  } satisfies CSSProperties,
  targetCardSelected: { borderColor: "var(--accent)", boxShadow: "0 0 0 1px var(--accent)" } satisfies CSSProperties,
  targetCardDisabled: { opacity: 0.5, cursor: "not-allowed" } satisfies CSSProperties,
  targetCardHead: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  targetCardTitle: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  targetCardDesc: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,

  // Preview step
  previewGrid: { display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, minHeight: 300 } satisfies CSSProperties,
  fileList: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  fileListLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  fileItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 6,
    border: "none",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 12.5,
    textAlign: "left",
    cursor: "pointer",
    wordBreak: "break-word",
  } satisfies CSSProperties,
  fileItemActive: { background: "var(--accent-bg)", color: "var(--accent-text)" } satisfies CSSProperties,
  fileView: {
    display: "flex",
    flexDirection: "column",
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
  } satisfies CSSProperties,
  fileViewHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  fileViewPath: { fontSize: 12.5, fontWeight: 600 } satisfies CSSProperties,
  readOnlyPre: {
    flex: 1,
    margin: 0,
    padding: 14,
    fontSize: 12.5,
    lineHeight: 1.6,
    overflow: "auto",
    whiteSpace: "pre-wrap",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  parseError: {
    padding: "10px 14px",
    fontSize: 12.5,
    color: "var(--crit)",
    background: "var(--crit-bg)",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  lintWarning: {
    padding: "10px 14px",
    fontSize: 12.5,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  previewLoading: { padding: 40, textAlign: "center", color: "var(--text-muted)" } satisfies CSSProperties,
  error: { padding: 40, textAlign: "center", color: "var(--crit)" } satisfies CSSProperties,

  // Configure step
  sectionLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginTop: 20,
    marginBottom: 10,
  } satisfies CSSProperties,
  triggerRow: { display: "flex", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  secretsList: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  secretRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    fontSize: 12.5,
  } satisfies CSSProperties,
  secretNote: { fontSize: 12, color: "var(--text-muted)", marginTop: 8 } satisfies CSSProperties,
  postAsGroup: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  postAsOption: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 4px",
    border: "none",
    background: "transparent",
    fontSize: 13.5,
    color: "var(--text-secondary)",
    cursor: "pointer",
    textAlign: "left",
  } satisfies CSSProperties,
  postAsOptionActive: { color: "var(--text-primary)", fontWeight: 600 } satisfies CSSProperties,
  postAsHint: { fontSize: 12, color: "var(--text-muted)", marginTop: 4, marginLeft: 24 } satisfies CSSProperties,
  blockMergeCallout: {
    marginTop: 20,
    padding: "12px 14px",
    borderRadius: 8,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  blockMergeTitle: { fontWeight: 600, marginBottom: 4, color: "var(--text-primary)" } satisfies CSSProperties,

  // Install step
  installCard: {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "14px 16px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    marginBottom: 10,
    cursor: "pointer",
  } satisfies CSSProperties,
  installCardActive: { borderColor: "var(--accent)", boxShadow: "0 0 0 1px var(--accent)" } satisfies CSSProperties,
  installCardHeader: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  installCardTitle: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  installCardBody: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  helpLink: { fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", marginTop: 8 } satisfies CSSProperties,
  successBanner: {
    marginTop: 14,
    padding: "10px 14px",
    borderRadius: 8,
    background: "var(--ok-bg)",
    color: "var(--ok)",
    fontSize: 13,
  } satisfies CSSProperties,
  errorBanner: {
    marginTop: 14,
    padding: "10px 14px",
    borderRadius: 8,
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 13,
  } satisfies CSSProperties,
} as const;

/** Dynamic per-selection radio-dot style — a standalone function (not a
 *  static map entry) so `s` above stays a pure `Record<string, CSSProperties>`. */
export function radioDot(active: boolean): CSSProperties {
  return {
    width: 14,
    height: 14,
    borderRadius: 99,
    border: "1.5px solid " + (active ? "var(--accent)" : "var(--border-strong)"),
    background: active ? "var(--accent)" : "transparent",
    flexShrink: 0,
  };
}
