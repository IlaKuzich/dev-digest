# TODO — shared skill-eval runner

Not yet implemented. Captured here so the idea isn't lost between sessions.

## Problem

Every skill that wants with/without-skill or old/new-version comparisons currently repeats the same
manual dance: snapshot the skill, spawn a with-skill subagent and a baseline subagent per test case,
save outputs, grade, aggregate. That's fine for a one-off (skill-creator's Eval mode does this), but
it doesn't scale to "run this for every skill in `.claude/skills/` before merging a PR."

## Proposed shape

- A single shared script, `skill-evals/_shared/run-eval.sh <skill-name>`, that:
  1. Reads `<skill-path>/evals/eval.md` + `<skill-path>/evals/expected-findings.json` (or
     `evals/evals.json` if the skill uses the skill-creator schema) to find its test cases and fixtures.
  2. Runs with-skill / without-skill (or old/new snapshot) pairs per case.
  3. Grades against the expected findings and prints a pass/fail summary.
- Each skill's own `evals/` folder stays the source of truth for its fixtures and expected findings
  (this is the "evals live inside the skill" convention we settled on — see
  `skill-evals/_shared/README.md`) — the shared script only supplies the run/grade *mechanism*, not
  the test content itself.
- Thin per-skill wrapper (optional): `.claude/skills/<name>/evals/run.sh` that just calls the shared
  script with this skill's name, so `cd .claude/skills/onion-architecture/evals && ./run.sh` works
  without remembering the shared script's path.

## Relationship to `evals/` (the course package)

This is a *lighter-weight* alternative to the full `evals/` harness (skill/agent/workflow tiers,
vitest-based, LLM judge). The course harness is the more rigorous tool for CI and quantitative
tracking (`pnpm eval:repeat` / `eval:delta`); this shared runner would be for a quick, cheap,
un-instrumented "does this skill still behave as expected" check without wiring a full `*.eval.ts`
file — useful during a skill's early draft/iterate phase, before it's mature enough to be worth the
heavier harness.

## Status

Not started. Revisit if manually re-running skill-creator's Eval mode per skill keeps feeling
repetitive.
