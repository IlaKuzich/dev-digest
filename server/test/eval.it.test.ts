import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { LLMProvider, Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval] Docker not available — skipping integration tests.');
}

/** The Review the stub LLM returns on the next `completeStructured` call; each
 *  test sets this. `failOnCall` (1-indexed) makes that Nth invocation throw,
 *  for exercising per-case failure isolation (AC-42). */
let nextReview: Review = { verdict: 'comment', summary: 'looks fine', score: 90, findings: [] };
let failOnCall = 0;
let callCount = 0;

const stubLlm = {
  id: 'openrouter',
  async listModels() {
    return [];
  },
  async complete() {
    throw new Error('not used');
  },
  async completeStructured() {
    callCount++;
    if (failOnCall === callCount) throw new Error('stub LLM failure');
    return {
      data: nextReview,
      model: 'stub-model',
      tokensIn: 10,
      tokensOut: 10,
      costUsd: 0.01,
      raw: '',
      attempts: 1,
    };
  },
  async embed() {
    return [];
  },
} as unknown as LLMProvider;

d('Eval module (it)', () => {
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
    nextReview = { verdict: 'comment', summary: 'looks fine', score: 90, findings: [] };
    failOnCall = 0;
    callCount = 0;
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), llm: { openrouter: stubLlm } },
    });
  }

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>, systemPrompt = 'Be a reviewer.') {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Agent ${randomUUID().slice(0, 8)}`,
        provider: 'openrouter',
        model: 'stub-model',
        system_prompt: systemPrompt,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  /** A fresh repo + PR + one pr_files patch + one review(+finding), so capture
   *  has real fixtures to freeze a diff from. `agentId: null` → agent-less
   *  review (AC-6). */
  async function seedPrWithFinding(opts: { agentId: string | null }) {
    const slug = randomUUID().slice(0, 8);
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `eval-${slug}`, fullName: `acme/eval-${slug}` })
      .returning();
    const [pull] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Test PR',
        author: 'tester',
        branch: 'feat/x',
        base: 'main',
        headSha: 'abc123',
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pull!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n context\n+  stripeKey: "sk_live_x",\n context\n',
    });
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pull!.id,
        agentId: opts.agentId,
        kind: 'review',
        verdict: 'request_changes',
        summary: 'x',
        score: 50,
        model: 'stub',
      })
      .returning();
    const [finding] = await pg.handle.db
      .insert(t.findings)
      .values({
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        rationale: 'x',
        confidence: 0.9,
      })
      .returning();
    return { repo, pull, review, finding };
  }

  it('captures an accepted finding as a must_find case with the frozen file diff (AC-1/2/3)', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);
    const { finding } = await seedPrWithFinding({ agentId: agent.id });

    const accept = await app.inject({ method: 'POST', url: `/findings/${finding.id}/accept` });
    expect(accept.statusCode).toBe(200);

    const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.owner_kind).toBe('agent');
    expect(body.owner_id).toBe(agent.id);
    expect(body.expected_output).toEqual([
      {
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        file: 'src/config.ts',
        start_line: 12,
        end_line: 12,
      },
    ]);
    expect(body.input_diff).toContain('src/config.ts');
    expect(body.input_diff).toContain('stripeKey');
    await app.close();
  });

  it('captures a dismissed finding as a must_not_flag ([]) case (AC-4)', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);
    const { finding } = await seedPrWithFinding({ agentId: agent.id });

    const dismiss = await app.inject({ method: 'POST', url: `/findings/${finding.id}/dismiss` });
    expect(dismiss.statusCode).toBe(200);

    const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(res.statusCode).toBe(201);
    expect(res.json().expected_output).toEqual([]);
    await app.close();
  });

  it('rejects capture on an agent-less (summary) review (AC-6)', async () => {
    const app = await makeApp();
    const { finding } = await seedPrWithFinding({ agentId: null });

    const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('runs a case through the engine and persists grounded scoring (AC-32/33/34/37)', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);
    const caseRes = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/eval-cases`,
      payload: {
        name: 'stripe-key-leak',
        input_diff: [
          'diff --git a/src/config.ts b/src/config.ts',
          '--- a/src/config.ts',
          '+++ b/src/config.ts',
          '@@ -10,2 +10,3 @@',
          ' context',
          '+  stripeKey: "sk_live_x",',
        ].join('\n'),
        expected_output: [
          {
            severity: 'CRITICAL',
            category: 'security',
            title: 'Hardcoded Stripe secret key',
            file: 'src/config.ts',
            start_line: 11,
            end_line: 11,
          },
        ],
      },
    });
    expect(caseRes.statusCode).toBe(201);
    const evalCase = caseRes.json();

    nextReview = {
      verdict: 'request_changes',
      summary: 'found it',
      score: 40,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          rationale: 'x',
          confidence: 0.9,
        },
      ],
    };

    const runRes = await app.inject({ method: 'POST', url: `/eval-cases/${evalCase.id}/run` });
    expect(runRes.statusCode).toBe(200);
    const result = runRes.json();
    expect(result.case_id).toBe(evalCase.id);
    expect(result.result.traces_total).toBe(1);
    expect(result.result.traces_passed).toBe(1);
    expect(result.result.recall).toBe(1);
    expect(result.result.citation_accuracy).toBe(1);
    await app.close();
  });

  it('runs a batch: eval_batches aggregate + version stamp + per-case batch_id (AC-24/41)', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);
    const caseA = (
      await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/eval-cases`,
        payload: { name: 'clean-refactor', input_diff: '', expected_output: [] },
      })
    ).json();
    const caseB = (
      await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/eval-cases`,
        payload: { name: 'clean-refactor-2', input_diff: '', expected_output: [] },
      })
    ).json();

    nextReview = { verdict: 'approve', summary: 'clean', score: 95, findings: [] };
    const batchRes = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    expect(batchRes.statusCode).toBe(200);
    const { batch, results } = batchRes.json();
    expect(batch.agent_version).toBe(agent.version);
    expect(batch.traces_total).toBe(2);
    expect(results).toHaveLength(2);

    const recentRes = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` });
    expect(recentRes.json()).toHaveLength(1);
    expect(recentRes.json()[0].id).toBe(batch.id);

    const runsForBatch = await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.batchId, batch.id));
    expect(runsForBatch).toHaveLength(2);
    expect(runsForBatch.map((r) => r.caseId).sort()).toEqual([caseA.id, caseB.id].sort());
    await app.close();
  });

  it('one failing case does not abort the batch (AC-42)', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/eval-cases`,
      payload: { name: 'case-one', input_diff: '', expected_output: [] },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/eval-cases`,
      payload: { name: 'case-two', input_diff: '', expected_output: [] },
    });

    failOnCall = 1; // the FIRST engine call in the batch loop throws; the loop must continue.
    const batchRes = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    expect(batchRes.statusCode).toBe(200);
    const { batch, results } = batchRes.json();
    expect(batch.traces_total).toBe(2);
    expect(results).toHaveLength(2);

    const errored = results.filter((r: { result: { per_trace: { actual: unknown }[] } }) => {
      const actual = r.result.per_trace[0]?.actual as { error?: string } | undefined;
      return actual && typeof actual === 'object' && 'error' in actual;
    });
    expect(errored).toHaveLength(1);
    const succeeded = results.length - errored.length;
    expect(succeeded).toBe(1);
    await app.close();
  });

  it('promotes a version forward-only (new highest version); rejects a non-existent version (AC-29/30/31)', async () => {
    const app = await makeApp();
    const agent = await createAgent(app, 'v1 prompt');
    expect(agent.version).toBe(1);

    const updated = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}`,
      payload: { system_prompt: 'v2 prompt' },
    });
    expect(updated.json().version).toBe(2);

    const promoted = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/promote`,
      payload: { version: 1 },
    });
    expect(promoted.statusCode).toBe(200);
    const promotedBody = promoted.json();
    expect(promotedBody.version).toBe(3); // NEW highest version, not a revert to 1
    expect(promotedBody.system_prompt).toBe('v1 prompt');

    const bad = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/promote`,
      payload: { version: 999 },
    });
    expect(bad.statusCode).toBe(404);

    const stillAtThree = await app.inject({ method: 'GET', url: `/agents/${agent.id}` });
    expect(stillAtThree.json().version).toBe(3);
    await app.close();
  });

  it('a cross-workspace eval case / batch id 404s (IDOR guard)', async () => {
    const app = await makeApp();
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-${randomUUID().slice(0, 8)}` })
      .returning();
    const [otherCase] = await pg.handle.db
      .insert(t.evalCases)
      .values({
        workspaceId: otherWs!.id,
        ownerKind: 'agent',
        ownerId: randomUUID(),
        name: 'other-case',
        inputDiff: '',
        expectedOutput: [],
      })
      .returning();

    const putRes = await app.inject({
      method: 'PUT',
      url: `/eval-cases/${otherCase!.id}`,
      payload: { name: 'hijacked' },
    });
    expect(putRes.statusCode).toBe(404);

    const [otherAgent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId: otherWs!.id,
        name: 'other-agent',
        provider: 'openrouter',
        model: 'stub-model',
        systemPrompt: 'x',
        version: 1,
      })
      .returning();
    const [otherBatch] = await pg.handle.db
      .insert(t.evalBatches)
      .values({ workspaceId: otherWs!.id, agentId: otherAgent!.id, agentVersion: 1, tracesPassed: 0, tracesTotal: 0 })
      .returning();

    const agent = await createAgent(app);
    const compareRes = await app.inject({
      method: 'GET',
      url: `/agents/${agent.id}/eval-runs/compare?a=${otherBatch!.id}&b=${otherBatch!.id}`,
    });
    expect(compareRes.statusCode).toBe(404);
    await app.close();
  });
});
