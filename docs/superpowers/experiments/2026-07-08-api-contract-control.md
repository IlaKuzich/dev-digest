# Experiment — API Contract Reviewer: skills off vs. on

**Date:** 2026-07-08
**Goal:** Show that binding the 4 API-contract skills to an agent changes a real review —
the agent misses a breaking change without them and catches it with them.

## Setup (via the UI, using the existing Skills + Agents features)

1. **Create the agent.** Agents → *New agent* → name `API Contract Reviewer`, paste the
   system prompt from [`docs/agent-prompts/api-contract-reviewer.md`](../../agent-prompts/api-contract-reviewer.md).
   Pick a capable model (e.g. `claude-opus-4-8`). Save.
2. **Create the 4 skills** (Skills → *Create* for three of them; **import** the fourth to
   exercise that path). Bodies:
   - [`breaking-change`](../../skills/api-contract/breaking-change.md)
   - [`response-schema`](../../skills/api-contract/response-schema.md)
   - [`semver-discipline`](../../skills/api-contract/semver-discipline.md)
   - [`deprecation-policy`](../../skills/api-contract/deprecation-policy.md) ← bring this
     one in via **Import** (paste/upload the markdown) rather than Create.
   Set each skill's `type` to `convention` (or `custom`) and enable it.
3. **Bind skills to the agent.** Agent editor → **Skills** tab → check all four, save.

## The test PR

Create (or pick) a PR that makes a **breaking contract change**. Minimal reproducer —
rename a response field on an existing route:

```diff
// server/src/modules/pulls/routes.ts (example)
- reply.send({ id: pr.id, fullTitle: pr.title })
+ reply.send({ id: pr.id, title: pr.title })   // fullTitle → title: breaking
```

(or change a route signature / make an optional response field required).

## Runs

- **A — skills OFF:** in the Agent editor Skills tab, uncheck all four skills, save.
  Run the agent on the PR. Record the findings.
- **B — skills ON:** re-check all four, save. Run the agent on the same PR. Record the
  findings and confirm at least one cites the `breaking-change` (or `response-schema`)
  rule with the offending `file:line`.

Both runs are visible in the run trace; with skills ON, the trace shows a
`## Skills / rules` block containing the four skill bodies (proof they were injected).

## Results (record after running)

| Run | Skills | Breaking change caught? | # findings | Trace id / link |
|-----|--------|------------------------|-----------|-----------------|
| A   | off    | _fill in_              | _fill in_ | _fill in_       |
| B   | on     | _fill in_              | _fill in_ | _fill in_       |

**Verdict (fill in):** Run A ______ the `fullTitle → title` rename; Run B ______ it and
commented citing `breaking-change` at `______:__`. The `## Skills / rules` block was
present in B's trace and absent in A's.

> This section is an experiment log to be completed by executing the protocol above
> against a running stack (`./scripts/dev.sh`) with a real model key configured.
