---
name: workflow-retro
description: MANUAL ONLY — invoke this skill exclusively when the user explicitly types /workflow-retro. NEVER auto-invoke it, never chain into it at the end of a run, and never trigger it from a hook or from another skill — not even after an expensive, surprising, or novel multi-agent chain finishes. When it runs, it reviews HOW a multi-agent run went: it reads the run's own transcripts to report exact token spend, cost, agent roster, spawn order and parallelism, cold-spawn-vs-warm-reuse, duplicated work, and file-ownership breaches; then judges the run against the rules in `.claude/agents/README.md` and writes a dated report to `docs/agent-runs/`. It grades the WORKFLOW, not the code — `engineering-insights` owns lessons about the code.
---

# /workflow-retro — grade the run, not the code

> **Manual only.** This skill runs *only* when the user explicitly types `/workflow-retro`.
> Never invoke it automatically — not from a hook, not from the end of an `/implement` run, not
> because a chain looked expensive or novel. It costs real tokens to produce a document nobody
> may read; the decision to spend them is the user's, every time.

You are reviewing **how a multi-agent run executed**: what it cost, which agents ran in what
order, where it duplicated work, and where it departed from the design in
[`.claude/agents/README.md`](../../agents/README.md). The code the run produced is not your
subject — `architecture-reviewer` and `plan-verifier` already judged that, during the run.

**Read `.claude/agents/README.md` before judging anything.** It owns the token-discipline
rules, the fix-loop routing table, and the four enforcement points. This skill measures a run
against that document; where the two disagree, the README wins and this file is the thing to
fix.

## The one rule that makes this skill worth running

**Every number comes from the transcript. You never estimate one from memory.**

An orchestrator asked "how did that run go?" will confabulate plausible token counts, invent a
spawn order, and forget the agent it cold-started an hour ago — and the answer will read
authoritative. The whole point of this skill is that Claude Code already wrote down what
happened, exactly, in `~/.claude/projects/<slug>/`. So:

```bash
node .claude/skills/workflow-retro/scripts/collect.mjs            # newest run with subagents
node .claude/skills/workflow-retro/scripts/collect.mjs --list     # pick a different one
node .claude/skills/workflow-retro/scripts/collect.mjs --session <id>
```

**Run it first, before you write a word.** It parses the orchestrator transcript plus every
`subagents/*.jsonl` — several MB of JSON that would cost more to read into context than the
run itself did — and returns one compact table. The script does the counting; you do the
judgement. Those are different jobs and the split is the design.

If the script and your recollection disagree, **the script is right.** Say so in the report
rather than quietly averaging the two.

### What it gives you, and what each number is worth

| Section | Trust it for |
|---|---|
| Tokens / cost | Tokens are **exact**. Cost is an **estimate** — list prices, 1h-TTL cache-write multiplier, Sonnet 5 intro pricing ignored. Treat it as an upper bound and never quote it to the cent |
| Agent roster | Exact: type, model, task, wall-clock, turns, tool histogram, `⛔stopped` if the user killed it |
| Execution shape | Waves are derived from **overlapping timestamps** — real parallelism, not intended parallelism |
| Warm resumes | Exact: every `SendMessage`, who it went to, and what it said |
| Concurrent writes | Two agents wrote one file **while both ran** — file ownership genuinely broke |
| Sequential hand-offs | Same file, non-overlapping agents — *not* a collision. Usually a cold re-spawn where a `SendMessage` would have done |
| Duplicate reads | Each repeated read is a cold start re-deriving context another agent already had |

---

## Phase 1 — Collect

Run the script. Confirm it picked the run you meant (it defaults to the newest session that
spawned at least one subagent — not necessarily the one you just finished). If the run spanned
two sessions, collect both and say so; do not silently report half of it.

## Phase 2 — Judge

Now the part the script cannot do. Walk the run against the README's rules and answer each
question with **evidence from the table**, not from impression:

| Question | The evidence is |
|---|---|
| Did every fix go to the **owner** of the file? | A "sequential hand-off" whose later agent is a fresh spawn = no. That is the README's central rule, and it is the most common breach |
| Did every re-check go to the **finder**? | A second reviewer of the same type, cold-spawned, instead of a `SendMessage` resume |
| Was the fix loop **bounded**? | More than two passes over the same finding ⇒ the requirement was wrong and should have gone to the user |
| Was file ownership **disjoint**? | Any concurrent write. With no worktree isolation this is the only thing preventing lost edits |
| Was parallelism **real**? | Agents in one wave that hard-depend on each other bought no wall-clock and paid N cold starts |
| Was any agent **too small to spawn**? | A short, few-turn agent whose whole job was a config tweak — cheaper inline |
| Did the **gates** run? | Mode A before the implementers; architecture review before Mode B; `pr-self-review` last |
| Was **model choice** right? | An opus agent doing recognition work, or a sonnet agent that produced shallow findings a later gate caught |

Then find the money. Rank agents by cost and ask what the top two bought. The README's rule of
thumb — *the biggest sink is rarely the code; it's cold restarts and verbose reports* — is a
claim this data can confirm or refute. **If the data refutes it, say so.** A retro that only
ever confirms the existing doctrine is not measuring anything.

### Two traps

- **Duplicate reads are not automatically waste.** Three researchers reading `INSIGHTS.md` is
  the system working — each needs it and none can borrow another's context. The waste is
  *overlapping scope*: two agents reading the same twenty files to answer near-identical
  questions. Judge the pattern, not the count.
- **A cheap run is not automatically a good run.** If a gate was skipped, the tokens it saved
  are not a saving — they are a deferred defect. Cost only reads as a win next to what the run
  actually delivered.

## Phase 3 — Report

Write `docs/agent-runs/<YYYY-MM-DD>-<slug>.md`:

```markdown
# Run retro — <feature> (<date>)

**Verdict:** <one sentence: did the chain work, and what did it cost?>

## What ran
<the script's roster + execution-shape sections, verbatim — this is the evidence>

## Where the run departed from the design
<each breach: what the README says, what happened, what it cost. Cite agent #s.>

## Where the design itself was wrong
<rules the run shows are mis-specified — see below. Often empty; never skip the heading.>

## Worth changing before the next run
<concrete, ranked, each tied to a number above>
```

Then add one line to `docs/agent-runs/README.md` (create it with a `# Agent runs` heading if
absent): `- [<date> — <feature>](<file>) — N agents, <tokens>, ~$<cost>, <verdict in 5 words>`.
That ledger is the point of keeping these: one run's cost is trivia, but six runs' costs show
a trend, and a rule breached in five consecutive retros is a broken rule, not five mistakes.

**The third heading is the one that earns this skill.** Every other section grades the run
against the design. That one grades *the design* — and it is the only section a subagent inside
the run structurally could not write, because none of them can see the whole chain. If three
retros running show implementers cold-spawned for fixes, the routing rule is not being
ignored; it is too hard to follow, and the README needs fixing.

### 🚦 GATE — report, don't act

**Stop at the report.** Do not edit `.claude/agents/README.md`, rewrite an agent, or retune a
model on the strength of one retro. Recommend it and let the user decide — a workflow change
made from a single data point is how a fluke becomes doctrine.

## Phase 4 — Boundary with `engineering-insights`

Both skills capture lessons; they are about different things, and the split is what keeps
`INSIGHTS.md` readable:

| Lesson is about | Goes to | Example |
|---|---|---|
| The **code** — a pattern, a dead end, a library quirk | `engineering-insights` → the module's `INSIGHTS.md` | "`Promise.all()` in `ingest.ts:42` times out past 30 items" |
| The **chain** — agents, routing, cost, gates | **this skill** → `docs/agent-runs/` | "Cold-spawning the fix implementer cost $5 and re-read 10 files the owner had open" |

If the run surfaced a code lesson, **do not write it here** — hand it to
`engineering-insights`, which owns every `INSIGHTS.md` and is append-only. And do not invoke
this skill *instead* of that one at session end: they are not substitutes, and root `CLAUDE.md`
requires the insights step regardless.

## When NOT to run this

This skill costs real tokens to produce a document nobody may read. Skip it for a single-agent
session, a two-agent run that went exactly as planned, or a re-run of a chain you retro'd last
week with no changes. Run it when the run was **expensive, surprising, or novel** — a new
agent, a changed model, a first outing for a workflow, or a chain that visibly thrashed. The
ledger is worth more with six honest entries than with thirty perfunctory ones.
