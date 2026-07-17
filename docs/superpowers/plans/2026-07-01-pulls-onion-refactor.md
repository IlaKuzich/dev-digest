# Pulls Module Onion-Architecture Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `server/src/modules/pulls/` so it obeys the onion dependency rule — `routes.ts` only parses/delegates/maps status, business logic lives in a `service.ts`, and all SQL lives in a workspace-scoped `repository.ts` (rows never leak to routes) — while preserving current behavior exactly.

**Architecture:** Introduce the missing application + persistence layers for the `pulls` feature. A new `PullsRepository` owns the `pull_requests` / `pr_files` / `pr_commits` tables; the PR-list rollups (reviews, findings, agent-run cost) are added to the existing `ReviewRepository`, which already owns those tables; repo lookups route through the existing `RepoRepository`. All three are exposed as lazy getters on the composition root (`platform/container.ts`). A new `PullsService` orchestrates GitHub sync, backfill, and degrade-when-offline behavior; `pulls/helpers.ts` + `pulls/constants.ts` hold pure transforms. Characterization unit tests (hermetic, `server-unit` lane) lock the extracted pure logic and the service orchestration before the routes are slimmed.

**Tech Stack:** TypeScript 5.7 (ESM, `.js` import specifiers), Fastify 5 + `fastify-type-provider-zod`, Drizzle ORM 0.38 (`postgres` driver), Zod 3 contracts from `@devdigest/shared` (vendored at `src/vendor/shared`), Vitest 2, mock adapters from `src/adapters/mocks.ts`.

## Global Constraints

- Node ≥22 · pnpm ≥10 · TypeScript 5.7 · Zod 3 · Drizzle ORM 0.38 · Vitest 2 (values from root `CLAUDE.md`).
- ESM only: **every relative import ends in `.js`** (e.g. `import { X } from './helpers.js'`), even for `.ts` source. Cross-package code only via `@devdigest/shared`.
- **Services receive `Container`; never instantiate adapters directly** (server `CLAUDE.md`). External calls (GitHub) resolve off the container (`await container.github()`).
- **A `repository.ts` is the only code that touches its table, and every query is workspace-scoped** where a `workspaceId` is available (tenancy guard). Drizzle rows (`$inferSelect`) stay inside repository/service; routes return contract DTOs.
- **Routes declare Zod `params`/`body` schemas** — no hand-rolled `Schema.parse(req.body)`.
- **Secrets via `SecretsProvider`, never `process.env`** in feature code (not touched here, but do not introduce it).
- **`server/package.json` is `skip-worktree`** — do NOT edit it (no new npm scripts). Unit lane is invoked as `pnpm exec vitest run --exclude '**/*.it.test.ts'`.
- **`cost_usd` is `NUMERIC(12,6)`** → Drizzle returns it as a **string** at runtime; every read path must cast with `Number(x)` and null-guard (`x != null ? Number(x) : null`). (server `INSIGHTS.md`, 2026-06-25.)
- Behavior-preserving refactor: the JSON shape returned by `GET /repos/:id/pulls`, `GET /pulls/:id`, `GET/POST /pulls/:id/comments` must not change. `PrMeta` / `PrDetail` / `PrReviewComment` / `PrCommentInput` contracts are the source of truth (`src/vendor/shared/contracts/platform.ts`).
- Tests hermetic by default (`src/adapters/mocks.ts`); DB-backed tests use the `*.it.test.ts` suffix (out of scope here — see Task 5 note).

---

## File Structure

- `server/vitest.config.ts` — **create.** Minimal Vitest config (node env, `src/**/*.test.ts`). Needed so the unit lane discovers the new colocated tests. (package.json is skip-worktree, so config lives in its own file.)
- `server/src/modules/pulls/constants.ts` — **create.** Literals: `BACKFILL_LIMIT`, `TOP_FINDINGS_LIMIT`, `SEV_ORDER`, `SevKey`.
- `server/src/modules/pulls/helpers.ts` — **create.** Pure transforms: `snippetOf`, `latestByPr`, `buildFindingsBuckets`, `toPrMetaDto`, `prDetailFromGitHub`, `prDetailFromPersisted`, plus the row/DTO helper types.
- `server/src/modules/pulls/helpers.test.ts` — **create.** Hermetic unit tests for `helpers.ts` + `constants.ts`.
- `server/src/modules/pulls/repository.ts` — **create.** `PullsRepository` — owns `pull_requests` / `pr_files` / `pr_commits`.
- `server/src/modules/pulls/service.ts` — **create.** `PullsService` — GitHub sync, backfill, rollups, degrade-when-offline.
- `server/src/modules/pulls/service.test.ts` — **create.** Hermetic orchestration tests (MockGitHubClient + injected fake repos).
- `server/src/modules/pulls/routes.ts` — **modify** (currently 424 lines). Slim to parse → delegate → map status.
- `server/src/modules/pulls/status.ts` — **unchanged.** `deriveReviewStatus` / `rollupSeverities` already pure; reused by helpers.
- `server/src/platform/container.ts` — **modify.** Add `reposRepo` and `pullsRepo` lazy getters.
- `server/src/modules/reviews/repository.ts` — **modify.** Add 3 rollup methods delegating to the split repo files.
- `server/src/modules/reviews/repository/review.repo.ts` — **modify.** `reviewScoresForPrs`, `activeFindingsForPrs`.
- `server/src/modules/reviews/repository/run.repo.ts` — **modify.** `doneRunCostsForPrs` (with the `Number(cost_usd)` cast).

---

### Task 1: Pure helpers + constants (with characterization tests)

Extract every pure transform currently inlined in `routes.ts` into `helpers.ts` / `constants.ts`, and lock their behavior with hermetic unit tests. This task adds `vitest.config.ts` (the first test needs a discoverable config).

**Files:**
- Create: `server/vitest.config.ts`
- Create: `server/src/modules/pulls/constants.ts`
- Create: `server/src/modules/pulls/helpers.ts`
- Test: `server/src/modules/pulls/helpers.test.ts`
- Reference (do not modify): `server/src/modules/pulls/status.ts` (`deriveReviewStatus`), `server/src/db/rows.ts` (`PullRow`, `FindingRow`), `server/src/vendor/shared/contracts/platform.ts` (`PrMeta`, `PrDetail`, `PrFile`, `PrCommit`)

