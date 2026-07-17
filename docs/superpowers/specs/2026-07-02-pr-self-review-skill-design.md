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
manually, and enforced as a blocking gate before a GitHub push/PR (any blocker
finding, or a stale/missing review, denies the push).

## Non-Goals (YAGNI)

- Does **not** post to GitHub.
- Does **not** run tests, linters, or type-checks.
- Does **not** auto-apply fixes (offers; user decides).
- Does **not** use subagents (parallel-per-area is a future enhancement).
- Does **not** provide a bypass/escape hatch — the gate is unconditional.

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
2. **Blocking hook** — a `PreToolUse` hook on `Bash` in `.claude/settings.json`
   that fires when the command contains `git push` or `gh pr create`. It reads the
   review-state artifact (below) and **denies** the tool call (exit code 2 /
   `permissionDecision: "deny"`) when either condition holds:
   - no review was run for the **current** diff (stale or missing = block), or
   - the last review for the current diff found **≥1 blocker**.
   Otherwise it allows the push. The deny message tells the user to run
   `pr-self-review` and clear blockers. There is no bypass.

## Review-State Artifact

The skill writes its verdict so the shell hook can gate without re-running the
review:

- Path: `.claude/.pr-self-review-state.json` (gitignored).
- Contents: `diffHash` (hash of the branch-vs-main + working-tree diff at review
  time), `verdict` (`pass` | `fail`), `blockerCount`, `timestamp`, `branch`.
- **Freshness:** the hook recomputes the current `diffHash` the same way and
  compares. A mismatch means the working tree changed since the review → treated
  as "not reviewed" → block. This makes "fresh review + 0 blockers" the only way
  through.

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
6. **Emit the report**, then **write the review-state artifact** (`diffHash`,
   `verdict` = `fail` if `blockerCount ≥ 1` else `pass`, counts, branch,
   timestamp). Offer to apply fixes (no auto-apply). The verdict is what the
   blocking hook later reads.

## Report Format

Markdown:
- Header: scope line (branch, N files changed, which areas detected).
- One section per area; each finding: `severity · file:line · skill · description ·
  suggested fix`.
- Severity levels: `blocker`, `warning`, `nit`. **`blocker` is the gating level**
  — ≥1 blocker means the push hook will deny until it is resolved and the review
  re-run.
- Footer: counts per severity, the verdict (`pass`/`fail`), then the "apply
  fixes?" offer.

## File Changes

- **New:** `.claude/skills/pr-self-review/SKILL.md` — the orchestrator skill.
- **New (optional):** `.claude/skills/pr-self-review/examples.md` — a sample report.
- **Edit:** `.claude/skills/README.md` — add a catalog row (Scope: `Workflow`).
- **New:** hook script (e.g. `.claude/hooks/pr-self-review-gate.sh`) that reads
  the state artifact, recomputes `diffHash`, and denies the push on stale/missing
  review or `blockerCount ≥ 1`.
- **Edit:** `.claude/settings.json` — register the `PreToolUse` blocking hook on
  `Bash` for `git push` / `gh pr create`.
- **Edit:** `.gitignore` — ignore `.claude/.pr-self-review-state.json`.

## Success Criteria

- Running the skill on a branch with both frontend and backend changes produces a
  report that visibly applied backend skills to `server/` files and frontend
  skills to `client/` files, plus full-stack skills to all code.
- Adding a new skill row to `README.md` causes it to be considered without editing
  `SKILL.md`.
- With ≥1 blocker (or no fresh review), `git push` / `gh pr create` is **denied**
  by the hook with a message pointing to `pr-self-review`.
- After the blocker is fixed and the review re-run (0 blockers, matching
  `diffHash`), the same push is allowed.
- Changing the working tree after a passing review invalidates the verdict
  (stale `diffHash`) and blocks again until re-reviewed.
- The report references concrete `file:line` locations and groups findings by
  skill/severity.
