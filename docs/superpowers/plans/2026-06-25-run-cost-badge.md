# Run Cost Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the USD cost of each agent run in three UI locations — PR list column, run history row, and run trace sidebar stats card.

**Architecture:** `costUsd` is already computed in `reviewer-core` (`ReviewOutcome.costUsd`) and currently discarded. This plan threads it through: DB column → server repo/executor → API responses → two client components.

**Tech Stack:** Drizzle ORM + PostgreSQL (server), Fastify 5 (routes), Next.js 15 + React 19 (client), Zod 3 (contracts), Vitest + RTL (tests).

## Global Constraints

- NOT a workspace — each package has its own `package.json` + lockfile; run `pnpm install` in each package independently.
- `@devdigest/shared` is **vendored** in each consumer: edit both `server/src/vendor/shared/` and `client/src/vendor/shared/` in sync.
- Never migrate on boot — run `pnpm db:migrate` manually after creating a migration file.
- `reviewer-core` is consumed as TypeScript SOURCE (no emitted JS).
- Server unit tests: `pnpm exec vitest run --exclude '**/*.it.test.ts'`; integration tests: `pnpm exec vitest run .it.test`.
- Client tests: `pnpm test` (hermetic jsdom, no API needed).
- Migration file naming: sequential `0010_<slug>.sql` — look at the `server/src/db/migrations/meta/` folder for the journal if Drizzle complains.
- `cost_usd` **null** = "no data" (failed/cancelled/old runs). Never render `$0.00` — treat null and 0 both as `—`.

---

## Files Modified / Created

| File | Action |
|------|--------|
| `server/src/db/migrations/0010_add_cost_usd_agent_runs.sql` | Create |
| `server/src/db/schema/runs.ts` | Modify — add `costUsd` column |
| `server/src/vendor/shared/contracts/trace.ts` | Modify — `RunStats` + `RunSummary` |
| `server/src/vendor/shared/contracts/platform.ts` | Modify — `PrMeta` |
| `client/src/vendor/shared/contracts/trace.ts` | Modify — same as server vendor |
| `client/src/vendor/shared/contracts/platform.ts` | Modify — same as server vendor |
| `server/src/modules/reviews/repository/run.repo.ts` | Modify — `completeAgentRun` + `listRunsForPull` |
| `server/src/modules/reviews/run-executor.ts` | Modify — wire `costUsd` from `outcome` |
| `server/src/modules/pulls/routes.ts` | Modify — add `latest_run_cost_usd` to PR list |
| `client/src/components/run-cost-badge/RunCostBadge.tsx` | Create |
| `client/src/components/run-cost-badge/RunCostBadge.test.tsx` | Create |
| `client/src/components/run-cost-badge/index.ts` | Create |
| `client/src/app/repos/[repoId]/pulls/constants.ts` | Modify — COLUMN_KEYS + GRID |
| `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx` | Modify |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx` | Modify |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx` | Modify |
| `client/messages/en/prReview.json` | Modify — add `list.columns.cost` |
| `client/messages/en/runs.json` | Modify — add `trace.stat.cost` |

---

## Task 1: DB Migration + Drizzle Schema

**Files:**
- Create: `server/src/db/migrations/0010_add_cost_usd_agent_runs.sql`
- Modify: `server/src/db/schema/runs.ts`

**Interfaces:**
- Produces: `agentRuns.costUsd` (Drizzle column, type `number | null`) — consumed by Tasks 3 and 4.

- [ ] **Step 1: Create the migration file**

```sql
-- server/src/db/migrations/0010_add_cost_usd_agent_runs.sql
ALTER TABLE "agent_runs" ADD COLUMN "cost_usd" double precision;
```

(Migration 0000 originally had this column; 0009 dropped it. We re-add it.)

- [ ] **Step 2: Add the column to the Drizzle schema**

File: `server/src/db/schema/runs.ts`

Current import line (line 1):
```ts
import { pgTable, uuid, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
```

Change to:
```ts
import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision } from 'drizzle-orm/pg-core';
```

