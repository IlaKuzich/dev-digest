# run-plan skill

Orchestrates the full SDD implementation pipeline from an existing `PLAN-*.md`.

## Prerequisites

Run these manually **before** `/run-plan`:
1. `spec-creator` → produces `SPEC-*.md`
2. `implementation-planner` → produces `plans/PLAN-*.md`

## Usage

```
/run-plan plans/PLAN-<feature>.md
```

## What it does

```
Phase 1: Implementation
  → reads Execution Mode from plan
  → single-agent OR implementer-backend ∥ implementer-frontend

Phase 2: Architecture Fix Loop (max 3 iterations)
  → architecture-reviewer (sonnet, scoped to changed files)
  → if CRITICAL/HIGH: implementer fixes → re-run
  → stops when clean or at max iterations

Phase 3: Final Verification
  → plan-viewer (sonnet) — reports AC coverage matrix
  → does NOT block

Phase 4: Summary report
```

## What it does NOT do

- Does not run `spec-creator` or `implementation-planner` (manual steps)
- Does not run `test-writer` (disabled, run manually when ready)
- Does not push to git (pr-self-review fires automatically on push)

## Based on

| Practice | Source |
|---|---|
| Orchestration skill reads plan DAG instead of user retyping workflow | Screenshot recommendation, session 2026-07-02 |
| architecture-reviewer before test-writer: structural fixes change test locations | Onion Architecture enforcement — moving code between layers changes file paths |
| plan-viewer as final non-blocking report | plan-viewer purpose: verify implementation matches plan, not gate the pipeline |
| max 3 fix iterations to prevent infinite loops | Common agentic loop safety pattern |
| scope architecture-reviewer to diff only | Efficiency: unchanged files cannot have new violations |
