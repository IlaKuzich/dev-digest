# Findings — Severity Filter Pills & Reference Alignment — Spec

**Date:** 2026-06-29
**Status:** Proposed
**Related:** [2026-06-28-findings-severity-counter-design.md](./2026-06-28-findings-severity-counter-design.md)

---

## Overview

The Findings feature is largely implemented, but a gap analysis against the
reference checklist surfaced **one missing capability** and **several shape /
naming divergences** between what shipped and what the reference describes.

This spec scopes:

1. **(New feature)** Clickable **severity filter pills** on the Review Runs
   accordion that filter the findings list inside it.
2. **(Alignment, optional)** Bringing API field names, endpoint shapes, and the
   findings popup interaction in line with the reference wording — each item is
   independently adoptable, with a recommendation on whether it is worth doing.

No behaviour is changed by this document — it is a design proposal only.

### Conformance summary (as of 2026-06-29)

| # | Reference requirement | Status | Evidence |
|---|---|---|---|
| 1 | PR list FINDINGS column cell | ✅ done | `client/.../pulls/_components/PRRow/PRRow.tsx:58-63`; `constants.ts:27,42-51` |
| 1 | Per-severity icons + counters | ✅ done | `client/src/components/findings-severity-badges/FindingsSeverityBadges.tsx` |
| 1 | `—` when none / unreviewed | ✅ done | `FindingsSeverityBadges.tsx:16-18` |
| 1 | Server aggregation + JOIN by severity | ✅ done | `server/src/modules/pulls/routes.ts:174-228` |
| 1 | Field name `findings_breakdown {critical,…}` | ⚠️ diverged | actual: `findings_by_severity {CRITICAL,…}` + `top_findings` |
| 2 | Timeline per-run icons | ✅ done | `client/.../RunHistory/RunHistory.tsx:195-214` |
| 2 | Finding popup (title/sev/file:line/confidence/rationale) | ⚠️ diverged | hover, not click; rationale = ≤120-char snippet not "2 lines" — `FindingsTooltip.tsx:38,75-127` |
| 2 | Click run block → opens accordion | ✅ done | `RunHistory.tsx:166` → `ReviewRunAccordion.tsx:48-54` |
| 3 | Accordion per run (agent + time + score) | ✅ done | `ReviewRunAccordion.tsx:96-124` |
| 3 | FindingCard with all fields + Accept/Dismiss | ✅ done | `client/.../FindingCard/FindingCard.tsx` |
| 3 | **Severity filter pills (click filters list)** | ❌ **missing** | `FindingsPanel.tsx` has only hide-low-confidence toggle |
| 3 | Empty State "No findings yet" | ✅ done | `FindingsTab.tsx:150-154` |
| 3 | First accordion `defaultOpen` | ✅ done | `FindingsTab.tsx:163` |
| 4 | Endpoint returns per-run findings | ⚠️ diverged | via `GET /pulls/:id/reviews`, not `/reviews/:id` or `/pulls/:id/runs` |
| 4 | `FindingRecord` fields | ✅ done | `server/src/vendor/shared/contracts/review-api.ts:15-19` |
| 4 | `POST /findings/:id/action {action}` | ⚠️ diverged | actual: `POST /findings/:id/accept` & `/dismiss` — `reviews/routes.ts:144` |

---

## Part A — Severity Filter Pills (the real gap)

### A.1 Problem

The reference requires, at the top of each Review Runs accordion:

> Filter pills by severity: `[⊘ 2 CRITICAL] [△ 3 WARNING] [○ 1 SUGGESTION]`.
> Clicking a pill filters the findings list inside the accordion; clicking the
> same pill again clears the filter.

Today the accordion header shows `FindingsTooltip` (a **hover** popup over the
severity badges) — there is no click-to-filter. `FindingsPanel` exposes only a
"hide low confidence" toggle (`FindingsPanel.tsx:50-55`) and `j/k` keyboard
navigation; it has no severity filter state.

### A.2 Scope

- New: a clickable severity-pill row that drives a filter on the findings list.
- The pills live **inside `FindingsPanel`** (the body), not the accordion header.
  Rationale: the header is a click-to-toggle/scroll target
  (`ReviewRunAccordion.tsx:82`), and a hover tooltip already occupies it; adding
  clickable controls there would fight the toggle gesture and the tooltip. The
  filter is also conceptually scoped to the panel it filters.
