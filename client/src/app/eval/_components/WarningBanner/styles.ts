import type { CSSProperties } from "react";

/** Co-located styles for WarningBanner. */
export const s = {
  banner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    marginBottom: 20,
  } satisfies CSSProperties,
  icon: { color: "var(--warn)", flexShrink: 0, marginTop: 1 } satisfies CSSProperties,
  text: { fontSize: 13.5, color: "var(--text-primary)", lineHeight: 1.5 } satisfies CSSProperties,
} as const;
