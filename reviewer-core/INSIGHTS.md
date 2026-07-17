# INSIGHTS — reviewer-core

Append-only engineering log for this package. Read before answering (per CLAUDE.md);
appended via the `engineering-insights` skill. One finding per entry, actionable
"cold" with `file:line` evidence. Append under the matching section — never reorder
or overwrite existing entries (correct a stale one with a new dated note). Prune
obsolete entries only during a deliberate review.

## What Works
## What Doesn't Work
## Codebase Patterns
- 2026-07-15 — Adding a new optional prompt input to `assemblePrompt` (the `intent` seam is the reference impl) follows a two-sided trust-boundary rule: (1) the derived / author-controlled **content** renders as a `wrapUntrusted('<name>', ...)`-wrapped `## Section` in the USER message, gated so an empty/whitespace value yields a byte-identical prompt — the same "omit when empty" contract as `repoMap`/`callers` (`src/prompt.ts`); (2) any **behavioral rule** about that content (e.g. `SCOPE_RULE` — "review within intent, one signal finding out-of-scope") goes in the TRUSTED `system` string beside `INJECTION_GUARD`, appended only when the input is present, and must NOT weaken `INJECTION_GUARD` (derived intent can never zero-out a real finding). Policy rule and untrusted content stay on opposite sides of the trust boundary. Thread the field through `ReviewInput` → `promptParts` in `src/review/run.ts`, mirroring `prDescription`.
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
