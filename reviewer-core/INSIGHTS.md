# INSIGHTS — reviewer-core

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
- 2026-07-05 — `ERR_MODULE_NOT_FOUND: Cannot find package 'openai'` from
  `reviewer-core/src/llm/structured.ts` when running `server` (`tsx watch src/server.ts`)
  means reviewer-core's own deps were never installed — run `cd reviewer-core && npm install`.
  **Why:** server's tsconfig path alias (`server/tsconfig.json` `paths["@devdigest/reviewer-core"]`)
  points straight at `../reviewer-core/src/index.ts`, so tsx loads those files as TS source.
  Node then resolves bare specifiers (`openai`, `openai/helpers/zod`) by walking up from the
  *physical* file location in `reviewer-core/`, not from `server/`. `server/node_modules/openai`
  is unreachable from a sibling directory, so `reviewer-core/node_modules` must exist
  independently even though nothing in reviewer-core is ever run standalone in dev.
## Session Notes
## Open Questions

<!-- No insights yet — append under the matching section as patterns emerge. -->
