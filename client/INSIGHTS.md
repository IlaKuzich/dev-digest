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

## Codebase Patterns
- 2026-06-29 — New component folders that export types used internally by sibling components must put those types in a separate `types.ts` (not `index.ts`) to avoid circular imports. Pattern: `ComponentA.tsx` imports `MyType` from `"./types"` directly; `index.ts` re-exports from both `./ComponentA` and `./types`. Example: `client/src/components/findings-severity-badges/types.ts` holds `TopFinding` + `toTopFinding`, imported by `FindingsTooltip.tsx` via `"./types"` (not `"./index"`).
