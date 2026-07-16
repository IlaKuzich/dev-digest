# Skills — Workbench Layout (3-column) Implementation Plan

**Design:** [`2026-07-16-skills-workbench-layout-design.md`](../specs/2026-07-16-skills-workbench-layout-design.md)
**Branch:** `2-SKILLS`

## Global Constraints

- Client package only. No server, schema, contract, or hook changes.
- `pnpm typecheck` and `pnpm test` must pass in `client/` before each commit.
- Use `git mv` for moves so history follows the file.
- Styles stay in colocated `styles.ts` typed `Record<string, CSSProperties>`;
  dynamic styles are standalone functions with an explicit return type
  (`client/INSIGHTS.md` — a function member breaks the `Record` annotation).
- Icons: use `icon="Edit"` for a pencil; there is no `"Pencil"` key.

---

### Task 1: Move shared components up to `skills/_components/`

Both routes render one component, so these can no longer live under a route-private
`_components`. Pure moves — no behavior change.

- [ ] **Step 1: Move the card and modal out of `SkillsListView`**
  ```
  git mv client/src/app/skills/_components/SkillsListView/_components/SkillCard \
         client/src/app/skills/_components/SkillCard
  git mv client/src/app/skills/_components/SkillsListView/_components/CreateSkillModal \
         client/src/app/skills/_components/CreateSkillModal
  ```

- [ ] **Step 2: Move the editor out of the `[id]` route**
  ```
  git mv client/src/app/skills/[id]/_components/SkillEditor \
         client/src/app/skills/_components/SkillEditor
  git mv client/src/app/skills/[id]/_components/SkillEditorView \
         client/src/app/skills/_components/SkillEditorPane
  ```

- [ ] **Step 3: Fix import paths in the moved files**
  - `SkillEditorPane` imported `../SkillEditor` → still `../SkillEditor`. ✔ unchanged.
  - `CreateSkillModal` / `SkillCard`: re-check relative depth to `lib/` and
    `vendor/` (they lose one level). Prefer the `@/` alias where the file already
    uses it.
  - Rename the component `SkillEditorView` → `SkillEditorPane` (file, `index.ts`
    export, test file).

- [ ] **Step 4: Typecheck** — `cd client && pnpm typecheck` (will still fail on
      `SkillsListView`, which Task 2 deletes; ignore errors naming only that folder).

---

### Task 2: Build `SkillsWorkbench`

New folder `client/src/app/skills/_components/SkillsWorkbench/` with
`SkillsWorkbench.tsx`, `styles.ts`, `helpers.ts`, `index.ts`.

- [ ] **Step 1: `helpers.ts`** — move `filterSkills` verbatim from
      `SkillsListView/helpers.ts`.

- [ ] **Step 2: `styles.ts`** — layout per design §4:
  - `row`: `display:flex, height:'calc(100vh - 52px)'`
  - `listCol`: `width:280, flexShrink:0, borderRight:'1px solid var(--border)',
    display:flex, flexDirection:'column', background:'var(--bg-surface)'`
  - `listHeader`: padding `16px 16px 12px`; `listScroll`: `flex:1, overflow:'auto'`
  - `pane`: `flex:1, minWidth:0, minHeight:0, overflow:'auto'`
    (`minWidth:0` is load-bearing — see design §4)
  - Reuse the search input styles from `SkillsListView/styles.ts`.

- [ ] **Step 3: `SkillsWorkbench.tsx`**
  - `"use client"`.
  - `const { id } = useParams<{ id?: string }>()` — `undefined` at `/skills`.
  - `useSkills()`, `useUpdateSkill()`; local `search`, `creating` state.
  - Tab for nav carry-over: `const tab = useSearchParams().get('tab') ?? 'config'`.
  - `<AppShell crumb={[{label: t('list.crumbLab')}, {label: t('list.crumb')}]}>` —
    no name segment (design §3).
  - List column: `h1` + Add `Dropdown` (Create / muted `importSoon`, unchanged) +
    search input + `filterSkills(...).map(SkillCard)`.
    - `onClick={() => router.push(`/skills/${sk.id}?tab=${tab}`)}`
    - `active={sk.id === id}`
    - `onToggle` → `update.mutate({ id: sk.id, patch: { enabled } })` (unchanged)
  - Loading / error / empty for the **list**: keep `Skeleton`, `ErrorState`,
    `EmptyState` as `SkillsListView` had them, inside the column.
  - Right pane: `{id ? <SkillEditorPane /> : <EmptyState icon="Sparkles"
    title={t('list.selectTitle')} body={t('list.selectBody')} />}`.
  - Render `{creating && <CreateSkillModal onClose={...} />}`.

