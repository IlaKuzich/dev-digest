# Skills — Workbench Layout (3-column)

**Date:** 2026-07-16
**Branch:** `2-SKILLS`
**Status:** Approved design → ready for implementation plan
**Supersedes:** section 6 ("Client — Skills page") of
[`2026-07-04-skills-core-loop-design.md`](./2026-07-04-skills-core-loop-design.md)

## Summary

Make the Skills UI a **workbench**: a persistent left skill list beside the tabbed
editor, so selecting a skill never loses the list. `/skills` and `/skills/:id` render
the same component; the id is optional and only decides what fills the right pane.

This is a **view-layer change only**. No schema, no contracts, no server routes, no
hooks. The core loop shipped in Slice A + B (skills CRUD, per-agent `enabled`,
prompt injection) is untouched.

### Why supersede the 07-04 design

Section 6 of that spec specified a `/skills` grid whose card click opens a **right-side
markdown preview panel**, with the editor on a separate `/skills/:id` page reached via
an Edit button. That shipped and works. Two things have changed since:

1. **The Preview tab now exists.** `SkillEditor` gained Config / Preview / Versions
   tabs (commit `4ca5e43`, not covered by any spec). The list's preview panel and the
   Preview tab now render the same body two different ways, in two places. One must go,
   and the tab is the one integrated with the draft.
2. **The agent editor already is a workbench.** `AgentEditorView` renders a 280px
   list column beside its tabbed editor. Skills is the odd one out, and costs two
   clicks (card → Edit) to reach what agents reach in one.

The 07-04 spec stays on disk as history; the append-only convention that governs
`INSIGHTS.md` applies to design docs too — correct a stale design with a new dated
one rather than rewriting an approved record.

## Scope

**In scope:**
- One `SkillsWorkbench` rendered by both `/skills` and `/skills/:id`.
- Persistent list column (heading, Add menu, search, cards) on both routes.
- Right pane: empty state when nothing is selected, tabbed editor when selected.
- Removing the list's markdown preview panel (the Preview tab replaces it).
- The file moves that let both routes share one component without cross-route imports.

**Out of scope** (mockups show these; no spec covers them — deliberately not built here):
- Import / community search drawer — still the `list.importSoon` muted stub.
  Remains deferred per the 07-04 spec.
- Evals and Stats tabs, "Run on evals" button.
- Skill-card stats (`3 agents · 71% pull · 74% accept`), source badges
  (Manual/Extracted/Community/Imported), token count.
- Syntax-highlighted `.md` body editor with line numbers and `unsaved` badge.
- Diff in the Versions tab (Restore only, as built).
- Sidebar entries: Onboarding Tour, Project Context, Eval Dashboard, GLOBAL group.

## Design

### 1. Routing

Both route entries stay thin and render the same client component:

```
skills/page.tsx        → <SkillsWorkbench />   (no id → empty right pane)
skills/[id]/page.tsx   → <SkillsWorkbench />   (id from useParams)
```

`SkillsWorkbench` reads the id with `useParams<{ id?: string }>()`. At `/skills` there
is no dynamic segment, so `params.id` is `undefined` — this is the whole selection
mechanism. Precedent: `AgentEditorView` already takes its id from `useParams`, and
both route entries stay synchronous (no `await params`).

`useSkill(id)` already guards with `enabled: !!id` (`lib/hooks/skills.ts:19`), so an
unselected workbench issues no detail request. **No hook changes.**

### 2. Navigation and URL state

- Card click → `router.push('/skills/:id?tab=' + tab)`, carrying the current tab so
  switching skills keeps you on the same tab (mirrors `AgentEditorView`'s
  `/agents/${a.id}?tab=${tab}`).
- Tab switch → `router.replace` on `?tab=` (unchanged).
- Deep links to `/skills/:id?tab=versions` keep working.
- `activeKeyFor` already maps `/skills*` → `skills` (`app-shell/helpers.ts`), so the
  sidebar highlight needs no change.

### 3. Breadcrumb and Back link

Breadcrumb is `Skills Lab › Skills` on **both** routes — the skill name is no longer
appended, because the editor is a selection within the page rather than a destination.
The `← Back` link is removed for the same reason: the list is always on screen.

This is a deliberate divergence from `AgentEditorView`, which appends the agent name.
The mockups show the non-appending form, and it is the honest one — the list column
means you never actually left Skills.

### 4. Layout

`AppShell` → single flex row, `height: calc(100vh - 52px)` (the `AgentEditorView`
constant, which accounts for the shell header):

