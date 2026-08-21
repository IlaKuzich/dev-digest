import type { CSSProperties } from "react";

/** Co-located styles for AgentDetail. */
export const s = {
  page: { padding: "20px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  backLink: { marginBottom: 12 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  metrics: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  section: { marginTop: 24 } satisfies CSSProperties,
} as const;