- Keep the existing header `FindingsTooltip` hover popup unchanged.

### A.3 Component design

**New file:** `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/SeverityFilter.tsx`

```ts
type SevKey = "CRITICAL" | "WARNING" | "SUGGESTION";

function SeverityFilter({
  counts,        // { CRITICAL: number; WARNING: number; SUGGESTION: number }
  active,        // SevKey | null  — single active severity (null = no filter)
  onToggle,      // (sev: SevKey) => void  — toggles; passing the active one clears
}: SeverityFilterProps): JSX.Element
```

Behaviour:
- Renders a pill per **non-zero** severity, order CRITICAL → WARNING →
  SUGGESTION (reuse the `SEVS` order from `FindingsSeverityBadges.tsx:8-12`).
- Each pill: severity icon + count + uppercase label (`CRITICAL` / `WARNING` /
  `SUGGESTION`). Unlike `FindingsSeverityBadges` (icon-only), pills here carry
  the text label per the reference mock.
- Active pill is visually emphasised (filled bg in the severity colour); inactive
  pills are outlined.
- Click a pill → `onToggle(sev)`. Clicking the already-active pill clears the
  filter (single-select toggle).
- If all severities are zero, render nothing (the panel will show its empty
  state instead).

**Decision — single vs multi select:** single-select (one active severity at a
time, re-click clears). The reference says "clicking the same pill again removes
the filter", which reads as a toggle; single-select is the simplest match and
mirrors the `[pill] … [pill]` one-active-at-a-time mock. Revisit only if users
ask for multi-severity unions.

### A.4 `FindingsPanel` wiring

