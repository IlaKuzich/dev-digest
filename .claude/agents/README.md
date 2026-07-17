# Agents

Custom subagents for the DevDigest project. Each agent is a Markdown file with YAML
frontmatter (`name`, `description`, `tools`, `model`, and optionally `permissionMode` /
`isolation`) plus a system-prompt body. Claude delegates to an agent based on its
`description`, so descriptions are written as trigger conditions ("Use when…"), not role
labels. Shared with the team via version control.

## Catalog

| Agent | Scope | Model | Isolation / mode | Tools | Purpose |
|-------|-------|-------|------------------|-------|---------|
| [researcher](researcher.md) | Read-only research | sonnet | — | Read, Grep, Glob, Bash, WebSearch, WebFetch | Investigate & report (codebase or web); never modifies anything |
| [planner](planner.md) | Planning | opus | `permissionMode: plan` (read-only) | Read, Grep, Glob, Bash | Produces a structured **Development Plan** (task contracts) before any code is written |
| [implementer](implementer.md) | Implementation | sonnet | active branch (file-ownership discipline) | Read, Grep, Glob, Edit, Write, Bash, Skill | Executes ONE plan task; writes code + makes tests green |
| [test-writer](test-writer.md) | Test authoring | sonnet | active branch (file-ownership discipline) | Read, Grep, Glob, Edit, Write, Bash, Skill | Writes/extends tests across all packages (server unit + `*.it.test.ts`, client RTL, reviewer-core, e2e); verifies against real output; never weakens a test to pass |
| [architecture-reviewer](architecture-reviewer.md) | Read-only review | opus | `permissionMode: plan` (read-only) | Read, Grep, Glob, Bash, Skill | Semantic architecture review of a diff — onion dependency rule, DI/container, repo/tenancy/DTO, client colocation/RSC, cross-package boundaries |
| [plan-verifier](plan-verifier.md) | Read-only verification | opus | `permissionMode: plan` (read-only) | Read, Grep, Glob, Bash, Skill | Checks an implemented change against its Development Plan — requirements traceability (every Task/Step/Verify delivered), not code quality |
| [doc-writer](doc-writer.md) | Documentation | sonnet | active branch (docs-only writes) | Read, Grep, Glob, Edit, Write, Bash, Skill | Turns shipped functionality / a plan / any input into a house-style doc with a mermaid diagram, placed in its correct repo location; never touches product code or `INSIGHTS.md` |

## Intended workflow

```
researcher (optional) → planner → N × implementer (parallel) → test-writer → architecture-reviewer  ┐
   gather context     Dev Plan     one task each, disjoint      write tests   + plan-verifier (review) ├→ pr-self-review gate → push/PR
                                                                              (read-only, parallel)   ┘
                                          doc-writer — documents the shipped work (any time, docs-only)
```

- **planner** reads the codebase + INSIGHTS, then writes `docs/plans/<feature>.md` — a
  self-contained plan whose tasks have non-overlapping file ownership.
