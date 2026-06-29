# Findings — Deep-link Navigation from Tooltip (finding focus + internal diff)

**Date:** 2026-06-29
**Status:** Implemented
**Affects:**
- `client/src/components/findings-severity-badges/FindingsTooltip.tsx`
- `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`
- `client/src/app/repos/[repoId]/pulls/[number]/_components/{FindingsTab,ReviewRunAccordion,FindingsPanel,FindingCard,RunHistory,DiffTab}`
- `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`
- `client/src/components/diff-viewer/{FindingsTooltip…,DiffViewer,FileCard,CodeLine}`

---

## Problem

The `FindingsTooltip` lists a PR's top findings in three places: the PR list row
(`PRRow`), the Timeline (`RunHistory`), and each review-run header
(`ReviewRunAccordion`). Two interactions were broken:

1. **Clicking a finding row** did not take the user to that finding.
   - From the PR list it pushed `…/pulls/{n}#finding-{id}` — a hash the PR detail
     page never read, so it landed on the **Overview** tab with nothing focused.
   - On the PR detail page it ran a bare `scrollIntoView('[data-finding-id]')`,
     which did nothing when the finding's run accordion was collapsed (the card is
     not in the DOM).

2. **Clicking a finding's `file:line`** opened an **external GitHub blob URL**
   (`githubBlobUrl`). On the PR list it did nothing at all (no `repoFullName` /
   `headSha` were passed, so no link was rendered).

### Expected behaviour

- **Finding click** → go to the PR's **Agent runs** tab (`?tab=findings`), open the
  review-run accordion that owns the finding, scroll to + highlight its card, and
  expand the card so its rationale is visible.
- **File:line click** → go to the PR's **Files changed** tab (`?tab=diff`), open the
  file, scroll to + flash the specific line — **inside the app**, not GitHub.

Both must work cross-page (from the PR list) and in-page (from the detail tooltips).

---

## Solution

### 1. URL contract (deep-link params)

Encoded as query params, consistent with the existing `?tab` / `?trace` params the
page already manages via `setParam`:

| Intent | URL |
|---|---|
| Focus a finding | `?tab=findings&finding=<findingId>` |
| Focus a diff line | `?tab=diff&file=<path>&line=<newLine>` |

`PRRow` pushes these (replacing the old `#finding-` hash). The PR detail page reads
them on arrival.

### 2. Central focus controller — `page.tsx`

The page owns the focus state and the two intents, sharing **one nonce** so the
latest click always wins and a repeat click re-triggers the scroll:

```ts
const focusNonce = React.useRef(0);
const [accordionTarget, setAccordionTarget] =
  React.useState<{ runId: string | null; findingId: string | null; nonce: number } | null>(null);
const [diffFocus, setDiffFocus] = React.useState<DiffFocus | null>(null);

const runIdForFinding = (id) => runs.find((r) => r.findings.some((f) => f.id === id))?.run_id ?? null;

handleFocusFinding(id)  // → resolve run, set accordionTarget, setTab("findings")
handleGoToReview(runId) // → set accordionTarget (findingId null), setTab("findings")
handleFocusDiffLine(file, line) // → set diffFocus, setTab("diff")
```

`handleGoToReview` (Timeline "jump to run") now flows through the same
`accordionTarget`, replacing `FindingsTab`'s old local target state.

**Cross-page replay:** an effect reads `finding` / `file` / `line` from the URL and
fires the matching handler **once** (guarded by a ref). The finding intent waits for
`reviews` to load (so the run resolves); the file intent only needs `pr.files`.

### 3. Finding focus — prop threading

`page → FindingsTab → ReviewRunAccordion → FindingsPanel → FindingCard` (the same
path `repoFullName` / `headSha` already travel):

- **ReviewRunAccordion** — extends the existing `targetRunId` / `targetNonce`
  open-and-scroll mechanism with `targetFindingId`. When the run matches it opens;
  the per-finding scroll is delegated to `FindingsPanel` (so the card, not the
  accordion top, is centered).
- **FindingsPanel** — new `focusFindingId` + `focusNonce`. On a new nonce it clears
  filters (`hideLow=false`, `activeSev=null`) so the target can't be filtered out,
  sets `focusIdx`, and `scrollIntoView`s `#finding-<id>`. A `handledFocus` ref makes
  it fire once per nonce (never on the initial render where nonce is 0).
- **FindingCard** — new `expandSignal`; when it changes (the card is the target) the
  card auto-expands so the rationale is visible on arrival. Existing `id` /
  `data-finding-id` / `focused` highlight are reused.

### 4. Internal diff focus — `diff-viewer`

`page → DiffTab → DiffViewer → FileCard → CodeLine`:

- **CodeLine** — renders `data-ln-new` / `data-ln-old` anchors and a transient
  `highlight` background flash.
- **FileCard** — new `focus: DiffFocus`. When it targets this file it force-opens,
  then (via `requestAnimationFrame`, after the lines render) scrolls to the line and
  flashes it for ~1.8s. **Smart fallback:** prefer the new-side line number, fall
  back to the old side; if neither is in the diff, just open the file (no scroll).
- **DiffFocus** = `{ file: string; line: number; nonce: number }`, exported from the
  diff-viewer public surface.

### 5. Click wiring — `FindingsTooltip` + `FindingCard`

- `FindingsTooltip` gains `onFileClick(file, startLine)`. The `file:line` renders via
  `MonoLink`'s `onClick` (a `<button>`, no `href`) when an internal handler is wired;
  it falls back to the GitHub `href` only when no handler is given.
- `FindingCard` gains the same `onFileClick`; an internal handler takes precedence
  over the external `githubBlobUrl`.
- Call sites:
  - **PRRow** → `router.push(?tab=findings&finding=…)` / `(?tab=diff&file=…&line=…)`.
  - **RunHistory** / **ReviewRunAccordion** → `onFocusFinding` / `onFocusDiffLine`
    (threaded from the page).
  - **FindingsPanel → FindingCard** → `onFocusDiffLine`.

---

## The bug that made it "still land on Overview" (portal event bubbling)

`FindingsTooltip` renders its popup with `ReactDOM.createPortal(popup, document.body)`
(see the tooltip-portal spec). **React synthetic events bubble through the React
component tree, not the DOM tree.** So a click inside the portaled popup bubbles to
the popup's React parent — `PRRow`'s row `onClick`
(`router.push(/pulls/{n})`, no query) or the accordion header's toggle — which fired
**after** our handler and clobbered the navigation, sending the user to Overview.

**Fix:** the finding-row `onClick` calls `e.stopPropagation()` (the `file:line` link
was already wrapped in a `stopPropagation` container). Guarded by a regression test:
a `FindingsTooltip` inside `<div onClick={parent}>` must call `onFindingClick` but
**not** the parent handler.

> Lesson: a React portal escapes DOM clipping/stacking, **not** React event
> propagation. Any clickable portaled content nested (in the React tree) under a
> clickable ancestor must `stopPropagation`.

---

## Not-found behaviour

If a deep-linked finding (or its file/line) isn't present, the page just switches to
the right tab with no scroll and no error — `accordionTarget.runId` / the `FileCard`
focus simply never match.

---

## Files touched

| File | Change |
|---|---|
| `…/pulls/[number]/page.tsx` | Focus controller: nonce, `accordionTarget`, `diffFocus`, handlers, URL replay |
| `…/_components/FindingsTab/FindingsTab.tsx` | Drops local target; threads `accordionTarget` + handlers down |
| `…/_components/ReviewRunAccordion/ReviewRunAccordion.tsx` | `targetFindingId`; `onFocusFinding` / `onFocusDiffLine` wiring |
| `…/_components/FindingsPanel/FindingsPanel.tsx` | `focusFindingId` / `focusNonce`; filter-reset + scroll; `onFileClick` |
| `…/_components/FindingCard/FindingCard.tsx` | `onFileClick` (internal nav); `expandSignal` auto-expand |
| `…/_components/RunHistory/RunHistory.tsx` | Tooltip → `onFocusFinding` / `onFocusDiffLine` |
| `…/_components/DiffTab/DiffTab.tsx` | Forwards `focus` to `DiffViewer` |
| `…/pulls/_components/PRRow/PRRow.tsx` | Tooltip → internal `?tab=…` pushes |
| `components/diff-viewer/DiffViewer/DiffViewer.tsx` | Forwards `focus` to each `FileCard` |
| `components/diff-viewer/FileCard/FileCard.tsx` | `DiffFocus`; force-open + scroll + flash (smart fallback) |
| `components/diff-viewer/CodeLine/CodeLine.tsx` | Line anchors + highlight |
| `components/diff-viewer/{FileCard,index}.ts` | Export `DiffFocus` |
| `components/findings-severity-badges/FindingsTooltip.tsx` | `onFileClick`; close-on-click; **`stopPropagation` fix** |

## Test impact

- `FindingsTooltip.test.tsx` — `onFindingClick` (+ closes popup), `onFileClick`
  (internal button, no anchor), and the **portal-bubbling regression** test.
- `FindingsPanel.test.tsx` — deep-link reveals a filtered-out finding; `onFileClick`
  forwarding.
- All existing tests unchanged. `pnpm typecheck` clean; `pnpm test` green.