Inside the `agentRuns` table definition, add after `blockers`:
```ts
  /** Cost of the LLM call(s) in USD; null when unavailable (failed/cancelled). */
  costUsd: doublePrecision('cost_usd'),
```

- [ ] **Step 3: Run the migration**

```bash
cd server && pnpm db:migrate
```

Expected: migration applies without error; `agent_runs` now has `cost_usd double precision`.

- [ ] **Step 4: Verify typecheck passes**

```bash
cd server && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add server/src/db/migrations/0010_add_cost_usd_agent_runs.sql server/src/db/schema/runs.ts
git commit -m "feat(db): re-add cost_usd to agent_runs (double precision)"
```

---

## Task 2: Shared Contracts (both vendor copies)

**Files:**
- Modify: `server/src/vendor/shared/contracts/trace.ts`
- Modify: `server/src/vendor/shared/contracts/platform.ts`
- Modify: `client/src/vendor/shared/contracts/trace.ts`
- Modify: `client/src/vendor/shared/contracts/platform.ts`

**Interfaces:**
- Consumes: nothing new — extends existing Zod schemas.
- Produces:
  - `RunStats.cost_usd: z.number().nullable()` — consumed by Tasks 3, 4, 9.
  - `RunSummary.cost_usd: z.number().nullable()` — consumed by Tasks 3, 8.
  - `PrMeta.latest_run_cost_usd: z.number().nullish()` — consumed by Tasks 5, 7.

> **Both vendor copies must be identical.** Edit `server/src/vendor/shared/` first, then copy the same change to `client/src/vendor/shared/`.

- [ ] **Step 1: Update `RunStats` in both vendor copies**

In `contracts/trace.ts`, find the `RunStats` definition and add `cost_usd`:

```ts
export const RunStats = z.object({
  duration_ms: z.number().int(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  findings: z.number().int(),
  grounding: z.string(),
  cost_usd: z.number().nullable(),   // cost of the LLM call(s); null = no data
});
export type RunStats = z.infer<typeof RunStats>;
```

Apply this change to both:
- `server/src/vendor/shared/contracts/trace.ts`
- `client/src/vendor/shared/contracts/trace.ts`

- [ ] **Step 2: Update `RunSummary` in both vendor copies**

In the same file, find `RunSummary` and add `cost_usd` after `blockers`:

```ts
export const RunSummary = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.string().nullable(),
  error: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  findings_count: z.number().int().nullable(),
  grounding: z.string().nullable(),
  ran_at: z.string().nullable(),
  score: z.number().int().nullable(),
  blockers: z.number().int().nullable(),
  cost_usd: z.number().nullable(),   // NEW
});
export type RunSummary = z.infer<typeof RunSummary>;
```

Apply to both vendor copies.

- [ ] **Step 3: Update `PrMeta` in both vendor copies**

In `contracts/platform.ts`, find `PrMeta` and add `latest_run_cost_usd` after `score`:

```ts
export const PrMeta = z.object({
  id: z.string().nullish(),
  number: z.number().int(),
  title: z.string(),
  author: z.string(),
  branch: z.string(),
  base: z.string(),
  head_sha: z.string(),
  additions: z.number().int(),
  deletions: z.number().int(),
  files_count: z.number().int(),
  status: PrStatus,
  opened_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  score: z.number().int().nullish(),
  latest_run_cost_usd: z.number().nullish(),  // NEW — most recent done run's cost
});
export type PrMeta = z.infer<typeof PrMeta>;
```

Apply to both vendor copies.

- [ ] **Step 4: Verify typechecks pass in both packages**

```bash
cd server && pnpm typecheck
cd client && pnpm typecheck
```

Expected: 0 errors in both.

- [ ] **Step 5: Commit**

```bash
git add \
  server/src/vendor/shared/contracts/trace.ts \
  server/src/vendor/shared/contracts/platform.ts \
  client/src/vendor/shared/contracts/trace.ts \
  client/src/vendor/shared/contracts/platform.ts
git commit -m "feat(shared): add cost_usd to RunStats/RunSummary and latest_run_cost_usd to PrMeta"
```

