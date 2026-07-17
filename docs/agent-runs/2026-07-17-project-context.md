# Run retro — Project Context (2026-07-17)

**Verdict:** The full `/implement` chain worked end-to-end — every gate ran in the right order,
every fix went to the warm owner and every re-check to the finder — at a measured **258.3M
tokens / ~$143 est** over 125.1 min; the dominant cost was one necessarily-serial, Docker-test-heavy
backend agent, not cold-start thrash, and the one real ownership breach was a shared `INSIGHTS.md`
that no task owns.

> Cost is the script's estimate (list prices, 2× 1h-cache-write multiplier, Sonnet 5 intro pricing
> ignored) — treat as an upper bound. **Token counts are exact.**
>
> Numbers are the **final** measurement (recollected on a manual `/workflow-retro` re-run). They
> ticked up from the first draft's 254.3M/~$140/95.9min, and the delta is **100% orchestrator**
> (17.5M→21.5M tokens): writing this retro, the feature commit, and the re-collect. The 8-agent
> **subagent** total (236.8M) is unchanged — no new agents ran. Meta-note: the retro itself cost
> ~4M orchestrator tokens (~$3), which is the price of the document you are reading.

## What ran

Session `36cfef5c` · 15:30–17:35 UTC · 8 cold spawns, 6 warm resumes.

| # | Agent | Model | Task | Min | Turns | Tokens | Cost | Resumes |
|---|---|---|---|---|---|---|---|---|
| 1 | plan-verifier | sonnet-5 | Plan gate Mode A | 1.3 | 5 | 208K | $0.99 | — |
| 2 | implementer | sonnet-5 | T1 contracts | 3.5 | 60 | 6.8M | $4.48 | — |
| 3 | implementer | sonnet-5 | T2 DB schema | 2.8 | 34 | 3.1M | $2.45 | — |
| 4 | implementer | sonnet-5 | T7 trace visibility | 4.2 | 65 | 6.8M | $3.99 | — |
| 5 | implementer | sonnet-5 | T3 backend → T4 inject → 2 arch fixes | 70.1 | 414 | **149.0M** | **$68.99** | 3 |
| 6 | implementer | sonnet-5 | T5 page → T6 attach tab | 22.7 | 229 | 48.3M | $22.83 | 1 |
| 7 | architecture-reviewer | sonnet-5 | Arch review + 2 re-checks | 25.0 | 113 | 13.3M | $9.66 | 2 |
| 8 | plan-verifier | sonnet-5 | Full trace Mode B | 5.5 | 85 | 9.2M | $5.87 | — |

