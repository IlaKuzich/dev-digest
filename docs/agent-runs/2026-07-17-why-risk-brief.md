# Run retro — Why+Risk Brief (2026-07-17)

**Verdict:** The SDD chain worked cleanly end-to-end — 25/25 ACs delivered, zero
architecture findings, zero file-ownership breaches, gates in the right order — at a
measured **104.8M tokens / ~$98 (est.)**, ~90 min wall-clock; 42% of the cost was the two
opus planning agents (spec + plan), which is inherent to SDD, not waste.

## What ran

Session `492f442d` · 19:04–20:35 UTC · **8 cold spawns, 2 warm resumes** · 104.8M tokens
(orchestrator 19.3M, subagents 85.5M) · est. $98.13 (orchestrator $22.47, subagents $75.66).

| # | Agent | Model | Task | Min | Turns | Tokens | Cost |
|---|---|---|---|---|---|---|---|
| 1 | spec-creator | opus-4-8 | Create spec | 18.9 | 118 | 15.3M | $19.61 |
| 2 | implementation-planner | opus-4-8 | Plan | 11.8 | 72 | 11.7M | $22.00 |
| 3 | plan-verifier | sonnet-5 | Mode A (plan gate) | 0.3 | 5 | 200K | $0.89 |
| 4 | implementer | sonnet-5 | T1 contract gate | 4.0 | 40 | 4.4M | $3.54 |
| 5 | implementer | sonnet-5 | T2 backend module | 16.4 | 128 | 23.2M | $11.59 |
| 6 | implementer | sonnet-5 | T3 card + hooks + i18n | 17.6 | 126 | 20.3M | $9.90 |
| 7 | architecture-reviewer | sonnet-5 | Arch review | 2.0 | 42 | 4.0M | $3.54 |
| 8 | plan-verifier | sonnet-5 | Mode B (full trace) | 8.2 | 69 | 6.2M | $4.60 |

**Execution shape (real, from overlapping timestamps):**
- W1 spec-creator (18.9m) → W2 planner (11.8m) → W3 Mode A (0.3m) → W4 T1 (4.0m) →
  **W5 T2 ∥ T3 (17.9m, genuinely parallel)** → W6 arch-review (2.0m) → W7 Mode B (8.2m).

**Warm resumes (both correct — no cold re-spawn):**
- → spec-creator @ 19:26: 8 owner decisions, finalize spec.
- → implementation-planner @ 19:52: multi-agent + GAP-1 discovery set, finalize plan.

**Overlap:** no file written by two agents — ownership held. Spec read by 7 agents, plan by
6, both contract copies by 4–5 — each a genuine need (every gate/implementer requires them),
the "system working," not overlapping scope.

## Where the run departed from the design

Essentially nowhere. Checked against `.claude/agents/README.md`:
- **Gates all ran, in order** — Mode A before implementers, arch-review before Mode B,
  pr-self-review last (orchestrator inline). The four enforcement points held.
- **Fix goes to owner / re-check to finder** — untested this run: arch-review returned zero
  findings, so the fix loop never fired. No cold-spawn-for-fix breach possible.
- **Parallelism real** — T2 ∥ T3 overlapped ~17.9 min on disjoint files (server vs client);
  T1 correctly ran solo first because both hard-depend on its contract exports.
- **Model choice right** — opus for the two reasoning-heavy planning agents, sonnet for
  implementers + recognition-grade reviewers. Mode A on sonnet cost $0.89 to guard the run's
  most expensive defect class. No opus agent did recognition work; no sonnet gate produced
  shallow findings a later gate caught (Mode B confirmed arch-review's clean verdict).
- **No agent too small to spawn** — Mode A (0.3m) and T1 (4.0m) are both load-bearing:
  Mode A needs fresh eyes on the coverage table (can't be inline), and spawning T1 separately
  is precisely what unblocked the T2∥T3 parallel wave.

## Where the design itself was wrong

- **Spec status vocabulary is a three-way muddle.** The README's enforcement table is binary:
  spec-creator writes `Status: draft`, the orchestrator flips it to `approved`, and that flip
  is the gate. But spec-creator wrote **`Status: ready`** (an intermediate it invented to avoid
  self-certifying `approved`), the `/implement` skill's input text gates on the literal string
  `approved`, and implementation-planner had already accepted `ready` as non-draft and planned
  off it. It cost one manual reconciliation edit this run (orchestrator flipped `ready→approved`
  after the owner's real yes), and it is a latent trap: a stricter planner gate keyed on
  `!= "approved"` would have refused a `ready` spec outright. **The vocabulary needs to be one
  of: (a) spec-creator writes `draft` per the README, or (b) the README + `/implement` +
  planner all recognize `ready` as the pre-approval state.** Pick one; today three files
  disagree.

## Worth changing before the next run

1. **Reconcile the spec-status vocabulary** (see above) — highest-value, lowest-effort. One
   edit to whichever of `spec-creator.md` / README / `/implement` loses the vote. Recurs every
   SDD run until fixed.
2. **The two opus planning agents are 42% of spend ($41.6 of ~$98)** — this is the run's real
   money, and it partially refutes the README's "biggest sink is cold restarts" doctrine *for
   an SDD run*: here the sink is opus reasoning (spec + plan), which is the feature's actual
   value, not waste. Do **not** downgrade them to sonnet reflexively — a shallow task contract
   loses its practice in every implementer built from it. Only revisit under real cost pressure.
3. **Duplicate spec/plan reads are not worth optimizing** — each of the 6–7 re-reads is a gate
   or implementer that genuinely needs the document in fresh context. This is the system
   working; leave it.

_Cost is an estimate (list prices, 1h-TTL cache-write 2× multiplier, Sonnet 5 intro pricing
ignored) — an upper bound, not a to-the-cent figure. Token counts are exact._
