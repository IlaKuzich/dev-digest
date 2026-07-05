# Plan: "Go to Diff" — Finding → Smart Order Scroll

> Status: APPROVED
> Created: 2026-06-25

## Problem

У кожного finding у вкладці "Agent runs" є `file` + `start_line`. Немає способу швидко перейти до відповідного рядка в диффі. Потрібна кнопка **"Go to Diff"** в шапці акордіона, яка одночасно: перемикає на вкладку "Files Changed", вмикає Smart Order, і скролить до конкретного рядка з severity-бейджем.

## Affected Modules

| Module | Path | Change Type |
|--------|------|-------------|
| frontend: DiffTab | `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx` | Modify |
| frontend: FindingCard | `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx` | Modify |
| frontend: FindingsPanel/ReviewRunAccordion | `client/src/app/repos/[repoId]/pulls/[number]/_components/` | Modify |

## Tasks

### TASK-001: Move smartOrder to URL + add scroll-to-line effect

**Scope:** frontend

**Owned Paths:**
- `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx`

**What to do:**

Replace `const [smartOrder, setSmartOrder] = React.useState(false)` with URL-param-based state:

```typescript
// Read smartOrder from URL param ?smart=1
const search = useSearchParams();
const router = useRouter();
const smartOrder = search.get('smart') === '1';
const setSmartOrder = (v: boolean) => {
  const sp = new URLSearchParams(search.toString());
  if (v) sp.set('smart', '1'); else sp.delete('smart');
  sp.delete('at'); // reset scroll target on manual toggle
  router.replace(`?${sp.toString()}`);
};

// Scroll to badge line after SmartDiffViewer mounts
const scrollTarget = search.get('at'); // format: "src/foo.ts:42"
React.useEffect(() => {
  if (!smartOrder || !scrollTarget) return;
  const colonIdx = scrollTarget.lastIndexOf(':');
  if (colonIdx === -1) return;
  const path = scrollTarget.slice(0, colonIdx);
  const line = parseInt(scrollTarget.slice(colonIdx + 1), 10);
  if (!path || isNaN(line)) return;
  const t = setTimeout(() => {
    document
      .querySelector(`[data-path="${path}"][data-line="${line}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 150);
  return () => clearTimeout(t);
}, [smartOrder, scrollTarget]);
```

Note: `useSearchParams()` in Next.js 15 requires a `<Suspense>` boundary in the parent. Verify the page that renders `<DiffTab>` wraps it in `<Suspense fallback={null}>`. DiffTab already has `"use client"` — no change needed there.

**Acceptance Criteria:**
- [ ] AC-001: `smartOrder` state reads from `?smart=1` URL param instead of React useState
- [ ] AC-002: Clicking "Smart Order" / "Original Order" buttons updates `?smart` in the URL via `router.replace`
- [ ] AC-003: When `?smart=1&at=<path>:<line>` is in URL, the component calls `scrollIntoView` on `[data-path][data-line]` element after 150ms
- [ ] AC-004: Manual toggle of smart/original order clears `?at` param from the URL
**Verification:**
| AC | How to measure |
|----|----------------|
| AC-001 | Read DiffTab.tsx — no `useState(false)` for smartOrder |
| AC-002 | Open PR page, click Smart Order → URL gains `?smart=1` |
| AC-003 | Navigate to `?tab=diff&smart=1&at=playwright.config.ts:25` → page scrolls to line 25 |
| AC-004 | After navigating with `?at=`, click Original Order → `?at` disappears from URL |

---

### TASK-002: FindingCard — add "Go to Diff" icon button in accordion header

**Scope:** frontend

**Owned Paths:**
- `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx`

**What to do:**

Add optional prop `viewInDiffHref?: string` to the FindingCard component props.

In the accordion **header** (not body), render an `<a>` tag with `ArrowUpRight` icon when `viewInDiffHref` is provided:

```
┌─ ⚠ Excessive mocking of E2E tests  [↗]  playwright.config.ts:25 ─ ∨ ┐
```

```tsx
{viewInDiffHref && (
  <a
    href={viewInDiffHref}
    onClick={(e) => e.stopPropagation()} // prevent accordion toggle
    title="Go to diff"
    style={s.goToDiff}
  >
    <Icon.ArrowUpRight size={13} />
  </a>
)}
```

Style — add to existing `FindingCard/styles.ts` alongside other entries:
```typescript
goToDiff: {
  display: 'inline-flex',
  alignItems: 'center',
  color: 'var(--text-muted)',
  opacity: 0.6,
  textDecoration: 'none',
  padding: '0 2px',
} satisfies CSSProperties,
```

`e.stopPropagation()` is required — a click on the link in the header must NOT toggle the accordion.

**Acceptance Criteria:**
- [ ] AC-006: `FindingCard` accepts optional `viewInDiffHref?: string` prop
- [ ] AC-007: When `viewInDiffHref` is provided, an `<a>` with `ArrowUpRight` icon appears in the accordion header
- [ ] AC-008: When `viewInDiffHref` is undefined, no icon/link is rendered (no visual change for old runs)
- [ ] AC-009: Clicking the icon navigates to `viewInDiffHref` without toggling the accordion open/closed
**Verification:**
| AC | How to measure |
|----|----------------|
| AC-006 | Read FindingCard.tsx — props type includes `viewInDiffHref?: string` |
| AC-007 | Open PR with findings from latest run → `↗` icon visible in header of each finding card |
| AC-008 | Findings from older runs show no `↗` icon |
| AC-009 | Click `↗` → tab switches to Files Changed, accordion stays closed |

---

### TASK-003: Pass viewInDiffHref from parent — latest run only

**Scope:** frontend

**Owned Paths:**
- `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx`
- `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx`
- `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx`

**What to do:**

The chain: `FindingsTab` → `ReviewRunAccordion` → `FindingsPanel` → `FindingCard`.
`FindingsTab` already uses `i === 0` for `defaultOpen` — same index marks the latest run.

1. **`FindingsTab.tsx`** — pass `isLatestRun={i === 0}` to `ReviewRunAccordion`
2. **`ReviewRunAccordion.tsx`** — accept `isLatestRun?: boolean`, pass through to `FindingsPanel`
3. **`FindingsPanel.tsx`** — accept `isLatestRun?: boolean`, compute `viewInDiffHref` per finding, pass to `FindingCard`

```typescript
// FindingsPanel — per finding:
const viewInDiffHref = isLatestRun && f.file && f.start_line != null
  // Do NOT encodeURIComponent(f.file) — querySelector must match data-path exactly
  ? `?tab=diff&smart=1&at=${f.file}:${f.start_line}`
  : undefined;

