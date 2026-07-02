# PR Self-Review Skill — Design

**Date:** 2026-07-02
**Status:** Approved for planning
**Topic:** New `pr-self-review` workflow skill for DevDigest

## Problem

Before pushing or opening a PR, changes should be checked against the team's
accumulated knowledge. DevDigest already ships 13 domain skills (`.claude/skills/`)
and project-wide rules (`CLAUDE.md`, per-package `INSIGHTS.md`), but nothing ties
them together into a pre-push self-review. Reviewing by hand means the relevant
skills are inconsistently applied — a frontend change may never get looked at
through `react-best-practices`, a backend change may skip `onion-architecture`.

## Goal

A workflow skill that takes the current open changes, routes them to the
**existing** domain skills (frontend, backend, full-stack) plus project-specific
rules, and produces a structured self-review report with suggested fixes — run
manually or reminded automatically before a GitHub push/PR.

## Non-Goals (YAGNI)

- Does **not** block `git push` / `gh pr create` (hook only reminds).
- Does **not** post to GitHub.
- Does **not** run tests, linters, or type-checks.
- Does **not** auto-apply fixes (offers; user decides).
- Does **not** use subagents (parallel-per-area is a future enhancement).

## Chosen Approach

**Single orchestrator skill.** One `SKILL.md` classifies the diff, sequentially
invokes the relevant existing skills as review criteria, checks project rules,
and assembles one report.

Rejected alternatives:
- **Subagent-per-area** — more isolated/thorough but heavier and costlier than a
  pre-push self-review warrants. Noted as a possible future extension.
- **Static checklist** — simplest, but fails the core requirement that the actual
  existing skills be used during review.

## Trigger (two layers)

1. **Skill** — `SKILL.md` with a description carrying trigger terms:
   `before git push`, `gh pr create`, `pr self-review`, `review my changes`,
   `open changes`. Lets the agent invoke it on intent, and enables manual/explicit
   invocation.
2. **Hook** — a `PreToolUse` hook on `Bash` in `.claude/settings.json` that fires
   when the command contains `git push` or `gh pr create`. It **only prints a
   reminder** ("run pr-self-review on open changes before pushing"); it does not
   block. The skill does the real work.

## Workflow (inside SKILL.md)

1. **Determine diff scope.** `git merge-base main HEAD`, then the branch diff vs
   main plus uncommitted working-tree changes. Produce the changed-file list.
2. **Classify files by path/package.**
   - `server/` → backend
   - `client/` → frontend
   - `reviewer-core/`, `e2e/`, shared/`vendor/` → their areas
   - Any code change → also the full-stack dimension.
3. **Build the active skill set dynamically.** Read the Scope column of
   `.claude/skills/README.md` and select skills for the present areas:
   - Backend → `fastify-best-practices`, `drizzle-orm-patterns`,
     `postgresql-table-design`, `onion-architecture`
   - Frontend → `next-best-practices`, `react-best-practices`,
     `react-testing-library`, `client-project-structure`
   - Full-stack (always, for any code change) → `security`, `zod`,
     `typescript-expert`
   Reading from README means newly added skills are picked up automatically.
4. **Run the review.** For each selected skill, invoke it (`Skill` tool) and apply
   its rules as review criteria against the diff of the corresponding area.
5. **Check project dimensions.**
   - **CLAUDE.md do-not-touch zones** — no workspace tool introduced, no direct
     cross-package `src` imports, vendored `shared` respected.
   - **INSIGHTS.md of each touched package** — reconcile the change against those
     recorded learnings.
6. **Emit the report** and offer to apply fixes (no auto-apply, no block).

## Report Format

Markdown:
- Header: scope line (branch, N files changed, which areas detected).
- One section per area; each finding: `severity · file:line · skill · description ·
  suggested fix`.
- Severity levels: `blocker`, `warning`, `nit`.
- Footer: counts per severity, then the "apply fixes?" offer.

## File Changes

- **New:** `.claude/skills/pr-self-review/SKILL.md` — the orchestrator skill.
- **New (optional):** `.claude/skills/pr-self-review/examples.md` — a sample report.
- **Edit:** `.claude/skills/README.md` — add a catalog row (Scope: `Workflow`).
- **Edit:** `.claude/settings.json` — add the `PreToolUse` reminder hook.

## Success Criteria

- Running the skill on a branch with both frontend and backend changes produces a
  report that visibly applied backend skills to `server/` files and frontend
  skills to `client/` files, plus full-stack skills to all code.
- Adding a new skill row to `README.md` causes it to be considered without editing
  `SKILL.md`.
- The hook prints a reminder before `git push` / `gh pr create` without blocking.
- The report references concrete `file:line` locations and groups findings by
  skill/severity.
