---
name: pr-self-review
description: "Use when about to git push or gh pr create on a DevDigest branch, or when asked to self-review / review my changes / review open changes before a PR. Runs the open diff through the repo's domain skills plus project rules and records a pass/fail verdict that gates the push."
metadata:
  tags: pr-review, self-review, pre-push, quality-gate, workflow, skills-orchestration
---

# PR Self-Review (DevDigest)

## Overview
Before code leaves the machine, run every relevant **existing** skill against the
open changes and record a verdict. A `git push` / `gh pr create` is **blocked** by
the `pr-self-review-gate` hook until a *fresh* review with **zero blockers** exists
for the current diff. This skill is the orchestrator: it classifies the diff,
invokes the right domain skills as review criteria, checks project rules, writes
the verdict, and reports.

This is a **workflow skill** — you do the reasoning; the skills you invoke supply
the criteria. Do not skip an area's skills because "the change looks fine."

## When to use
- You (or the user) are about to push or open a PR.
- The user says "self-review", "review my changes", "review open changes".
- The push hook denied a `git push` — run this, clear blockers, re-run, retry.

## Workflow

### 1. Determine the diff scope
Base = `git merge-base main HEAD`. Review = branch-vs-main **plus** working-tree
and untracked changes. Get the changed-file list:
```bash
base=$(git merge-base main HEAD 2>/dev/null || git merge-base origin/main HEAD)
git diff --name-only "$base"; git status --porcelain
```

### 2. Classify changed files by package/path
| Path prefix | Area |
|---|---|
| `server/` | Backend |
| `client/` | Frontend |
| `reviewer-core/` | Core engine |
| `e2e/` | E2E |
| any `src/vendor/shared`, `scripts/`, root config | Full-stack / project-wide |

Any code change also gets the **Full-stack** dimension.

### 3. Build the active skill set — dynamically
Read the **Scope column** of `.claude/skills/README.md` and select the skills for
the areas present in the diff. Do not hardcode the list here — reading README means
new skills are picked up automatically. Typical mapping today:
- **Backend** → `fastify-best-practices`, `drizzle-orm-patterns`,
  `postgresql-table-design`, `onion-architecture`
- **Frontend** → `next-best-practices`, `react-best-practices`,
  `react-testing-library`, `client-project-structure`
- **Full-stack (always, any code change)** → `security`, `zod`, `typescript-expert`

### 4. Run the review
For **each** selected skill: invoke it (`Skill` tool) and apply its rules as review
criteria to the diff of that area. Frontend skills judge `client/` files; backend
skills judge `server/` files; full-stack skills judge all code.

### 5. Check project dimensions

**5a. Mechanical do-not-touch checks (run these — every hit is an automatic
`blocker`).** These are cheaper and more reliable than eyeballing; do them before
judgment. Scope the greps to the changed files (`$base` from step 1):
```bash
# Workspace tool introduced (forbidden — DevDigest is NOT a workspace)
ls pnpm-workspace.yaml turbo.json nx.json 2>/dev/null
git diff "$base" -- '**/package.json' | grep -nE '^\+.*"workspaces"'
# Direct cross-package src import (must route through @devdigest/shared)
git diff "$base" | grep -nE "^\+.*from ['\"].*(server|client|reviewer-core|e2e)/src/"
# reviewer-core must stay JS-emit-free (never emits JS)
git diff "$base" -- 'reviewer-core/**/tsconfig*.json' | grep -nE '^\+.*"(noEmit"|outDir)'
```
Report each hit as a `blocker` with the offending `file:line`.

**5b. Judgment dimensions.**
- Remaining **CLAUDE.md** rules not captured above (vendored `shared` respected,
  package boundaries, etc.).
- **INSIGHTS.md of each touched package** — read it and reconcile the change with
  those recorded learnings (and root `INSIGHTS.md` for cross-cutting changes).

### 6. Report, then record the verdict
Emit the report (format below). Then write the verdict artifact — the hook reads
it. `verdict` is `fail` when `blockerCount ≥ 1`, else `pass`:
```bash
hash=$(bash .claude/hooks/pr-review-diff-hash.sh)
cat > .claude/.pr-self-review-state.json <<JSON
{"diffHash":"$hash","verdict":"<pass|fail>","blockerCount":<N>,"branch":"$(git rev-parse --abbrev-ref HEAD)","timestamp":"$(date -u +%FT%TZ)"}
JSON
```
Then offer to apply fixes. **Do not auto-apply. Do not edit the artifact by hand to
force a pass** — recompute it only by re-running this skill after real fixes.

## Severity rubric (assign consistently — the verdict gates the push)
| Severity | Definition |
|---|---|
| `blocker` | Broken/missing contract, dependency-rule violation (onion), security issue, a do-not-touch hit (§5a), or anything that would fail review. Any ≥1 ⇒ **FAIL**. |
| `warning` | Best-practice violation with no correctness/security risk (missing test, suboptimal pattern, wrong colocation). |
| `nit` | Style/preference; safe to ignore. |

## Report format
```
## PR Self-Review — <branch>
Scope: <N> files · areas: <Backend, Frontend, …>
Skills consulted — Backend: fastify, onion, …; Frontend: react, …; Full-stack: security, zod, ts

### <Area>
- [blocker] path/to/file.ts:42 · <skill> — <what's wrong>. Fix: <suggestion>
- [warning] …
- [nit] …

### Verdict
blockers: <N> · warnings: <N> · nits: <N> → <PASS | FAIL>
```
**REQUIRED:** the `Skills consulted` line must name every skill actually invoked,
grouped by area — it is the accountability record that each relevant skill really
ran. An area with changed files and no skills listed is an incomplete review.
Every finding needs a concrete `file:line` and a suggested fix.

## Common mistakes
- **Reviewing only the working tree.** Scope is merge-base..HEAD + working tree —
  already-committed branch work counts.
- **Skipping the full-stack skills** because the change is "just backend" — `security`,
  `zod`, `typescript-expert` apply to any code.
- **Hardcoding the skill list.** Read it from README so new skills are covered.
- **Forcing the gate.** Editing the state file or bypassing the hook defeats the
  purpose. Fix the blocker, re-run, then push.