- [ ] **Step 4: `index.ts`** — `export { SkillsWorkbench } from './SkillsWorkbench';`

---

### Task 3: Strip page chrome from `SkillEditorPane`

- [ ] **Step 1: Remove the `AppShell` wrapper** from all three returns (error,
      loading, loaded) — the workbench owns it now. Return bare fragments/divs.
- [ ] **Step 2: Remove the back link** (`s.header` + `s.backLink` + `editor.back`).
- [ ] **Step 3: `styles.ts`** — drop `maxWidth: 1040` / `margin: '0 auto'` centering;
      the pane fills its column. Keep the title row.
- [ ] **Step 4: Keep** the draft state, `save`, `remove`, `toggleEnabled`, the title
      row (icon, name, version badge, enabled toggle) and `<SkillEditor …/>` as-is.
- [ ] **Step 5: Typecheck.**

---

### Task 4: Repoint the routes

- [ ] **Step 1: `skills/page.tsx`** → render `<SkillsWorkbench />`; update the comment.
- [ ] **Step 2: `skills/[id]/page.tsx`** → render `<SkillsWorkbench />`; update the
      comment to say the id is read from `useParams` and only selects the pane.
- [ ] **Step 3: Delete** `client/src/app/skills/_components/SkillsListView/` and the
      now-empty `client/src/app/skills/[id]/_components/`.

---

### Task 5: i18n cleanup

- [ ] **Step 1:** In `client/messages/en/skills.json` remove the now-unreachable
      `editor.back`, `editor.crumbFallback`, and `preview.*` (the panel's Edit button
      and heading are gone). Keep `list.selectTitle` / `list.selectBody` — reused by
      the pane empty state.
- [ ] **Step 2:** Grep for each removed key to prove nothing references it:
      `grep -rn "editor.back\|crumbFallback\|preview\." client/src`.

---

### Task 6: Tests

- [ ] **Step 1: `SkillsWorkbench.test.tsx`** (replaces `SkillsListView.test.tsx`)
  - Mock `AppShell` as a passthrough (`client/INSIGHTS.md` — otherwise
    `IntlError: MISSING_MESSAGE: 'shell'`).
  - Mock `next/navigation`: `useRouter`, `useSearchParams`, and `useParams` — the
    last one drives selected vs unselected.
  - Cases: renders cards from mocked `/skills`; search filters the list
    (`fireEvent.change`); `useParams` → `{}` shows the empty state; card click calls
    `router.push` with `/skills/<id>?tab=config`.
- [ ] **Step 2: `SkillEditorPane.test.tsx`** — retarget the existing
      `SkillEditorView.test.tsx`: rename import/describe, drop any assertion on the
      back link or the breadcrumb name segment. Keep the tab-switch and
      draft-survival assertions.
- [ ] **Step 3:** `cd client && pnpm test` — full suite, no regressions.
- [ ] **Step 4:** `pnpm typecheck`.

---

### Task 7: Verify + commit

- [ ] **Step 1: Manual check** — `/skills` shows the list with an empty pane;
      clicking a card selects it in place with the list still visible; `?tab=`
      round-trips; deep link to `/skills/<id>?tab=versions` opens on Versions.
- [ ] **Step 2: Commit** — `feat(skills): 3-column workbench layout`, noting the
      spec supersession in the body.
- [ ] **Step 3:** Invoke `engineering-insights` to capture anything non-obvious.