**Interfaces:**
- Consumes: `PullRow` from `../../db/rows.js`; `PrMeta`, `PrDetail` from `@devdigest/shared`; `deriveReviewStatus` from `./status.js`.
- Produces (relied on by Tasks 2–5):
  - `constants.ts`: `BACKFILL_LIMIT = 10`, `TOP_FINDINGS_LIMIT = 6`, `type SevKey = 'CRITICAL' | 'WARNING' | 'SUGGESTION'`, `SEV_ORDER: Record<SevKey, number>`.
  - `helpers.ts`:
    - `snippetOf(rationale: string): string`
    - `interface ReviewScoreRow { prId: string; score: number | null }`
    - `interface RunCostRow { prId: string; costUsd: number | null }`
    - `interface FindingRollupRow { prId: string; id: string; severity: string; category: string; title: string; file: string; startLine: number; endLine: number; confidence: number; rationale: string }`
    - `interface TopFinding { id: string; severity: string; category: string; title: string; file: string; start_line: number; end_line: number; confidence: number; rationale_snippet: string }`
    - `interface FindingsBucket { bySeverity: { CRITICAL: number; WARNING: number; SUGGESTION: number }; top: TopFinding[] }`
    - `latestByPr<T extends { prId: string }>(rowsNewestFirst: T[]): Map<string, T>`
    - `buildFindingsBuckets(rows: FindingRollupRow[]): Map<string, FindingsBucket>`
    - `interface PrListRollups { review: Map<string, ReviewScoreRow>; cost: Map<string, RunCostRow>; findings: Map<string, FindingsBucket> }`
    - `toPrMetaDto(row: PullRow, rollups: PrListRollups, now: number): PrMeta`
    - `prDetailFromGitHub(pr: PullRow, detail: PrDetail): PrDetail`
    - `prDetailFromPersisted(pr: PullRow, files: { path: string; additions: number; deletions: number; patch: string | null }[], commits: { sha: string; message: string; author: string; committedAt: Date | null }[]): PrDetail`

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

// Unit lane is hermetic (no Docker); integration tests use the *.it.test.ts
// suffix and are excluded via the CLI (`--exclude '**/*.it.test.ts'`).
// package.json is skip-worktree, so config lives here rather than in scripts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: Write the failing test**

`server/src/modules/pulls/helpers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SEV_ORDER, TOP_FINDINGS_LIMIT } from './constants.js';
import {
  snippetOf,
  latestByPr,
  buildFindingsBuckets,
  toPrMetaDto,
  prDetailFromGitHub,
  prDetailFromPersisted,
  type FindingRollupRow,
  type PrListRollups,
} from './helpers.js';
import type { PullRow } from '../../db/rows.js';
import type { PrDetail } from '@devdigest/shared';

const basePull: PullRow = {
  id: 'pr-1',
  workspaceId: 'ws-1',
  repoId: 'repo-1',
  number: 7,
  title: 'Add caching',
  author: 'ada',
  branch: 'feat/cache',
  base: 'main',
  headSha: 'sha-head',
  lastReviewedSha: 'sha-head',
  additions: 10,
  deletions: 2,
  filesCount: 3,
  status: 'open',
  body: 'body text',
  openedAt: new Date('2026-06-01T00:00:00Z'),
  updatedAt: new Date('2026-06-01T00:00:00Z'),
};

const emptyRollups: PrListRollups = { review: new Map(), cost: new Map(), findings: new Map() };

describe('snippetOf', () => {
  it('returns short rationales unchanged', () => {
    expect(snippetOf('short reason')).toBe('short reason');
  });
  it('truncates long rationales at a word boundary with an ellipsis', () => {
    const long = 'word '.repeat(40).trim(); // 199 chars
    const out = snippetOf(long);
    expect(out.length).toBeLessThanOrEqual(121);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s\S+…$/); // no partial trailing word before the ellipsis
  });
});

describe('latestByPr', () => {
  it('keeps the first row seen per prId (input is newest-first)', () => {
    const map = latestByPr([
      { prId: 'a', score: 90 },
      { prId: 'a', score: 10 },
      { prId: 'b', score: 50 },
    ]);
    expect(map.get('a')).toEqual({ prId: 'a', score: 90 });
    expect(map.get('b')).toEqual({ prId: 'b', score: 50 });
    expect(map.size).toBe(2);
  });
});

describe('buildFindingsBuckets', () => {
  const mk = (over: Partial<FindingRollupRow>): FindingRollupRow => ({
    prId: 'pr-1', id: 'f', severity: 'WARNING', category: 'bug', title: 't',
    file: 'a.ts', startLine: 1, endLine: 2, confidence: 0.5, rationale: 'why', ...over,
  });

  it('counts by severity and maps rows to TopFinding DTO fields', () => {
    const map = buildFindingsBuckets([
      mk({ id: '1', severity: 'CRITICAL', confidence: 0.9 }),
      mk({ id: '2', severity: 'WARNING', confidence: 0.8 }),
      mk({ id: '3', severity: 'SUGGESTION', confidence: 0.7 }),
    ]);
    const b = map.get('pr-1')!;
    expect(b.bySeverity).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 1 });
    expect(b.top[0]).toMatchObject({ id: '1', start_line: 1, end_line: 2, rationale_snippet: 'why' });
  });

  it('sorts by severity then confidence desc and trims to TOP_FINDINGS_LIMIT', () => {
    const rows = Array.from({ length: TOP_FINDINGS_LIMIT + 2 }, (_, i) =>
      mk({ id: String(i), severity: 'SUGGESTION', confidence: i / 100 }),
    );
    rows.push(mk({ id: 'crit', severity: 'CRITICAL', confidence: 0.01 }));
    const b = buildFindingsBuckets(rows).get('pr-1')!;
    expect(b.top).toHaveLength(TOP_FINDINGS_LIMIT);
    expect(b.top[0].id).toBe('crit'); // CRITICAL wins regardless of confidence
    expect(SEV_ORDER.CRITICAL).toBeLessThan(SEV_ORDER.WARNING);
  });
});

describe('toPrMetaDto', () => {
  it('maps a row to PrMeta with rollups and derived status', () => {
    const rollups: PrListRollups = {
      review: new Map([['pr-1', { prId: 'pr-1', score: 88 }]]),
      cost: new Map([['pr-1', { prId: 'pr-1', costUsd: 0.42 }]]),
      findings: new Map([['pr-1', { bySeverity: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 }, top: [] }]]),
    };
    const dto = toPrMetaDto(basePull, rollups, Date.parse('2026-06-02T00:00:00Z'));
    expect(dto).toMatchObject({
      id: 'pr-1', number: 7, head_sha: 'sha-head',
      score: 88, latest_run_cost_usd: 0.42,
      findings_by_severity: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 },
      status: 'reviewed',
    });
  });
  it('nulls score/cost/findings when absent', () => {
    const dto = toPrMetaDto(basePull, emptyRollups, Date.now());
    expect(dto.score).toBeNull();
    expect(dto.latest_run_cost_usd).toBeNull();
    expect(dto.findings_by_severity).toBeNull();
    expect(dto.top_findings).toBeNull();
  });
});

describe('prDetail mappers', () => {
  it('prDetailFromGitHub overrides the id with the local PR id', () => {
    const detail = { number: 7, files: [], commits: [] } as unknown as PrDetail;
    expect(prDetailFromGitHub(basePull, detail).id).toBe('pr-1');
  });
  it('prDetailFromPersisted builds the DTO from persisted rows', () => {
    const dto = prDetailFromPersisted(
      basePull,
      [{ path: 'a.ts', additions: 1, deletions: 0, patch: null }],
      [{ sha: 's', message: 'm', author: 'ada', committedAt: null }],
    );
    expect(dto.files).toHaveLength(1);
    expect(dto.commits[0]).toEqual({ sha: 's', message: 'm', author: 'ada', committed_at: null });
    expect(dto.body).toBe('body text');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd server && pnpm exec vitest run src/modules/pulls/helpers.test.ts`
