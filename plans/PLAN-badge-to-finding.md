# Plan: Badge to Finding Navigation

> Status: DRAFT
> Created: 2026-06-25

## Problem

In the Smart Diff view, each line with a finding shows a severity badge (e.g. "blocker", "warning", "suggestion") rendered as a plain `<span>` in `CodeLine.tsx`. These badges are not interactive. Users who spot a badge on a diff line have no way to jump directly to the full FindingCard for that issue -- they must manually switch to the Findings tab, find the correct ReviewRunAccordion, and scan for the relevant finding. This is the reverse direction of the existing "Go to Diff" flow (FindingCard -> diff line) and completing it would make the review loop bidirectional.

## Affected Modules

| Module | Path | Change Type |
|--------|------|-------------|
| Shared contracts | `server/src/vendor/shared/contracts/brief.ts` | Extend `line_findings` schema to include `id` |
| Server — pulls service | `server/src/modules/pulls/service.ts` | Include finding `id` in `line_findings` output |
| Server — review repo | `server/src/modules/reviews/repository/review.repo.ts` | Add `id` to `LatestReviewData` findings shape |
| Client — SmartDiffViewer | `client/src/components/smart-diff/SmartDiffViewer.tsx` | Pass `lineBadges` Map with `id` (not just severity string) |
| Client — GroupSection | `client/src/components/smart-diff/SmartDiffViewer.tsx` (inner component) | Pass updated `lineBadges` to FileCard |
| Client — FileCard | `client/src/components/diff-viewer/FileCard/FileCard.tsx` | Update `lineBadges` prop type to carry `id` |
| Client — CodeLine | `client/src/components/diff-viewer/CodeLine/CodeLine.tsx` | Turn badge `<span>` into `<a href="?tab=findings&finding=<id>">` |
| Client — FindingsTab | `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx` | Read `?finding=<id>`, resolve to correct run, open accordion + scroll |
| Client — FindingsPanel | `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx` | Pass `targetFindingId` to FindingCard |
| Client — ReviewRunAccordion | `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx` | Accept `targetFindingId`, scroll to FindingCard after opening |
| Client — FindingCard | `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx` | Scroll into view + expand when targeted (already has `data-finding-id`) |

## Tasks

### TASK-001: Extend `line_findings` contract with finding `id`

**Scope:** backend
**Owned Paths:**
- `server/src/vendor/shared/contracts/brief.ts`
- `server/src/modules/reviews/repository/review.repo.ts`
- `server/src/modules/pulls/service.ts`

**What to do:**

1. In `server/src/vendor/shared/contracts/brief.ts`, add `id: z.string()` to the `line_findings` array item schema:

```ts
// before
line_findings: z
  .array(z.object({ line: z.number().int(), severity: z.string() }))
  .nullish(),

// after
line_findings: z
  .array(z.object({ id: z.string(), line: z.number().int(), severity: z.string() }))
  .nullish(),
```

2. In `server/src/modules/reviews/repository/review.repo.ts`, add `id` to the `LatestReviewData` interface and the DB select:

```ts
// LatestReviewData interface — add id
export interface LatestReviewData {
  findings: Array<{
    id: string;        // <-- new
    file: string;
    title: string;
    severity: string;
    startLine: number;
  }>;
  reviewTokens: number | null;
}

// select — add id
const findings = await db
  .select({
    id: t.findings.id,  // <-- new
    file: t.findings.file,
    title: t.findings.title,
    severity: t.findings.severity,
    startLine: t.findings.startLine,
  })
  .from(t.findings)
  .where(eq(t.findings.reviewId, review.id));

// return mapping — add id
findings.map((f) => ({
  id: f.id,            // <-- new
  file: f.file,
  title: f.title,
  severity: f.severity,
  startLine: f.startLine,
})),
```

3. In `server/src/modules/pulls/service.ts`, the `lineMap` currently stores `Map<number, string>` (line -> severity). Change it to `Map<number, { severity: string; id: string }>` and propagate the id into the `line_findings` output. When multiple findings land on the same line, keep the most severe one (existing logic), and carry its `id`:

```ts
// before
const lineMap = new Map<number, string>();
for (const f of findings) {
  const existing = lineMap.get(f.startLine);
  if (
    !existing ||
    (severityRank[f.severity] ?? 0) > (severityRank[existing] ?? 0)
  ) {
    lineMap.set(f.startLine, f.severity);
  }
}

// after
const lineMap = new Map<number, { severity: string; id: string }>();
for (const f of findings) {
  const existing = lineMap.get(f.startLine);
  if (
    !existing ||
    (severityRank[f.severity] ?? 0) > (severityRank[existing.severity] ?? 0)
  ) {
    lineMap.set(f.startLine, { severity: f.severity, id: f.id });
  }
}

// line_findings output
line_findings: hasReview
  ? [...lineMap.entries()].map(([line, { severity, id }]) => ({
      id,
      line,
      severity,
    }))
  : null,
```

