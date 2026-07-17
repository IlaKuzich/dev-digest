/**
 * Why+Risk Brief — GET/POST /pulls/:id/brief end-to-end against a real
 * Postgres. Mirrors the `*.it.test.ts` harness in `blast.it.test.ts` /
 * `conventions.it.test.ts`: `startPg()` + `seed(db)` + `buildApp({ config,
 * db, overrides })` + `app.inject(...)`, gated on Docker.
 *
 * A fake `RepoIntel` facade is injected (blast never re-derives; this feature
 * only reads its output). `overrides.secrets` has no GITHUB_TOKEN, so
 * `PullsService.getDetail` deterministically falls back to persisted
 * `pr_files` rows (never a real network call) — this ALSO means every PR here
 * has no `linked_issue` (AC-11) and Intent is never derived (AC-12) unless a
 * test explicitly inserts a `pr_intent` row, exercising the degradation paths
 * by default rather than as a special case.
 *
 * The LLM is a hand-rolled stub (not `MockLLMProvider`) so tests can both
 * capture the exact assembled messages (AC-2) and switch behaviour (valid
 * fixture / throw) per test via mutable module state, mirroring
 * `conventions.it.test.ts`'s `stubLlm`/`nextDrafts` pattern.
 */
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { LLMProvider, ChatMessage, BriefEnvelope } from '@devdigest/shared';
import type { RepoIntel, BlastResult, IndexState } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[brief] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

// ---- LLM stub: captures assembled messages, switches fixture/throw per test -----

let nextBrief: unknown = null;
/** Set to an Error before a call to simulate a failed structured call (AC-24). */
let nextError: Error | null = null;
let structuredCalls: { messages: ChatMessage[] }[] = [];
/** Small artificial delay so two concurrent `regenerate()` calls genuinely
 *  overlap in-flight rather than resolving so fast the guard is never truly
 *  exercised (AC-25). */
const STUB_DELAY_MS = 20;

