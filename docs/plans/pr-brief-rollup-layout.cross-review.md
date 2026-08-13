# Cross-model review — PR Brief cross-run rollup & 3-column card layout

Plan: [`pr-brief-rollup-layout.md`](./pr-brief-rollup-layout.md) · Spec: [`specs/2026-08-11-pr-brief-rollup-layout.md`](../../specs/2026-08-11-pr-brief-rollup-layout.md)

Two independent staff-engineer reviews of the spec + plan, run cold via OpenRouter (no
access to the authoring conversation) before implementation, per the project's
spec-driven-development chain.

| Model | Verdict | Cost | Tokens (in/out) |
|---|---|---|---|
| `openai/gpt-4.1` | Safe to build as-is. No blockers. | $0.0312 | 12,121 / 864 |
| `google/gemini-2.5-pro` | Safe to build as-is. One non-blocking gap. | $0.0552 | 13,033 / 3,888 |

## What they caught

- **(Gemini) Transient list/card inconsistency.** The list (`GET /repos/:id/pulls`) and
  the card (`GET /pulls/:id/metrics-rollup`) are two separate requests — a run completing
  between loading the list and opening the PR can make the two disagree for that one
  navigation, even though both compute the SAME rollup logic (AC-7 is about the
  *computation* being unified, not point-in-time data). Gemini's suggested fix (carry the
  full rollup on `PrMeta` and seed the card's query cache from the list response via
  `setQueryData`) is a real option but changes the `PrMeta` contract shape — **not applied
  to the plan**, left as a known, accepted, extremely narrow race (a metrics display, not
  a security/correctness issue) rather than re-opening the spec for it.
- **(GPT-4.1) Dual-vendor contract drift risk.** Already an established, accepted project
  convention (root INSIGHTS 2026-06-25) — no action.
- **(GPT-4.1) Non-transactional rollup vs. concurrent run completion.** Same class as
  Gemini's finding above; acceptable for a metrics rollup (eventual consistency).
- **(GPT-4.1) `severity` case-sensitivity in the blocker predicate.** `Finding.severity` is
  a Zod enum (`CRITICAL|WARNING|SUGGESTION`), not a free-text column, so a lowercase value
  can't reach the DB — not a real risk given the actual schema, but a reasonable comment to
  leave near the predicate in `rollup.ts`.
- **(GPT-4.1) Large-repo batching.** Already covered by AC-20 / the plan's batched-query
  requirement; no new action.
