# Run retro — Export to CI (2026-08-25)

**Verdict:** The chain worked — Mode A gated before implementers, all 6 fixes (5 architecture/typecheck
ones plus a CRITICAL security bypass caught by `pr-self-review`) went to the warm owning implementer via
`SendMessage` and every re-check to the finder, and the loop stayed bounded — at **266.6M tokens / ~$188
est.** over a session spanning two calendar days; the one real ownership breach is, for the **third
consecutive retro**, the same unfixed `client/INSIGHTS.md` concurrent-write gap that the first two retros
already named and recommended a specific fix for.

> Cost is the script's estimate (list prices, 2× 1h-cache-write multiplier, Sonnet 5 intro pricing
> ignored) — treat as an upper bound. Token counts are exact.

## What ran

Session `b8e2d4b4` · Window 05:21–05:31 UTC, 2026-08-25 (session spans ~2 calendar days of elapsed
time — human latency between waves, not agent compute) · 11 cold spawns, 12 warm resumes.

| # | Agent | Model | Task | Start | Min | Turns | Tokens | Cost | Resumes | Tools |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | fork | sonnet-5 | Survey existing CI export groundwork | 05:22 | 1.9 | 17 | 1.3M | $0.69 | — | Bash:6 Agent:1 AskUserQuestion:1 |
| 2 | spec-creator | opus-4-8 | Write Export-to-CI spec | 05:30 | 1328.0 | 114 | 15.8M | $22.35 | 4 | Read:23 Edit:19 Glob:7 Grep:6 Write:2 |
| 3 | general-purpose | sonnet-5 | Correct source='ci' false alarm | 05:34 | 2.2 | 34 | 1.4M | $1.14 | — | Bash:16 |
| 4 | implementation-planner | opus-4-8 | Plan Export-to-CI implementation | 03:51 | 18.9 | 117 | 22.6M | $28.61 | 1 | Read:34 Edit:12 Grep:10 Glob:8 Write:1 |
| 5 | plan-verifier | sonnet-5 | Plan gate Mode A for export-to-ci | 04:13 | 0.7 | 5 | 181K | $0.89 | — | Read:2 |
| 6 | implementer | sonnet-5 | T1: workflow_yml contract + server re-lint | 04:14 | 1486.1 | 101 | 17.4M | $15.87 | 1 | Read:21 Bash:20 Edit:14 Write:1 Skill:1 |
| 7 | implementer | sonnet-5 | T2: client CI foundation (hooks, i18n, YAML editor) | 04:20 | 56.5 | 86 | 11.5M | $8.57 | 1 | Bash:21 Read:12 Edit:7 Write:5 |
| 8 | implementer | sonnet-5 | T3: Export Wizard + agent CI tab | 04:27 | 37.0 | 276 | 68.2M | $32.69 | 1 | Read:63 Bash:59 Edit:24 Write:18 |
| 9 | implementer | sonnet-5 | T4: CI Runs page + GLOBAL nav | 04:27 | 37.9 | 180 | 35.8M | $22.37 | 2 | Bash:44 Read:41 Edit:11 Write:10 Skill:1 |
| 10 | architecture-reviewer | sonnet-5 | Architecture review of Export-to-CI diff | 04:56 | 9.8 | 86 | 7.0M | $6.64 | 1 | Bash:33 Read:21 |
| 11 | plan-verifier | sonnet-5 | Full trace Mode B for export-to-ci | 05:06 | 11.4 | 138 | 18.2M | $10.79 | 1 | Bash:53 Read:32 |

**Execution shape (real, timestamp-overlap):**
- Wave 1 (05:22): fork — cheap, right-sized exploration whose raw tool output correctly stayed out of
  the orchestrator's context.
- Wave 2 (05:30→next day): spec-creator ∥ general-purpose — the ~22h span is calendar time between the
  spec's 4 warm resumes (clarifications resolved async), not continuous compute.
- Wave 3: implementation-planner, warm-resumed once to fold TT1 and apply 3 decisions.
- Wave 4: plan-verifier Mode A — 0.7 min, 2 reads, exactly as designed (gate before any code).
- Wave 5 (04:14–05:00-ish, 6 in overlap): T1–T4 implementers, architecture-reviewer, plan-verifier Mode
  B. #6 (T1, this task)'s 1486.1-minute span is likewise calendar time — it includes the gap until its
  05:22 warm resume for the CRITICAL security fix, not continuous work.