---

## Task 3: Server — Review Pipeline (run.repo.ts + run-executor.ts)

**Files:**
- Modify: `server/src/modules/reviews/repository/run.repo.ts`
- Modify: `server/src/modules/reviews/run-executor.ts`

**Interfaces:**
- Consumes: `agentRuns.costUsd` (Task 1), `RunSummary.cost_usd` (Task 2), `ReviewOutcome.costUsd` (already in `reviewer-core/src/review/run.ts:109`).
- Produces: `GET /pulls/:id/runs` response includes `cost_usd` per run.

- [ ] **Step 1: Update `completeAgentRun` signature in `run.repo.ts`**

File: `server/src/modules/reviews/repository/run.repo.ts`

Find the `completeAgentRun` function's `values` parameter and add `costUsd`:

```ts
export async function completeAgentRun(
  db: Db,
  runId: string,
  values: {
    status: 'done' | 'failed' | 'cancelled';
    durationMs: number;
    tokensIn: number;
    tokensOut: number;
    costUsd?: number | null;          // NEW
    findingsCount: number;
    grounding: string;
    score?: number | null;
    blockers?: number | null;
    error?: string | null;
  },
): Promise<void> {
  await db
    .update(t.agentRuns)
    .set({
      status: values.status,
      durationMs: values.durationMs,
      tokensIn: values.tokensIn,
      tokensOut: values.tokensOut,
      costUsd: values.costUsd ?? null,  // NEW
      findingsCount: values.findingsCount,
      grounding: values.grounding,
      score: values.score ?? null,
      blockers: values.blockers ?? null,
      error: values.error ?? null,
    })
    .where(eq(t.agentRuns.id, runId));
}
```

- [ ] **Step 2: Update `listRunsForPull` to return `cost_usd`**

In the same file, find `listRunsForPull` and update the `rows.map` return to include `cost_usd`:

```ts
return rows.map(({ run, agentName }) => ({
  run_id: run.id,
  agent_id: run.agentId,
  agent_name: agentName ?? null,
  provider: run.provider,
  model: run.model,
  status: run.status,
  error: run.error,
  duration_ms: run.durationMs,
  tokens_in: run.tokensIn,
  tokens_out: run.tokensOut,
  findings_count: run.findingsCount,
  grounding: run.grounding,
  ran_at: run.ranAt ? run.ranAt.toISOString() : null,
  score: run.score,
  blockers: run.blockers,
  cost_usd: run.costUsd ?? null,      // NEW
}));
```

- [ ] **Step 3: Wire `costUsd` in `run-executor.ts` — success path**

File: `server/src/modules/reviews/run-executor.ts`

Find the line (around line 213):
```ts
const { tokensIn, tokensOut, grounding } = outcome;
```

Change to:
```ts
const { tokensIn, tokensOut, grounding, costUsd } = outcome;
```

Then find the `completeAgentRun` call in the success block (around line 243) and add `costUsd`:

```ts
await this.repo.completeAgentRun(runId, {
  status: 'done',
  durationMs,
  tokensIn,
  tokensOut,
  costUsd,                             // NEW
  findingsCount: findingRows.length,
  grounding,
  score: outcome.review.score,
  blockers,
  error: null,
});
```

Add `cost_usd` to the `stats` block of the `RunTrace` (around line 264):

```ts
stats: {
  duration_ms: durationMs,
  tokens_in: tokensIn,
  tokens_out: tokensOut,
  findings: findingRows.length,
  grounding,
  cost_usd: costUsd ?? null,           // NEW
},
```

- [ ] **Step 4: Wire `costUsd` in `run-executor.ts` — failure/cancel paths**

There are two `completeAgentRun` calls in the failure path (one in `failAll`, one in the catch block). Add `costUsd: null` to both.

