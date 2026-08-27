/* Pure helpers for MultiAgentHistoryView — no React import
   (client-project-structure). Duplicated (not imported) from the sibling
   MultiAgentResultsView/helpers.ts's `formatDurationMs` — it's a one-line
   pure function, and duplicating it keeps this route's _components free of
   a cross-route reach-in rather than adding another "no lift" exception. */
export function formatDurationMs(ms: number | null): string {
  if (ms == null) return "—";
  const seconds = ms / 1000;
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
}