const stubLlm = {
  id: 'openai',
  async listModels() {
    return [];
  },
  async complete() {
    throw new Error('not used');
  },
  async completeStructured(req: { messages: ChatMessage[] }) {
    structuredCalls.push({ messages: req.messages });
    await new Promise((r) => setTimeout(r, STUB_DELAY_MS));
    if (nextError) throw nextError;
    return {
      data: nextBrief,
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

function assembledPromptText(): string {
  return structuredCalls
    .flatMap((c) => c.messages.map((m) => m.content))
    .join('\n');
}

let repoSeq = 0;

/** Insert a fresh repo (with a REAL tmp clone dir containing `docs/foo.md`,
 *  so context discovery — GAP-1's discovery set — has something to find) plus
 *  a PR with one changed file (a patch containing a distinctive marker, used
 *  to assert AC-2's no-raw-patch-text rule). */
async function seedRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const dir = await mkdtemp(join(tmpdir(), 'brief-'));
  await mkdir(join(dir, 'docs'), { recursive: true });
  await writeFile(join(dir, 'docs', 'foo.md'), '# Foo\nA discovered project-context doc.', 'utf8');

  const name = `brief-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath: dir })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting to public API endpoints',
      author: 'marisa.koch',
      branch: 'feat/rate-limit-public',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 10,
      deletions: 2,
      filesCount: 1,
      status: 'open',
      body: 'Adds rate limiting.',
    })
    .returning();
  await db.insert(t.prFiles).values([
    {
      prId: pr!.id,
      path: 'src/middleware/ratelimit.ts',
      additions: 10,
      deletions: 2,
      patch: '@@ -1,3 +1,4 @@\n+  SUPER_SECRET_PATCH_TOKEN_QWERTY\n   rest of the patch body,',
    },
  ]);
  return pr!;
}

/** Fully implements RepoIntel so tests inject only what blast actually calls. */
function fakeRepoIntel(result: BlastResult, state: IndexState): RepoIntel {
  return {
    indexRepo: async () => {
      throw new Error('brief never writes the index');
    },
    refreshIndex: async () => {
      throw new Error('brief never writes the index');
    },
    getIndexState: async () => state,
    getBlastRadius: async () => result,
    getRepoMap: async () => {
      throw new Error('not used by brief');
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

const EMPTY_RESULT: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [] };
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

const VALID_BRIEF = {
  what: 'Adds rate limiting to public API endpoints.',
  why: 'Prevent abuse of unauthenticated endpoints.',
  risk_level: 'medium',
  risks: [
    {
      kind: 'security',
      title: 'Missing coverage on a legacy route',
      explanation: 'One route was not covered by the new middleware.',
      severity: 'medium',
      file_refs: ['src/middleware/ratelimit.ts', 'src/does/not/exist.ts'],
    },
  ],
  review_focus: [
    { file_ref: 'src/middleware/ratelimit.ts', reason: 'Core new logic', line: 12 },
    { file_ref: 'docs/foo.md', reason: 'Related design doc', line: null },
    { file_ref: 'src/ghost.ts', reason: 'Hallucinated ref', line: null },
  ],
};

d('brief routes (Testcontainers pg)', () => {
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
    nextBrief = VALID_BRIEF;
    nextError = null;
    structuredCalls = [];
  });

  function makeApp() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        llm: { openai: stubLlm },
        repoIntel: fakeRepoIntel(EMPTY_RESULT, DEGRADED_STATE),
      },
    });
  }

  it('GET returns null before any generation (AC-9 precondition) — zero LLM calls', async () => {
    const app = await makeApp();
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
    expect(structuredCalls).toHaveLength(0);

    await app.close();
  });

  it('POST generates, grounds, and caches a BriefEnvelope with stale:false (AC-3/AC-5/AC-10)', async () => {
    const app = await makeApp();
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BriefEnvelope;

    expect(body.stale).toBe(false);
    expect(body.brief.risk_level).toBe('medium');
    // The ungrounded ref is dropped, but the risk survives on its other ref.
    expect(body.brief.risks).toHaveLength(1);
    expect(body.brief.risks[0]!.file_refs).toEqual(['src/middleware/ratelimit.ts']);
    // review_focus: the changed file and the discovered context doc survive;
    // the hallucinated one is dropped (AC-6).
    expect(body.brief.review_focus.map((r) => r.file_ref).sort()).toEqual([
      'docs/foo.md',
      'src/middleware/ratelimit.ts',
    ]);
    expect(structuredCalls).toHaveLength(1);

    // Cache row actually persisted — a subsequent GET reads it back with no LLM call.
    const get = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(get.statusCode).toBe(200);
    expect((get.json() as BriefEnvelope).brief).toEqual(body.brief);
    expect(structuredCalls).toHaveLength(1); // GET made no additional call

    await app.close();
  });

  it('second GET after caching serves the SAME brief with ZERO further LLM calls (AC-8)', async () => {
    const app = await makeApp();
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);

    const post = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(post.statusCode).toBe(200);
    expect(structuredCalls).toHaveLength(1);

    const get1 = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(get1.statusCode).toBe(200);
    const env1 = get1.json() as BriefEnvelope;
    expect(env1.brief).toEqual((post.json() as BriefEnvelope).brief);
    expect(env1.stale).toBe(false);

    // A SECOND reopen — still zero further LLM calls.
    const get2 = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(get2.statusCode).toBe(200);
    expect(structuredCalls).toHaveLength(1); // unchanged since the POST

    await app.close();
  });

  it('cross-workspace prId 404s on both GET and POST — nothing read or generated (AC-14)', async () => {
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-ws-brief-${repoSeq++}` })
      .returning();
    const otherPr = await seedRepoAndPr(pg.handle.db, otherWs!.id);

    const app = await makeApp();

    const get = await app.inject({ method: 'GET', url: `/pulls/${otherPr.id}/brief` });
    expect(get.statusCode).toBe(404);
    expect(get.json().error.code).toBe('not_found');

    const post = await app.inject({ method: 'POST', url: `/pulls/${otherPr.id}/brief` });
    expect(post.statusCode).toBe(404);
    expect(post.json().error.code).toBe('not_found');

    expect(structuredCalls).toHaveLength(0); // never reached the LLM

    await app.close();
  });

  it('no linked issue and Intent not derived — still ONE call, brief returned (AC-11/AC-12)', async () => {
    const app = await makeApp();
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);
    // No pr_intent row inserted → Intent stays null; MockSecretsProvider has no
    // GITHUB_TOKEN → linked_issue is never set by PullsService.getDetail.

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    expect(structuredCalls).toHaveLength(1);

    const prompt = assembledPromptText();
    expect(prompt).toContain('Linked issue: none');
    expect(prompt).toContain('Derived intent: not yet derived');

    await app.close();
  });

  it('a risk left with no valid file_ref is dropped entirely (AC-5)', async () => {
    nextBrief = {
      what: 'x',
      why: 'y',
      risk_level: 'high',
      risks: [
        {
          kind: 'security',
          title: 'Hallucinated risk',
          explanation: 'x',
          severity: 'high',
          file_refs: ['src/does/not/exist.ts'],
        },
      ],
      review_focus: [],
    };
    const app = await makeApp();
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BriefEnvelope;
    expect(body.brief.risks).toEqual([]);

    await app.close();
  });

  it('moved head SHA → GET reports stale:true and makes NO LLM call (AC-15)', async () => {
    const app = await makeApp();
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(structuredCalls).toHaveLength(1);

    // Simulate a new commit moving the PR's head.
    await pg.handle.db
      .update(t.pullRequests)
      .set({ headSha: 'newsha0000' })
      .where(eq(t.pullRequests.id, pr.id));

    const get = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(get.statusCode).toBe(200);
    const env = get.json() as BriefEnvelope;
    expect(env.stale).toBe(true);
    expect(structuredCalls).toHaveLength(1); // GET never calls the LLM, even when stale

    await app.close();
  });

  it('a failed structured call leaves the prior cache intact (AC-24)', async () => {
    const app = await makeApp();
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);

    const first = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(first.statusCode).toBe(200);
    const cachedBefore = (first.json() as BriefEnvelope).brief;

    nextError = new Error('model unavailable');
    const failed = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(failed.statusCode).toBeGreaterThanOrEqual(500);

    const get = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(get.statusCode).toBe(200);
    expect((get.json() as BriefEnvelope).brief).toEqual(cachedBefore);

    await app.close();
  });

  it('the assembled prompt never contains raw patch text (AC-2)', async () => {
    const app = await makeApp();
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(structuredCalls).toHaveLength(1);

    const prompt = assembledPromptText();
    expect(prompt).not.toContain('SUPER_SECRET_PATCH_TOKEN_QWERTY');
    expect(prompt).not.toContain('@@ -1,3 +1,4 @@');

    await app.close();
  });

  it('two concurrent regenerate calls for one PR coalesce into exactly ONE structured call (AC-25)', async () => {
    const app = await makeApp();
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId);

    const [r1, r2] = await Promise.all([
      app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` }),
      app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` }),
    ]);
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    expect(structuredCalls).toHaveLength(1);
    // Both callers see the SAME grounded result.
    expect(r1.json()).toEqual(r2.json());

    await app.close();
  });

  it('a discovered (not attached) context doc grounds a review_focus ref; an undiscovered path is dropped (AC-1/AC-5 discovery-set)', async () => {
    const app = await makeApp();
    const pr = await seedRepoAndPr(pg.handle.db, workspaceId); // seeds docs/foo.md as a discovered doc

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BriefEnvelope;

    const focusRefs = body.brief.review_focus.map((r) => r.file_ref);
    expect(focusRefs).toContain('docs/foo.md'); // discovered, no per-PR attachment needed
    expect(focusRefs).not.toContain('src/ghost.ts'); // never discovered/changed — dropped

    const prompt = assembledPromptText();
    expect(prompt).toContain('docs/foo.md');
    expect(prompt).toContain('A discovered project-context doc.');

    await app.close();
  });
});
