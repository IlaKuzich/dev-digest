# Spec: Run Cost Badge

**Status:** ready-to-implement  
**Touches:** `server/` · `client/` · `@devdigest/shared` (vendored)

---

## 1. Goal

Show the USD cost of each agent run in three places without any extra LLM calls:

| Screen | Where | Format |
|--------|-------|--------|
| PR list | `COST` column | `$0.012` compact |
| Agent runs tab | per-run row (right side) | `9,119 tok · $0.0013` |
| Run Trace sidebar | Stats section card | `$0.06` |

Cost is already computed inside `ReviewOutcome.costUsd` (reviewer-core, `run.ts:183`)
from the OpenRouter completion response — it is currently discarded. This spec wires
it through to the DB, API, and UI.

Rule: runs with **no cost data** (failed, cancelled, or pre-feature rows) render `—`,
never `$0.00`.

---

## 2. Data Flow

```
OpenRouter response → ReviewOutcome.costUsd
    └─► run-executor.ts  (currently unused — line 213)
        ├─► agent_runs.cost_usd  (DB persist)
        ├─► RunTrace.stats.cost_usd  (trace document)
        └─► RunSummary.cost_usd  (GET /pulls/:id/runs response)

GET /repos/:id/pulls  → PrMeta.latest_run_cost_usd  (PR list column)
GET /pulls/:id/runs   → RunSummary.cost_usd          (run history rows)
GET /runs/:id/trace   → RunTrace.stats.cost_usd      (sidebar Stats card)
```

---

## 3. DB

### 3.1 New column

```sql
-- server/src/db/migrations/<timestamp>_add_cost_usd_to_agent_runs.sql
ALTER TABLE agent_runs ADD COLUMN cost_usd NUMERIC(12, 6);
```

Run manually: `pnpm db:migrate` (per convention — never on boot).
Existing rows stay `NULL` (means "no data", not "$0.00").

### 3.2 Schema

File: `server/src/db/schema/runs.ts`

```ts
// Add inside agentRuns table definition:
costUsd: numeric('cost_usd', { precision: 12, scale: 6 }),
```

---

## 4. Shared Contracts (`@devdigest/shared`)

Both vendored copies must be updated in sync:
`server/src/vendor/shared/contracts/` and `client/src/vendor/shared/contracts/`

### 4.1 `RunStats` — `contracts/trace.ts`

```ts
export const RunStats = z.object({
  duration_ms: z.number().int(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  findings: z.number().int(),
  grounding: z.string(),
  cost_usd: z.number().nullable(),   // NEW — null = no data
});
```

### 4.2 `RunSummary` — `contracts/trace.ts`

```ts
export const RunSummary = z.object({
  // … existing fields unchanged …
  cost_usd: z.number().nullable(),   // NEW
});
```

### 4.3 `PrMeta` — `contracts/platform.ts`

```ts
export const PrMeta = z.object({
  // … existing fields unchanged …
  latest_run_cost_usd: z.number().nullish(),  // NEW — most recent done run
});
```

---

## 5. Server

### 5.1 `run.repo.ts` — persist cost on completion

`completeAgentRun` signature change:

```ts
values: {
  status: 'done' | 'failed' | 'cancelled';
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd?: number | null;           // NEW
  findingsCount: number;
  grounding: string;
  score?: number | null;
  blockers?: number | null;
  error?: string | null;
}
```

Inside the `db.update(...).set(...)` call add:

```ts
costUsd: values.costUsd ?? null,
```

### 5.2 `run.repo.ts` — expose cost in `listRunsForPull`

In the `rows.map(...)` return:

```ts
cost_usd: run.costUsd != null ? Number(run.costUsd) : null,
```

### 5.3 `run-executor.ts` — wire `outcome.costUsd` through

**Success path** (`runOneAgent`, line ~213):

```ts
// Change:
const { tokensIn, tokensOut, grounding } = outcome;
// To:
const { tokensIn, tokensOut, grounding, costUsd } = outcome;
```

Pass to `completeAgentRun` (line ~243):

```ts
await this.repo.completeAgentRun(runId, {
  status: 'done',
  durationMs,
  tokensIn,
  tokensOut,
  costUsd,                           // NEW
  findingsCount: findingRows.length,
  grounding,
  score: outcome.review.score,
  blockers,
  error: null,
});
```

Add to the `stats` block of the trace document (line ~264):

```ts
stats: {
  duration_ms: durationMs,
  tokens_in: tokensIn,
  tokens_out: tokensOut,
  findings: findingRows.length,
  grounding,
  cost_usd: costUsd ?? null,         // NEW
},
```

**Failure/cancel path** — pass `costUsd: null` explicitly so the call compiles
after the signature change:

```ts
await this.repo.completeAgentRun(runId, {
  status,
  durationMs: Date.now() - start,
  tokensIn: 0,
  tokensOut: 0,
  costUsd: null,                     // NEW (no cost on failure)
  findingsCount: 0,
  grounding: '0/0 passed',
  error: msg,
});
```

`failAll` helper (line ~76) — same addition.

### 5.4 `pulls/routes.ts` — add `latest_run_cost_usd` to `GET /repos/:id/pulls`

After the existing `latestReviewByPr` block, add a parallel query:

```ts
// Latest cost for each PR (most recent done run).
const latestCostByPr = new Map<string, number | null>();
if (prIds.length > 0) {
  const costRows = await container.db
    .select({ prId: t.agentRuns.prId, costUsd: t.agentRuns.costUsd })
    .from(t.agentRuns)
    .where(
      and(
        inArray(t.agentRuns.prId, prIds),
        eq(t.agentRuns.status, 'done'),
      ),
    )
    .orderBy(desc(t.agentRuns.ranAt));
  for (const row of costRows) {
    if (row.prId && !latestCostByPr.has(row.prId)) {
      latestCostByPr.set(row.prId, row.costUsd != null ? Number(row.costUsd) : null);
    }
  }
}
```

In the `rows.map(...)` return value:

```ts
latest_run_cost_usd: latestCostByPr.get(r.id) ?? null,
```

---

## 6. Client

### 6.1 New component: `RunCostBadge`

**File:** `client/src/components/RunCostBadge/RunCostBadge.tsx`

```tsx
interface RunCostBadgeProps {
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  /** compact: "$0.012" (PR list column)
   *  inline:  "9,119 tok · $0.0013" (run row) */
  variant?: 'compact' | 'inline';
}
```

**Formatting rules:**

```
formatCost(usd):
  null / undefined  → "—"
  0                 → "—"    (genuine $0.00 is indistinguishable from "no data")
  < 0.0001          → "<$0.0001"
  otherwise         → "$" + usd.toLocaleString('en-US', { minimumFractionDigits: 2,
                             maximumFractionDigits: 4 })
                      e.g. 0.012 → "$0.012", 0.0013 → "$0.0013", 1.5 → "$1.50"

formatTokenCount(n):
  n >= 10_000  → (n/1000).toFixed(1).replace(/\.0$/,"") + "K"   e.g. 15000 → "15K"
  n >= 1_000   → (n/1000).toFixed(1) + "K"                      e.g. 9119  → "9.1K"
  otherwise    → n.toLocaleString()                              e.g. 450   → "450"
```

**compact variant** — plain `<span>` in monospace, color `var(--text-secondary)`:

```
$0.012
```

**inline variant** — shown on settled run rows, color `var(--text-muted)`:

```
9.1K tok · $0.0013
```

Token count = `(tokensIn ?? 0) + (tokensOut ?? 0)`; renders nothing if both are 0/null.

### 6.2 Screen 1 — PR list (`PRRow`)

**File:** `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`

- Add `RunCostBadge` with `variant="compact"` and `costUsd={pr.latest_run_cost_usd}`
- Insert between the score ring (`CircularScore`) and the status badge cells

**File:** `client/src/app/repos/[repoId]/pulls/page.tsx` (or wherever column headers live)

- Add `COST` header between `SCORE` / `FINDINGS` and `STATUS`

### 6.3 Screen 2 — run history row (`RunHistory`)

**File:** `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx`

In the right-side metadata block (currently shows only `ran_at` time), add below the timestamp:

```tsx
{settled && (
  <RunCostBadge
    variant="inline"
    costUsd={r.cost_usd}
    tokensIn={r.tokens_in}
    tokensOut={r.tokens_out}
  />
)}
```

### 6.4 Screen 3 — Trace sidebar Stats section (`TraceBody`)

**File:** `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`

Add a 4th `<Stat>` card in the `statsRow`:

```tsx
<Stat
  label={t("trace.stat.cost")}
  val={stats.cost_usd != null && stats.cost_usd > 0
    ? formatCost(stats.cost_usd)
    : "—"}
/>
```

---

## 7. i18n

### `messages/en/runs.json` (and other locales)

```json
{
  "trace": {
    "stat": {
      "cost": "Cost"
    }
  }
}
```

### `messages/en/prReview.json` (and other locales)

```json
{
  "list": {
    "header": {
      "cost": "Cost"
    }
  }
}
```

---

## 8. Tests

### Unit — `RunCostBadge`

| Input | Expected output |
|-------|-----------------|
| `costUsd=null` | `—` |
| `costUsd=0` | `—` |
| `costUsd=0.012` compact | `$0.012` |
| `costUsd=0.0013` compact | `$0.0013` |
| `costUsd=1.5` compact | `$1.50` |
| `costUsd=0.0013, tokensIn=9119, tokensOut=0` inline | `9.1K tok · $0.0013` |
| `costUsd=0.06, tokensIn=15000, tokensOut=1200` inline | `15K tok · $0.06` |
| `costUsd=null` inline | `—` |

### Integration — server

- `POST /pulls/:id/review` → after run completes, `GET /pulls/:id/runs` returns a
  row with `cost_usd` matching what OpenRouter reported (non-null for models that
  report cost).
- `GET /repos/:id/pulls` → PR with one completed run has a non-null
  `latest_run_cost_usd`; PR with no runs has `latest_run_cost_usd: null`.
- `GET /runs/:id/trace` → `stats.cost_usd` is present and matches the run row.

---

## 9. Constraints

- **Zero extra LLM calls.** `costUsd` comes from the same response already in-flight.
- **No `$0.00`.** `null` and `0` both render `—`. Distinguishing "ran but free"
  from "no data" is not worth the UI noise.
- **Backward-safe.** `PrMeta.latest_run_cost_usd` is `nullish` so existing API
  consumers that don't know about this field ignore it safely. `RunStats.cost_usd`
  and `RunSummary.cost_usd` are `nullable` for the same reason.
- **No migration of existing rows.** `cost_usd` is nullable; old runs keep `NULL`
  and render `—`.
- **`NUMERIC(12,6)` storage.** Sufficient for costs up to $999,999.999999; avoids
  floating-point drift on the DB side. Cast to `Number` before returning from the
  API (JS floats are fine at this precision).