In the `failAll` helper (around line 76):
```ts
await this.repo
  .completeAgentRun(runId, {
    status: 'failed',
    durationMs: 0,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: null,                     // NEW
    findingsCount: 0,
    grounding: '0/0 passed',
    error: msg,
  })
```

In the catch block (around line 298):
```ts
await this.repo
  .completeAgentRun(runId, {
    status,
    durationMs: Date.now() - start,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: null,                     // NEW
    findingsCount: 0,
    grounding: '0/0 passed',
    error: msg,
  })
```

- [ ] **Step 5: Verify typecheck passes**

```bash
cd server && pnpm typecheck
```

Expected: 0 errors. TypeScript will catch any `completeAgentRun` callers that are missing the new optional field (they're fine — it's optional with `?`).

- [ ] **Step 6: Run server unit tests**

```bash
cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add \
  server/src/modules/reviews/repository/run.repo.ts \
  server/src/modules/reviews/run-executor.ts
git commit -m "feat(server): persist and return cost_usd on agent runs"
```

---

## Task 4: Server — PR List Endpoint

**Files:**
- Modify: `server/src/modules/pulls/routes.ts`

**Interfaces:**
- Consumes: `agentRuns.costUsd` (Task 1), `PrMeta.latest_run_cost_usd` (Task 2).
- Produces: `GET /repos/:id/pulls` returns `latest_run_cost_usd` per PR.

- [ ] **Step 1: Add imports to `pulls/routes.ts`**

The file already imports `{ and, desc, eq, inArray }` from `drizzle-orm`. Verify `inArray` and `desc` are present (they are). No new imports needed.

- [ ] **Step 2: Add cost query to `GET /repos/:id/pulls`**

In `server/src/modules/pulls/routes.ts`, inside the `GET /repos/:id/pulls` handler, find the `latestReviewByPr` block (around line 118) and add a `latestCostByPr` block right after it:

```ts
    // Latest cost for each PR from the most recent completed run.
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
          latestCostByPr.set(row.prId, row.costUsd ?? null);
        }
      }
    }
```

- [ ] **Step 3: Include `latest_run_cost_usd` in the returned `PrMeta`**

In the same handler, find the `rows.map((r) => {` block (around line 133) and add `latest_run_cost_usd`:

```ts
    return rows.map((r) => {
      const review = latestReviewByPr.get(r.id);
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        author: r.author,
        branch: r.branch,
        base: r.base,
        head_sha: r.headSha,
        additions: r.additions,
        deletions: r.deletions,
        files_count: r.filesCount,
        status: deriveReviewStatus({
          ghStatus: r.status,
          lastReviewedSha: r.lastReviewedSha,
          headSha: r.headSha,
          updatedAt: r.updatedAt,
          now,
        }),
        opened_at: r.openedAt?.toISOString() ?? null,
        updated_at: r.updatedAt?.toISOString() ?? null,
        score: review ? review.score : null,
        latest_run_cost_usd: latestCostByPr.get(r.id) ?? null,  // NEW
      };
    });
```

- [ ] **Step 4: Verify typecheck passes**

```bash
cd server && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/pulls/routes.ts
git commit -m "feat(server): expose latest_run_cost_usd on PR list endpoint"
```

---

## Task 5: Client — `RunCostBadge` Component + Tests

**Files:**
- Create: `client/src/components/run-cost-badge/RunCostBadge.tsx`
- Create: `client/src/components/run-cost-badge/RunCostBadge.test.tsx`
- Create: `client/src/components/run-cost-badge/index.ts`

**Interfaces:**
- Produces:
  - `RunCostBadge` — React component, consumed by Tasks 6, 7, 8.
  - `formatCost(usd: number | null | undefined): string` — exported helper, consumed by Task 9 (TraceBody).

- [ ] **Step 1: Write the failing tests first**

