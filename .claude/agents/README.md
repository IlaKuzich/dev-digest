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
| [spec-creator](spec-creator.md) | Specification (SDD) | opus | active branch (**spec-only writes**, hook-enforced) | Read, Grep, Glob, Edit, Write, Skill | Authors the **Spec** (*what & why*) before any planning: interviews the six categories, records every criterion in **EARS**, mines supplied design sources for gaps/corner cases/UX. Writes only `specs/` + `<pkg>/specs/`; never plans tasks or writes code |
| [implementation-planner](implementation-planner.md) | Implementation planning | opus | active branch (**plans-only writes**, hook-enforced) | Read, Grep, Glob, Edit, Write | Reviews the requirements (gaps + recommendations), asks multi-agent vs single-agent, then produces a structured **Implementation Plan** (task contracts) before any code is written. Never authors a spec |
| [implementer](implementer.md) | Implementation | sonnet | active branch (file-ownership discipline) | Read, Grep, Glob, Edit, Write, Bash, Skill | Executes ONE plan task; writes code + makes tests green |
| [test-writer](test-writer.md) | Test authoring | sonnet | ⛔ **DISABLED** (2026-07-17, cost) | Read, Grep, Glob, Edit, Write, Bash, Skill | Writes/extends tests across all packages (server unit + `*.it.test.ts`, client RTL, reviewer-core, e2e); verifies against real output; never weakens a test to pass. **Not currently invoked** — see [Current configuration](#current-configuration) |
| [architecture-reviewer](architecture-reviewer.md) | Read-only review | **sonnet** | `permissionMode: plan` (read-only) | Read, Grep, Glob, Bash, Skill | Semantic architecture review of a diff — onion dependency rule, DI/container, repo/tenancy/DTO, client colocation/RSC, cross-package boundaries |
| [plan-verifier](plan-verifier.md) | Read-only verification | **sonnet** | `permissionMode: plan` (read-only) | Read, Grep, Glob, Bash, Skill | Traces the chain **spec AC-N → plan Task → code → test**: whether the change satisfies the **Spec's** criteria (and breached no Non-goal) *and* delivered its **Implementation Plan**. Requirements traceability, not code quality |
| [doc-writer](doc-writer.md) | Documentation | sonnet | active branch (docs-only writes) | Read, Grep, Glob, Edit, Write, Bash, Skill | Turns shipped functionality / a plan / any input into a house-style doc with a mermaid diagram, placed in its correct repo location; never touches product code or `INSIGHTS.md` |

## Current configuration

The workflow below is the **design**. Three deviations are live as of **2026-07-17**, all
taken for token cost. They are choices, and each is reversible — do not read the rest of this
README as describing what runs today without them:

| Deviation | Effect | Revert |
|---|---|---|
| **`test-writer` is DISABLED** — its `description:` is neutered so nothing routes to it | Tests exist only where a plan Task's `Verify` command demands them. `plan-verifier` Mode B now reports untested behavior as PARTIAL **by design**; that list is the run's **test debt** and must be read | `test-writer.md` → "Re-enabling" |
| **`architecture-reviewer` → `sonnet`** | It checks a diff against four preloaded rule-sets — recognition, not open-ended design reasoning. Risk: a CRITICAL needing several hops | `model: opus` |
| **`plan-verifier` → `sonnet`** | Best-supported of the three: its axis is coverage, not quality, and it preloads no skills for that exact reason | `model: opus` |
| **Split invocation** — `spec-creator` and `implementation-planner` are run **by hand** | The `/implement` skill ([`.claude/skills/implement/`](../skills/implement/SKILL.md)) orchestrates only the build half: Mode A → implementers → architecture review + fix loop → Mode B → PR gate | — |

The load-bearing one is the first. Disabling `test-writer` is only safe while somebody reads
the PARTIAL list; the moment that stops, it has silently become a decision to ship untested
code.

## Intended workflow

```
researcher (optional) → spec-creator → implementation-planner → plan-verifier ── N × implementer → architecture-reviewer → test-writer → plan-verifier → pr-self-review → push/PR
   gather context        WHAT & WHY      requirements review      MODE A: gate    one task each,    read-only, semantic     write tests   MODE B: full     (broad gate)
       ↑                 Spec (EARS)     + Implementation Plan    spec ⇄ plan     disjoint files    boundary review        for the gaps   AC→code→test
       └── 🔎 ───────────┤ specs/*.md    HOW                      (no code yet)   (or 1 ×, single-        │
                         └── ❓ → you → the user                                   agent mode)            └── fixes → SendMessage to the WARM implementer that owns the file
                                                                 doc-writer — documents the shipped work (any time, docs-only)

  🔎 research needed → you run researcher, return findings via SendMessage (warm context)
  ❓ open question   → only a human decides; relay it, then SendMessage the answer back
  ⛔ implementation-planner REFUSES a spec that is still draft or has an open [NEEDS CLARIFICATION]
  ⛔ plan-verifier MODE A blocks implementers if any AC-N is unscheduled — re-plan, don't build
```

**Why this order** — each position is load-bearing, and two of them are counter-intuitive:

- **`plan-verifier` runs twice, in two different modes.** Mode A (spec ⇄ plan, two file reads,
  no `Bash`) gates the plan *before* anyone writes code: an `AC-N` the plan forgot to schedule
  is the workflow's most expensive defect, and catching it needs no code at all. Mode B (the
  full `AC-N → Task → code → test` trace) runs last. Mode B **cannot** move earlier: its rule
  "an AC with code but no test is PARTIAL" would mark everything PARTIAL before `test-writer`
  has run, producing a report that is noise.
