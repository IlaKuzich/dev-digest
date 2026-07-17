/** Pure helpers for SmartDiffViewer — no React import, unit-testable without
    rendering (client-project-structure: colocated helpers.ts). Turning
    findings into per-line highlight ranges / anchored badges is the shared
    diff engine's job (`components/diff-viewer/helpers.ts`'s `highlightByLine`
    / `findingsByStartLine`) — this file only selects+filters the source data
    from `usePrReviews`. */
import type { FindingRecord, ReviewRecord, SmartDiffFile, SmartDiffGroup } from "@devdigest/shared";

/** Active (non-dismissed) findings for one file, from persisted reviews.
    Always filters dismissed findings — client/INSIGHTS.md:20 ("any time you
    count review.findings ... always prepend `.filter((f) => !f.dismissed_at)`").
    The smart-diff endpoint only carries finding *line numbers*; the full
    finding objects (severity, title, rationale, ...) are overlaid
    client-side from the persisted reviews (usePrReviews). */
export function activeFindingsForFile(
  reviews: ReviewRecord[] | undefined,
  file: string,
): FindingRecord[] {
  const out: FindingRecord[] = [];
  for (const review of reviews ?? []) {
    for (const f of review.findings) {
      if (f.dismissed_at || f.file !== file) continue;
      out.push(f);
    }
  }
  return out;
}

/** Flattens the role-grouped SmartDiff groups back into a single file list, in
    fixed group order (core, wiring, boilerplate) — used for the "Original
    order" toggle. The SmartDiff contract carries no per-file original index,
    so this is the only order reconstructable from the groups alone. */
export function originalOrder(groups: SmartDiffGroup[]): SmartDiffFile[] {
  return groups.flatMap((g) => g.files);
}