Create `client/src/components/run-cost-badge/RunCostBadge.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge, formatCost, formatTokenCount } from "./RunCostBadge";

afterEach(cleanup);

// --- formatCost unit tests ---
describe("formatCost", () => {
  it("returns — for null", () => expect(formatCost(null)).toBe("—"));
  it("returns — for undefined", () => expect(formatCost(undefined)).toBe("—"));
  it("returns — for 0", () => expect(formatCost(0)).toBe("—"));
  it("formats 0.012", () => expect(formatCost(0.012)).toBe("$0.012"));
  it("formats 0.0013", () => expect(formatCost(0.0013)).toBe("$0.0013"));
  it("formats 1.5", () => expect(formatCost(1.5)).toBe("$1.50"));
  it("formats 0.06", () => expect(formatCost(0.06)).toBe("$0.06"));
  it("formats very small values", () => expect(formatCost(0.00001)).toBe("<$0.0001"));
});

// --- formatTokenCount unit tests ---
describe("formatTokenCount", () => {
  it("formats below 1k", () => expect(formatTokenCount(450)).toBe("450"));
  it("formats 9119 as 9.1K", () => expect(formatTokenCount(9119)).toBe("9.1K"));
  it("formats 15000 as 15K", () => expect(formatTokenCount(15000)).toBe("15K"));
  it("formats 1200 as 1.2K", () => expect(formatTokenCount(1200)).toBe("1.2K"));
});

// --- Component: compact variant ---
describe("RunCostBadge compact", () => {
  it("renders — when costUsd is null", () => {
    render(<RunCostBadge costUsd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders $0.012 for costUsd=0.012", () => {
    render(<RunCostBadge costUsd={0.012} />);
    expect(screen.getByText("$0.012")).toBeInTheDocument();
  });

  it("renders $0.06 for costUsd=0.06", () => {
    render(<RunCostBadge costUsd={0.06} />);
    expect(screen.getByText("$0.06")).toBeInTheDocument();
  });
});

// --- Component: inline variant ---
describe("RunCostBadge inline", () => {
  it("renders — when costUsd is null", () => {
    render(<RunCostBadge costUsd={null} variant="inline" tokensIn={9119} tokensOut={0} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders tokens · cost when costUsd is set", () => {
    render(
      <RunCostBadge costUsd={0.0013} variant="inline" tokensIn={9119} tokensOut={0} />,
    );
    expect(screen.getByText(/9\.1K tok/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.0013/)).toBeInTheDocument();
  });

  it("renders combined tokens (in + out)", () => {
    render(
      <RunCostBadge costUsd={0.06} variant="inline" tokensIn={15000} tokensOut={1200} />,
    );
    // 15000 + 1200 = 16200 → 16.2K
    expect(screen.getByText(/16\.2K tok/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd client && pnpm test -- RunCostBadge
```

Expected: FAIL with "Cannot find module './RunCostBadge'" or similar.

- [ ] **Step 3: Implement `RunCostBadge.tsx`**

Create `client/src/components/run-cost-badge/RunCostBadge.tsx`:

```tsx
import React from "react";

// ---- Formatting helpers (exported so TraceBody can use formatCost directly) ----

export function formatCost(usd: number | null | undefined): string {
  if (usd == null || usd === 0) return "—";
  if (usd < 0.0001) return "<$0.0001";
  // Use up to 4 decimal places, minimum 2.
  const decimals = usd < 0.01 ? 4 : usd < 1 ? 3 : 2;
  return "$" + usd.toFixed(decimals);
}

export function formatTokenCount(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`;
  }
  return n.toLocaleString();
}

// ---- Component ----

interface RunCostBadgeProps {
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  /** compact: "$0.012" (PR list column, default)
   *  inline:  "9.1K tok · $0.0013" (run history row) */
  variant?: "compact" | "inline";
}

const compactStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono, monospace)",
  fontSize: 13,
  color: "var(--text-secondary)",
};

const inlineStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  whiteSpace: "nowrap",
};