<FindingCard
  key={f.id}
  f={f}
  viewInDiffHref={viewInDiffHref}
  // ... other existing props
/>
```

**Acceptance Criteria:**
- [ ] AC-011: `viewInDiffHref` is passed to `FindingCard` only for findings of the most recent run
- [ ] AC-012: `viewInDiffHref` format is `?tab=diff&smart=1&at=<rawPath>:<line>` (path is NOT encoded — must match `data-path` in DOM)
- [ ] AC-013: `viewInDiffHref` is `undefined` when `f.file` or `f.start_line` is missing
- [ ] AC-014: Findings from older runs receive `viewInDiffHref={undefined}` (no icon shown)
**Verification:**
| AC | How to measure |
|----|----------------|
| AC-011 | Read parent component — `viewInDiffHref` passed only in `index === 0` branch |
| AC-012 | Log or inspect href value in browser DevTools |
| AC-013 | Read code — conditional on `f.file && f.start_line != null` |
| AC-014 | Open PR with 2+ runs → icon only on latest run's findings |

---

## Implementation Phases

### Phase 1: URL state + scroll (TASK-001)
- [ ] Edit `DiffTab.tsx` — replace useState with URL params + add scroll effect

### Phase 2: FindingCard button (TASK-002)
- [ ] Edit `FindingCard.tsx` — add `viewInDiffHref` prop + icon in header

### Phase 3: Wire parent (TASK-003)
- [ ] `FindingsTab.tsx` — add `isLatestRun={i === 0}` to `<ReviewRunAccordion>`
- [ ] `ReviewRunAccordion.tsx` — accept + pass through `isLatestRun?: boolean` to `<FindingsPanel>`
- [ ] `FindingsPanel.tsx` — accept `isLatestRun`, compute `viewInDiffHref` (raw path, no encode), pass to `<FindingCard>`
- [ ] Check parent page (`page.tsx`) — if `<DiffTab>` is not wrapped in `<Suspense fallback={null}>`, add it (required by Next.js 15 for `useSearchParams`)

### Phase 4: Typecheck
- [ ] `cd client && pnpm typecheck` — 0 errors

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `encodeURIComponent` in href breaks querySelector match against raw `data-path` | Do NOT encode `f.file` — pass raw path in `?at=`. URLSearchParams in `setSmartOrder` handles full param encoding |
| `useSearchParams` forces Suspense boundary in Next.js 15 | DiffTab is already a Client Component — wrap in `<Suspense>` if build warns |
| Runs not sorted newest-first in parent component | Read the parent before assuming sort order |

## Out of Scope

- Highlight/underline the scroll target line (scroll only, no visual marking)
- Persisting `smart=1` across sessions
- "Go to Diff" from Timeline block (separate feature)
- i18n for the `title="Go to diff"` tooltip (static string acceptable for icon title)