- **`architecture-reviewer` runs BEFORE `test-writer`**, not after. It judges product code, not
  tests, so it loses nothing by running early — and it gains a lot: a CRITICAL finding ("resolve
  this adapter from the `Container` instead of `new`") changes the code's shape, and any test
  written against the old shape has to be rewritten. Review → fix → test is strictly cheaper
  than test → review → fix → re-test.

- **spec-creator** turns a feature idea into a **Spec** — the *what & why* — in
  `specs/<YYYY-MM-DD>-<slug>.md` (cross-module) or `<pkg>/specs/` (single-package). It
  interviews the **six categories** (problem · goals/non-goals · user stories · acceptance
  criteria · edge cases · non-functional), records every criterion in **EARS** so it is
  testable, and analyses the design sources the user supplies for uncovered states,
  cross-module gaps and UX improvements. It is the input `implementation-planner` consumes.
  - Like the planner it has no `AskUserQuestion` tool, so it runs in **two phases**: draft
    with `[NEEDS CLARIFICATION]` markers + questions returned in its report → relay them to
    the user → resume the **same** agent via `SendMessage` with the answers (warm context).
  - **It writes `Status: draft` and never raises it to `approved` — that flip is yours to
    make, and only after the user has read the spec and said yes.** `approved` is what
    unblocks `implementation-planner`, so it is the one gate between an unagreed requirement
    and shipped behavior; letting the spec's own author clear it makes the gate
    self-certified. And spec-creator is precisely the context that *cannot* clear it
    honestly: resolving every `[NEEDS CLARIFICATION]` proves it has no *known* open
    questions, and says nothing about the question it failed to think of. When it reports
    "draft, ready to ratify", show the spec to the user — do not flip the bit on the agent's
    say-so, which just relocates the self-certification to you.
  - Its report ends with **two separate, explicitly distinct channels** — route them
    differently:

    | Channel | Means | You do |
    |---|---|---|
    | `## ❓ Open questions` | Only a human can answer — a decision, preference, priority | Put it to the user |
    | `## 🔎 Research needed` | A fact exists somewhere; no decision required | Spawn `researcher`, return findings via `SendMessage` |

    spec-creator reads **this repo only** — no `WebSearch`/`WebFetch`, and it cannot spawn
    agents — so an external fact must come back through you. That is why `researcher` sits
    upstream of it in the diagram. **Never send an Open question to the researcher:** it will
    return a well-sourced answer to a question that was never factual, and the answer will
    read authoritative enough to bypass the user's decision entirely.
  - Before reporting it runs a **self-check** whose core is traceability *inside* the spec —
    user story → AC, edge case → AC, and every AC back to something actually asked for. Only
    spec-creator can make these checks (it alone sees stories, criteria, edge cases and the
    design source at once), and an AC tracing back to nothing is invented scope that will
    otherwise get built.
  - Its write scope is enforced by a **hook in its own frontmatter**
    (`.claude/hooks/spec-creator-write-scope.sh`), not by prompt discipline — and it has no
    `Bash`, so the hook cannot be routed around. The hook is agent-scoped, so it never
    constrains the other writers.
- **implementation-planner** reads the requirements + codebase + INSIGHTS, **reviews the
  requirements** (reports gaps, ambiguities, and recommendations for a better approach),
  asks the user whether to plan for a **multi-agent** parallel run or a **single-agent**
  pass, then writes `docs/plans/<feature>.md`. It plans *how* to build already-stated
  requirements — it never authors a spec, and it never invents a missing requirement
  (that goes to the clarification gate instead).
  - It has no `AskUserQuestion` tool, so its questions come back in its report; relay them
    to the user and resume the **same** agent via `SendMessage` with the answers (warm
    context, no cold restart).
- One **implementer** is spawned per task in multi-agent mode. Each works in the currently
  active branch, touching only the files its task owns (no worktree isolation —
  collision-freedom relies on the plan's disjoint file ownership), invokes the
  area-appropriate skills, and self-verifies by making its tests pass. It does **not** push
  or run the full PR gate. In single-agent mode one implementer executes the ordered tasks
  in one warm context.
- **test-writer** authors/extends the tests for the changed area (it shares the write posture
  and file-ownership discipline of the implementer; keep its owned test files disjoint from
  any parallel implementer's).
- **architecture-reviewer** judges the architectural soundness of the diff, read-only, and
  runs **before test-writer** so its findings reshape the code while no test depends on the
  old shape yet. Route each finding back to the **warm implementer that owns the file** via
  `SendMessage`, and the re-check back to the reviewer that raised it — never a fresh spawn
  for either.
- **plan-verifier** judges requirements coverage and runs **twice** — Mode A gates the plan
  before implementation, Mode B traces the finished change (see the diagram note above).
  Both complement — not replace — `pr-self-review`, which stays the broad pre-push gate.
  - **plan-verifier traces from the spec, not from the plan** — `AC-N → Task → code → test`.
    Checking only the code against the plan can find work that was scheduled and skipped, but
    never a requirement the plan **forgot to schedule**: the plan cannot report what it does
    not contain. So it reports gaps at two levels — *spec-level* (an AC no task covered, or a
    Non-goal that got built ⇒ the plan misread the spec, re-plan) and *plan-level* (a Task's
    Steps/Verify unmet ⇒ the implementation is incomplete).

### The fix loop (what happens when a gate reports a problem)

Every gate above can fail, and a gate whose failure path is undefined is not a gate. Route
each finding by **what kind of gap it is**, not by who found it:

| Finding | Who fixes it | Who re-checks |
|---|---|---|
| `architecture-reviewer` CRITICAL / WARNING | The **implementer that owns the file**, resumed via `SendMessage` | The **same** architecture-reviewer, via `SendMessage` |
| `plan-verifier` Mode B **plan-level** gap (a Task's Steps/Verify unmet) | The **implementer that owns that Task**, resumed via `SendMessage` | The same plan-verifier, via `SendMessage` |
| `plan-verifier` Mode B **spec-level** gap (an `AC-N` no Task covered) | **Nobody — re-plan.** Back to `implementation-planner` (warm) to add the Task, then spawn an implementer for it | plan-verifier Mode A on the amended plan, then Mode B again |
| `plan-verifier` Mode A: an unscheduled `AC-N` | `implementation-planner`, warm, before any implementer spawns | plan-verifier Mode A again |
| An `AC-N` with code but no test (PARTIAL) | `test-writer`, via its TT-task | plan-verifier Mode B |
| A criterion that turns out to be wrong / unbuildable | **The user.** A new spec that `Supersedes:` the old one — never an edit in place | The chain, from the top |

Three rules make the loop terminate and stay honest:

- **Fix goes to the owner; re-check goes to the finder.** Both are `SendMessage` to a warm
  agent, never a fresh spawn. The implementer that wrote the module already holds its
  context; the reviewer that raised the finding already knows what it was looking for and
  will not re-derive a different opinion. A cold respawn pays the full cold start to arrive
  at a worse answer.
- **A spec-level gap is not a coding task.** It is tempting to hand "AC-3 is missing" to an
  implementer and move on. Don't: no Task owns those files, so the implementer either works
  unowned or reaches into someone else's `Owns`, and the plan stays permanently out of sync
  with the code. Re-plan first — it is one warm round trip.
- **Bound the loop.** If the same finding survives two fix attempts, stop and put it to the
  user. A gate that keeps failing usually means the requirement is wrong, not the code — and
  that is the one thing no agent in this chain is allowed to decide.

### The spec → plan → code chain (four enforcement points)

Requirements survive from spec to code only because four separate gates refuse to paper
over a gap. Each guards a different way the chain silently breaks:

| Point | Agent | Rule |
|---|---|---|
| Question → guess | `spec-creator` | Never guesses; unresolved requirements become `[NEEDS CLARIFICATION]` and go back to the user |
| `draft` → `approved` | **a human** (via you) | `spec-creator` writes `draft` and **never** raises it. Only the user's explicit yes flips the bit — you make the edit |
| `draft` → plan | `implementation-planner` | **Refuses to plan** a spec that is `draft` or has an open `[NEEDS CLARIFICATION]`; every `AC-N` must appear in the plan's `## Criteria coverage` table mapped to a task |
| Plan → code | `plan-verifier` **Mode A** | Fresh eyes on that `## Criteria coverage` table **before** implementers spawn — the planner cannot catch an AC its own plan dropped |
| Code → merge | `plan-verifier` **Mode B** | Every `AC-N` must reach code **and a test**; an AC with code but no test is PARTIAL |

The third row exists because the second is **self-graded**: the planner both builds the
coverage table and checks it. A dropped `AC-N` is invisible from inside that context, and by
the time Mode B sees it, N implementers have already built the wrong scope.

The load-bearing convention that ties them together: **`AC-N` IDs are permanent**. The plan's
`Criteria coverage` table, each Task's `Satisfies:` field, and the verifier's matrix all cite
them, so a renumbered or repurposed criterion re-points every reference at a requirement that
changed underneath it — while the traceability still looks intact. Changing an agreed
criterion means a **new spec that `Supersedes:` the old one**, never an edit in place (see
[`specs/README.md`](../../specs/README.md)).
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

The **implementation-planner** prescribes, and each **implementer** invokes, skills by the **area** of
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

**spec-creator is deliberately outside this map.** It preloads only `security` (the
`Untrusted inputs` + security-Non-functional sections are judgements it must make unprompted)
and `mermaid-diagram` (the `Contracts & flows` section). Loading the backend/frontend
implementation skills would pull a *what & why* document toward *how* — the one failure mode
the spec/plan split exists to prevent.

### What to preload, and what not to

An agent can **preload** skills via a `skills:` field in its frontmatter, putting the skill's
content in context from startup — the reliable "always apply" mechanism. It is not free: the
thirteen implementation skills are ~21K tokens, paid on every cold start, and re-sent every
turn. So preload by this principle:

> **Preload where a skill governs what the agent WRITES. Do not preload where the agent only
> reasons about the skill's name.**

| Agent | Preloads | Why |
|---|---|---|
| `implementer` | backend + frontend + full-stack trio + insights | It writes code in any area; the skills are the rules it writes by. Its body's area table decides which apply to the task at hand |
| `test-writer` | `react-testing-library`, trio, insights | Same — it writes tests by these rules. Framework skills are excluded: it tests existing code, it does not author routes/services |
| `architecture-reviewer` | `onion-architecture`, `client-project-structure`, `typescript-expert`, `security` | These skills **are** the rule-set it enforces — its findings cite them by section |
| `implementation-planner` | the full set (13) | The exception to the principle, taken deliberately. It only *prescribes* these skills by name, so the principle says not to preload — but a plan that prescribes the wrong set silently loses that practice in **every** task built from it, and the ~21K is paid once per feature, against N implementers who each pay it anyway |
| `plan-verifier` | **none** | Its axis is coverage, not quality; its own prompt forbids a quality issue from changing a verdict. Preloading quality rule-sets bought only side-notes it may not act on |
| `spec-creator` | `security`, `mermaid-diagram` | See below — the implementation skills would pull a *what & why* document toward *how* |

When you add a skill to `.claude/skills/README.md`, add it to the `skills:` list of every
agent that **writes by** it — not to every agent that might mention it.

## Insights (learning logs)

DevDigest keeps a per-package `INSIGHTS.md` (`server/`, `client/`, `reviewer-core/`,
`e2e/`) plus a root `INSIGHTS.md` for cross-cutting lessons. The agents use a **hybrid**
strategy:

- **spec-creator** reads root + each touched package's `INSIGHTS.md` while specifying, and
  folds a relevant lesson into the spec as an **edge case or acceptance criterion** — a
  documented rake the spec walks into is a defect in the spec, not a surprise for the
  implementer. Its write scope excludes every `INSIGHTS.md`, so a new lesson goes out in its
  report instead.
- **implementation-planner** reads root + each touched package's `INSIGHTS.md` at planning
  time and folds relevant lessons into the affected task as explicit constraints.
- **implementer** reads only its **module-local** `INSIGHTS.md` on site (insights are many
  and local — reading the whole repo's logs would bloat context).
- The **implementer** can append a new lesson via the `engineering-insights` convention
  when it hits something non-obvious and durable. The **implementation-planner does not
  write to any `INSIGHTS.md`** — its writes are confined to the plans directory (`docs/plans/`), so it
  instead surfaces a lesson inside the plan file and flags it for the insights flow to append.

---

## Design basis & sources

The agents below are **not** built-in Claude Code templates — there is no official
"Planner" or "Implementer" archetype. They are composed from documented Claude Code
mechanisms (Plan mode, `permissionMode`, `isolation: worktree`, task contracts) and
Anthropic's published agent-engineering guidance. Sources below are the pages these
designs are traced to.

### `spec-creator` — based on

- **EARS (Easy Approach to Requirements Syntax)**: five patterns — ubiquitous /
  `WHEN` / `WHILE` / `IF…THEN` / `WHERE`, all with `SHALL` — so every criterion collapses to
  one testable statement with no ambiguity about trigger, state, or response. Devised by
  Alistair Mavin at Rolls-Royce (IEEE RE'09); the syntax is the easy half — the agent's real
  job is translating a vague verb into a concrete trigger + observable response.
  — *Mavin et al., "Easy Approach to Requirements Syntax"*.
- **Spec-Driven Development**: the spec is the durable artifact and the plan's input;
  requirements (*what/why*) are authored separately from the plan (*how*), and ambiguity is
  marked explicitly rather than resolved by guessing.
  — *GitHub spec-kit* (`[NEEDS CLARIFICATION]` marker convention).
- **One subagent = one responsibility**: specification (*what/why*) is split from planning
  (*how*) — mirrored by `implementation-planner`, which never authors a spec. A spec that
  specifies implementation silently takes the design decision away from the planner.
  — *Claude Code sub-agents*.
- **Interview before specifying; never guess**: surface ambiguities and let the requester
  resolve them. A guessed requirement is indistinguishable from an agreed one once written,
  and it propagates through plan → code before any human reads it.
  — *Claude Code best practices* ("Let Claude interview you").
- **Hook-enforced write scope, agent-scoped**: hooks declared in an agent's own frontmatter
  run only while that agent is active and are torn down when it finishes — the mechanism
  that lets one agent be confined without gagging the others. A session-wide
  `permissions.deny` cannot express this: subagents inherit deny rules unconditionally and
  cannot override them, so it would block `implementer` too. `Bash` is withheld deliberately
  — a `PreToolUse(Write|Edit)` gate is decorative if the agent can `echo > file`.
  — *Claude Code sub-agents* (frontmatter `hooks:`); *Claude Code hooks* (`PreToolUse`, exit 2 = deny).
- **Untrusted design sources as data, not instructions**: mockups and pasted design text are
  third-party content; the agent treats them as data it describes, never as directives.
  — *`.claude/skills/security`* (in-repo); mirrors the spec template's own `Untrusted inputs` section.
- **Insights as requirements input**: root + per-package `INSIGHTS.md` record rakes the
  project already stepped on — a spec that walks into a documented failure is defective, so
  relevant lessons become edge cases or criteria.
  — *`.claude/skills/engineering-insights`* (in-repo).

Sources:
- https://alistairmavin.com/ears/
- https://github.com/github/spec-kit
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/best-practices

### `implementation-planner` — based on

- **Explore → Plan → Implement**: planning is a distinct read-only phase; ask for a
  detailed plan (files, functions, order) before coding.
  — *Claude Code best practices*, *sub-agents* (built-in Plan agent is read-only).
- **Interview before planning; don't guess**: surface ambiguities and let the requester
  resolve them rather than inventing requirements — a planner that specifies is a planner
  that builds the wrong thing confidently.
  — *Claude Code best practices* ("Let Claude interview you").
- **One subagent = one responsibility**: planning (*how*) is separated from specification
  (*what/why*); the plan cites a requirements source it does not own.
  — *Claude Code sub-agents*.
- **Self-contained specs**: a good plan names the files/interfaces involved, states what is
  out of scope, and ends with an end-to-end verification step.
  — *Claude Code best practices* ("Let Claude interview you").
- **Plan to a file, not the chat**: implementers start with fresh context and won't see the
  planner's reasoning, so the handoff must be a written artifact.
  — *sub-agents* (subagent context is fresh).
- **Hook-enforced write scope, agent-scoped** (replaced `permissionMode: plan`): the real
  rule is "one directory", not "no writes at all". `permissionMode: plan` could only express
  the blunt version, which forced the planner to author its plan through chunked `Bash`
  heredocs — the plan's whole text passing through context as shell commands, with a
  truncation risk at every chunk boundary. A `PreToolUse(Write|Edit)` hook in the agent's own
  frontmatter states the rule exactly and lets the plan be written with `Write`. `Bash` is
  withheld, as with spec-creator, so the gate cannot be routed around via `echo > file` — and
  so the planner structurally cannot run a test it is only supposed to prescribe.
  — *Claude Code sub-agents* (frontmatter `hooks:`); *Claude Code hooks* (`PreToolUse`, exit 2 = deny).
- **Upfront orchestration + per-task contracts**: define each worker's role, objective,
  output format, and file/tool boundaries before spawning — the top failure mode Anthropic
  observed in production was overlapping/duplicated work from under-specified tasks.
  — *Anthropic Engineering: Multi-agent research system*.
- **Orchestrator-workers pattern** for changes spanning many files.
  — *Anthropic Engineering: Building effective agents*.
- **Minimum tools**: no `Bash`, and writes confined to the plans directory by hook.
  — *sub-agents*.

Sources:
- https://code.claude.com/docs/en/best-practices
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/hooks
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

- **Requirements traceability**: map each item to code evidence with an explicit
  PASS/PARTIAL/MISSING — a traceability matrix, not a quality review.
  — *Requirements Traceability Matrix*.
- **Trace from the requirement, not from the plan**: an RTM is anchored at the *requirement*
  (spec `AC-N`), forward through design (plan Task) to implementation and test. Anchoring it
  at the plan instead only proves the plan was executed — it is structurally blind to a
  requirement the plan never scheduled, because the artifact being checked is also the one
  that dropped it. Hence `AC-N → Task → code → test`, with permanent AC IDs as the join key.
  — *Requirements Traceability Matrix* (bidirectional tracing).
- **Acceptance criteria vs definition-of-done**: per-Task criteria are checked individually;
  the plan's end-to-end verification is the global definition-of-done.
  — *Acceptance Criteria vs Definition of Done*.
- **Evidence discipline / read-only**: "no evidence = MISSING," never assume; `permissionMode:
  plan`, no Edit/Write. Orthogonal to both the architecture-reviewer (quality) and
  `pr-self-review` (diff-vs-skills) — this axis is coverage only.
  — *Claude Code sub-agents*; *`.claude/agents/implementation-planner.md`* (the plan template it checks against).

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