**Execution shape (real, corrected for the fix loop):**
- Wave A (15:31): Mode A gate (#1) — before any implementer. ✓
- Wave B (15:34): T1 (#2), T2 (#3), T7 (#4) truly-parallel cold spawns; T3 (#5) + T5 (#6) join once T1/T2 land.
- Fix loop (16:24–16:48): arch-review (#7) → warm fixes into #5 → warm re-checks into #7. The collect
  script's timestamp-based "Wave 2, 6 in parallel" **conflates this fix loop with the build wave** —
  #5 only "overlaps" #7 because #7's findings were being fixed *by* #5. The real parallel width was
  5 implementers, not 6-with-reviewer.
- Wave C (16:49): Mode B (#8) after the review. ✓

**Warm resumes (all 6 correct):** T6→#6, T4→#5, arch-fix→#5, re-check→#7, sibling-fix→#5, re-check→#7.

## Where the run departed from the design

- **Concurrent write to `client/INSIGHTS.md` (#4 T7 and #6 T5/T6, both running).** This is a genuine
  file-ownership breach — the one thing no-worktree-isolation relies on the plan to prevent. It did
  **not** come from overlapping *feature* Owns (those were disjoint and held); it came from both
  implementers appending to the shared package `INSIGHTS.md` via the `engineering-insights` convention,
  a file in **no task's `Owns` list**. Append-only + git limited the blast radius, but a lost entry was
  possible. `server/INSIGHTS.md` shows the same pattern as a *sequential* hand-off (#3→#5) — same root
  cause, no collision only because they didn't overlap. See design finding below — this is a design gap,
  not an implementer mistake.

Everything else honored the README:
- **Fixes → owner, re-checks → finder:** 3 fix passes, all `SendMessage` into the warm owner (#5) and
  warm finder (#7); **zero cold re-spawns for fixes.** The warm-reuse doctrine was followed exactly.
- **Loop bounded:** 3 passes were 3 *different* findings (2 WARNINGs, then 1 new sibling); no single
  finding survived two attempts, so nothing should have escalated to the user.
- **Gates in order:** Mode A → implementers → arch-review → Mode B → pr-self-review (orchestrator). ✓
- **Warm folding correct:** T3→T4 and T5→T6 were folded into one warm agent each because each second
  task hard-depends on the first — bought no lost wall-clock and saved 2 cold starts.
- **Model choice held:** every agent on sonnet-5. The downgraded `architecture-reviewer` **caught a real
  untrusted-input tokenizer DoS *and* the sibling call site the first fix missed** — no shallow-findings
  failure, no signal to restore opus this run.

**Where the money went (refutes the README's rule of thumb, this run):** #5 alone is **149.0M tokens /
49% of total** — but it was **one warm agent**, not cold-start thrash. Its 414 turns / 95 reads / 65 Bash
are the backend module + injection + Docker `*.it.test.ts` iteration (each run spins Postgres via
testcontainers). The README says *"the biggest sink is rarely the code — it's cold restarts and verbose
reports."* Here it **was** the code — specifically a necessarily-serial, integration-test-heavy backend
chain — while cold-start/warm discipline was near-optimal. The doctrine held on process; the cost lived
where the doctrine didn't predict.

## Where the design itself was wrong

**The plan's disjoint-`Owns` guarantee and the implementer's `INSIGHTS.md`-append behavior contradict
each other, and this run hit the collision.** Implementers preload `engineering-insights` and append a
lesson to their package's `INSIGHTS.md` when they hit something durable — but `INSIGHTS.md` is never in a
task's `Owns` list, so any two same-package implementers running in parallel write it concurrently
(measured: #4 + #6 on `client/INSIGHTS.md`). Worse, the `/implement` skill's own Phase 6 asserts *"agents
in this chain are barred from writing `INSIGHTS.md` themselves"* — which is **false as run**: 7 in-agent
appends happened (roster #2–#6). The two documents disagree about who owns `INSIGHTS.md`.

Two coherent resolutions — **the user picks, this retro only recommends:**
1. **Make Phase 6's claim true:** strip `engineering-insights` from the `implementer` preload and forbid
   its `INSIGHTS.md` writes; implementers surface lessons in their report, the orchestrator captures them
   in Phase 6 (which it did anyway, for the cross-cutting lesson). Single writer, no collision, matches
   the skill's stated contract.
2. **Keep in-agent appends but serialize them:** designate one implementer per package per wave as the
   `INSIGHTS.md` owner, or have appends go through the orchestrator. Preserves "capture as you go" at the
   cost of a routing rule.

Recommendation leans **(1)** — it's less machinery and the orchestrator's Phase 6 already exists and
already worked. But it trades away the "record it before you forget" immediacy the `engineering-insights`
skill is built around, so it's a real tradeoff, not a bug-fix.

## Worth changing before the next run

1. **Resolve the `INSIGHTS.md` ownership contradiction** (design finding above) — it's the only measured
   ownership breach and it recurs on every multi-implementer wave in one package. Highest priority.
2. **`collect.mjs` conflates the fix loop with the build wave** (timestamp overlap makes #5 look
   concurrent with the reviewer #7 that was driving its fixes). A future reader will mis-count parallel
   width as 6. Minor tooling note — consider tagging resume-driven activity distinctly from spawn-time.
3. **Backend integration-test cost is the real budget line** (#5 = 49%). If future backend tasks want to
   trim spend, the lever is unit-vs-Docker test balance in the plan's `Verify` commands, **not** more
   parallelism or model downgrades — those were already near-optimal here.