Expected: FAIL — `Cannot find module './constants.js'` / `'./helpers.js'`.

- [ ] **Step 4: Write `constants.ts`**

`server/src/modules/pulls/constants.ts`:

```ts
/** PR-list module literals (pure — no I/O). */

/** Max diff-stat backfills per list request (each is a GitHub detail fetch). */
export const BACKFILL_LIMIT = 10;

/** Findings shown in a PR's list-row preview, after severity+confidence sort. */
export const TOP_FINDINGS_LIMIT = 6;

export type SevKey = 'CRITICAL' | 'WARNING' | 'SUGGESTION';

/** Sort order for the top-findings preview (lower = higher priority). */
export const SEV_ORDER: Record<SevKey, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };
```

- [ ] **Step 5: Write `helpers.ts`**

`server/src/modules/pulls/helpers.ts`:

```ts
import type { PrMeta, PrDetail } from '@devdigest/shared';
import type { PullRow } from '../../db/rows.js';
import { deriveReviewStatus } from './status.js';
import { SEV_ORDER, TOP_FINDINGS_LIMIT, type SevKey } from './constants.js';

/**
 * pulls PR-list transforms (pure — no DB / `this`, so they unit-test cleanly).
 * The repository returns rows newest-first; these helpers dedup/group/sort and
 * map rows → contract DTOs so `routes.ts` and `service.ts` stay logic-light.
 */

/** Trim a rationale to a ~120-char preview, cut on a word boundary. */
export function snippetOf(rationale: string): string {
  if (rationale.length <= 120) return rationale;
  return rationale.slice(0, 120).replace(/\s\S+$/, '') + '…';
}

export interface ReviewScoreRow {
  prId: string;
  score: number | null;
}

export interface RunCostRow {
  prId: string;
  costUsd: number | null;
}

export interface FindingRollupRow {
  prId: string;
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  startLine: number;
  endLine: number;
  confidence: number;
  rationale: string;
}

export interface TopFinding {
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  confidence: number;
  rationale_snippet: string;
}

export interface FindingsBucket {
  bySeverity: { CRITICAL: number; WARNING: number; SUGGESTION: number };
  top: TopFinding[];
}

/** First row seen per prId wins — pass rows already ordered newest-first. */
export function latestByPr<T extends { prId: string }>(rowsNewestFirst: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rowsNewestFirst) {
    if (!map.has(row.prId)) map.set(row.prId, row);
  }
  return map;
}

/** Group active findings per PR: severity tally + top-N preview (sorted). */
export function buildFindingsBuckets(rows: FindingRollupRow[]): Map<string, FindingsBucket> {
  const byPr = new Map<string, FindingsBucket>();
  for (const row of rows) {
    if (!byPr.has(row.prId)) {
      byPr.set(row.prId, { bySeverity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }, top: [] });
    }
    const bucket = byPr.get(row.prId)!;
    const sev = row.severity as SevKey;
    if (sev in bucket.bySeverity) bucket.bySeverity[sev]++;
    bucket.top.push({
      id: row.id,
      severity: row.severity,
      category: row.category,
      title: row.title,
      file: row.file,
      start_line: row.startLine,
      end_line: row.endLine,
      confidence: row.confidence,
      rationale_snippet: snippetOf(row.rationale),
    });
  }
  for (const bucket of byPr.values()) {
    bucket.top.sort((a, b) => {
      const sevDiff =
        (SEV_ORDER[a.severity as SevKey] ?? 3) - (SEV_ORDER[b.severity as SevKey] ?? 3);
      return sevDiff !== 0 ? sevDiff : b.confidence - a.confidence;
    });
    bucket.top = bucket.top.slice(0, TOP_FINDINGS_LIMIT);
  }
  return byPr;
}

export interface PrListRollups {
  review: Map<string, ReviewScoreRow>;
  cost: Map<string, RunCostRow>;
  findings: Map<string, FindingsBucket>;
}

/** Map a persisted PR row + rollups → the PrMeta list DTO. */
export function toPrMetaDto(row: PullRow, rollups: PrListRollups, now: number): PrMeta {
  const review = rollups.review.get(row.id);
  const bucket = rollups.findings.get(row.id);
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    author: row.author,
    branch: row.branch,
    base: row.base,
    head_sha: row.headSha,
    additions: row.additions,
    deletions: row.deletions,
    files_count: row.filesCount,
    status: deriveReviewStatus({
      ghStatus: row.status,
      lastReviewedSha: row.lastReviewedSha,
      headSha: row.headSha,
      updatedAt: row.updatedAt,
      now,
    }),
    opened_at: row.openedAt?.toISOString() ?? null,
    updated_at: row.updatedAt?.toISOString() ?? null,
    score: review ? review.score : null,
    latest_run_cost_usd: rollups.cost.get(row.id)?.costUsd ?? null,
    findings_by_severity: bucket?.bySeverity ?? null,
    top_findings: bucket?.top ?? null,
  };
}

/** GitHub detail wins; only the local PR id is substituted. */
export function prDetailFromGitHub(pr: PullRow, detail: PrDetail): PrDetail {
  return { ...detail, id: pr.id };
}

/** Build PrDetail from persisted rows when GitHub is unavailable (offline). */
export function prDetailFromPersisted(
  pr: PullRow,
  files: { path: string; additions: number; deletions: number; patch: string | null }[],
  commits: { sha: string; message: string; author: string; committedAt: Date | null }[],
): PrDetail {
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    branch: pr.branch,
    base: pr.base,
    head_sha: pr.headSha,
    additions: pr.additions,
    deletions: pr.deletions,
    files_count: pr.filesCount,
    status: pr.status as PrDetail['status'],
    opened_at: pr.openedAt?.toISOString() ?? null,
    updated_at: pr.updatedAt?.toISOString() ?? null,
    body: pr.body ?? null,
    files: files.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? null,
    })),
    commits: commits.map((c) => ({
      sha: c.sha,
      message: c.message,
      author: c.author,
      committed_at: c.committedAt?.toISOString() ?? null,
    })),
  };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd server && pnpm exec vitest run src/modules/pulls/helpers.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 7: Typecheck**

Run: `cd server && pnpm typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add server/vitest.config.ts server/src/modules/pulls/constants.ts server/src/modules/pulls/helpers.ts server/src/modules/pulls/helpers.test.ts
git commit -m "refactor(pulls): extract pure list/detail transforms into helpers + constants"
```

---

### Task 2: PullsRepository + container getters

Create the persistence layer that owns `pull_requests` / `pr_files` / `pr_commits`, and expose it (plus the existing `RepoRepository`) as lazy getters on the composition root.

**Files:**
- Create: `server/src/modules/pulls/repository.ts`
- Modify: `server/src/platform/container.ts`
- Reference: `server/src/modules/repos/repository.ts` (pattern + `RepoRepository`), `server/src/db/schema/pulls.ts`, `server/src/db/rows.ts` (`PullRow`)

**Interfaces:**
- Consumes: `Db` from `../../db/client.js`; `PrMeta` from `@devdigest/shared`; `PullRow` from `../../db/rows.js`; schema barrel `* as t` from `../../db/schema.js`.
- Produces (relied on by Tasks 4–5):
  - `class PullsRepository { constructor(db: Db) }` with:
    - `getById(workspaceId: string, prId: string): Promise<PullRow | undefined>`
    - `listByRepo(repoId: string): Promise<PullRow[]>`
    - `getFiles(prId: string): Promise<PrFileRow[]>`
    - `getCommits(prId: string): Promise<PrCommitRow[]>`
    - `upsertFromGitHub(workspaceId: string, repoId: string, pulls: PrMeta[]): Promise<void>`
    - `updateStats(prId: string, stats: { additions: number; deletions: number; filesCount: number }): Promise<void>`
    - `replaceFiles(prId: string, files: PrMeta extends never ? never : import('@devdigest/shared').PrFile[]): Promise<void>` — see code (typed as `PrFile[]`)
    - `replaceCommits(prId: string, commits: import('@devdigest/shared').PrCommit[]): Promise<void>` — see code (typed as `PrCommit[]`)
    - `updateDetail(prId: string, values: { body: string | null; additions: number; deletions: number; filesCount: number }): Promise<void>`
  - exported types `PrFileRow`, `PrCommitRow` (re-exported `$inferSelect`).
  - `container.pullsRepo: PullsRepository` and `container.reposRepo: RepoRepository` (lazy getters).

- [ ] **Step 1: Write `repository.ts`**

`server/src/modules/pulls/repository.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrMeta, PrFile, PrCommit } from '@devdigest/shared';
import type { PullRow } from '../../db/rows.js';

