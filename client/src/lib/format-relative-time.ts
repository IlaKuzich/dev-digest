/* format-relative-time.ts — shared "Xm ago" / "Xh ago" / "Xd ago" formatter.
   Canonical home per client-project-structure ("reused by 2+ routes lifts to
   src/lib/"): this exact bucketing (minutes→hours→days, "just now" floor,
   `Date.parse` + a `ms < 0` guard against clock-skewed/future timestamps) was
   already independently written THREE times across the codebase —
   `app/repos/[repoId]/context/_components/ProjectContextView/helpers.ts`'s
   `timeSinceLabel` (oldest), and two near-identical copies added in this PR
   (`AgentEditor/_components/CiTab/helpers.ts`'s `relativeTime`,
   `ci-runs/_components/CiRunsView/helpers.ts`'s `relativeTimeFrom`). This file
   is the single source of truth going forward; new call sites should import
   from here rather than writing a fourth copy. (Note: `app/repos/[repoId]/
   pulls/helpers.ts`'s `relativeTime` is a DIFFERENT, compact format —
   `"3h"`/`"2d"`/`"—"`, no "ago" suffix, `Math.round` not `Math.floor` — a
   distinct display contract for that page's dense list column, not a
   duplicate of this one; it is intentionally NOT unified here.) */

export function relativeTimeFrom(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