**Acceptance Criteria:**
- [ ] AC-001: `GET /pulls/:id/smart-diff` returns `line_findings` items with an `id` field (string UUID) alongside `line` and `severity`

**Verification:**

| AC | How to measure |
|----|----------------|
| AC-001 | Run a review on a test PR, then call the smart-diff endpoint and inspect the JSON — each `line_findings` entry must have `id`, `line`, `severity` |

---

### TASK-002: Make diff badges clickable and wire `?finding=<id>` navigation

**Scope:** frontend
**Owned Paths:**
- `client/src/components/diff-viewer/CodeLine/CodeLine.tsx`
- `client/src/components/diff-viewer/FileCard/FileCard.tsx`
- `client/src/components/smart-diff/SmartDiffViewer.tsx`
- `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx`
- `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx`
- `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx`
- `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx`

**What to do:**

**Step A — Propagate `id` through the badge Map**

1. In `SmartDiffViewer.tsx`, change the `lineBadges` Map value from `string` (severity) to `{ severity: string; findingId: string }`:

```ts
// before
lineBadges={
  smartFile.line_findings
    ? new Map(
        smartFile.line_findings.map((f) => [f.line, f.severity]),
      )
    : undefined
}

// after
lineBadges={
  smartFile.line_findings
    ? new Map(
        smartFile.line_findings.map((f) => [
          f.line,
          { severity: f.severity, findingId: f.id },
        ]),
      )
    : undefined
}
```

2. In `FileCard.tsx`, update the `lineBadges` prop type from `Map<number, string>` to `Map<number, { severity: string; findingId: string }>`. Pass the full object to CodeLine — no destructuring needed since CodeLine now expects the same shape:

```ts
// prop type change
lineBadges?: Map<number, { severity: string; findingId: string }>;

// CodeLine usage — pass the full badge object directly (type matches)
badge={lineBadges?.get(ln.newNo ?? ln.oldNo ?? -1)}
// type: { severity: string; findingId: string } | undefined — matches CodeLine's updated badge prop
```

> Both `FileCard.lineBadges` value type and `CodeLine.badge` prop type must be updated to `{ severity: string; findingId: string }` in the same commit to avoid type mismatch.

3. In `CodeLine.tsx`, update the `badge` prop from `string` to the object type and turn the `<span>` into a plain `<a href>` — the same pattern used by "Go to Diff":

```ts
// prop type
badge?: { severity: string; findingId: string };

// All BADGE_STYLE / BADGE_LABEL lookups change from badge → badge.severity

// Replace the badge <span> with a simple <a>:
{badge && BADGE_STYLE[badge.severity] && (
  <a
    href={`?tab=findings&finding=${badge.findingId}`}
    onClick={(e) => e.stopPropagation()}
    style={{ ...BADGE_STYLE[badge.severity], cursor: "pointer", textDecoration: "none" }}
  >
    {BADGE_LABEL[badge.severity] ?? badge.severity.toLowerCase()}
  </a>
)}
```

> No prop drilling, no `window.history`, no callback chain needed. The browser navigates to the new URL natively — Next.js router picks it up automatically. `e.stopPropagation()` prevents the click from bubbling to parent diff row handlers.

**Step B — Read `?finding=<id>` and navigate to the correct FindingCard**

`page.tsx` не змінюється — `FindingsTab` читає `useSearchParams()` сам (page.tsx вже є `"use client"` і викликає `useSearchParams`, тому Suspense не потрібен).

4. In `FindingsTab.tsx`, read `?finding=<id>` via `useSearchParams()`. When set, find which `ReviewRecord` contains that finding and auto-set the `target` state to open that accordion. Also pass `targetFindingId` down to each `ReviewRunAccordion`:

```ts
// Read from URL directly:
const search = useSearchParams();
const targetFindingId = search.get("finding");

// Effect: when targetFindingId changes, find the run that owns it
React.useEffect(() => {
  if (!targetFindingId) return;
  const owningRun = runs.find((r) =>
    r.findings.some((f) => f.id === targetFindingId),
  );
  if (owningRun?.run_id) {
    setTarget((p) => ({ runId: owningRun.run_id!, n: (p?.n ?? 0) + 1 }));
  }
}, [targetFindingId, runs]);

// Pass to each accordion:
<ReviewRunAccordion
  ...
  targetFindingId={targetFindingId}
/>
```

