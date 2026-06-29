# Findings Severity Counter & Tooltip — Design Spec

**Date:** 2026-06-28  
**Status:** Approved

---

## Overview

Add a findings counter with per-severity breakdown (CRITICAL / WARNING / SUGGESTION) to the PR list table and the PR detail Agent runs tab. Each counter is hoverable and opens a tooltip with individual finding details. The same treatment is applied to the Review Runs accordion header for consistency.

### Surfaces

| Surface | Location | Data source |
|---|---|---|
| PR list | FINDINGS column (new) | `PrMeta.findings_by_severity` + `PrMeta.top_findings` |
| PR detail — Timeline | Each agent run row (replaces plain text) | `ReviewRecord[]` cross-referenced by `run_id` |
| PR detail — Review Runs accordion | Accordion header (replaces plain text) | `ReviewRecord.findings` (already in scope) |

---

## 1. Contract — `PrMeta` extension

Two new nullable fields added to `PrMeta` in both vendored copies:

```
server/src/vendor/shared/contracts/platform.ts
client/src/vendor/shared/contracts/platform.ts
```

```ts
findings_by_severity: z.object({
  CRITICAL:   z.number().int(),
  WARNING:    z.number().int(),
  SUGGESTION: z.number().int(),
}).nullable().optional()

top_findings: z.array(z.object({
  id:               z.string(),
  severity:         z.string(),
  category:         z.string(),
  title:            z.string(),
  file:             z.string(),
  start_line:       z.number().int(),
  end_line:         z.number().int(),
  confidence:       z.number(),
  rationale_snippet: z.string(), // first ≤120 chars of rationale, no truncation mid-word
})).nullable().optional()
```

Both fields are `null` when the PR has no reviews yet.

### Aggregation rules (server)

- Source: **all non-dismissed findings** across all `reviews` rows for the PR (all runs, all agents).
- `top_findings`: up to **6 entries**, sorted CRITICAL → WARNING → SUGGESTION, then by `confidence` descending within each severity.
- `rationale_snippet`: `rationale.slice(0, 120)` — trim to last word boundary, append `…` if truncated.
- Both fields are computed **on-read** in `GET /repos/:id/pulls`, same pattern as `score` and `latest_run_cost_usd` (one extra `IN`-query + JS grouping).

---

## 2. New shared component — `FindingsTooltip`

**Location:** `client/src/components/findings-severity-badges/`

### `FindingsSeverityBadges`

Inline pill row. Props:

```ts
{
  bySeverity: { CRITICAL: number; WARNING: number; SUGGESTION: number } | null | undefined
}
```

Behaviour:
- Renders nothing (shows `—`) when `bySeverity` is null/undefined or all counts are 0.
- Renders only non-zero severities in order: CRITICAL, WARNING, SUGGESTION.
- Each pill: severity icon (from `SEV` tokens) + count. No label text — icon alone.
- Gap between pills: 6px.

### `FindingsTooltip`

Wraps `FindingsSeverityBadges` in a hover-triggered tooltip panel. Props:

```ts
{
  bySeverity:    { CRITICAL: number; WARNING: number; SUGGESTION: number } | null | undefined
  findings:      TopFinding[]   // the top_findings array (or derived via toTopFinding from FindingRecord[])
  repoFullName?: string | null  // when present, finding file:line links to GitHub blob
  headSha?:      string | null
}
```

Tooltip panel:
- Header: `"N FINDINGS"` (sum of all severities across bySeverity, or `findings.length` when bySeverity is absent).
- Body: scrollable list (max-height ~320px), one row per finding:
  - Severity icon (color-coded, no label)
  - Title (truncated, `font-weight: 600`)
  - Category tag (CategoryTag primitive)
  - File + line range as `MonoLink` (href optional prop — passed when `repoFullName`+`headSha` are available, e.g. timeline/accordion; omitted in PR list context where no GitHub URL is available)
  - Confidence (`ConfidenceNum` primitive)
  - `rationale_snippet` in muted small text, one line, overflow ellipsis
- Tooltip is positioned below the trigger, left-aligned, width ~380px, `z-index` above table rows.
- Opens on `mouseenter`, closes on `mouseleave` (no click-toggle needed).
- When `findings` is empty and `bySeverity` is also empty/null: tooltip does not open (hover is a no-op).

Both components are exported from `client/src/components/findings-severity-badges/index.ts`, along with the `TopFinding` type alias and the `toTopFinding` helper.

---

## 3. Server — `GET /repos/:id/pulls` query extension

In `server/src/modules/pulls/routes.ts`, after the existing `latestCostByPr` query, add:

