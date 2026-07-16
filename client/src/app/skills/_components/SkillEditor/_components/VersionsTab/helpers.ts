/** Pure helpers for the Versions tab. */

/**
 * Render a snapshot timestamp as a plain `YYYY-MM-DD` day. Version history is
 * scanned, not read to the second, and a fixed format keeps it stable across
 * locales/timezones in tests.
 */
export function formatVersionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}