6. In `ReviewRunAccordion.tsx`, accept `targetFindingId?: string | null`. When the accordion opens (because its `targetRunId` matched), scroll to the specific FindingCard using the existing `data-finding-id` attribute:

```ts
// Add to props:
targetFindingId?: string | null;

// After the existing targetRunId effect, add:
React.useEffect(() => {
  if (!open || !targetFindingId) return;
  // Small delay to let the DOM render after accordion opens
  const timer = setTimeout(() => {
    const el = rootRef.current?.querySelector(
      `[data-finding-id="${targetFindingId}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, 100);
  return () => clearTimeout(timer);
}, [open, targetFindingId]);
```

7. In `FindingCard.tsx`, auto-expand and apply a highlight ring when targeted:

```ts
// Add prop:
targeted?: boolean;

// In the component:
React.useEffect(() => {
  if (targeted) setExpanded(true);
}, [targeted]);

// In the root div style, add a transient highlight:
style={s.card(!!focused || !!targeted, sevColor, muted)}
```

In `FindingsPanel.tsx`, read `targetFindingId` directly from URL via `useSearchParams()` — do NOT receive it as prop from ReviewRunAccordion:

```ts
// In FindingsPanel.tsx — add at top of component:
const search = useSearchParams();
const targetFindingId = search.get("finding");

// Pass to FindingCard:
targeted={f.id === targetFindingId}
```

> This decouples FindingsPanel from ReviewRunAccordion's navigation concern. Each component reads the URL independently — consistent with how DiffTab reads `?smart=` and `?at=`.

**Acceptance Criteria:**
- [ ] AC-002: Severity badges in Smart Diff view render as interactive elements (button/link) with pointer cursor
- [ ] AC-003: Clicking a badge switches to the Findings tab (`?tab=findings`)
- [ ] AC-004: The ReviewRunAccordion containing the clicked finding auto-opens
- [ ] AC-005: The specific FindingCard scrolls into view and auto-expands
- [ ] AC-006: Clicking a different badge overwrites `?finding=` with the new id and navigates to the new FindingCard correctly

**Verification:**

| AC | How to measure |
|----|----------------|
| AC-002 | Visual: hover over a badge in Smart Diff — cursor changes to pointer; element is a `<button>` |
| AC-003 | Click a badge — URL changes to include `?tab=findings`, Findings tab content appears |
| AC-004 | If the finding belongs to a collapsed run accordion, it opens automatically |
| AC-005 | The FindingCard with the matching `data-finding-id` is visible in the viewport and expanded |
| AC-006 | Click badge A → navigate to FindingCard A. Then click badge B → URL updates to `?finding=<B_id>`, navigates to FindingCard B |

---

## Implementation Phases

### Phase 1: Backend — Add `id` to `line_findings` (TASK-001)
Extend the Zod contract, repository query, and service mapping. No migration needed — the `id` column already exists on the `findings` table; it just wasn't selected in `getLatestReviewData`. This phase is backwards-compatible: the client currently ignores extra fields from the API.

### Phase 2: Frontend — Wire badge click to FindingCard (TASK-002)
Thread the finding `id` through `lineBadges`, make badges interactive, read `?finding=` param, and implement the open-accordion + scroll-to-card flow. Depends on Phase 1 being deployed (the `id` field must be present in the smart-diff response).

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Multiple findings on the same line — only one `id` is carried in `line_findings` (the most severe). Badge click navigates to the most severe finding; others on that line are not directly reachable via badge. | Acceptable tradeoff. The existing `lineMap` already picks one severity per line. Users can browse adjacent findings once the accordion is open. |
| Timing: the FindingCard DOM node may not exist yet when `scrollIntoView` is called (accordion is opening). | Use a `setTimeout(…, 100)` after `open` becomes true, giving React time to paint the expanded content. |
| Re-clicking same badge after navigating away does not re-trigger scroll (URL param unchanged). | Next click on a *different* badge overwrites `?finding=` — works correctly. Same badge: user is already on the finding, no scroll needed. |

## Out of Scope

- Showing multiple finding badges per line (current contract picks one per line — most severe wins).
- Highlighting the specific diff line when navigating *from* FindingCard to diff (that is the existing "Go to Diff" feature, already implemented).
- Badge tooltips showing finding title on hover.
- Keyboard navigation for badges (Tab / Enter) — can be added later if needed.
- Animating the FindingCard highlight (pulse, fade, etc.) — a static focus ring is sufficient for v1.
