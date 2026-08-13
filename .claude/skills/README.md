# Skills

Reusable AI skills that provide specialized knowledge and workflows. Canonical location is `.claude/skills/` with a symlink at `.cursor/skills/ → ../.claude/skills` for Cursor compatibility. Shared with the team via version control.

## Catalog

| Skill | Scope | Description |
|-------|-------|-------------|
| [fastify-best-practices](fastify-best-practices/SKILL.md) | Backend | Fastify routes, plugins, JSON-schema validation, error handling |
| [drizzle-orm-patterns](drizzle-orm-patterns/SKILL.md) | Backend | Drizzle schema, queries, relations, transactions, migrations |
| [postgresql-table-design](postgresql-table-design/SKILL.md) | Backend | Postgres schema design, data types, indexing, constraints |
| [next-best-practices](next-best-practices/SKILL.md) | Frontend | Next.js App Router, RSC boundaries, data fetching, optimization |
| [react-best-practices](react-best-practices/SKILL.md) | Frontend | React anti-patterns, state management, hooks rules |
| [react-testing-library](react-testing-library/SKILL.md) | Frontend | General-purpose React Testing Library guide with Vitest |
| [zod](zod/SKILL.md) | Full-stack | Zod schema validation, parsing, error handling, type inference |
| [typescript-expert](typescript-expert/SKILL.md) | Full-stack | Type-level programming, performance, tooling, migrations |
| [security](security/SKILL.md) | Full-stack | OWASP Top 10:2025, auth, injection, uploads, secrets |
| [mermaid-diagram](mermaid-diagram/SKILL.md) | Shared | Mermaid diagrams in markdown (flowcharts, sequence, ERD, …) |
| [pr-self-review](pr-self-review/SKILL.md) | Workflow | Pre-push self-review: routes the open diff through the domain skills + project rules, gates `git push`/`gh pr create` |
| [engineering-insights](engineering-insights/SKILL.md) | Workflow | Captures a session's non-obvious lessons into the touched module's append-only `INSIGHTS.md` — lessons about the **code** |
| [workflow-retro](workflow-retro/SKILL.md) | Workflow | Grades a finished multi-agent run (`/workflow-retro`): parses the run's own transcripts for exact tokens, cost, roster, spawn order, warm-vs-cold reuse and duplicated work, judges it against the agents README, and reports to `docs/agent-runs/` — lessons about the **chain** |
| [implement](implement/SKILL.md) | Orchestration | Executes an already-approved spec + already-written plan (`/implement`): Mode A gate → implementers → architecture review + bounded fix loop → Mode B trace → PR gate. `spec-creator` and `implementation-planner` are run **manually**, before it. **Never preloaded into an agent** — see below |
| [design-assets](design-assets/SKILL.md) | Workflow | Places a spec's **design reference** files (mockups, screenshots, design PDFs) into its sibling `specs/assets/<spec-id>/` folder (`/design-assets`), so `implementation-planner` and `implementer` can open them cold. Run in the **orchestrator session** — `spec-creator` cannot copy binaries by design, so the copy is routed around it to keep its write barrier real. Design references only. **Never preloaded into an agent** |

### A note on the Scope column

The **Backend / Frontend / Full-stack** rows are the source of truth for the skill→area map
that `implementation-planner` prescribes from and every `implementer` invokes — see
[`.claude/agents/README.md`](../agents/README.md), "How skills map to agents". Adding a row
there is what puts a practice into that map.

**Workflow** and **Orchestration** are deliberately outside it:

- **Workflow** skills run at a point in the process (`pr-self-review` before a push,
  `engineering-insights` when wrapping up, `workflow-retro` after a multi-agent chain
  finishes), not per file area. `engineering-insights` and `workflow-retro` are complementary,
  not alternatives: the first records what the session learned about the **code**, the second
  what it learned about the **agent chain**. Neither substitutes for the other, and
  `workflow-retro` never writes to any `INSIGHTS.md`.
- **Orchestration** — currently only `implement` — describes how the *agents* are routed. It
  must **never** appear in an agent's `skills:` frontmatter. The rule in the agents README is
  "preload a skill into every agent that **writes by** it"; no agent writes by `implement`,
  and preloading it would hand a worker the instructions for running the whole chain,
  spawning agents included. It belongs to the top-level context only.

Note that `react-testing-library` is currently preloaded only by `test-writer`, which is
**disabled** (see `.claude/agents/test-writer.md` → "Re-enabling"). The skill stays listed
and correct; nothing loads it right now.

## What Are Skills?

Skills are modular packages that extend the AI agent with specialized knowledge and workflows. Unlike rules (always applied) or agents (invoked for specific tasks), skills are loaded on-demand when the agent determines they're relevant.

### Skills vs Rules vs Commands vs Agents

| Type | Scope | Loaded | Purpose |
|------|-------|--------|---------|
| **Rules** (`.mdc`) | Project conventions | Always or by file pattern | Persistent guardrails |
| **Commands** (`.md`) | User actions | On `/command` invocation | Slash commands |
| **Skills** (`.md`) | Domain knowledge | On-demand by agent | Specialized knowledge |
| **Agents** (`.md`) | Workflows | Via Task tool | Subagent orchestration |

## Creating New Skills

Each skill has:

- `SKILL.md` — Main skill file with rules and conventions (required)
- `examples.md` — Code examples showing good/bad patterns (recommended)
- `references.md` — Sources and rationale (optional)
