import type { CSSProperties } from "react";

/** Co-located styles for the Config tab. */
export const s = {
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minWidth: 0,
    maxWidth: 760,
  } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, marginTop: 4 } satisfies CSSProperties,
} as const;