**Warm resumes (12 total, all → a warm owner/finder, zero cold respawns for a fix):**
- 4 → spec-creator: false-alarm correction, new mockup, upstream spec found, all 4 open questions
  resolved.
- 1 → implementation-planner: finalize plan.
- 1 → implementer (T4): fix command palette listing disabled nav items.
- 2 → implementer (T4, then T3 or T2): extract shared relative-time helper / switch to it — one
  architecture-reviewer WARNING, fixed across the two files that needed it.
- 1 → architecture-reviewer: re-check the relative-time dedup fix.
- 1 → implementer (T2, yaml-editor): fix client typecheck errors in `lint.ts`.
- 1 → plan-verifier: re-check the yaml-editor typecheck fix.
- 1 → implementer (T1, this task): **CRITICAL — fix a job-level `permissions:` escalation bypass in the
  AC-48 server re-lint**, found by `pr-self-review` (not a subagent in this roster — it runs as an
  orchestrator-invoked skill). The fix landed in one pass: `checkPermissions` was rewritten to validate
  every `permissions:` occurrence in the file (not just the first), a regression test was added
  reproducing the exact bypass, and the coordinator's literal repro input was independently re-verified
  outside the test suite to return `ok:false`. **Caveat:** this retro was collected while that fix's
  own re-check (presumably a `pr-self-review` re-run) had not yet landed in the transcript — the loop
  is closed on my side, not yet confirmed closed by the finder.

## Where the run departed from the design

- **Concurrent write to `client/INSIGHTS.md` — #7 (T2), #8 (T3), #9 (T4), all three running.** This is
  the **third consecutive retro** to hit this exact failure mode (see `2026-07-17-project-context.md`
  and `2026-07-28-eval-pipeline.md`, both titled "INSIGHTS ownership gap"). Root cause, unchanged since
  the first occurrence: no task's `Owns` list contains `INSIGHTS.md` — it is written via the
  `engineering-insights` convention that every `implementer` preloads and acts on independently, so any
  N same-package implementers running in the same wave write it concurrently with no serialization.
  Verified this run's contradiction is still live in the source, not just in the retro's memory:
  `implementer.md:22,138-140` still preloads `engineering-insights` and instructs a direct append, while
  `implement/SKILL.md:202,211` still claims *"Agents in this chain are barred from writing `INSIGHTS.md`
  themselves"* — a claim this very run falsified again (I, implementer #6/T1, appended to
  `server/INSIGHTS.md` directly, twice). See "Where the design itself was wrong" below — this is the
  same unfixed design gap, not a new implementer mistake, and it has now survived two explicit prior
  recommendations naming the exact fix.