export function RunCostBadge({
  costUsd,
  tokensIn,
  tokensOut,
  variant = "compact",
}: RunCostBadgeProps) {
  if (variant === "inline") {
    const cost = formatCost(costUsd);
    if (cost === "—") return <span style={inlineStyle}>—</span>;
    const totalTokens = (tokensIn ?? 0) + (tokensOut ?? 0);
    const tokStr = totalTokens > 0 ? `${formatTokenCount(totalTokens)} tok · ` : "";
    return (
      <span style={inlineStyle}>
        {tokStr}{cost}
      </span>
    );
  }

  return <span style={compactStyle}>{formatCost(costUsd)}</span>;
}
```

- [ ] **Step 4: Create the barrel index**

Create `client/src/components/run-cost-badge/index.ts`:

```ts
export { RunCostBadge, formatCost, formatTokenCount } from "./RunCostBadge";
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd client && pnpm test -- RunCostBadge
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/run-cost-badge/
git commit -m "feat(client): add RunCostBadge component with formatCost/formatTokenCount helpers"
```

---

## Task 6: Client — PR List Column

**Files:**
- Modify: `client/src/app/repos/[repoId]/pulls/constants.ts`
- Modify: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`
- Modify: `client/messages/en/prReview.json`

**Interfaces:**
- Consumes: `RunCostBadge` (Task 5), `PrMeta.latest_run_cost_usd` (Task 2).
- Produces: COST column visible in the PR list between STATUS and UPDATED.

- [ ] **Step 1: Add i18n key for the column header**

File: `client/messages/en/prReview.json`

Find the `"columns"` object (around line 89) and add `"cost"`:

```json
"columns": {
  "pullRequest": "Pull request",
  "author": "Author",
  "size": "Size",
  "score": "Score",
  "status": "Status",
  "cost": "Cost",
  "updated": "Updated"
},
```

- [ ] **Step 2: Update `COLUMN_KEYS` and `GRID` in `constants.ts`**

File: `client/src/app/repos/[repoId]/pulls/constants.ts`

Change `COLUMN_KEYS` to add `"cost"` between `"status"` and `"updated"`:

```ts
export const COLUMN_KEYS: string[] = [
  "pullRequest",
  "author",
  "size",
  "score",
  "status",
  "cost",     // NEW
  "updated",
];
```

Change `GRID` to add a column width for COST (78px):

```ts
export const GRID = "1fr 132px 92px 60px 118px 78px 78px";
```

(Was `"1fr 132px 92px 60px 118px 78px"` — 6 columns. Now 7.)

- [ ] **Step 3: Add `RunCostBadge` to `PRRow`**

File: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`

Add the import at the top of the file:
```tsx
import { RunCostBadge } from "@/components/run-cost-badge";
```

Inside the return JSX, add a `RunCostBadge` cell between the status badge cell and the updated cell. Find:

```tsx
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
```

Change to:

```tsx
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <div>
        <RunCostBadge costUsd={pr.latest_run_cost_usd} />
      </div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
```

- [ ] **Step 4: Verify typechecks pass**

```bash
cd client && pnpm typecheck
```

Expected: 0 errors. TypeScript will confirm `pr.latest_run_cost_usd` exists on `PrMeta` (added in Task 2).

- [ ] **Step 5: Run client tests**

```bash
cd client && pnpm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add \
  client/messages/en/prReview.json \
  "client/src/app/repos/[repoId]/pulls/constants.ts" \
  "client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx"
git commit -m "feat(client): add COST column to PR list"
```

---

## Task 7: Client — RunHistory Row + TraceBody Stats Card

**Files:**
- Modify: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx`
- Modify: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`
- Modify: `client/messages/en/runs.json`

**Interfaces:**
- Consumes: `RunCostBadge` + `formatCost` (Task 5), `RunSummary.cost_usd` (Task 2), `RunStats.cost_usd` (Task 2).

- [ ] **Step 1: Add i18n key for the Stats cost card**

File: `client/messages/en/runs.json`

Find the `"stat"` object inside `"trace"` (around line 39):

```json
"stat": {
  "duration": "DURATION",
  "tokens": "TOKENS",
  "findings": "FINDINGS"
},
```

Add `"cost"`:

```json
"stat": {
  "duration": "DURATION",
  "tokens": "TOKENS",
  "cost": "COST",
  "findings": "FINDINGS"
},
```

- [ ] **Step 2: Add cost display to `RunHistory` rows**

File: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx`

