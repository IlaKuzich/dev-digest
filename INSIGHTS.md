# INSIGHTS — project-wide

Append-only engineering log for **cross-cutting / project-wide** findings — build
scripts, dev/e2e tooling, and conventions that span packages (no-workspace layout,
vendored `@devdigest/shared`, tsconfig path aliases). Module-specific lessons go in
that package's own `INSIGHTS.md`. Appended via the `engineering-insights` skill.
One finding per entry, actionable "cold" with `file:line` evidence. Append under the
matching section — never reorder or overwrite existing entries (correct a stale one
with a new dated note). Prune obsolete entries only during a deliberate review.

## What Works
## What Doesn't Work
## Codebase Patterns
## Tool & Library Notes
## Decisions
## Recurring Errors & Fixes
## Session Notes
## Open Questions

## Codebase Patterns
- 2026-06-25 — Both `server/src/vendor/shared/` and `client/src/vendor/shared/` must receive **identical** Zod contract changes in the same commit. Missing one side causes runtime Zod parse failures that are hard to trace. There is no automated sync — it is manual by convention.

## Recurring Errors & Fixes
- 2026-07-16 — In a **fresh `git worktree`, `cd server && pnpm typecheck` fails with errors that look like broken product code but are just missing deps in a SIBLING package.** `git worktree add` checks out tracked files only, so each package's gitignored `node_modules/` is absent. Because `reviewer-core` is consumed as TypeScript **SOURCE** via a tsconfig path alias (root CLAUDE.md), tsc type-checks its files as part of the server program — so the server typecheck reports `TS2307: Cannot find module 'openai'` / `'zod'` at `../reviewer-core/src/llm/*.ts` and a couple of `TS2322 'unknown' is not assignable to 'T'` in the adapters. **Fix:** install per package before believing any typecheck (`cd reviewer-core && npm install`, `cd client && pnpm install` — reviewer-core uses npm, the others pnpm). After that the same command is clean. Don't chase these as a regression from your own change.
- 2026-06-25 — `.claude/settings.local.json` was accidentally committed with Windows-specific absolute paths. Added to `.gitignore` and removed with `git rm --cached`. If you see this file reappear after a merge, it is not ignored upstream — re-run `git rm --cached .claude/settings.local.json`.
