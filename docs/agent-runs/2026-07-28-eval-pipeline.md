# Run retro — Eval Pipeline (2026-07-28)

**Verdict:** The chain worked to design — every gate ran in order, all 5 fixes went to the warm owning agent, the loop stayed bounded, and the one real defect (a `pnpm typecheck` failure) was caught by the right gate and fixed — at ~$110 / 162M tokens for a 48-AC cross-module feature; the two blemishes are both **recurring design gaps**, not execution mistakes: concurrent `INSIGHTS.md` writes (2nd retro running) and task `Verify` commands that don't type-check.

## What ran

Session `0df0fc64` · 08:57–09:46 UTC (49.0 min) · 2026-07-28
10 cold spawns, 5 warm resumes · 162.1M tokens (orch 14.8M / subagents 147.3M) · est. $109.67

| # | Agent | Model | Task | Min | Turns | Tokens | Cost | Resumes | Tools |
|---|---|---|---|---|---|---|---|---|---|
| 1 | plan-verifier | sonnet-5 | Plan gate Mode A | 0.5 | 5 | 176K | $0.86 | — | Read:2 |
| 2 | implementer | sonnet-5 | T1 contracts+nav | 25.9 | 72 | 11.0M | $8.67 | 1 | Read:16 Bash:15 Edit:9 Write:1 |
| 3 | implementer | sonnet-5 | T2 DB schema | 1.6 | 38 | 3.5M | $2.65 | — | Bash:8 Read:7 Edit:5 Write:1 |
| 4 | implementer | sonnet-5 | T3 scoring | 36.1 | 40 | 4.6M | $5.01 | 1 | Bash:10 Read:6 Write:3 Edit:1 |
| 5 | implementer | sonnet-5 | T5 capture UI | 4.2 | 74 | 8.4M | $5.77 | — | Bash:22 Read:14 Edit:9 Write:1 |
| 6 | implementer | sonnet-5 | T6 Evals tab | 23.5 | 173 | 33.8M | $18.42 | 1 | Bash:38 Read:31 Edit:26 Write:10 |
| 7 | implementer | sonnet-5 | T7 eval dashboard | 21.4 | 212 | 39.3M | $19.97 | 1 | Bash:49 Read:40 Write:31 Edit:11 |
| 8 | implementer | sonnet-5 | T4 server module | 33.6 | 121 | 26.7M | $18.31 | 1 | Read:45 Bash:18 Edit:8 Write:6 |
| 9 | architecture-reviewer | sonnet-5 | Arch review | 3.2 | 66 | 5.0M | $3.67 | — | Bash:28 Read:16 |
| 10 | plan-verifier | sonnet-5 | Full trace Mode B | 6.4 | 124 | 14.8M | $7.48 | — | Bash:40 Read:35 |

**Execution shape** (timestamp-overlap, i.e. real parallelism): the intended waves — W0 `T1∥T2`, W1 `T3∥T5∥T6∥T7`, W2 `T4`, then arch-review, then Mode B — collapse into one long 08:59–09:40 overlap window because T4 was launched (correctly) while the client tasks still ran, and both gates ran after. Parallelism was genuine: no same-wave pair shared a file or hard-depended on a sibling.

**Warm resumes (all 5 → the owning implementer, never a cold respawn):** i18n keys → T1; consume keys → T6 + T7; scoring.ts typecheck → T3; routes.ts typecheck → T4.

## Where the run departed from the design

- **Concurrent write to `client/INSIGHTS.md` by #5, #6, #7 (T5/T6/T7) while all three ran.** With no worktree isolation, disjoint file ownership is the *only* thing preventing lost edits, and it broke here. Append-only + lucky interleaving meant no edit was visibly lost, but that is timing, not safety. The plan's `Owns` matrix never listed `INSIGHTS.md` for any task because the `engineering-insights` convention lets *any* implementer append to its package log — so the file is structurally unownable under the current model. **This is the only ownership breach in the run.** Cost: ~nil this time; risk: a silently dropped insight on the next unlucky interleave.
- **Mode B's re-check was done inline, not by resuming the finder (#10).** The README says re-check goes to the finder. For a mechanical `pnpm typecheck` pass/fail this was a deliberate, cheaper call — re-running the full `AC→code→test` trace to confirm two type errors vanished would be wildly disproportionate, and I verified inline instead of cold-spawning a fresh verifier (which the rule actually forbids). Judged defensible, not a breach — but noted so the ledger can see it if it recurs.