File: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx`

- Add state: `const [activeSev, setActiveSev] = React.useState<SevKey | null>(null)`.
- Compute counts for the pills from **non-dismissed** findings — per the client
  INSIGHTS rule (2026-06-29): any severity count over `review.findings` must
  prepend `.filter((f) => !f.dismissed_at)`, otherwise pills contradict the
  blockers count (see `ReviewRunAccordion.tsx:57-63`). Reuse that exact pattern.
- Extend the `shown` memo (currently `visibleFindings(findings, hideLow)` at
  `FindingsPanel.tsx:31`) to also filter by `activeSev` when set:
  `shown = visible.filter((f) => activeSev == null || f.severity === activeSev)`.
- Render `<SeverityFilter counts={…} active={activeSev} onToggle={…} />` in the
  toolbar (`FindingsPanel.tsx:50-55`), alongside the existing hide-low toggle.
- Reset `focusIdx` to 0 when `activeSev` changes (the `j/k` cursor must not point
  past the filtered list — same concern the existing `useEffect` deps cover).
- Empty filtered result reuses the existing `EmptyState`
  (`FindingsPanel.tsx:58-59`); its copy ("no match") already fits a filtered-out
  list.

### A.5 Interaction with existing controls

- `hideLow` (confidence) and `activeSev` (severity) compose — both apply.
- Keyboard `j/k/a/d` continue to operate on the **filtered** `shown` list (no
  change needed beyond the focus reset).

### A.6 Tests

`FindingsPanel.test.tsx` (extend) + `SeverityFilter.test.tsx` (new):
- Pills render only for non-zero severities, in CRITICAL→WARNING→SUGGESTION order.
- Counts exclude dismissed findings.
- Click a pill → only that severity's cards remain.
- Click active pill again → filter clears, full list returns.
- Severity filter + hide-low compose (both applied).
- Dismissed-only severity does not render a pill.

---

## Part B — Reference Alignment (optional, per-item)

Each item below is independent. "Recommendation" states whether it is worth the
churn given the feature already works.

### B.1 PR-list field name: `findings_by_severity` vs `findings_breakdown`

- Reference: `findings_breakdown: { critical, warning, suggestion }` (lowercase).
- Actual: `findings_by_severity: { CRITICAL, WARNING, SUGGESTION }` + a separate
  `top_findings` array (`pulls/routes.ts:255-256`; contract in both vendored
  `platform.ts` copies).
- **Recommendation: do NOT rename.** The current names are richer (the popup
  needs `top_findings`) and consistent with the `SevKey` casing used everywhere
  in the codebase. A rename would touch both vendored `@devdigest/shared` copies
  (must stay byte-identical — root INSIGHTS 2026-06-25) plus every consumer, for
  zero functional gain. If alignment is mandated, do the contract change in both
  `server/src/vendor/shared/contracts/platform.ts` and
  `client/src/vendor/shared/contracts/platform.ts` in **one commit**.

### B.2 Finding popup: hover vs click; snippet vs 2 lines

- Reference: popup opens **on click**; rationale shows **first 2 lines**.
- Actual: opens on **hover** (`FindingsTooltip.tsx:38`); rationale is a single-
  line `≤120`-char snippet (`snippetOf` in `pulls/routes.ts:22-25`,
  `toTopFinding` on the client).
- **Recommendation: keep hover.** Hover is the lighter, more conventional
  affordance for a dense list/table and is already wired across all three
  surfaces (PR list, timeline, accordion header). Switching to click adds
  open/close state management and outside-click handling for marginal benefit.
  The `≤120`-char snippet is a deliberate, word-boundary-trimmed choice
  (`pulls/routes.ts:22-25`) and reads cleaner than a raw 2-line clamp.
- If click is required: add `onClick` toggle + a document-level outside-click
  listener to `FindingsTooltip`, and gate the existing `mouseenter/mouseleave`
  behind a prop so the three call sites can opt in per surface.

### B.3 Endpoint shape for per-run findings

- Reference: `GET /reviews/:id` or `GET /pulls/:id/runs` returns
  `findings: FindingRecord[]`.
- Actual: per-run findings arrive via **`GET /pulls/:id/reviews`**
  (`ReviewRecord[]`, each with `findings`) — `reviews/routes.ts`. `/pulls/:id/runs`
  returns lifecycle `RunSummary` rows without findings (by design — the timeline
  cross-references reviews by `run_id`, see `RunHistory.tsx:196`).
- **Recommendation: no change.** The data is fully available; the split (runs =
  lifecycle, reviews = findings) is intentional and already consumed correctly by
  the client. Renaming/merging endpoints is churn without benefit.

### B.4 Finding action endpoint: two routes vs one `action` body

- Reference: `POST /findings/:id/action` with body `{ action: "accept" |
  "dismiss" }`.
- Actual: two routes `POST /findings/:id/accept` and `POST /findings/:id/dismiss`
  (`reviews/routes.ts:144`), no body; both persist a timestamp via
  `setFindingAccepted` / `setFindingDismissed(new Date())`
  (`reviews/findings.ts:22-33`) into `findings.accepted_at` / `dismissed_at`.
- **Recommendation: keep the two-route form.** It is RESTful, already wired to the
  client `useFindingAction` hook, and the persistence contract
  (`accepted_at`/`dismissed_at`) exactly matches the reference. The route shape is
  cosmetic. If a single `action` endpoint is mandated, add it as an alias that
  dispatches on `req.body.action` and keep the two existing routes for back-compat
  (the SSE/run flow and existing client both call them).

### B.5 Stale comment in `pulls/routes.ts` (cleanup, not alignment)

- `server/src/modules/pulls/routes.ts:122-125` claims "*The per-severity FINDINGS
  breakdown is intentionally not surfaced on the list — findings live on the PR
  detail page.*" — directly contradicted by the code at lines 160-256 which **does**
  surface it.
- **Recommendation: delete/replace the comment.** Pure cleanup; documents real
  behaviour. Low risk, do alongside any of the above.

---

## Decisions to confirm before implementing

1. **Part A is the only required build.** Confirm: build the severity filter
   pills (single-select toggle, inside `FindingsPanel`).
2. **Part B items default to "no change"** except B.5 (comment cleanup). Confirm
   whether any of B.1–B.4 must be force-aligned to the reference wording despite
   the recommendation against it.

---

## Files touched (if Part A is approved)

| File | Change |
|---|---|
| `client/.../FindingsPanel/SeverityFilter.tsx` | New — pill row component |
| `client/.../FindingsPanel/FindingsPanel.tsx` | Add `activeSev` state, counts, filter, render pills |
| `client/.../FindingsPanel/SeverityFilter.test.tsx` | New — pill unit tests |
| `client/.../FindingsPanel/FindingsPanel.test.tsx` | Extend — filter behaviour |
| `server/src/modules/pulls/routes.ts` | (B.5 only) remove stale comment at 122-125 |