```ts
// findings_by_severity + top_findings: all non-dismissed findings for each PR
const findingsByPr = new Map<string, {
  bySeverity: { CRITICAL: number; WARNING: number; SUGGESTION: number };
  top: TopFinding[];
}>()

if (prIds.length > 0) {
  const fRows = await container.db
    .select({ prId: reviews.prId, severity: findings.severity, ... })
    .from(findings)
    .innerJoin(reviews, eq(findings.reviewId, reviews.id))
    .where(and(
      inArray(reviews.prId, prIds),
      isNull(findings.dismissedAt),
    ))
    .orderBy(/* severity priority DESC, confidence DESC */);

  // JS-group into findingsByPr map
}
```

Return shape per PR row:
```ts
findings_by_severity: findingsByPr.get(r.id)?.bySeverity ?? null,
top_findings:         findingsByPr.get(r.id)?.top ?? null,
```

No schema migration needed — query reads existing `findings` and `reviews` tables.

---

## 4. Client integration points

### 4a. PR list — `PRRow` + column layout

Files changed:
- `client/src/app/repos/[repoId]/pulls/constants.ts`
  - Insert `"findings"` into `COLUMN_KEYS` between `"score"` and `"status"`.
  - Update `GRID` template from `"1fr 132px 92px 60px 118px 78px 78px"` to add a ~100px findings column, e.g. `"1fr 132px 92px 60px 100px 118px 78px 78px"`.

- `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`
  - Add a `<div>` cell rendering `<FindingsTooltip bySeverity={pr.findings_by_severity} findings={pr.top_findings ?? []} />`.

- `messages/en/prReview.json` (or equivalent i18n file)
  - Add column header key: `"list.columns.findings": "Findings"`.

### 4b. PR detail — Timeline (`RunHistory`)

File: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx`

New prop added:
```ts
reviews?: ReviewRecord[]
```

For each settled run row:
- Build `bySeverity` by finding `reviews.find(r => r.run_id === run.run_id)?.findings` and grouping by severity.
- Build `findings` array from the same `FindingRecord[]` (mapped to the `TopFinding` shape — `rationale_snippet` = `f.rationale.slice(0, 120)`).
- Replace the current `<div style={{ fontSize: 12, color: "var(--text-muted)" }}>X findings · Y blockers</div>` with `<FindingsTooltip bySeverity={bySeverity} findings={findings} />` plus ` · N blocker(s)` text when blockers > 0.

`FindingsTab.tsx` passes `reviews={runs}` to `<RunHistory>` (it already holds `ReviewRecord[]` as `runs`).

### 4c. PR detail — ReviewRunAccordion header

File: `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx`

- Compute `bySeverity` from `review.findings` (already available).
- Replace `<span style={...}>{findings.length} finding{...} · {blockers} blocker{...}</span>` with `<FindingsTooltip bySeverity={bySeverity} findings={review.findings} />` + blocker count text.

---

## 5. Helper — `toTopFinding`

Small pure function (co-located with the component or in a helpers file) to convert a `FindingRecord` → `TopFinding`:

```ts
function toTopFinding(f: FindingRecord): TopFinding {
  const snippet = f.rationale.length > 120
    ? f.rationale.slice(0, 120).replace(/\s\S+$/, '') + '…'
    : f.rationale;
  return { id: f.id, severity: f.severity, category: f.category,
           title: f.title, file: f.file, start_line: f.start_line,
           end_line: f.end_line, confidence: f.confidence,
           rationale_snippet: snippet };
}
```

---

## 6. Testing

- **Unit tests** for `FindingsSeverityBadges`: renders nothing on null/zero; renders correct pills; hides zero-count severities.
- **Unit test** for `FindingsTooltip`: tooltip content renders expected finding rows.
- **Unit test** for `toTopFinding`: snippet truncation at word boundary.
- **No new integration tests** — server query change follows same pattern as existing latestReviewByPr (already integration-tested indirectly via pulls routes).

---

## 7. Files changed summary

| File | Change |
|---|---|
| `server/src/vendor/shared/contracts/platform.ts` | Add `findings_by_severity`, `top_findings` to `PrMeta` |
| `client/src/vendor/shared/contracts/platform.ts` | Same (vendored copy must match) |
| `server/src/modules/pulls/routes.ts` | Add findings IN-query, populate new fields |
| `client/src/components/findings-severity-badges/FindingsSeverityBadges.tsx` | New component |
| `client/src/components/findings-severity-badges/FindingsTooltip.tsx` | New component |
| `client/src/components/findings-severity-badges/index.ts` | Barrel export |
| `client/src/app/repos/[repoId]/pulls/constants.ts` | Add "findings" to COLUMN_KEYS + GRID |
| `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx` | Render findings column cell |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx` | Add reviews prop, render FindingsTooltip |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx` | Pass reviews to RunHistory |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx` | Replace text with FindingsTooltip |
| i18n messages file | Add `list.columns.findings` key |