- **`architecture-reviewer` (#10) started at 04:56, while T3 (#8, 04:27–05:04) and T4 (#9, 04:27–05:05)
  were still inside their active windows** — a genuine timestamp overlap, not the fix-loop-driven false
  overlap the 2026-07-17 retro warned `collect.mjs` can manufacture (there is no fix-loop activity
  driving #8/#9 at that point; both are still on their first pass). This means the review may have begun
  reading the diff 8–9 minutes before the two client tasks finished writing it. The design intends
  architecture-reviewer to run **after** all implementers report done, precisely so it judges the
  finished diff, not a still-mutating one. No evidence it caused a missed finding here (the WARNING it
  did raise — the relative-time dedup — was fixed and re-checked cleanly), but the ordering risk is real
  and worth watching if it recurs.

- **Everything else held:**
  - Fix → owner, re-check → finder, for every finding: the relative-time WARNING (2 implementer resumes
    → 1 architecture-reviewer re-check), the yaml-editor typecheck failure (1 implementer resume → 1
    plan-verifier re-check), and — even though `pr-self-review` findings aren't in the README's formal
    fix-loop table — the CRITICAL permissions bypass was still routed by the same principle, straight to
    the warm implementer that owned `generators/lint.ts`, never a fresh spawn.
  - Gate order: Mode A (#5) ran before any implementer spawned; Mode B (#11) ran after the build wave;
    `pr-self-review`'s finding landed chronologically last, appropriately, as the broad pre-push gate.
  - Model choice matched the documented "Current configuration" deviations exactly: opus for
    spec-creator/implementation-planner (reasoning-heavy), sonnet for architecture-reviewer/plan-verifier
    (recognition/coverage axes) and every implementer.
  - Loop bound: no finding needed a second fix attempt — each surfaced issue was resolved in one pass.

## Where the design itself was wrong

1. **`INSIGHTS.md` ownership under parallel implementer waves is still unresolved — three data points
   now, zero remediation.** The first retro (2026-07-17) named the exact contradiction and offered two
   concrete resolutions; the second (2026-07-28) restated it as "recurring" and picked a specific
   recommendation ("during a parallel implementer wave, implementers must NOT write `INSIGHTS.md`; they
   surface the lesson in their report and the orchestrator writes it in Phase 6"). Neither has been
   applied: `implementer.md` still preloads `engineering-insights` and instructs direct appends
   (`implementer.md:22,43-51,138-141`); `implement/SKILL.md:202,211` still asserts the opposite. Three
   runs in a row have now produced a concurrent (or, in leaner waves, merely sequential-and-lucky) write
   to the same unowned file. This has crossed from "a recommendation to weigh" to "a known-broken
   invariant with a written fix that keeps not landing." It should stop being optional.

2. **No explicit barrier ensures `architecture-reviewer` waits for every implementer to report done
   before it starts reading the diff.** This run is the first of the three retros to show a *clean*
   (non-fix-loop) timestamp overlap between the reviewer and two still-active implementers. It is a
   scheduling gap in the orchestrator's wave sequencing, not a rule the agents themselves can enforce —
   the reviewer has no way to know from inside its own context whether every sibling implementer's final
   write has landed.

## Worth changing before the next run (ranked)

1. **Stop re-recommending the `INSIGHTS.md` fix softly — apply resolution (1) from the 2026-07-17 retro
   now.** Strip the `engineering-insights` preload and direct-append instructions from
   `.claude/agents/implementer.md`; route every implementer-surfaced lesson through the orchestrator's
   existing Phase 6 (which the `/implement` skill already claims is the only path). Three consecutive
   retros and two prior explicit recommendations is the threshold this file itself says makes a pattern
   "a broken rule, not a mistake" — this is that threshold.
2. **Add an explicit "wait for all implementer TaskUpdate:done signals before spawning
   architecture-reviewer" step to the orchestrator's wave logic**, so a fast reviewer can't start against
   a diff two siblings are still writing. Cheap to add; the alternative is a review that silently misses
   a late-landing file.
3. **Confirm the CRITICAL permissions-bypass fix's re-check actually lands** (a `pr-self-review` re-run
   confirming `ok:false` on the reported repro and the new regression test green) before this feature
   merges — this retro was collected mid-fix, one step ahead of that confirmation.
4. **Watch `general-purpose` agent #3** ("Correct source='ci' false alarm," 34 turns / 16 Bash calls for
   $1.14) — cost is negligible, but the turn count is disproportionate to what reads as a quick fact
   check the orchestrator could plausibly have resolved with 2–3 direct `Grep`/`Read` calls. Not urgent
   given the dollar cost, but worth a second look if this shape recurs at higher stakes.

**Note on the money:** the top two agents by cost this run — implementation-planner ($28.61, opus,
producing the full BUILT/NEW-section plan) and the T3 implementer ($32.69, sonnet, 276 turns / 63 Read /
59 Bash building the 4-step Export Wizard + CI tab) — are, like the 2026-07-28 run's top two, dominated
by genuinely large scope and iterative test-fix cycles, not cold-start thrash. This is now the **second**
of three retros where the single biggest line item is real work, not the README's "cold restarts and
verbose reports" doctrine — the doctrine held for the smaller agents (#1 fork, #3 general-purpose, #5
Mode A) but not for the two largest, consistent with the pattern the 2026-07-28 retro already noted:
it applies to many-small-task runs, not runs with a genuinely large single task.