- One **implementer** is spawned per task. Each works in the currently active branch,
  touching only the files its task owns (no worktree isolation — collision-freedom relies
  on the planner's disjoint file ownership), invokes the area-appropriate skills, and
  self-verifies by making its tests pass. It does **not** push or run the full PR gate.
- **test-writer** authors/extends the tests for the changed area (it shares the write posture
  and file-ownership discipline of the implementer; keep its owned test files disjoint from
  any parallel implementer's).
- **architecture-reviewer** and **plan-verifier** are read-only review gates run before the
  PR: the former judges architectural soundness of the diff, the latter judges whether the
  Development Plan was fully delivered (requirements coverage). They complement — not
  replace — `pr-self-review`, which stays the broad pre-push gate.
- **doc-writer** documents the shipped work into the correct docs location; it can run at any
  point and only ever writes documentation (never product code or `INSIGHTS.md`).
- After all tasks merge, the normal `pr-self-review` skill + push hook gate the PR.

## Orchestrating economically (token discipline)

Delegation is not free. Every fresh subagent **cold-starts** — it re-reads CLAUDE.md, the
relevant `INSIGHTS.md`, and the template/target files before doing any work (often
~100K tokens) — and its **final report lands verbatim in the orchestrator's context** and
is re-sent on every subsequent turn. So the cost of a subagent is `cold-start + work +
report-carried-forward`, not just the work. Optimize against all three:

- **Don't spawn a cold agent for small work.** A task that is a handful of precisely-scoped
  edits (a config-value change, a one-line wiring, a doc tweak) is cheaper done **inline**
  than shipped to a fresh agent that must re-derive context first. Reserve agents for work
  that is genuinely large, or genuinely parallel.
- **Reuse a warm agent via `SendMessage`, don't respawn.** Follow-up fixes, re-reviews, and
  clarifications belong with the agent that already holds the context — send a security fix
  back to the **implementer that wrote the module**, a re-verification back to the
  **reviewer that raised the finding**. A new spawn pays the full cold-start again; a resume
  reuses the transcript.
- **Group tasks that share context or can't parallelize anyway.** If task B hard-depends on
  task A (B needs A's exports), one agent doing A→B warm beats two cold starts — you lose no
  wall-clock (B could never overlap A) and save one cold-start. Split into separate agents
  only when the work is truly independent **and** parallelism buys real time.
- **Ask for terse, structured returns.** A subagent's final message is carried in your
  context indefinitely, so verbosity there costs twice. Request "verdict + bulleted findings
  + `file:line`", not an essay. Reserve a full traceability matrix / long report for when
  that document *is* the deliverable, not for a routine green result.
- **Prefer fewer, broader research passes — or read directly.** For a feature that mirrors an
  existing pattern, one targeted researcher (or a few direct reads of the template + the
  thing you're extending) beats several overlapping cold researchers re-reading the same
  files. Use a **`fork`** for exploration whose raw tool-output you don't need to keep — a
  fork keeps its tool output out of the parent's context.
- **Match gate weight to risk.** Run the heavy read-only gate where risk lives (the
  architecture-reviewer earns its cost when it catches a real boundary/security defect); a
  gate that is pure formality on an already well-verified change can be lightened or skipped.

Rule of thumb: **the biggest token sink is rarely the code — it's cold restarts and verbose
reports.** Fewer cold agents, warm reuse via `SendMessage`, and terse structured returns are
the highest-leverage savings. (Consistent with why these are report-back **subagents**, not
an agent team — see the `implementer` design note below.)

## How skills map to agents

The **planner** prescribes, and each **implementer** invokes, skills by the **area** of
the files touched. This mirrors the Scope column of [`.claude/skills/README.md`](../skills/README.md)
and the `pr-self-review` skill:

| Area | Skills |
|---|---|
| **Backend** (`server/**`) | `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `onion-architecture` |
| **Frontend** (`client/**`) | `next-best-practices`, `react-best-practices`, `react-testing-library`, `client-project-structure` |
| **Full-stack** (any code change) | `security`, `zod`, `typescript-expert` |
| **Diagrams** (in the plan) | `mermaid-diagram` |

Every task uses its area set **plus** the full-stack trio. `.claude/skills/README.md` is
the source of truth for this map.

Both agents also **preload** these skills via a `skills:` field in their frontmatter, so
the skill content is in context from startup (the reliable "always apply" mechanism) — the
body's area table then decides which of them apply to the current task. The planner
preloads the full set (it must know every skill it might prescribe); the implementer
preloads the full implementation set (backend + frontend + full-stack trio + insights),
because a single implementer handles both UI and backend work. When you add a skill to
`.claude/skills/README.md`, add it to these `skills:` lists too.

## Insights (learning logs)

DevDigest keeps a per-package `INSIGHTS.md` (`server/`, `client/`, `reviewer-core/`,
`e2e/`) plus a root `INSIGHTS.md` for cross-cutting lessons. The agents use a **hybrid**
strategy:

- **planner** reads root + each touched package's `INSIGHTS.md` at planning time and folds
  relevant lessons into the affected task as explicit constraints.
- **implementer** reads only its **module-local** `INSIGHTS.md` on site (insights are many
  and local — reading the whole repo's logs would bloat context).
- The **implementer** can append a new lesson via the `engineering-insights` convention
  when it hits something non-obvious and durable. The **planner does not write to any
  `INSIGHTS.md`** — its writes are confined to the plans directory (`docs/plans/`), so it
  instead surfaces a lesson inside the plan file and flags it for the insights flow to append.

---

## Design basis & sources

The agents below are **not** built-in Claude Code templates — there is no official
"Planner" or "Implementer" archetype. They are composed from documented Claude Code
mechanisms (Plan mode, `permissionMode`, `isolation: worktree`, task contracts) and
Anthropic's published agent-engineering guidance. Sources below are the pages these
designs are traced to.

### `planner` — based on

- **Explore → Plan → Implement**: planning is a distinct read-only phase; ask for a
  detailed plan (files, functions, order) before coding.
  — *Claude Code best practices*, *sub-agents* (built-in Plan agent is read-only).
- **Self-contained specs**: a good plan names the files/interfaces involved, states what is
  out of scope, and ends with an end-to-end verification step.
  — *Claude Code best practices* ("Let Claude interview you").
- **Plan to a file, not the chat**: implementers start with fresh context and won't see the
  planner's reasoning, so the handoff must be a written artifact.
  — *sub-agents* (subagent context is fresh).
- **Upfront orchestration + per-task contracts**: define each worker's role, objective,
  output format, and file/tool boundaries before spawning — the top failure mode Anthropic
  observed in production was overlapping/duplicated work from under-specified tasks.
  — *Anthropic Engineering: Multi-agent research system*.
- **Orchestrator-workers pattern** for changes spanning many files.
  — *Anthropic Engineering: Building effective agents*.
- **Read-only by construction**: `permissionMode: plan`, no Edit/Write, minimum tools.
  — *sub-agents*.

Sources:
- https://code.claude.com/docs/en/best-practices
- https://code.claude.com/docs/en/sub-agents
- https://www.anthropic.com/engineering/multi-agent-research-system
- https://www.anthropic.com/engineering/building-effective-agents

### `implementer` — based on

- **Partition file ownership**: with no worktree isolation, parallel workers must not edit
  the same files — collision-freedom relies entirely on the planner assigning each task a
  disjoint set of files. (`isolation: worktree` is the alternative hard-isolation mechanism
  if you ever want it; we deliberately run in the active branch instead.)
  — *Claude Code agent-teams* (teams have no automatic file isolation); *sub-agents* (`isolation`).
- **Verify by running a check, not self-assessment**: run tests/build/lint, iterate until
  green, and show the output as evidence rather than asserting "done".
  — *Claude Code best practices*.
- **Writer ≠ Reviewer**: the same context shouldn't both write and fully grade the code, so
  the implementer's self-review is scoped to code correctness + green tests; the full
  `pr-self-review` gate runs separately in fresh context.
  — *Claude Code best practices* (adversarial/fresh-context review step).
- **Skills scoped by area, enforced as a hard rule**: skill activation can be scoped by file
  paths, and a hard requirement should be enforced rather than left to chance (a skill can
  stop influencing behavior).
  — *Claude Code skills*; *skill-authoring best practices*.
- **Subagents (report back), not agent teams**: chosen because implementers don't need to
  talk to each other mid-task, which is cheaper in tokens.
  — *Claude Code agent-teams* (comparison table).

Sources:
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/agent-teams
- https://code.claude.com/docs/en/best-practices
- https://code.claude.com/docs/en/skills
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- https://www.anthropic.com/engineering/multi-agent-research-system

### `test-writer` — based on

- **Behavior/contract over implementation**: derive expected values from the spec/contract,
  not by pasting current output — otherwise a generated test enshrines the current (possibly
  buggy) behavior forever.
  — *AI-generated-tests pitfalls* (davidadamojr, codeintelligently).
- **Mock only at designated seams; never over-mock**: coding-agent test generators commonly
  over-mock, producing tests that no longer exercise real behavior; mock the LLM/GitHub/git
  at `server/src/adapters/mocks.ts`, MSW/hook level on the client — never the subject under test.
  — *empirical study of agent-generated tests over-mocking* (arXiv 2602.00409).
- **Red→green with real output; never weaken a test to pass**: Claude tends to alter tests
  rather than fix implementation, so this is a hard rule; verify against the exact per-package
  command and show the output.
  — *Claude Code best practices*; *TDD-with-Claude guide*.
- **Writer ≠ evaluator**: Anthropic found agents grade their own work poorly, so the
  test-writer surfaces what it did/didn't cover instead of certifying sufficiency.
  — *Anthropic (agents can't evaluate their own work)*.

Sources:
- https://davidadamojr.com/ai-generated-tests-are-lying-to-you/
- https://arxiv.org/html/2602.00409v1
- https://github.com/FlorianBruniaux/claude-code-ultimate-guide/blob/main/guide/workflows/tdd-with-claude.md
- https://qaskills.sh/blog/reviewing-ai-generated-tests-checklist-2026

### `architecture-reviewer` — based on

- **Read-only reviewer, fresh context, writer ≠ reviewer**: a review agent gets read-only
  tools and a separate context from the code's author to cut false positives.
  — *Claude Code sub-agents*; *Anthropic advanced patterns (subagents)*.
- **Architectural governance as fitness functions**: encode the architecture decision (onion
  dependency rule, module boundaries) as the review's criteria; the same rules seed CI checks.
  — *architecture fitness functions / governance-at-AI-speed*.
- **Reviewer-prompt house style**: reuse the `docs/agent-prompts/` 8-section skeleton
  (Role → … → Severity CRITICAL|WARNING|SUGGESTION → Verdict → Findings discipline), cite
  real `file:line`, never invent findings, empty list ⇒ approve.
  — *`docs/agent-prompts/README.md`* (in-repo).
- **Narrow, not a second `pr-self-review`**: enforces only semantic architectural rules; the
  mechanical grep gates stay in `pr-self-review`.
  — *`.claude/skills/pr-self-review/SKILL.md`* (in-repo).

Sources:
- https://code.claude.com/docs/en/sub-agents
- https://aipatternbook.com/architecture-fitness-function
- https://www.infoq.com/articles/architectural-governance-ai-speed/
- https://claude.com/blog/subagents-in-claude-code

### `plan-verifier` — based on

- **Requirements traceability**: map each plan item (Task/Owns/Step/Verify/Shared-contract)
  to code evidence with an explicit PASS/PARTIAL/MISSING — a traceability matrix, not a
  quality review.
  — *Requirements Traceability Matrix*.
- **Acceptance criteria vs definition-of-done**: per-Task criteria are checked individually;
  the plan's end-to-end verification is the global definition-of-done.
  — *Acceptance Criteria vs Definition of Done*.
- **Evidence discipline / read-only**: "no evidence = MISSING," never assume; `permissionMode:
  plan`, no Edit/Write. Orthogonal to both the architecture-reviewer (quality) and
  `pr-self-review` (diff-vs-skills) — this axis is coverage only.
  — *Claude Code sub-agents*; *`.claude/agents/planner.md`* (the plan template it checks against).

Sources:
- https://stell-engineering.com/blog/requirements-traceability-matrix
- https://www.altexsoft.com/blog/acceptance-criteria-definition-of-done/
- https://code.claude.com/docs/en/sub-agents

### `doc-writer` — based on

- **Accuracy-to-code (anti-hallucination)**: cite real `file:line`, quote verbatim, never
  document an API/field not read in source — verified-reference generation.
  — *DocAgent (verified references)*; *doc-as-code / LLM-friendly docs*.
- **Diátaxis** for choosing the doc type (tutorial / how-to / reference / explanation) and
  documenting "why"/contracts rather than restating code.
  — *Diátaxis framework*.
- **Diagrams-as-code (mermaid), version-controlled, ≤20 nodes**: match the house diagram
  style; invoke the `mermaid-diagram` skill before drawing.
  — *mermaid architecture-diagram practice*; *`.claude/skills/mermaid-diagram`* (in-repo).
- **Docs ≠ INSIGHTS; docs-only write posture**: never write product code or any `INSIGHTS.md`
  (owned by the `engineering-insights` skill); link new docs into the relevant index.
  — *`.claude/skills/engineering-insights`* (in-repo).

Sources:
- https://diataxis.fr/
- https://arxiv.org/html/2504.08725v1
- https://www.mintlify.com/library/ai-hallucinations
- https://revision.app/blog/mermaid-architecture-diagram

### General subagent-authoring principles (both agents)

- `description` is load-bearing — write it as a trigger condition, in the third person.
- One subagent = one responsibility ("each subagent should excel at one specific task").
- Grant only the tools an agent needs; route model choice by task (Opus for reasoning-heavy
  planning, Sonnet as the balanced default for high-volume implementation).
- Check agents into version control.

Source: https://code.claude.com/docs/en/sub-agents

## Creating new agents

Add a `<name>.md` file here with frontmatter (`name`, `description`, `tools`, `model`) and a
system-prompt body. Keep `description` a trigger condition. Restrict `tools` to the minimum.
List the agent in the Catalog table above. If it depends on the skill map or INSIGHTS
convention, reference them rather than duplicating their content.