/**
 * F1 — pulls data-access. The ONLY place that touches `pull_requests`,
 * `pr_files`, and `pr_commits`. PR reads are workspace-scoped (tenancy guard);
 * child-table writes are scoped through their parent PR (which carries the
 * workspace). Import is idempotent on (repo_id, number).
 */

export type { PullRow };
export type PrFileRow = typeof t.prFiles.$inferSelect;
export type PrCommitRow = typeof t.prCommits.$inferSelect;

export class PullsRepository {
  constructor(private db: Db) {}

  getById(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    return this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)))
      .then((rows) => rows[0]);
  }

  listByRepo(repoId: string): Promise<PullRow[]> {
    return this.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
  }

  getFiles(prId: string): Promise<PrFileRow[]> {
    return this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
  }

  getCommits(prId: string): Promise<PrCommitRow[]> {
    return this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
  }

  /** Idempotent import: insert new PRs, refresh the volatile fields on conflict. */
  async upsertFromGitHub(workspaceId: string, repoId: string, pulls: PrMeta[]): Promise<void> {
    for (const pr of pulls) {
      await this.db
        .insert(t.pullRequests)
        .values({
          workspaceId,
          repoId,
          number: pr.number,
          title: pr.title,
          author: pr.author,
          branch: pr.branch,
          base: pr.base,
          headSha: pr.head_sha,
          additions: pr.additions,
          deletions: pr.deletions,
          filesCount: pr.files_count,
          status: pr.status,
          openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
          updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
        })
        .onConflictDoUpdate({
          target: [t.pullRequests.repoId, t.pullRequests.number],
          set: {
            title: pr.title,
            headSha: pr.head_sha,
            status: pr.status,
            updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
          },
        });
    }
  }

  async updateStats(
    prId: string,
    stats: { additions: number; deletions: number; filesCount: number },
  ): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({ additions: stats.additions, deletions: stats.deletions, filesCount: stats.filesCount })
      .where(eq(t.pullRequests.id, prId));
  }

  async replaceFiles(prId: string, files: PrFile[]): Promise<void> {
    await this.db.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
    if (files.length > 0) {
      await this.db.insert(t.prFiles).values(
        files.map((f) => ({
          prId,
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
      );
    }
  }

  async replaceCommits(prId: string, commits: PrCommit[]): Promise<void> {
    await this.db.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
    if (commits.length > 0) {
      await this.db.insert(t.prCommits).values(
        commits.map((c) => ({
          prId,
          sha: c.sha,
          message: c.message,
          author: c.author,
          committedAt: c.committed_at ? new Date(c.committed_at) : null,
        })),
      );
    }
  }

  async updateDetail(
    prId: string,
    values: { body: string | null; additions: number; deletions: number; filesCount: number },
  ): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({
        body: values.body,
        additions: values.additions,
        deletions: values.deletions,
        filesCount: values.filesCount,
      })
      .where(eq(t.pullRequests.id, prId));
  }
}
```

- [ ] **Step 2: Add the container getters**

In `server/src/platform/container.ts`, add the import near the other repository imports (after the `ReviewRepository` import on line 27):

```ts
import { RepoRepository } from '../modules/repos/repository.js';
import { PullsRepository } from '../modules/pulls/repository.js';
```

Add the backing fields alongside `_agentsRepo` / `_reviewRepo` (near line 73):

```ts
  private _reposRepo?: RepoRepository;
  private _pullsRepo?: PullsRepository;
```

Add the getters next to `reviewRepo` (after line 101):

```ts
  get reposRepo(): RepoRepository {
    return (this._reposRepo ??= new RepoRepository(this.db));
  }

  get pullsRepo(): PullsRepository {
    return (this._pullsRepo ??= new PullsRepository(this.db));
  }
```

- [ ] **Step 3: Typecheck**

Run: `cd server && pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Run the unit lane (no regressions)**

Run: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`
Expected: PASS (Task 1 tests still green; nothing else broken).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/pulls/repository.ts server/src/platform/container.ts
git commit -m "refactor(pulls): add PullsRepository + wire pullsRepo/reposRepo getters"
```

---

### Task 3: PR-list rollup queries on ReviewRepository

The list endpoint's score/cost/findings rollups read `reviews`, `agent_runs`, and `findings` — tables owned by `ReviewRepository`. Add three read methods there (respecting table ownership) rather than letting `pulls` reach into them. Per server `INSIGHTS.md`, keep the wrapper class and the split repo files in sync manually.

**Files:**
- Modify: `server/src/modules/reviews/repository/review.repo.ts`
- Modify: `server/src/modules/reviews/repository/run.repo.ts`
- Modify: `server/src/modules/reviews/repository.ts`
- Reference: `server/src/db/schema/reviews.ts` (`reviews`, `findings`), `server/src/db/schema/runs.ts` (`agentRuns`), Task 1 helper types (`ReviewScoreRow`, `RunCostRow`, `FindingRollupRow`)

**Interfaces:**
- Consumes: `Db`, `* as t`, `and/desc/eq/inArray/isNull` from `drizzle-orm`, `ReviewScoreRow`/`RunCostRow`/`FindingRollupRow` from `../../pulls/helpers.js`.
- Produces (relied on by Task 4) — on `ReviewRepository`:
  - `reviewScoresForPrs(prIds: string[]): Promise<ReviewScoreRow[]>` (newest-first)
  - `doneRunCostsForPrs(prIds: string[]): Promise<RunCostRow[]>` (newest-first; `cost_usd` cast via `Number`)
  - `activeFindingsForPrs(prIds: string[]): Promise<FindingRollupRow[]>` (non-dismissed only)

- [ ] **Step 1: Add query functions to `review.repo.ts`**

Append to `server/src/modules/reviews/repository/review.repo.ts` (ensure `and`, `desc`, `inArray`, `isNull` are in the `drizzle-orm` import at the top; add whichever are missing):

```ts
import type { ReviewScoreRow, FindingRollupRow } from '../../pulls/helpers.js';

/** Latest-review scores for PRs (kind='review'), newest-first for dedup. */
export async function reviewScoresForPrs(db: Db, prIds: string[]): Promise<ReviewScoreRow[]> {
  if (prIds.length === 0) return [];
  const rows = await db
    .select({ prId: t.reviews.prId, score: t.reviews.score })
    .from(t.reviews)
    .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
    .orderBy(desc(t.reviews.createdAt));
  return rows.map((r) => ({ prId: r.prId, score: r.score }));
}

/** Non-dismissed findings for PRs (joined via review → pr) for the list rollup. */
export async function activeFindingsForPrs(db: Db, prIds: string[]): Promise<FindingRollupRow[]> {
  if (prIds.length === 0) return [];
  const rows = await db
    .select({
      prId: t.reviews.prId,
      id: t.findings.id,
      severity: t.findings.severity,
      category: t.findings.category,
      title: t.findings.title,
      file: t.findings.file,
      startLine: t.findings.startLine,
      endLine: t.findings.endLine,
      confidence: t.findings.confidence,
      rationale: t.findings.rationale,
    })
    .from(t.findings)
    .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
    .where(and(inArray(t.reviews.prId, prIds), isNull(t.findings.dismissedAt)));
  return rows;
}
```

- [ ] **Step 2: Add the cost query to `run.repo.ts`**

Append to `server/src/modules/reviews/repository/run.repo.ts` (ensure `and`, `desc`, `eq`, `inArray` are imported from `drizzle-orm`):

```ts
import type { RunCostRow } from '../../pulls/helpers.js';

/**
 * Latest completed-run cost per PR, newest-first for dedup. `cost_usd` is
 * NUMERIC → returned as a string by the driver, so cast with Number (INSIGHTS
 * 2026-06-25).
 */
export async function doneRunCostsForPrs(db: Db, prIds: string[]): Promise<RunCostRow[]> {
  if (prIds.length === 0) return [];
  const rows = await db
    .select({ prId: t.agentRuns.prId, costUsd: t.agentRuns.costUsd })
    .from(t.agentRuns)
    .where(and(inArray(t.agentRuns.prId, prIds), eq(t.agentRuns.status, 'done')))
    .orderBy(desc(t.agentRuns.ranAt));
  return rows.flatMap((r) =>
    r.prId ? [{ prId: r.prId, costUsd: r.costUsd != null ? Number(r.costUsd) : null }] : [],
  );
}
```

- [ ] **Step 3: Expose them on the `ReviewRepository` wrapper**

In `server/src/modules/reviews/repository.ts`, add the import of the rollup types near the top (after line 3):

```ts
import type { ReviewScoreRow, RunCostRow, FindingRollupRow } from '../pulls/helpers.js';
```

Add these methods to the class (e.g. after `reviewsForPull`, near line 65):

```ts
  // ---- PR-list rollups (consumed by the pulls list endpoint) --------------

  reviewScoresForPrs(prIds: string[]): Promise<ReviewScoreRow[]> {
    return reviewRepo.reviewScoresForPrs(this.db, prIds);
  }

  activeFindingsForPrs(prIds: string[]): Promise<FindingRollupRow[]> {
    return reviewRepo.activeFindingsForPrs(this.db, prIds);
  }

  doneRunCostsForPrs(prIds: string[]): Promise<RunCostRow[]> {
    return runRepo.doneRunCostsForPrs(this.db, prIds);
  }
```

- [ ] **Step 4: Typecheck**

Run: `cd server && pnpm typecheck`
Expected: no errors. (If `and`/`desc`/`inArray`/`isNull` were missing from a file's `drizzle-orm` import, the error names the file — add them.)

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/reviews/repository.ts server/src/modules/reviews/repository/review.repo.ts server/src/modules/reviews/repository/run.repo.ts
git commit -m "refactor(reviews): add PR-list rollup queries (scores, costs, active findings)"
```

---

### Task 4: PullsService (orchestration) + hermetic tests

Create the application layer that orchestrates GitHub sync, backfill, rollups, and degrade-when-offline — the logic currently inlined in `routes.ts`. Test it hermetically with `MockGitHubClient` and injected fake repositories.

**Files:**
- Create: `server/src/modules/pulls/service.ts`
- Test: `server/src/modules/pulls/service.test.ts`
- Reference: `server/src/platform/container.ts` (`Container`, `ContainerOverrides`), `server/src/adapters/mocks.ts` (`MockGitHubClient`), `server/src/platform/config.ts` (`AppConfig`), `server/src/platform/errors.ts` (`AppError`, `NotFoundError`), `server/src/modules/repos/repository.ts` (`RepoRepository`), Tasks 1–3 outputs.

**Interfaces:**
- Consumes: `Container` from `../../platform/container.js`; `PullsRepository` (Task 2); `RepoRepository` (existing); the rollup methods on `ReviewRepository` (Task 3); helpers/constants (Task 1); `container.github()`; contracts `PrMeta`/`PrDetail`/`PrReviewComment`/`PrCommentInput`/`GitHubClient` from `@devdigest/shared`.
- Produces (relied on by Task 5):
  - `class PullsService` with constructor `(container: Container, repos?, pulls?, reviews?)` where the optional deps default to `container.reposRepo` / `container.pullsRepo` / `container.reviewRepo` (a test seam). Types:
    - `repos: Pick<RepoRepository, 'getById'>`
    - `pulls: PullsRepository`
    - `reviews: Pick<ReviewRepository, 'reviewScoresForPrs' | 'doneRunCostsForPrs' | 'activeFindingsForPrs'>`
  - Methods:
    - `listForRepo(workspaceId: string, repoId: string): Promise<PrMeta[]>`
    - `getDetail(workspaceId: string, prId: string): Promise<PrDetail>`
    - `listComments(workspaceId: string, prId: string): Promise<PrReviewComment[]>`
    - `createComment(workspaceId: string, prId: string, input: PrCommentInput): Promise<PrReviewComment>`

- [ ] **Step 1: Write `service.ts`**

`server/src/modules/pulls/service.ts`:

```ts
import type { PrMeta, PrDetail, PrReviewComment, PrCommentInput, GitHubClient } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { RepoRepository } from '../repos/repository.js';
import type { ReviewRepository } from '../reviews/repository.js';
import { PullsRepository } from './repository.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { BACKFILL_LIMIT } from './constants.js';
import {
  latestByPr,
  buildFindingsBuckets,
  toPrMetaDto,
  prDetailFromGitHub,
  prDetailFromPersisted,
  type PrListRollups,
} from './helpers.js';

type PrListReadModel = Pick<
  ReviewRepository,
  'reviewScoresForPrs' | 'doneRunCostsForPrs' | 'activeFindingsForPrs'
>;

/**
 * F1 — pulls use case. GitHub PR import (list + per-PR detail) and inline
 * review comments. Local-first: sync from GitHub when a token is configured,
 * but never fail the read — persisted/seeded PRs stay viewable offline.
 *
 * No HTTP and no raw SQL live here — persistence goes through PullsRepository /
 * ReviewRepository, pure transforms through helpers.ts.
 */
export class PullsService {
  private readonly repos: Pick<RepoRepository, 'getById'>;
  private readonly pulls: PullsRepository;
  private readonly reviews: PrListReadModel;

  constructor(
    private container: Container,
    repos: Pick<RepoRepository, 'getById'> = container.reposRepo,
    pulls: PullsRepository = container.pullsRepo,
    reviews: PrListReadModel = container.reviewRepo,
  ) {
    this.repos = repos;
    this.pulls = pulls;
    this.reviews = reviews;
  }

  /** Best-effort GitHub client — null when no token / offline. */
  private async githubOrNull(): Promise<GitHubClient | null> {
    try {
      return await this.container.github();
    } catch (err) {
      this.container.jobs; // no-op; keep import surface stable
      return null;
    }
  }

  async listForRepo(workspaceId: string, repoId: string): Promise<PrMeta[]> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.githubOrNull();
    if (gh) {
      try {
        const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
        await this.pulls.upsertFromGitHub(workspaceId, repo.id, pulls);
      } catch {
        // offline / error → serve persisted PRs
      }
    }

    const rows = await this.pulls.listByRepo(repo.id);

    // Backfill diff stats for freshly-imported PRs (zeroed size/diff), capped.
    if (gh) {
      const needStats = rows
        .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
        .slice(0, BACKFILL_LIMIT);
      for (const r of needStats) {
        try {
          const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
          await this.pulls.updateStats(r.id, {
            additions: detail.additions,
            deletions: detail.deletions,
            filesCount: detail.files_count,
          });
          r.additions = detail.additions;
          r.deletions = detail.deletions;
          r.filesCount = detail.files_count;
        } catch {
          // per-PR backfill is best-effort
        }
      }
    }

    const prIds = rows.map((r) => r.id);
    const [scores, costs, findings] = await Promise.all([
      this.reviews.reviewScoresForPrs(prIds),
      this.reviews.doneRunCostsForPrs(prIds),
      this.reviews.activeFindingsForPrs(prIds),
    ]);
    const rollups: PrListRollups = {
      review: latestByPr(scores),
      cost: latestByPr(costs),
      findings: buildFindingsBuckets(findings),
    };

    const now = Date.now();
    return rows.map((r) => toPrMetaDto(r, rollups, now));
  }

  async getDetail(workspaceId: string, prId: string): Promise<PrDetail> {
    const pr = await this.pulls.getById(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.repos.getById(workspaceId, pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    try {
      const gh = await this.container.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
      await this.pulls.replaceFiles(pr.id, detail.files);
      await this.pulls.replaceCommits(pr.id, detail.commits);
      await this.pulls.updateDetail(pr.id, {
        body: detail.body ?? null,
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.files_count,
      });
      return prDetailFromGitHub(pr, detail);
    } catch {
      const files = await this.pulls.getFiles(pr.id);
      const commits = await this.pulls.getCommits(pr.id);
      return prDetailFromPersisted(pr, files, commits);
    }
  }

  private async resolvePrAndRepo(workspaceId: string, prId: string) {
    const pr = await this.pulls.getById(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.repos.getById(workspaceId, pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  async listComments(workspaceId: string, prId: string): Promise<PrReviewComment[]> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    const gh = await this.githubOrNull();
    if (!gh) return [];
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch {
      return [];
    }
  }

  async createComment(
    workspaceId: string,
    prId: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.container.github();
    } catch {
      throw new AppError('github_unavailable', 'Connect a GitHub token to post comments.', 400);
    }
    try {
      return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
        commitId: pr.headSha,
        path: input.path,
        line: input.line,
        ...(input.side ? { side: input.side } : {}),
        body: input.body,
        ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
    }
  }
}
```

> Note: the `this.container.jobs; // no-op` line in `githubOrNull` is a placeholder to avoid an unused-`err` lint. Replace it with the project's logger call if the reviewer prefers — e.g. drop the try body comment and keep `return null;`. Do NOT leave a dead statement in the final code; simplest is:
> ```ts
> private async githubOrNull(): Promise<GitHubClient | null> {
>   try { return await this.container.github(); } catch { return null; }
> }
> ```
> Use this simpler form.

- [ ] **Step 2: Write the failing service test**

`server/src/modules/pulls/service.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PullsService } from './service.js';
import { MockGitHubClient } from '../../adapters/mocks.js';
import { Container, type ContainerOverrides } from '../../platform/container.js';
import type { AppConfig } from '../../platform/config.js';
import type { Db } from '../../db/client.js';
import type { PullRow, PullsRepository } from './repository.js';
import type { RepoRepository } from '../repos/repository.js';

// --- fakes -----------------------------------------------------------------
const repoRow = {
  id: 'repo-1', workspaceId: 'ws-1', owner: 'acme', name: 'app',
  fullName: 'acme/app', clonePath: null, createdBy: 'sys', lastPolledAt: null,
} as unknown as Awaited<ReturnType<RepoRepository['getById']>>;

const prRow: PullRow = {
  id: 'pr-1', workspaceId: 'ws-1', repoId: 'repo-1', number: 482,
  title: 'x', author: 'a', branch: 'b', base: 'main', headSha: 'a1b2c3d4',
  lastReviewedSha: null, additions: 0, deletions: 0, filesCount: 0,
  status: 'open', body: null, openedAt: null, updatedAt: null,
};

function fakeRepos(): Pick<RepoRepository, 'getById'> {
  return { getById: async () => repoRow };
}

function fakePulls(rows: PullRow[]) {
  const calls = { upsert: 0, updateStats: 0 };
  const repo = {
    getById: async () => rows[0],
    listByRepo: async () => rows,
    getFiles: async () => [],
    getCommits: async () => [],
    upsertFromGitHub: async () => { calls.upsert++; },
    updateStats: async (_id: string, s: { additions: number; deletions: number; filesCount: number }) => {
      calls.updateStats++; rows[0].additions = s.additions; rows[0].deletions = s.deletions; rows[0].filesCount = s.filesCount;
    },
    replaceFiles: async () => {},
    replaceCommits: async () => {},
    updateDetail: async () => {},
  } as unknown as PullsRepository;
  return { repo, calls };
}

const fakeReviews = {
  reviewScoresForPrs: async () => [{ prId: 'pr-1', score: 77 }],
  doneRunCostsForPrs: async () => [{ prId: 'pr-1', costUsd: 0.5 }],
  activeFindingsForPrs: async () => [
    { prId: 'pr-1', id: 'f1', severity: 'CRITICAL', category: 'sec', title: 't',
      file: 'a.ts', startLine: 1, endLine: 2, confidence: 0.9, rationale: 'r' },
  ],
};

function makeContainer(overrides: ContainerOverrides): Container {
  const config = { cloneDir: '/tmp', secretsPath: '/tmp/s.json', embeddingsEnabled: false } as unknown as AppConfig;
  return new Container(config, {} as Db, overrides);
}

describe('PullsService.listForRepo', () => {
  it('syncs from GitHub, backfills stats, and assembles rollups', async () => {
    const rows = [{ ...prRow }];
    const pulls = fakePulls(rows);
    const gh = new MockGitHubClient(); // default pull #482 + detail with 247/38/9
    const svc = new PullsService(makeContainer({ github: gh }), fakeRepos(), pulls.repo, fakeReviews);

    const list = await svc.listForRepo('ws-1', 'repo-1');

    expect(pulls.calls.upsert).toBe(1);
    expect(pulls.calls.updateStats).toBe(1); // zeroed stats → one backfill
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: 'pr-1', score: 77, latest_run_cost_usd: 0.5,
      additions: 247, deletions: 38, files_count: 9,
      findings_by_severity: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 },
    });
  });

  it('degrades to persisted PRs when GitHub is unavailable', async () => {
    const rows = [{ ...prRow, additions: 5, deletions: 1, filesCount: 2 }];
    const pulls = fakePulls(rows);
    // No github override → container.github() throws (no token) → gh = null.
    const svc = new PullsService(makeContainer({}), fakeRepos(), pulls.repo, fakeReviews);

    const list = await svc.listForRepo('ws-1', 'repo-1');

    expect(pulls.calls.upsert).toBe(0);
    expect(pulls.calls.updateStats).toBe(0);
    expect(list[0]).toMatchObject({ additions: 5, files_count: 2 });
  });
});

describe('PullsService.getDetail', () => {
  it('refreshes from GitHub and returns the local PR id', async () => {
    const rows = [{ ...prRow }];
    const pulls = fakePulls(rows);
    const svc = new PullsService(makeContainer({ github: new MockGitHubClient() }), fakeRepos(), pulls.repo, fakeReviews);
    const detail = await svc.getDetail('ws-1', 'pr-1');
    expect(detail.id).toBe('pr-1');
    expect(detail.files.length).toBeGreaterThan(0);
  });

  it('falls back to persisted rows when GitHub is unavailable', async () => {
    const rows = [{ ...prRow, body: 'persisted body' }];
    const pulls = fakePulls(rows);
    const svc = new PullsService(makeContainer({}), fakeRepos(), pulls.repo, fakeReviews);
    const detail = await svc.getDetail('ws-1', 'pr-1');
    expect(detail.id).toBe('pr-1');
    expect(detail.body).toBe('persisted body');
    expect(detail.files).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails first, then passes**

Run: `cd server && pnpm exec vitest run src/modules/pulls/service.test.ts`
Expected: with `service.ts` present it PASSES. (If you wrote the test before `service.ts`, it first FAILS with "Cannot find module './service.js'".) Confirm all four cases are green.

- [ ] **Step 4: Typecheck**

Run: `cd server && pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/pulls/service.ts server/src/modules/pulls/service.test.ts
git commit -m "refactor(pulls): add PullsService orchestration + hermetic tests"
```

---

### Task 5: Slim routes.ts to transport-only

Replace the 424-line `routes.ts` with a thin transport layer: declare Zod schemas, resolve context, delegate to `PullsService`, map errors to status. Behavior is unchanged.

**Files:**
- Modify (rewrite): `server/src/modules/pulls/routes.ts`
- Reference: `server/src/modules/reviews/routes.ts` (thin-route pattern: `const service = new XService(container)`), `server/src/modules/_shared/context.ts` (`getContext`), `server/src/modules/_shared/schemas.ts` (`IdParams`)

**Interfaces:**
- Consumes: `PullsService` (Task 4); `getContext` from `../_shared/context.js`; `IdParams` from `../_shared/schemas.js`; `PrCommentInput`, `PrMeta`, `PrDetail`, `PrReviewComment` from `@devdigest/shared`.
- Produces: the module's Fastify plugin default export (unchanged registration in `modules/index.ts`).

- [ ] **Step 1: Rewrite `routes.ts`**

`server/src/modules/pulls/routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrMeta, PrDetail, PrReviewComment } from '@devdigest/shared';
import { PrCommentInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { PullsService } from './service.js';

/**
 * F1 — pulls module (transport). PR import via GitHub (list + per-PR detail)
 * and inline review comments. All logic lives in PullsService; routes only
 * parse, delegate, and let platform errors map to status.
 *
 *   GET  /repos/:id/pulls   → list PRs for a repo (synced + persisted)
 *   GET  /pulls/:id         → full PR detail (diff/files, commits, body)
 *   GET  /pulls/:id/comments  → inline review comments (proxied live)
 *   POST /pulls/:id/comments  → create an inline comment / reply
 */
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new PullsService(container);

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
    const { workspaceId } = await getContext(container, req);
    return service.listForRepo(workspaceId, req.params.id);
  });

  app.get('/pulls/:id', { schema: { params: IdParams } }, async (req): Promise<PrDetail> => {
    const { workspaceId } = await getContext(container, req);
    return service.getDetail(workspaceId, req.params.id);
  });

  app.get(
    '/pulls/:id/comments',
    { schema: { params: IdParams } },
    async (req): Promise<PrReviewComment[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.listComments(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput } },
    async (req): Promise<PrReviewComment> => {
      const { workspaceId } = await getContext(container, req);
      return service.createComment(workspaceId, req.params.id, req.body);
    },
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd server && pnpm typecheck`
Expected: no errors. (`status.ts` is still imported by `helpers.ts`; the old inline `snippetOf`/`SevKey` are gone from `routes.ts`.)

- [ ] **Step 3: Run the full unit lane**

Run: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`
Expected: PASS — `helpers.test.ts` + `service.test.ts` green, no regressions elsewhere.

- [ ] **Step 4: Smoke-test the live endpoints**

Boot the stack and confirm the three GET shapes are unchanged (behavior-preserving check — the JSON must match pre-refactor).

Run (from repo root, in one terminal): `./scripts/dev.sh`
Then in another terminal:

```bash
# adjust :id to a seeded repo id from the repos list
curl -s localhost:3001/api/repos | head -c 400
curl -s "localhost:3001/api/repos/<REPO_ID>/pulls" | head -c 600
curl -s "localhost:3001/api/pulls/<PR_ID>" | head -c 600
```

Expected: the pulls list returns objects with `id`, `number`, `status`, `score`, `latest_run_cost_usd`, `findings_by_severity`, `top_findings`; detail returns `files` + `commits`. Same shape as before the refactor. (Route prefix is whatever `app.ts` mounts modules under — check `src/app.ts` if `/api` differs.)

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/pulls/routes.ts
git commit -m "refactor(pulls): slim routes to transport-only (parse/delegate/map)"
```

> **Follow-up (out of scope, note for reviewer):** DB-backed behavior of `PullsRepository` and the new `ReviewRepository` rollup queries is currently covered only by typecheck + the manual smoke in Step 4. TESTING.md's `server-integration` lane (`*.it.test.ts` via testcontainers) is the proper home for a `pulls.it.test.ts` that drives `GET /repos/:id/pulls` end-to-end against real Postgres. The `test/helpers/pg.ts` harness that TESTING.md references does not yet exist, so establishing it is a separate effort. Also note the pre-existing `INSIGHTS.md` item: `latestReviewByPr`/`latestCostByPr` do an O(all-done-runs) fetch + JS dedup — now isolated in `reviewRepo.reviewScoresForPrs`/`doneRunCostsForPrs`, making them the single place to later swap in a `DISTINCT ON (pr_id)` query.

---

## Self-Review

**1. Spec coverage (against the analysis):**
- Routes doing persistence/business logic/DTO-mapping → moved to `PullsRepository` (Task 2) + `PullsService` (Task 4) + `helpers.ts` (Task 1); routes slimmed (Task 5). ✅
- Duplicated PR-upsert (pulls vs polling) → centralized in `PullsRepository.upsertFromGitHub` (Task 2); polling can reuse `container.pullsRepo` later (polling is out of the chosen scope, but the seam exists). ✅
- Rollup reads touching reviews/findings/agent_runs → added to their owning `ReviewRepository` (Task 3), not reached into from pulls. ✅
- `cost_usd` string→Number cast preserved (Task 3, `doneRunCostsForPrs`). ✅
- Contract shapes preserved (Task 1 helpers map to `PrMeta`/`PrDetail` exactly; Task 5 smoke verifies). ✅
- Verification = characterization unit tests (chosen strategy): pure helpers (Task 1) + service orchestration with mocks (Task 4). ✅

**2. Placeholder scan:** The only prose-flagged spot is `githubOrNull` in Task 4 Step 1 — the note replaces it with the simpler `try { return await this.container.github(); } catch { return null; }`. Use that final form; no `TODO`/`TBD` remain.

**3. Type consistency:** `latestByPr`, `buildFindingsBuckets`, `PrListRollups`, `ReviewScoreRow`, `RunCostRow`, `FindingRollupRow`, `toPrMetaDto`, `prDetailFromGitHub`, `prDetailFromPersisted` are defined in Task 1 and consumed with the same names/signatures in Tasks 3–4. `reviewScoresForPrs` / `doneRunCostsForPrs` / `activeFindingsForPrs` names match across `review.repo.ts`/`run.repo.ts`, the `ReviewRepository` wrapper (Task 3), and the `PrListReadModel` `Pick` in `service.ts` (Task 4). `container.reposRepo` / `container.pullsRepo` defined in Task 2 and used in Task 4's constructor defaults. Consistent.
