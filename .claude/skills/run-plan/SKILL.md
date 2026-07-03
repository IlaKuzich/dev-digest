---
name: run-plan
description: >
  SDD workflow orchestrator. Reads an existing PLAN-*.md and executes the full
  implementation pipeline: implementers → architecture fix loop → plan-viewer verification.
  spec-creator and implementation-planner run separately BEFORE this skill.
  TRIGGER when: "/run-plan", "run plan", "execute plan", "запусти план",
  "виконай план", "run the plan", "implement the plan".
---

# Run Plan Skill

> **Orchestrates the full implementation pipeline from an existing PLAN-*.md.**
> spec-creator and implementation-planner run manually before this skill is invoked.

---

## How to invoke

```
/run-plan plans/PLAN-<feature>.md
```

The PLAN-*.md path is **required**. If not provided → ask the user to specify it.

---

## Execution Algorithm

### STEP 0 — Init

```bash
START_SHA=$(git rev-parse HEAD)
echo "START_SHA: $START_SHA"
```

Save START_SHA — used in Phase 2 to scope architecture-reviewer to only the new changes.

Read the PLAN file:
- Extract **Execution Mode** (`multi-agent` or `single-agent`)
- Extract all **TASKs** with their **Scope** (backend / frontend) and **Owned Paths**
- Verify owned paths between parallel tasks do NOT overlap — if they do, treat as `single-agent`

---

### PHASE 1 — Implementation

**single-agent** (scope = one module, or overlapping owned paths):
```
Spawn 1 implementer agent with the full PLAN path.
Wait for completion. Collect Implementation Report.
```

**multi-agent** (scope = backend + frontend, non-overlapping owned paths):
```
Spawn TWO implementer agents IN PARALLEL (single message, two Agent tool calls):
  → implementer-backend: "implement backend tasks from plans/PLAN-<name>.md"
  → implementer-frontend: "implement frontend tasks from plans/PLAN-<name>.md"
Wait for BOTH to complete. Collect both Implementation Reports.
```

**Phase 1 output before proceeding:**
```
✅ Phase 1 complete
   Backend:  <status from implementer report>
   Frontend: <status from implementer report>
   Typecheck: ✓/✗   Tests: ✓/✗
```

If any implementer reports ✗ typecheck or ✗ tests → **STOP**. Do not proceed to Phase 2.
Report the failure and ask the user how to proceed.

---

### PHASE 2 — Architecture Fix Loop

**Max 3 iterations.** Counter starts at 0.

**Each iteration:**

1. Collect changed files since START_SHA:
```bash
git diff $START_SHA...HEAD --name-only --diff-filter=AM
```

2. Spawn **architecture-reviewer** with:
   - The list of changed files as scope
   - Instruction: "Review only these files: <list>. Check for Onion Architecture violations, SOLID violations, and import direction issues."

3. Parse findings:
   - **No CRITICAL or HIGH** → exit loop, proceed to Phase 3
   - **CRITICAL or HIGH found** AND counter < 3:
     - Group violations by scope (backend violations → backend implementer, frontend → frontend)
     - Spawn implementer(s) with violations as context:
       ```
       "Fix the following architecture violations found by architecture-reviewer.
        Do NOT change behavior — only fix structure.
        Violations: <list of VIOLATION blocks>"
       ```
     - Increment counter
     - Go to next iteration
   - **counter = 3** AND still CRITICAL/HIGH → **STOP**

**Loop output on each iteration:**
```
🔄 Architecture Review — Iteration N/3
   CRITICAL: N   HIGH: N   MEDIUM: N   LOW: N
   → <action taken>
```

**If STOP at max iterations:**
```
⛔ Architecture Fix Loop: max iterations reached.
   Remaining violations:
   <list CRITICAL/HIGH violations>
   Please review manually and decide how to proceed.
```

---

### PHASE 3 — Final Verification (plan-viewer)

Spawn **plan-viewer** with the PLAN path:
```
"Run plan coverage check for plans/PLAN-<name>.md.
 Output the full coverage matrix: IMPLEMENTED / PARTIAL / MISSING per AC."
```

Collect the coverage matrix. **Do NOT block on results** — plan-viewer reports only.

---

### PHASE 4 — Summary Report

```
## /run-plan Summary

**Plan:** plans/PLAN-<name>.md
**Start SHA:** <sha>
**End SHA:** <git rev-parse HEAD>

### Phase 1: Implementation
- Backend implementer:  ✓/✗
- Frontend implementer: ✓/✗  (or: single-agent)

### Phase 2: Architecture
- Iterations: N/3
- Violations fixed: N
- Remaining LOW/MEDIUM: N (acceptable)
- Remaining CRITICAL/HIGH: N ⚠️ (needs attention)

### Phase 3: Plan Coverage
- Total ACs: N
- ✅ Implemented: N (N%)
- ⚠️ Partial: N
- ❌ Missing: N

### Next steps
- test-writer: not run (disabled — invoke manually when ready)
- git push: triggers pr-self-review automatically (if hook configured)
```

---

## Rules

- **NEVER skip Phase 2** — architecture-reviewer always runs after implementation
- **NEVER block on plan-viewer** — it reports coverage, does not gate the workflow
- **NEVER run implementers in parallel if owned paths overlap** — check the plan first
- **test-writer is disabled** — do not spawn it, only mention it in summary
- **Max 3 fix iterations** — if still CRITICAL/HIGH after 3 → stop and report
- **Scope architecture-reviewer to changed files only** — never full-repo audit in this skill
- **If PLAN path not provided** → ask before doing anything else
