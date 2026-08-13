/**
 * reviews module — GET /pulls/:id/metrics-rollup end-to-end against a real
 * Postgres. Mirrors the `*.it.test.ts` harness in `brief.it.test.ts`:
 * `startPg()` + `seed(db)` + `buildApp({ config, db })` + `app.inject(...)`,
 * gated on Docker.
 *
 * Covers the T3 core cases: two agents' latest done runs → MIN score + SUM
 * cost/tokens (AC-1, AC-4, AC-2/3), a done + a failed run → failed
 * contributes nothing (AC-1), no done run → null (AC-10), and a
 * cross-workspace prId → 404 (IDOR).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[metrics-rollup] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;

async function seedRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `rollup-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 30,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'deadbeef',
      additions: 4,
      deletions: 0,
      filesCount: 1,
      status: 'open',
    })
    .returning();
  return pr!;
}

async function seedAgent(db: PgFixture['handle']['db'], workspaceId: string, name: string) {
  const [agent] = await db
    .insert(t.agents)
    .values({ workspaceId, name, provider: 'openai', model: 'gpt-4.1', systemPrompt: 'you review' })
    .returning();
  return agent!;
}

async function seedDoneRun(
  db: PgFixture['handle']['db'],
  opts: {
    workspaceId: string;
    prId: string;
    agentId: string | null;
    ranAt: Date;
    score: number | null;
    costUsd: number | null;
    tokensIn: number;
    tokensOut: number;
    status?: 'done' | 'failed' | 'cancelled';
  },
) {
  const [run] = await db
    .insert(t.agentRuns)
    .values({
      workspaceId: opts.workspaceId,
      agentId: opts.agentId,
      prId: opts.prId,
      ranAt: opts.ranAt,
      provider: 'openai',
      model: 'gpt-4.1',
      status: opts.status ?? 'done',
      score: opts.score,
      costUsd: opts.costUsd != null ? String(opts.costUsd) : null,
      tokensIn: opts.tokensIn,
      tokensOut: opts.tokensOut,
      findingsCount: 0,
      grounding: 'n/a',
    })
    .returning();
  return run!;
}

async function seedReviewWithFindings(
  db: PgFixture['handle']['db'],
  opts: {
    workspaceId: string;
    prId: string;
    agentId: string | null;
    runId: string;
    findings: { severity: string; dismissed?: boolean }[];
  },
) {
  const [review] = await db
    .insert(t.reviews)
    .values({
      workspaceId: opts.workspaceId,
      prId: opts.prId,
      agentId: opts.agentId,
      runId: opts.runId,
      kind: 'review',
      verdict: null,
      summary: null,
      score: null,
      model: 'gpt-4.1',
    })
    .returning();
  if (opts.findings.length > 0) {
    await db.insert(t.findings).values(
      opts.findings.map((f) => ({
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 1,
        endLine: 1,
        severity: f.severity,
        category: 'security',
        title: 'finding',
        rationale: 'why',
        confidence: 0.9,
        dismissedAt: f.dismissed ? new Date() : null,
      })),
    );
  }
  return review!;
}

d('reviews: GET /pulls/:id/metrics-rollup (it)', () => {
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

  function makeApp() {
    return buildApp({ config: config(), db: pg.handle.db });
  }

  it('two agents\' latest done runs roll up to MIN score + SUM cost/tokens', async () => {
    const app = await makeApp();
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);
    const security = await seedAgent(pg.handle.db, workspaceId, 'Security');
    const general = await seedAgent(pg.handle.db, workspaceId, 'General');

    const secRun = await seedDoneRun(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: security.id,
      ranAt: new Date('2026-08-01T00:00:00Z'),
      score: 61,
      costUsd: 0.01,
      tokensIn: 5000,
      tokensOut: 800,
    });
    const genRun = await seedDoneRun(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: general.id,
      ranAt: new Date('2026-08-01T00:00:00Z'),
      score: 78,
      costUsd: 0.004,
      tokensIn: 3200,
      tokensOut: 500,
    });
    await seedReviewWithFindings(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: security.id,
      runId: secRun.id,
      findings: [{ severity: 'CRITICAL' }, { severity: 'WARNING' }],
    });
    await seedReviewWithFindings(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: general.id,
      runId: genRun.id,
      findings: [{ severity: 'SUGGESTION' }],
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/metrics-rollup` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      score: 61,
      findings_count: 3,
      blockers: 1,
      cost_usd: 0.014,
      tokens_in: 8200,
      tokens_out: 1300,
    });

    await app.close();
  });

  it('a done run + a failed run for the same agent — the failed run contributes nothing', async () => {
    const app = await makeApp();
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);
    const agent = await seedAgent(pg.handle.db, workspaceId, 'Solo');

    await seedDoneRun(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agent.id,
      ranAt: new Date('2026-08-01T00:00:00Z'),
      score: null,
      costUsd: null,
      tokensIn: 0,
      tokensOut: 0,
      status: 'failed',
    });
    const doneRun = await seedDoneRun(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agent.id,
      ranAt: new Date('2026-08-02T00:00:00Z'),
      score: 55,
      costUsd: 0.02,
      tokensIn: 1000,
      tokensOut: 200,
    });
    await seedReviewWithFindings(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agent.id,
      runId: doneRun.id,
      findings: [],
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/metrics-rollup` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ score: 55, cost_usd: 0.02, findings_count: 0, blockers: 0 });

    await app.close();
  });

  it('returns null when the PR has no done run at all (AC-10)', async () => {
    const app = await makeApp();
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/metrics-rollup` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();

    await app.close();
  });

  it('rejects a PR belonging to another workspace as not_found (IDOR guard)', async () => {
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-ws-${repoSeq++}` })
      .returning();
    const otherPr = await seedRepoAndPr(pg.handle.db, otherWs!.id);

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${otherPr.id}/metrics-rollup` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');

    await app.close();
  });
});