- **(Both, opinion) The `reviewScoresForPrs`/`doneRunCostsForPrs` dead-code left in place**
  (per the requester's explicit Q2b decision) is tech debt worth a follow-up chore ticket —
  noted, not actioned in this plan.

## Disposition

No plan changes made from this review — both models independently confirmed the plan is
safe to implement as written; every finding is either already covered, already an accepted
project convention, or a narrow non-blocking edge case left as documented residual risk.

Full raw responses archived below for reference.

---

## `openai/gpt-4.1` — full response

## 1. Summary verdict

**This plan is solid and safe to build from as-is.** It covers every acceptance criterion in the spec, addresses all edge cases, and makes sound architectural choices (notably, the server-side rollup and the new dedicated endpoint). The task split is clear, sequential, and minimizes risk.

---

## 2. Risks / gaps found

1. **Potential for contract drift in dual-vendored Zod types**
   - **What's wrong:** The plan correctly calls out the need to keep the shared `PrMetricsRollup` contract byte-identical in both server and client vendor copies, but this is a manual, hand-synced process.
   - **Why it matters:** If a future edit is made to only one copy, subtle bugs or runtime validation errors could occur, especially since the plan does not automate this check.
   - **Fix:** Consider adding a CI check or a script to diff the two files on every PR, or at minimum, document this risk for future maintainers.

2. **No explicit handling of concurrent run insertions**
   - **What's wrong:** The rollup logic (group by agent_id, pick latest `status='done'` by `ran_at`) assumes the DB state is stable during aggregation. If a new run is inserted or marked as `done` during the rollup computation, there could be a race where the rollup is briefly inconsistent.
   - **Why it matters:** This is a minor risk, but in high-concurrency environments, a user might see a rollup that omits a just-completed run.
   - **Fix:** Acceptable as-is (eventual consistency is fine for metrics), but worth noting in documentation that the rollup is not transactional with run insertions/updates.

3. **No migration for existing list columns**
   - **What's wrong:** The plan intentionally does not rename the `latest_run_cost_usd` field in `PrMeta`, even though its semantics change from "latest run" to "SUM of latest-done-per-agent".
   - **Why it matters:** This is called out as an accepted misnomer, but downstream consumers (e.g., analytics, exports) may be confused.
   - **Fix:** None required per spec, but recommend a clear comment in the code and possibly in API docs.

4. **No explicit test for findings with mixed-case severities**
   - **What's wrong:** The blocker count relies on `severity === 'CRITICAL'`. If the DB ever contains e.g. `'critical'` (lowercase), those would be missed.
   - **Why it matters:** Data cleanliness is assumed, but if not enforced, this could undercount blockers.
   - **Fix:** Either enforce uppercase in the DB, or defensively `.toUpperCase()` in the predicate. At minimum, add a test for this in `rollup.test.ts`.

5. **No mention of pagination or large PR sets**
   - **What's wrong:** The plan asserts that the batched query for all PRs in a repo is "bounded", but does not specify what happens if a repo has thousands of PRs.
   - **Why it matters:** If the PR list grows very large, the batched query could become slow or memory-intensive.
   - **Fix:** Acceptable as-is given current usage, but if scaling up, consider paginating or chunking the rollup computation.

---

## 3. Anything you'd have done differently (opinion, not defect)

- **I might have considered embedding the rollup in the existing Brief response** (as an optional field), rather than a new endpoint, to reduce client round-trips. However, the plan's approach is justified by the spec's explicit non-goal and contract freeze, and avoids coupling unrelated concerns.
- **Automating the dual-vendor contract sync** (e.g., via a script or CI check) would reduce future risk, but is not a blocker for this implementation.

---

**In summary:** The plan is thorough, matches the spec, and is safe to proceed. The only real risks are minor and mostly about future maintainability or edge-case data hygiene, not correctness or architecture. No blocking issues found.

---

## `google/gemini-2.5-pro` — full response

Excellent. Here is my review of the implementation plan.

***

### 1. Summary verdict

The plan is exceptionally detailed, well-structured, and safe to build from. It correctly interprets the spec's complex rollup logic and constraints. I found one minor gap where a transient data inconsistency could violate an acceptance criterion, but the fix is straightforward.

### 2. Risks / gaps found

1.  **Transient data inconsistency between the list and the card violates the spirit of AC-7.**
    *   **What's wrong:** The plan implements two separate API calls for the rollup data: one for the list (`GET /repos/:id/pulls` in T4) and another for the card (`GET /pulls/:id/metrics-rollup` in T3/T5). If a new agent run completes *between* the user loading the list and navigating to the PR detail page, the card will show newer data than the list, and the score/cost values will disagree.
    *   **Why it matters:** This creates a transient A-B inconsistency that violates the user-facing goal of AC-7 ("so that for any one PR the score shown on the card and in the list agree"). While the *logic* is unified, the data is not guaranteed to be from the same point in time.
    *   **Concrete fix:** Modify the `PrMeta` contract in T4 to carry the full `PrMetricsRollup` object, not just the `score` and `cost`. The client can then use React Query's `setQueryData` to pre-populate the cache for the `usePrMetricsRollup` hook upon receiving the list data. This ensures the card initially renders with the exact same data the user just saw in the list, guaranteeing consistency for that navigation flow. The spec prohibits *renaming* `PrMeta` fields but does not prohibit *adding* a new one, which would be the cleanest way to achieve this.

### 3. Anything you'd have done differently

*   **The decision to leave dead code should be tracked (Plan: "Q2b → leave").** The plan correctly follows the requester's decision to leave the now-unused `reviewScoresForPrs` and `doneRunCostsForPrs` functions in the repository. While not a defect in this plan, this creates immediate technical debt. I would have filed a low-priority "chore" ticket to remove these functions in a follow-up PR, ensuring the cleanup isn't forgotten.
