import type { Brief } from '@devdigest/shared';

/**
 * Pure grounding validation for the Why+Risk Brief (AC-5/AC-6). No I/O, no
 * container — hermetically testable in isolation (`brief-grounding.test.ts`).
 *
 * This is a SECURITY control, not just UX (spec §Non-functional › Security):
 * `file_refs` from the model become links in the UI, so an ungrounded /
 * hallucinated path is both a misleading link and a potential path-shaped
 * injection. Every `file_ref` must name something that literally appears in
 * the assembled input's file/endpoint/context-spec set, or it is dropped.
 */

/**
 * Strip a trailing `:line` or `:start-end` suffix so a line-annotated ref
 * (`src/x.ts:12-18`) grounds against the bare path (`src/x.ts`) in the set.
 * Endpoint refs (`GET /api/public/items`) carry no such suffix and pass
 * through unchanged. Plain string ops only — no dynamically-built RegExp
 * (root `INSIGHTS.md:29`); the pattern here is a fixed literal, not built
 * from input.
 */
export function normalizeFileRef(ref: string): string {
  return ref.replace(/:\d+(?:-\d+)?$/, '');
}

export interface GroundBriefResult {
  brief: Brief;
  /** Every dropped ref (from `risks[].file_refs` and `review_focus[].file_ref`),
   *  for the caller to log (AC-5 "record the drop"). */
  dropped: string[];
}

/**
 * Validate every `file_ref` in `risks[]` and `review_focus[]` against the
 * assembled `fileSet` (the union of changed files, blast map files/endpoints/
 * crons, and discovered context-doc paths — see `assembleFileSet` in
 * `helpers.ts`).
 *
 * - `risks[]`: filter each risk's `file_refs` to grounded refs only; if a risk
 *   retains no valid ref, drop the whole risk (AC-5).
 * - `review_focus[]`: drop any item whose `file_ref` is ungrounded (AC-6).
 *
 * Grounding removing every risk (or every focus item) yields empty arrays
 * with the brief otherwise unchanged and still valid (AC-7) — never an error.
 */
export function groundBrief(brief: Brief, fileSet: Set<string>): GroundBriefResult {
  const dropped: string[] = [];

  const risks = brief.risks
    .map((risk) => {
      const keptRefs = risk.file_refs.filter((ref) => {
        const grounded = fileSet.has(normalizeFileRef(ref));
        if (!grounded) dropped.push(ref);
        return grounded;
      });
      return { ...risk, file_refs: keptRefs };
    })
    .filter((risk) => risk.file_refs.length > 0);

  const review_focus = brief.review_focus.filter((item) => {
    const grounded = fileSet.has(normalizeFileRef(item.file_ref));
    if (!grounded) dropped.push(item.file_ref);
    return grounded;
  });

  return { brief: { ...brief, risks, review_focus }, dropped };
}
