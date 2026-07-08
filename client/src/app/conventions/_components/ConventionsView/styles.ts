import type { CSSProperties } from "react";

export const s: Record<string, CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    padding: "28px 32px",
    maxWidth: 1000,
    margin: "0 auto",
    width: "100%",
  },
  header: { display: "flex", flexDirection: "column", gap: 6 },
  h1: { fontSize: 26, fontWeight: 700, margin: 0, color: "var(--text-primary)" },
  repoName: { color: "var(--accent, #3b82f6)" },
  subtitle: { color: "var(--text-muted)", fontSize: 14, margin: 0 },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  toolbarLeft: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    color: "var(--text-muted)",
    fontSize: 13,
  },
  toolbarRight: { display: "flex", alignItems: "center", gap: 8 },
  list: { display: "flex", flexDirection: "column", gap: 12 },
};
