/* ProjectContextView/helpers.ts — pure helpers for the discovery page: token
   aggregation, path splitting, last-synced age, and the clone-absent test.
   No React import — business logic only (client-project-structure). */
import type { ContextDoc, ContextDocsResponse } from "@devdigest/shared";

/** Sum of every discovered document's token_estimate — the aggregate figure
    in the footer (AC-4). Always an approximation (AC-13's framing extends
    here too), never re-fetched or re-encoded — arithmetic over data already
    on the query result. */
export function aggregateTokenEstimate(docs: ContextDoc[]): number {
  return docs.reduce((sum, d) => sum + d.token_estimate, 0);
}

/** Repo-relative path → filename (last segment). */
export function docFilename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

/** Repo-relative path → containing directory ("" when the file sits at the
    root of one of the configured roots). */
export function docDirectory(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}

/**
 * True when the repo has no local clone (or the clone is otherwise absent) —
 * the ONE fact that decides which empty-branch copy to render. Must be read
 * BEFORE the empty early-return so the caller can pick between the
 * clone-absent reason (AC-2, offers Resync) and the roots-empty reason
 * (AC-3, names the searched roots, describes manual attach) — computing this
 * only after already choosing a generic "no docs" branch is exactly the
 * mistake `client/INSIGHTS.md:32` and `client/INSIGHTS.md:34` record: an
 * empty screen that owes the user a reason must carry it inside that same
 * branch, not bolt it on afterward.
 */
export function isCloneAbsent(clone: ContextDocsResponse["clone"]): boolean {
  return !clone.present;
}

/** Human "time since" label for the last-synced footer (AC-4) — the list is
    always a snapshot of the last sync, never live, so its age is part of
    reading it honestly. Returns `null` when there is no sync timestamp to
    show (caller falls back to an "unknown" label). */
export function timeSinceLabel(iso: string | null): string | null {
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