- **List column** — fixed 280px, `flexShrink: 0`, right border, `bg-surface`, its own
  `overflow: auto`. Holds: `Skills` heading, Add dropdown, search input, cards.
- **Right pane** — `flex: 1`, `minWidth: 0`, `minHeight: 0`, own `overflow: auto`.

`minWidth: 0` on the right pane is load-bearing: without it a flex child refuses to
shrink below its content, and the editor's `<pre>` body pushes the column wider than
the viewport instead of scrolling.

The search input and `Skills` heading live **in the list column**, not in a page
header — this is what the mockups show and what distinguishes this from the agents
left column (which has neither).

### 5. Right-pane states

| State | Renders |
|---|---|
| no id | `EmptyState` — "Select a skill" |
| id + loading | `Skeleton` (title + body) |
| id + error / not found | `ErrorState` with retry |
| id + loaded | Title row (name, version badge, enabled toggle) + `SkillEditor` tabs |

The editor keeps everything it has today: the draft lives above the tab switch so
unsaved edits survive tab changes, save bumps the version, delete confirms then
`router.push('/skills')`.

### 6. Component structure

Both routes render one component, so shared pieces move to the common ancestor
(`skills/_components/`). A component under `skills/[id]/_components/` may not be
imported from `skills/_components/` — that reaches into another route's private
folder. Precedent for the flat shape: `agents/_components/AgentCard` sits beside
`AgentsListView` because both views use it.

```
skills/
  page.tsx                    → <SkillsWorkbench />
  [id]/page.tsx               → <SkillsWorkbench />
  _components/
    SkillsWorkbench/          NEW  — AppShell, layout, list column, pane routing
    SkillCard/                moved from SkillsListView/_components/
    CreateSkillModal/         moved from SkillsListView/_components/
    SkillEditorPane/          moved from [id]/_components/SkillEditorView/
    SkillEditor/              moved from [id]/_components/SkillEditor/ (tabs unchanged)
```

Deleted: `skills/_components/SkillsListView/` and `skills/[id]/_components/`.
`filterSkills` moves to `SkillsWorkbench/helpers.ts` unchanged.

`SkillEditorPane` is `SkillEditorView` minus its `AppShell` wrapper, back link, and
centered `maxWidth: 1040` — the workbench owns page chrome now. It keeps the draft
state, save/delete, and the title row.

### 7. i18n

Reuse existing `skills` namespace keys. `list.selectTitle` / `list.selectBody` already
exist for the empty state (they described the old preview panel's empty state and fit
unchanged). Remove, as all become unreachable:

- `editor.back` and `editor.crumbFallback` — back link and name-crumb are gone.
- the whole top-level `preview` block (`edit` / `enabled` / `disabled`) — it belonged
  to the removed panel. Note `editor.preview*` is a *different* key and stays; it
  belongs to the Preview tab.
- `list.subtitle` — the 280px column has no room for it, and the mockups show none.

### 8. Testing (per `TESTING.md`)

Client RTL, `fetch` mocked, `fireEvent` not `user-event` (not a dependency here):

- `SkillsWorkbench.test.tsx` (replaces `SkillsListView.test.tsx`): renders cards;
  search filters; no id → empty state; card click pushes `/skills/:id?tab=…`.
- `SkillEditorPane.test.tsx` (replaces `SkillEditorView.test.tsx`): existing
  assertions retargeted — tabs, draft survives tab change, save payload.
- `AppShell` must be mocked as a passthrough in workbench tests, per the known
  `IntlError: MISSING_MESSAGE 'shell'` trap (`client/INSIGHTS.md`).
- Mock `useParams` per test to drive the selected / unselected split.

## Risks / open notes

- **`Markdown` headings render unstyled.** The vendored primitive defines no heading
  styles and its `.dd-md` hook is dead CSS (`client/INSIGHTS.md`). The Preview tab
  inherits this from the panel it replaces — no regression, but the mockup's styled
  preview will not be reproduced. Fixing it means touching sealed `vendor/ui`; out of
  scope.
- **Losing the grid.** `/skills` no longer shows a multi-column card grid; the list is
  a single 280px column. Intentional — it is what makes the list persist — but it does
  show fewer skills at a glance.
- **`AgentEditorView` still appends its crumb** and keeps its own inline list column.
  Skills and Agents will differ slightly until Agents is brought to the same shape.
  Not in scope; worth a follow-up so the two Skills Lab pages agree.
