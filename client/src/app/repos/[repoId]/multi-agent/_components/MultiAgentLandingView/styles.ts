import type { CSSProperties } from "react";

/** Co-located styles for MultiAgentLandingView. */
export const s = {
  page: {
    padding: "24px 32px 48px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
    maxWidth: 1280,
    margin: "0 auto",
  } satisfies CSSProperties,
} as const;