Everything else held: Mode A ran before implementers; arch-review ran before Mode B; `pr-self-review` ran last; the fix loop was one bounded pass per finding; model choice was correct (all sonnet, all on recognition/coverage axes — the arch-reviewer "missing" the typecheck failure is not a miss, typecheck is outside its read-only architecture axis, and Mode B owns it by running the verify).

## Where the design itself was wrong

1. **`INSIGHTS.md` ownership in parallel waves is unresolved — and this is now the SECOND consecutive retro to hit it** (see `2026-07-17-project-context.md` — "INSIGHTS ownership gap"). Two data points make it a broken rule, not two mistakes. The `implement` skill's Phase 6 already routes *agent-surfaced* insights through the orchestrator (agents in the chain are barred from writing `INSIGHTS.md` per the README) — yet **implementers still wrote it themselves mid-wave**, because the `implementer` agent preloads the `engineering-insights` skill and acts on it. The fix is a one-line rule: **during a parallel implementer wave, implementers must NOT write `INSIGHTS.md`; they surface the lesson in their report and the orchestrator writes it in Phase 6** (exactly the path already mandated for every other agent in the chain). That removes the only unownable file from the parallel model.
2. **Per-task `Verify` = `vitest run <file>` does not type-check, so a task's own definition-of-done is weaker than the plan's end-to-end gate.** Two real type errors (`noUncheckedIndexedAccess` in #4's `scoring.ts`; a Fastify/Zod `req.body` input-optionality `TS2345` in #8's `routes.ts`) passed each task green and only surfaced at Mode B (#10, $7.48 to find + 2 warm resumes to fix). The `implementation-planner` should give every server task a `Verify` that includes `pnpm typecheck`, or the `implementer` should typecheck before declaring green. (The *code* form of both traps is now in `server/INSIGHTS.md`; this is the *chain* form.)

## Worth changing before the next run (ranked, each tied to a number above)

1. **Make `INSIGHTS.md` orchestrator-only during parallel waves** (README + `implementer` frontmatter). Recurring across 2 retros; the one concurrent write this run (#5/#6/#7) and the prior run's gap are the evidence. Highest priority — it is a correctness/lost-work risk, not a cost one.
2. **Add `pnpm typecheck` to server task `Verify` commands** (planner behaviour). Would have caught both type errors inside #4/#8 instead of paying #10 + 2 resumes to surface them. ~$8–10 and one gate-round-trip of avoidable latency.
3. **Front-load i18n keys into T1's brief.** The i18n follow-up cost 3 warm resumes (09:23–09:25) for ~10 cosmetic leaf labels because T6/T7 discovered missing keys only after building. Deriving the full key set from the six mockups at T1 time would collapse that to zero resumes. Low value (cosmetic, AC-45-mandated) but cheap to fix.
4. **Consider inlining one-line typecheck fixes** rather than warm-resuming the owner. Borderline: the warm resume kept file ownership clean and re-ran the verify for free, but a `?? []` / `!`-assertion is small enough that an inline orchestrator edit + a single `pnpm typecheck` would have been cheaper. Judgement call; not a rule.

**Note on the money (refutes the doctrine, this run):** the README's rule of thumb is "the biggest sink is rarely the code — it's cold restarts and verbose reports." Here the top two agents (#7 $19.97 / 212 turns, #6 $18.42 / 173 turns — ~35% of total) were the two large client UI tasks, and their cost is dominated by genuine iterate-test-fix work (Bash:49 / Bash:38 — many RTL/recharts/jsdom test cycles), not cold-start or report overhead. Duplicate reads (plan + spec read by ~8 agents) are the README's "system working" case, not waste — each implementer needs its AC slice. For a run whose tasks are genuinely large, the code *was* the sink; the doctrine holds for many-small-task runs, not this shape.
