/* context-attach/helpers.ts — pure helpers for the Context attach tab: merge
   discovered docs with the owner's saved attachments, reorder, display-only
   filter (AC-9), token-sum arithmetic (AC-12/13), and path splitting. No React
   import — business logic only (client-project-structure). */
import type { ContextAttachment, ContextDoc, SetContextBody } from "@devdigest/shared";
import type { ContextRowState } from "./types";

/**
 * Merge every discovered document with the owner's saved attachment set:
 * attached docs first (in their saved order + attached flag), then any
 * discovered doc not yet attached, appended unattached (AC-7's "ordered by
 * the agent's stored order with unattached documents following attached
 * ones"). Mirrors `mergeSkillsWithLinks` in the AgentEditor Skills tab.
 */
export function mergeDocsWithAttachments(
  docs: ContextDoc[],
  attachments: ContextAttachment[],
): ContextRowState[] {
  const byPath = new Map(attachments.map((a) => [a.path, a]));
  const ordered = [...attachments]
    .sort((a, b) => a.order - b.order)
    .map((a) => docs.find((d) => d.path === a.path))
    .filter((d): d is ContextDoc => !!d)
    .map((d) => ({ doc: d, attached: byPath.get(d.path)!.attached }));
  const unattached = docs
    .filter((d) => !byPath.has(d.path))
    .map((d) => ({ doc: d, attached: false }));
  return [...ordered, ...unattached];
}

/** Move the item at `from` to position `to`, returning a new array — used by
    both drag-drop and the keyboard move-up/move-down buttons. */
export function reorder<T>(list: T[], from: number, to: number): T[] {
  const copy = [...list];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved!);
  return copy;
}

/** Rows narrowed by the filter text, each still carrying its REAL index into
    the unfiltered `rows` array — drag/drop, toggle, and reorder all act on
    that real index, so a display-only filter (AC-9) never perturbs the
    stored order or attached state, even while it's narrowing what's shown. */
export function filterRows(
  rows: ContextRowState[],
  filter: string,
): { row: ContextRowState; index: number }[] {
  const q = filter.trim().toLowerCase();
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !q || row.doc.path.toLowerCase().includes(q));
}

/** Sum of `token_estimate` over only the currently-attached rows (AC-12) —
    pure arithmetic over data already fetched with the document list; never
    triggers a network or model call. Rendered `≈ {n} tokens`, never exact
    (AC-13) — the caller owns that framing, this just computes the number. */
export function attachedTokenEstimate(rows: ContextRowState[]): number {
  return rows.filter((r) => r.attached).reduce((sum, r) => sum + r.doc.token_estimate, 0);
}

export function attachedCount(rows: ContextRowState[]): number {
  return rows.filter((r) => r.attached).length;
}

/** Repo-relative path → filename (last segment). */
export function docFilename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

/** Repo-relative path → containing directory ("" at a root's top level). */
export function docDirectory(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}

/** The full ordered `SetContextBody` posted on Save — paths + attached flag
    only, in display order (order is positional in the array, not a separate
    field); never the document text (AC-10/11 UI side). */
export function toSetContextBody(rows: ContextRowState[]): SetContextBody {
  return { docs: rows.map((r) => ({ path: r.doc.path, attached: r.attached })) };
}
