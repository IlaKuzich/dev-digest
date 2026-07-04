# INSIGHTS — client

Append-only engineering log for this package. Read before answering (per CLAUDE.md);
appended via the `engineering-insights` skill. One finding per entry, actionable
"cold" with `file:line` evidence. Append under the matching section — never reorder
or overwrite existing entries (correct a stale one with a new dated note). Prune
obsolete entries only during a deliberate review.

## What Works
## What Doesn't Work
## Codebase Patterns
## Tool & Library Notes
## Decisions
## Recurring Errors & Fixes
## Session Notes
## Open Questions

## Recurring Errors & Fixes
- 2026-06-25 — `formatCost` trailing-zero bug: using `usd < 0.01 ? 4 : usd < 1 ? 3 : 2` gives 3 decimal places for `0.06` → `"$0.060"`. Fix: `usd.toFixed(4).replace(/(\.\d{2}.*?)0+$/, '$1')` — formats to 4 dp then strips trailing zeros while keeping minimum 2 decimal places. See `client/src/components/run-cost-badge/RunCostBadge.tsx:9`.
- 2026-06-29 — Dismissed findings inconsistency in `ReviewRunAccordion`: `bySeverity` severity counts must filter `!f.dismissed_at` just like the `blockers` count on the line above does — otherwise pills show a higher number than blockers, contradicting each other. Pattern: any time you count `review.findings` by severity in the client, always prepend `.filter((f) => !f.dismissed_at)`. Fixed at `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:58-63`.
- 2026-07-04 — The vendored icon registry (`client/src/vendor/ui/icons.tsx:64,147`) exports lucide's `Pencil` icon only under the key `"Edit"` (`Edit: Pencil` alias) — `IconName` has no `"Pencil"` key. Passing `icon="Pencil"` to `Button`/`EmptyState`/etc. fails typecheck ("not assignable" against the full `IconName` union). Use `icon="Edit"` for a pencil/edit glyph. Hit in `client/src/app/skills/_components/SkillsListView/SkillsListView.tsx` (Edit button in the skill preview panel).

## Codebase Patterns
- 2026-06-29 — New component folders that export types used internally by sibling components must put those types in a separate `types.ts` (not `index.ts`) to avoid circular imports. Pattern: `ComponentA.tsx` imports `MyType` from `"./types"` directly; `index.ts` re-exports from both `./ComponentA` and `./types`. Example: `client/src/components/findings-severity-badges/types.ts` holds `TopFinding` + `toTopFinding`, imported by `FindingsTooltip.tsx` via `"./types"` (not `"./index"`).
- 2026-07-04 — RTL-testing a page-level `*ListView` component that renders `<AppShell>` needs more than `NextIntlClientProvider`. `AppShell` (`client/src/components/app-shell/AppShell.tsx:10-20`) pulls in `useShellContext`/`useShellCommands`/`useGlobalShortcuts`, which need the `"shell"` i18n namespace, `next/navigation`'s `usePathname`, and a theme hook — a test that only supplies the page's own message namespace fails with `IntlError: MISSING_MESSAGE: ... 'shell'` and then `usePathname` not mocked. Fix: mock the `AppShell` module itself as a passthrough — `vi.mock("../../../../components/app-shell", () => ({ AppShell: ({ children }) => <>{children}</> }))` — alongside mocking `next/navigation`'s `useRouter` (existing precedent: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/RunReviewDropdown.test.tsx:6-8`). Applied at `client/src/app/skills/_components/SkillsListView/SkillsListView.test.tsx`.
