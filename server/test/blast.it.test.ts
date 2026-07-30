/**
 * L04/Blast Radius — GET /pulls/:id/blast end-to-end against a real Postgres.
 * Mirrors the `*.it.test.ts` harness in `smart-diff.it.test.ts`: `startPg()` +
 * `seed(db)` + `buildApp({ config, db, overrides })` + `app.inject(...)`,
 * gated on Docker.
 *
 * A mock `RepoIntel` facade is injected via `ContainerOverrides.repoIntel` — no
 * real index is built or read (the whole feature never writes the index).
 * `overrides.secrets` is a `MockSecretsProvider` (no GITHUB_TOKEN), so
 * `PullsService.getDetail` deterministically falls back to persisted
 * `pr_files` rows instead of depending on ambient env/network.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { RepoIntel, BlastResult, IndexState } from '../src/modules/repo-intel/types.js';
import type { BlastResponse } from '../src/modules/blast/service.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[blast] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;

/** Insert a fresh repo + PR + a couple of pr_files rows under the given workspace. */
async function seedRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `blast-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 7,
      title: 'Refactor rate limiter',
      author: 'marisa.koch',
      branch: 'feat/blast',
      base: 'main',
      headSha: 'deadbeef',
      additions: 10,
      deletions: 2,
      filesCount: 1,
      status: 'open',
    })
    .returning();
  await db.insert(t.prFiles).values([
    { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 10, deletions: 2 },
  ]);
  return pr!;
}

/**
 * Insert a SECOND PR under the given workspace/repo that touches `path` —
 * used to populate "Prior PRs touching these files" (T11). `pr.repoId` off
 * `seedRepoAndPr`'s return already carries the repo id, so no separate repo
 * lookup is needed.
 */
async function seedPriorPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  repoId: string,
  opts: { path: string; number?: number; status?: string; updatedAt?: Date },
) {
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId,
      number: opts.number ?? 3,
      title: 'Add rate limiter tests',
      author: 'yuki.tanaka',
      branch: 'fix/prior',
      base: 'main',
      headSha: 'cafebabe',
      additions: 4,
      deletions: 1,
      filesCount: 1,
      status: opts.status ?? 'merged',
      updatedAt: opts.updatedAt ?? new Date(),
    })
    .returning();
  await db.insert(t.prFiles).values([{ prId: pr!.id, path: opts.path, additions: 4, deletions: 1 }]);
  return pr!;
}

/** Fully implements RepoIntel so tests can inject only the two methods the
 * blast route actually calls (getBlastRadius, getIndexState). */
function fakeRepoIntel(result: BlastResult, state: IndexState): RepoIntel {
  return {
    indexRepo: async () => {
      throw new Error('blast never writes the index');
    },
    refreshIndex: async () => {
      throw new Error('blast never writes the index');
    },
    getIndexState: async () => state,
    getBlastRadius: async () => result,
    getRepoMap: async () => {
      throw new Error('not used by blast');
    },
    getFileRank: async () => [],
    getSymbolsInFiles: async () => [],
    getCallerSignatures: async () => [],
    getUnresolvedReferences: async () => [],
    getConventionSamples: async () => [],
    getTopFilesByRank: async () => [],
    getCriticalPaths: async () => [],
  };
}

const FULL_STATE: IndexState = {
  repoId: 'ignored',
  status: 'full',
  filesIndexed: 42,
  filesSkipped: 0,
  durationMs: 1000,
  lastIndexedSha: 'deadbeef',
  indexerVersion: 1,
  updatedAt: new Date(),
};

const DEGRADED_STATE: IndexState = {
  repoId: 'ignored',
  status: 'degraded',
  filesIndexed: 0,
  filesSkipped: 0,
  durationMs: 0,
  lastIndexedSha: '',
  indexerVersion: 1,
  updatedAt: new Date(),
  degraded: true,
  degradedReason: 'no_data',
};

d('blast routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('happy path: persistent BlastResult with factsByFile is grouped/capped/attributed', async () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/middleware/ratelimit.ts', name: 'rateLimit', kind: 'function' }],
      callers: [
        { file: 'src/api/users.ts', symbol: 'listUsers', viaSymbol: 'rateLimit', line: 12, rank: 5 },
        { file: 'src/api/public/webhooks.ts', symbol: 'handleWebhook', viaSymbol: 'rateLimit', line: 30, rank: 9 },
      ],
      impactedEndpoints: ['GET /users', 'POST /webhooks'],
      factsByFile: {
        'src/api/users.ts': { endpoints: ['GET /users'], crons: [] },
        'src/api/public/webhooks.ts': { endpoints: ['POST /webhooks'], crons: ['nightly-cleanup'] },
      },
    };
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { secrets: new MockSecretsProvider(), repoIntel: fakeRepoIntel(result, FULL_STATE) },
    });
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BlastResponse;

    expect(body.changed_symbols).toEqual([
      { file: 'src/middleware/ratelimit.ts', name: 'rateLimit', kind: 'function' },
    ]);
    expect(body.downstream).toHaveLength(1);
    expect(body.downstream[0]!.symbol).toBe('rateLimit');
    // Highest rank (9) first.
    expect(body.downstream[0]!.callers.map((c) => c.name)).toEqual(['handleWebhook', 'listUsers']);
    expect(body.downstream[0]!.endpoints_affected.sort()).toEqual(['GET /users', 'POST /webhooks']);
    expect(body.downstream[0]!.crons_affected).toEqual(['nightly-cleanup']);
    expect(body.summary).toBe('');
    expect(body.index_state.status).toBe('full');
    expect(body.index_state.degraded).toBeUndefined();

    await app.close();
  });

  it('degraded path: returns 200 (not an error) with crons_affected empty and index_state.degraded true', async () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/middleware/ratelimit.ts', name: 'rateLimit', kind: 'function' }],
      callers: [
        { file: 'src/api/users.ts', symbol: 'listUsers', viaSymbol: 'rateLimit', line: 12, rank: 0 },
      ],
      impactedEndpoints: ['GET /users'],
      degraded: true,
      reason: 'no_data',
      // No factsByFile — the degraded facade path carries no cron data.
    };
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        repoIntel: fakeRepoIntel(result, DEGRADED_STATE),
      },
    });
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BlastResponse;

    expect(body.downstream[0]!.endpoints_affected).toEqual(['GET /users']);
    // Never fabricated as "0 crons" — the empty array is the honest signal,
    // and index_state.degraded is what the UI keys the "unknown" label off.
    expect(body.downstream[0]!.crons_affected).toEqual([]);
    expect(body.index_state.degraded).toBe(true);
    expect(body.index_state.degradedReason).toBe('no_data');
    expect(body.index_state.status).toBe('degraded');

    await app.close();
  });

  it('rejects a PR belonging to another workspace as not_found (IDOR guard)', async () => {
    // A second, separate workspace + repo + PR — never resolvable via the
    // no-auth default-workspace context this app always resolves to.
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-ws-${repoSeq++}` })
      .returning();
    const otherPr = await seedRepoAndPr(pg.handle.db, otherWs!.id);

    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        repoIntel: fakeRepoIntel(
          { changedSymbols: [], callers: [], impactedEndpoints: [] },
          FULL_STATE,
        ),
      },
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${otherPr.id}/blast` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');

    await app.close();
  });

  it('rejects a non-uuid id as a validation error', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {} });
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/blast' });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('prior_prs: a prior PR touching an overlapping file appears, newest-ish first', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        repoIntel: fakeRepoIntel(
          { changedSymbols: [], callers: [], impactedEndpoints: [] },
          FULL_STATE,
        ),
      },
    });
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);
    const prior = await seedPriorPr(pg.handle.db, workspaceId, pr.repoId, {
      path: 'src/middleware/ratelimit.ts', // overlaps with seedRepoAndPr's default file
      status: 'merged',
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BlastResponse;

    expect(body.prior_prs).toHaveLength(1);
    expect(body.prior_prs[0]).toEqual({
      id: prior.id,
      number: prior.number,
      title: prior.title,
      author: prior.author,
      merged_at: prior.updatedAt!.toISOString(),
    });

    await app.close();
  });

  it('prior_prs: a PR touching the same path in a DIFFERENT workspace/repo does not appear (cross-tenant guard)', async () => {
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-ws-prior-${repoSeq++}` })
      .returning();
    // Same overlapping file path, but under a completely different
    // workspace + repo — must never leak into this workspace's prior_prs.
    await seedRepoAndPr(pg.handle.db, otherWs!.id);

    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        repoIntel: fakeRepoIntel(
          { changedSymbols: [], callers: [], impactedEndpoints: [] },
          FULL_STATE,
        ),
      },
    });
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BlastResponse;

    expect(body.prior_prs).toEqual([]);

    await app.close();
  });
});