Add the import at the top:
```tsx
import { RunCostBadge } from "@/components/run-cost-badge";
```

Find the right-side metadata block in the settled run row. Currently it looks like:

```tsx
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
              {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
            </div>
```

Change to:

```tsx
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
              {r.ran_at && (
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {new Date(r.ran_at).toLocaleTimeString()}
                </span>
              )}
              {settled && (
                <RunCostBadge
                  variant="inline"
                  costUsd={r.cost_usd}
                  tokensIn={r.tokens_in}
                  tokensOut={r.tokens_out}
                />
              )}
            </div>
```

- [ ] **Step 3: Add COST stat card to `TraceBody`**

File: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`

Add the import at the top:
```tsx
import { formatCost } from "@/components/run-cost-badge";
```

Find the Stats section's `<div style={s.statsRow}>` block (around line 63):

```tsx
        <div style={s.statsRow}>
          <Stat label={t("trace.stat.duration")} val={formatSeconds(stats.duration_ms)} />
          <Stat label={t("trace.stat.tokens")} val={formatTokens(stats.tokens_in, stats.tokens_out)} />
          <Stat label={t("trace.stat.findings")} val={stats.findings} />
        </div>
```

Change to:

```tsx
        <div style={s.statsRow}>
          <Stat label={t("trace.stat.duration")} val={formatSeconds(stats.duration_ms)} />
          <Stat label={t("trace.stat.tokens")} val={formatTokens(stats.tokens_in, stats.tokens_out)} />
          <Stat label={t("trace.stat.cost")} val={formatCost(stats.cost_usd)} />
          <Stat label={t("trace.stat.findings")} val={stats.findings} />
        </div>
```

- [ ] **Step 4: Verify typechecks pass**

```bash
cd client && pnpm typecheck
```

Expected: 0 errors. TypeScript will confirm `r.cost_usd` exists on `RunSummary` and `stats.cost_usd` exists on `RunStats`.

- [ ] **Step 5: Run client tests**

```bash
cd client && pnpm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add \
  client/messages/en/runs.json \
  "client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx" \
  "client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx"
git commit -m "feat(client): show cost in run history rows and trace sidebar stats"
```

---

## Self-Review Checklist

- [x] **DB** — migration 0010 re-adds `cost_usd` as `double precision` ✓
- [x] **Schema** — `agentRuns.costUsd` added to Drizzle with matching type ✓
- [x] **Contracts** — `RunStats.cost_usd`, `RunSummary.cost_usd`, `PrMeta.latest_run_cost_usd` in both vendor copies ✓
- [x] **run.repo** — `completeAgentRun` accepts + writes `costUsd`; `listRunsForPull` returns `cost_usd` ✓
- [x] **run-executor** — `costUsd` from `ReviewOutcome` wired to both `completeAgentRun` and `RunTrace.stats` ✓
- [x] **failure paths** — both `failAll` and catch block pass `costUsd: null` ✓
- [x] **pulls/routes** — `latestCostByPr` query + `latest_run_cost_usd` in response ✓
- [x] **RunCostBadge** — compact (`$0.012`) and inline (`9.1K tok · $0.0013`) variants ✓
- [x] **null/0 render** — both render `—`, never `$0.00` ✓
- [x] **PR list** — COLUMN_KEYS + GRID + PRRow + i18n ✓
- [x] **Run history** — settled rows show cost inline ✓
- [x] **Trace sidebar** — COST stat card between TOKENS and FINDINGS ✓
- [x] **i18n** — `list.columns.cost` (prReview.json) and `trace.stat.cost` (runs.json) ✓
- [x] **Tests** — `RunCostBadge.test.tsx` covers all formatCost/formatTokenCount edge cases + both variants ✓
- [x] **Zero extra LLM calls** — cost comes from existing `ReviewOutcome.costUsd`, no new provider calls ✓
