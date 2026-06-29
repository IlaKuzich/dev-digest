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
- 2026-06-25 — `.claude/settings.local.json` was accidentally committed with Windows-specific absolute paths. Added to `.gitignore` and removed with `git rm --cached`. If you see this file reappear after a merge, it is not ignored upstream — re-run `git rm --cached .claude/settings.local.json`.
