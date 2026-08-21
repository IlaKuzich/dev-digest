/** Pure helpers for RecentRunsTable — no React import. */

/**
 * Render a batch-run timestamp as `YYYY-MM-DD HH:mm` (UTC) — matches the
 * mockups exactly and stays stable across locales/timezones in tests (see
 * `VersionsTab/helpers.ts` for the precedent of a fixed, test-stable format).
 */
export function formatRunTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** `0.82` → `"82%"`; `null` → `"—"`. Never encodes state by color alone. */
export function formatMetricPct(value: number | null): string {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

/** `0.23` → `"$0.23"`; `null` → `"—"`. */
export function formatCostUsd(value: number | null): string {
  if (value == null) return "—";
  return `$${value.toFixed(2)}`;
}
