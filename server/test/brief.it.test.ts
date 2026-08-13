/**
 * Brief module — POST /pulls/:prId/brief end-to-end against a real Postgres.
 * Mirrors the `*.it.test.ts` harness in `conventions.it.test.ts` /
 * `smart-diff.it.test.ts`: `startPg()` + `seed(db)` + `buildApp({ config, db,
 * overrides })` + `app.inject(...)`, gated on Docker.
 *
 * Covers: cached-read-returns-null-with-zero-LLM-calls (AC-11/17), regenerate
 * recomputes + persists (AC-12), a subsequent cached read after generate does
 * NOT call the LLM again (AC-11), cross-workspace IDOR (AC-24), and a
 * best-effort Brief when Intent/Blast/issue/run are all missing (AC-19).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Brief, LLMProvider } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[brief] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const FIXTURE_BRIEF: Brief = {
  risk_level: 'medium',
  what: 'Adds rate limiting to public API endpoints.',
  why: 'Prevents abuse of unauthenticated endpoints.',
  risks: [
    {
      kind: 'security',
      title: 'Live key committed',
      explanation: 'A live-looking key appears in config.',
      severity: 'high',
      file_refs: ['src/config.ts'],
    },
  ],
  review_focus: [{ file: 'src/config.ts', line: 12, reason: 'live Stripe key committed in plaintext' }],
};

/** Call-counting structured-completion stub — asserts the LLM is invoked
 *  exactly when expected (zero calls on a cached read). */
let completeStructuredCalls = 0;
const stubLlm = {
  id: 'openai',
  async listModels() {
    return [];
  },
  async complete() {
    throw new Error('not used');
  },
  async completeStructured() {
    completeStructuredCalls++;
    return {
      data: FIXTURE_BRIEF,
      model: 'gpt-4.1',
      tokensIn: 10,
      tokensOut: 20,
      costUsd: 0,
      raw: '',
      attempts: 1,
    };
  },
  async embed() {
    return [];
  },
} as unknown as LLMProvider;

let repoSeq = 0;

/** Insert a fresh repo + PR (with one changed file) under the given workspace. */
async function seedRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `brief-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 21,
      title: 'Add rate limiting',
      body: 'Adds rate limiting to public endpoints.',
      author: 'marisa.koch',
      branch: 'feat/rate-limit',
      base: 'main',
      headSha: 'deadbeef',
      additions: 4,
      deletions: 0,
      filesCount: 1,
      status: 'open',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 4,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return pr!;
}

d('brief module (it)', () => {
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

  beforeEach(() => {
    completeStructuredCalls = 0;
  });

  function makeApp() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { github: new MockGitHubClient(), llm: { openai: stubLlm } },
    });
  }

  it('cached read with nothing generated yet returns null and makes zero LLM calls', async () => {
    const app = await makeApp();
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
    expect(completeStructuredCalls).toBe(0);

    await app.close();
  });

  it('{regenerate:true} recomputes via one LLM call and persists the Brief', async () => {
    const app = await makeApp();
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/brief`,
      payload: { regenerate: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Brief;
    expect(body.risk_level).toBe('medium');
    expect(body.review_focus).toEqual(FIXTURE_BRIEF.review_focus);
    expect(completeStructuredCalls).toBe(1);

    const [row] = await pg.handle.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .where(eq(t.prBrief.prId, pr.id));
    expect(row?.json).toMatchObject({ risk_level: 'medium' });

    await app.close();
  });

  it('cached read after generate returns the cached Brief without calling the LLM again', async () => {
    const app = await makeApp();
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);

    const genRes = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/brief`,
      payload: { regenerate: true },
    });
    expect(genRes.statusCode).toBe(200);
    expect(completeStructuredCalls).toBe(1);

    const cachedRes = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(cachedRes.statusCode).toBe(200);
    expect(cachedRes.json()).toMatchObject({ risk_level: 'medium' });
    expect(completeStructuredCalls).toBe(1); // unchanged — no new LLM call

    await app.close();
  });

  it('rejects a PR belonging to another workspace as not_found (IDOR guard)', async () => {
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-ws-${repoSeq++}` })
      .returning();
    const otherPr = await seedRepoAndPr(pg.handle.db, otherWs!.id);

    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${otherPr.id}/brief`,
      payload: { regenerate: true },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
    expect(completeStructuredCalls).toBe(0);

    await app.close();
  });

  it('produces a best-effort Brief when Intent/Blast/issue/run are all absent', async () => {
    // No Intent row, no reviews/agent_runs rows, and a PR body with no
    // issue reference — every optional Brief input degrades silently.
    const app = await makeApp();
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `brief-bare-${repoSeq++}`, fullName: `acme/bare-${repoSeq}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 22,
        title: 'Bare PR',
        body: null,
        author: 'marisa.koch',
        branch: 'feat/bare',
        base: 'main',
        headSha: 'cafef00d',
        additions: 0,
        deletions: 0,
        filesCount: 0,
        status: 'open',
      })
      .returning();

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr!.id}/brief`,
      payload: { regenerate: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Brief;
    expect(body.risk_level).toBe('medium');
    expect(completeStructuredCalls).toBe(1);

    await app.close();
  });
});
