/**
 * A5 — Multi-Agent Review server slice end-to-end against a real Postgres.
 * Mirrors the `*.it.test.ts` harness in `reviews.it.test.ts` /
 * `metrics-rollup.it.test.ts`: `startPg()` + `seed(db)` + `buildApp({ config,
 * db, overrides })` + `app.inject(...)`, gated on Docker. Deterministic
 * column/conflict/estimate cases seed `agent_runs`/`reviews`/`findings`
 * directly (metrics-rollup.it.test.ts's pattern) rather than racing a real
 * background run; the trigger/linking case drives the real route + a stubbed
 * LLM (reviews.it.test.ts's pattern) since that's the thing under test there.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[multi-agent] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded secret introduced.',
  score: 60,
  findings: [
    {
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded secret',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live key is committed in source.',
      confidence: 0.9,
      kind: 'finding',
    },
  ],
};

type PgDb = PgFixture['handle']['db'];

let repoSeq = 0;
let prNumber = 900;

async function seedRepoAndPr(db: PgDb, workspaceId: string) {
  const name = `multi-agent-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: prNumber++,
      title: 'Multi-agent PR',
      author: 'marisa.koch',
      branch: 'feat/ma',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

async function seedAgentRow(db: PgDb, workspaceId: string, name: string) {
  const [agent] = await db
    .insert(t.agents)
    .values({ workspaceId, name, provider: 'openai', model: 'gpt-4.1', systemPrompt: 'you review' })
    .returning();
  return agent!;
}

async function seedAgentRun(
  db: PgDb,
  opts: {
    workspaceId: string;
    prId: string;
    agentId: string;
    status: 'done' | 'failed';
    durationMs: number | null;
    costUsd: number | null;
    score: number | null;
    error?: string | null;
  },
) {
  const [run] = await db
    .insert(t.agentRuns)
    .values({
      workspaceId: opts.workspaceId,
      agentId: opts.agentId,
      prId: opts.prId,
      provider: 'openai',
      model: 'gpt-4.1',
      status: opts.status,
      durationMs: opts.durationMs,
      costUsd: opts.costUsd != null ? String(opts.costUsd) : null,
      score: opts.score,
      findingsCount: opts.status === 'done' ? 1 : 0,
      grounding: opts.status === 'done' ? '1/1 passed' : '0/0 passed',
      error: opts.error ?? null,
    })
    .returning();
  return run!;
}

async function seedReviewWithFinding(
  db: PgDb,
  opts: {
    workspaceId: string;
    prId: string;
    agentId: string;
    runId: string;
    summary: string;
    verdict: string;
    score: number;
    finding: { file: string; line: number; severity: string; title: string } | null;
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
      verdict: opts.verdict,
      summary: opts.summary,
      score: opts.score,
      model: 'gpt-4.1',
    })
    .returning();
  if (opts.finding) {
    await db.insert(t.findings).values({
      reviewId: review!.id,
      file: opts.finding.file,
      startLine: opts.finding.line,
      endLine: opts.finding.line,
      severity: opts.finding.severity,
      category: 'security',
      title: opts.finding.title,
      rationale: 'seeded for test',
      confidence: 0.9,
    });
  }
  return review!;
}

d('A5 multi-agent review (Testcontainers pg)', () => {
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

  function appWithLlm() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  }

  it('triggers a fan-out over 2 agents → both runs linked to ONE multi_agent_runs parent (AC-12); N=1 uses the identical flow → a single-column run (AC-30)', async () => {
    const app = await appWithLlm();
    const { pr } = await seedRepoAndPr(pg.handle.db, workspaceId);
    const a1 = await seedAgentRow(pg.handle.db, workspaceId, 'Sec A');
    const a2 = await seedAgentRow(pg.handle.db, workspaceId, 'Sec B');

    const triggerRes = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: [a1.id, a2.id] },
    });
    expect(triggerRes.statusCode).toBe(200);
    const { id: multiRunId } = triggerRes.json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const links = await pg.handle.db
      .select()
      .from(t.multiAgentRunAgents)
      .where(eq(t.multiAgentRunAgents.multiAgentRunId, multiRunId));
    expect(links).toHaveLength(2);

    const readRes = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent` });
    expect(readRes.statusCode).toBe(200);
    expect(readRes.json().id).toBe(multiRunId);
    expect(readRes.json().columns).toHaveLength(2);

    // N=1, a different PR, same flow.
    const { pr: pr2 } = await seedRepoAndPr(pg.handle.db, workspaceId);
    const single = await app.inject({
      method: 'POST',
      url: `/pulls/${pr2.id}/multi-agent-run`,
      payload: { agent_ids: [a1.id] },
    });
    expect(single.statusCode).toBe(200);
    await waitForPrRuns(pg.handle.db, pr2.id, { expected: 1 });
    const single_read = await app.inject({ method: 'GET', url: `/pulls/${pr2.id}/multi-agent` });
    expect(single_read.json().columns).toHaveLength(1);

    await app.close();
  });

  it('GET /pulls/:id/multi-agent renders 2 columns, actual totals (max duration, sum cost), and a conflict with an "ignored" take (AC-20/AC-21/AC-22/AC-24/AC-28)', async () => {
    const app = await appWithLlm();
    const { pr } = await seedRepoAndPr(pg.handle.db, workspaceId);
    const agentA = await seedAgentRow(pg.handle.db, workspaceId, 'Column Agent A');
    const agentB = await seedAgentRow(pg.handle.db, workspaceId, 'Column Agent B');

    const [multiRun] = await pg.handle.db
      .insert(t.multiAgentRuns)
      .values({ workspaceId, prId: pr.id })
      .returning();

    const runA = await seedAgentRun(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agentA.id,
      status: 'done',
      durationMs: 5000,
      costUsd: 0.05,
      score: 80,
    });
    const runB = await seedAgentRun(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agentB.id,
      status: 'done',
      durationMs: 8000,
      costUsd: 0.1,
      score: 70,
    });
    await pg.handle.db
      .insert(t.multiAgentRunAgents)
      .values([
        { multiAgentRunId: multiRun!.id, agentRunId: runA.id },
        { multiAgentRunId: multiRun!.id, agentRunId: runB.id },
      ]);

    // Agent A flags src/config.ts:11 (CRITICAL); Agent B reviewed the same PR
    // but did NOT flag that line → an explicit 'ignored' take at that location.
    await seedReviewWithFinding(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agentA.id,
      runId: runA.id,
      summary: 'Found a critical issue.',
      verdict: 'request_changes',
      score: 80,
      finding: { file: 'src/config.ts', line: 11, severity: 'CRITICAL', title: 'Hardcoded secret' },
    });
    await seedReviewWithFinding(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agentB.id,
      runId: runB.id,
      summary: 'Looks fine to me.',
      verdict: 'approve',
      score: 90,
      finding: null,
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent` });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.agent_count).toBe(2);
    expect(body.columns).toHaveLength(2);
    // total = max(5000, 8000) — wall-clock of the parallel fan-out, not a sum.
    expect(body.total_duration_ms).toBe(8000);
    // total = sum(0.05, 0.10).
    expect(body.total_cost_usd).toBeCloseTo(0.15, 5);

    expect(body.conflicts).toHaveLength(1);
    const conflict = body.conflicts[0];
    expect(conflict.file).toBe('src/config.ts');
    expect(conflict.line).toBe(11);
    const takeA = conflict.takes.find((tk: { agent_id: string }) => tk.agent_id === agentA.id);
    const takeB = conflict.takes.find((tk: { agent_id: string }) => tk.agent_id === agentB.id);
    expect(takeA.verdict).toBe('CRITICAL');
    expect(takeB.verdict).toBe('ignored');

    await app.close();
  });

  it('a failed agent renders a failed column with its failure reason; the other agent\'s column is unaffected (AC-16)', async () => {
    const app = await appWithLlm();
    const { pr } = await seedRepoAndPr(pg.handle.db, workspaceId);
    const agentOk = await seedAgentRow(pg.handle.db, workspaceId, 'Reliable Agent');
    const agentBad = await seedAgentRow(pg.handle.db, workspaceId, 'Flaky Agent');

    const [multiRun] = await pg.handle.db
      .insert(t.multiAgentRuns)
      .values({ workspaceId, prId: pr.id })
      .returning();

    const runOk = await seedAgentRun(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agentOk.id,
      status: 'done',
      durationMs: 3000,
      costUsd: 0.02,
      score: 85,
    });
    const runBad = await seedAgentRun(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agentBad.id,
      status: 'failed',
      durationMs: null,
      costUsd: null,
      score: null,
      error: 'LLM provider quota exceeded',
    });
    await pg.handle.db
      .insert(t.multiAgentRunAgents)
      .values([
        { multiAgentRunId: multiRun!.id, agentRunId: runOk.id },
        { multiAgentRunId: multiRun!.id, agentRunId: runBad.id },
      ]);
    await seedReviewWithFinding(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agentOk.id,
      runId: runOk.id,
      summary: 'All good.',
      verdict: 'approve',
      score: 85,
      finding: null,
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent` });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const okColumn = body.columns.find((c: { agent_id: string }) => c.agent_id === agentOk.id);
    const badColumn = body.columns.find((c: { agent_id: string }) => c.agent_id === agentBad.id);
    expect(okColumn.status).toBe('done');
    expect(okColumn.score).toBe(85);

    expect(badColumn.status).toBe('failed');
    expect(badColumn.score).toBeNull();
    expect(badColumn.cost_usd).toBeNull();
    expect(badColumn.summary).toBe('LLM provider quota exceeded');

    await app.close();
  });

  it('estimates: averages an agent\'s past done runs (AC-4), shows "no history" for a never-run agent (AC-5), and null summary for no prior review on this PR (AC-6)', async () => {
    const app = await appWithLlm();
    const { pr: historyPr1 } = await seedRepoAndPr(pg.handle.db, workspaceId);
    const { pr: historyPr2 } = await seedRepoAndPr(pg.handle.db, workspaceId);
    const { pr: selectedPr } = await seedRepoAndPr(pg.handle.db, workspaceId);

    const veteranAgent = await seedAgentRow(pg.handle.db, workspaceId, 'Veteran Agent');
    const freshAgent = await seedAgentRow(pg.handle.db, workspaceId, 'Never Run Agent');

    // Veteran's past runs are on OTHER PRs (AC-4 — averaged across all PRs,
    // not the selected one) and it has never reviewed `selectedPr` (AC-6).
    await seedAgentRun(pg.handle.db, {
      workspaceId,
      prId: historyPr1.id,
      agentId: veteranAgent.id,
      status: 'done',
      durationMs: 4000,
      costUsd: 0.02,
      score: 80,
    });
    await seedAgentRun(pg.handle.db, {
      workspaceId,
      prId: historyPr2.id,
      agentId: veteranAgent.id,
      status: 'done',
      durationMs: 6000,
      costUsd: 0.04,
      score: 80,
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${selectedPr.id}/agent-estimates` });
    expect(res.statusCode).toBe(200);
    const estimates = res.json() as {
      agent_id: string;
      avg_duration_ms: number | null;
      avg_cost_usd: number | null;
      runs: number;
      summary: string | null;
    }[];

    const veteran = estimates.find((e) => e.agent_id === veteranAgent.id)!;
    expect(veteran.runs).toBe(2);
    expect(veteran.avg_duration_ms).toBe(5000);
    expect(veteran.avg_cost_usd).toBeCloseTo(0.03, 5);
    expect(veteran.summary).toBeNull();

    const fresh = estimates.find((e) => e.agent_id === freshAgent.id)!;
    expect(fresh.runs).toBe(0);
    expect(fresh.avg_duration_ms).toBeNull();
    expect(fresh.avg_cost_usd).toBeNull();

    await app.close();
  });

  it('rejects a multi-agent read for a PR belonging to another workspace as not_found (AC-26)', async () => {
    const app = await appWithLlm();
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-ws-${repoSeq++}` })
      .returning();
    const { pr: otherPr } = await seedRepoAndPr(pg.handle.db, otherWs!.id);
    await pg.handle.db.insert(t.multiAgentRuns).values({ workspaceId: otherWs!.id, prId: otherPr.id });

    const res = await app.inject({ method: 'GET', url: `/pulls/${otherPr.id}/multi-agent` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');

    await app.close();
  });

  it('POST /findings/:id/learn and /findings/:id/reply succeed (AC-18 server half)', async () => {
    const app = await appWithLlm();
    const { pr } = await seedRepoAndPr(pg.handle.db, workspaceId);
    const agent = await seedAgentRow(pg.handle.db, workspaceId, 'Learn/Reply Agent');
    const run = await seedAgentRun(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agent.id,
      status: 'done',
      durationMs: 1000,
      costUsd: 0.01,
      score: 60,
    });
    const review = await seedReviewWithFinding(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agent.id,
      runId: run.id,
      summary: 'One finding.',
      verdict: 'request_changes',
      score: 60,
      finding: { file: 'src/config.ts', line: 11, severity: 'CRITICAL', title: 'Hardcoded secret' },
    });
    const [findingRow] = await pg.handle.db
      .select()
      .from(t.findings)
      .where(eq(t.findings.reviewId, review.id));

    const learnRes = await app.inject({ method: 'POST', url: `/findings/${findingRow!.id}/learn` });
    expect(learnRes.statusCode).toBe(200);
    expect(learnRes.json().finding.accepted_at).not.toBeNull();

    const replyRes = await app.inject({
      method: 'POST',
      url: `/findings/${findingRow!.id}/reply`,
      payload: { reply: 'Thanks — fixing this.' },
    });
    expect(replyRes.statusCode).toBe(200);
    expect(replyRes.json().reply).toBe('Thanks — fixing this.');

    await app.close();
  });

  it('GET /repos/:id/multi-agent/latest returns the repo\'s most recent multi-agent run\'s PR number, null when none, and 404 for a cross-workspace repo (nav landing fix)', async () => {
    const app = await appWithLlm();

    // A fresh repo with a PR but no multi-agent run yet → null (still routes
    // to Configure, not an error).
    const { repo: emptyRepo } = await seedRepoAndPr(pg.handle.db, workspaceId);
    const emptyRes = await app.inject({ method: 'GET', url: `/repos/${emptyRepo.id}/multi-agent/latest` });
    expect(emptyRes.statusCode).toBe(200);
    expect(emptyRes.json()).toBeNull();

    // Two multi-agent runs on two different PRs in the SAME repo — the newer
    // one's PR number wins, not the first-seeded one.
    const { repo, pr: olderPr } = await seedRepoAndPr(pg.handle.db, workspaceId);
    const [olderRun] = await pg.handle.db
      .insert(t.multiAgentRuns)
      .values({ workspaceId, prId: olderPr.id })
      .returning();
    const [newerPr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
        number: prNumber++,
        title: 'Newer PR',
        author: 'marisa.koch',
        branch: 'feat/newer',
        base: 'main',
        headSha: 'e5f6a7b8',
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.multiAgentRuns).values({
      workspaceId,
      prId: newerPr!.id,
      ranAt: new Date(Date.now() + 60_000),
    });
    // Sanity: the older run really is older, ordering isn't tied to insert order.
    expect(olderRun!.ranAt.getTime()).toBeLessThan(Date.now() + 60_000);

    const latestRes = await app.inject({ method: 'GET', url: `/repos/${repo.id}/multi-agent/latest` });
    expect(latestRes.statusCode).toBe(200);
    expect(latestRes.json()).toEqual({ pr_number: newerPr!.number });

    // Cross-workspace repo → not_found, same tenancy guard as the PR routes.
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-ws-${repoSeq++}` })
      .returning();
    const { repo: otherRepo } = await seedRepoAndPr(pg.handle.db, otherWs!.id);
    const crossWsRes = await app.inject({
      method: 'GET',
      url: `/repos/${otherRepo.id}/multi-agent/latest`,
    });
    expect(crossWsRes.statusCode).toBe(404);
    expect(crossWsRes.json().error.code).toBe('not_found');

    await app.close();
  });

  it('GET /repos/:id/multi-agent/history lists every run in the repo across ALL its PRs, newest-first, with correct status/totals, and 404s cross-workspace (2026-08-27 repo-wide follow-on)', async () => {
    const app = await appWithLlm();

    const { repo, pr: pr1 } = await seedRepoAndPr(pg.handle.db, workspaceId);
    // A SECOND PR in the SAME repo — `seedRepoAndPr` always mints a fresh repo,
    // so a genuinely repo-wide fixture needs a direct insert here (mirrors the
    // `latestForRepo` test's `newerPr` above).
    const [pr2] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
        number: prNumber++,
        title: 'Second PR in the same repo',
        author: 'marisa.koch',
        branch: 'feat/second',
        base: 'main',
        headSha: 'c9d8e7f6',
        status: 'needs_review',
      })
      .returning();
    const agent = await seedAgentRow(pg.handle.db, workspaceId, 'History Agent');

    // Older run, on pr1: one done + one failed agent → overall status 'failed'.
    const [multiRun1] = await pg.handle.db
      .insert(t.multiAgentRuns)
      .values({ workspaceId, prId: pr1.id })
      .returning();
    const doneRun = await seedAgentRun(pg.handle.db, {
      workspaceId,
      prId: pr1.id,
      agentId: agent.id,
      status: 'done',
      durationMs: 5000,
      costUsd: 0.05,
      score: 80,
    });
    const failedRun = await seedAgentRun(pg.handle.db, {
      workspaceId,
      prId: pr1.id,
      agentId: agent.id,
      status: 'failed',
      durationMs: null,
      costUsd: null,
      score: null,
      error: 'boom',
    });
    await pg.handle.db.insert(t.multiAgentRunAgents).values([
      { multiAgentRunId: multiRun1!.id, agentRunId: doneRun.id },
      { multiAgentRunId: multiRun1!.id, agentRunId: failedRun.id },
    ]);

    // Newer run, on a DIFFERENT PR (pr2) in the SAME repo: one still-running
    // agent → overall status 'running'; totals stay 0/null (not a misleading
    // "finished instantly for free") even though agent_count is already 1.
    const [multiRun2] = await pg.handle.db
      .insert(t.multiAgentRuns)
      .values({ workspaceId, prId: pr2.id, ranAt: new Date(Date.now() + 60_000) })
      .returning();
    const [runningAgentRun] = await pg.handle.db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        agentId: agent.id,
        prId: pr2.id,
        provider: 'openai',
        model: 'gpt-4.1',
        status: 'running',
        durationMs: null,
        costUsd: null,
        score: null,
      })
      .returning();
    await pg.handle.db
      .insert(t.multiAgentRunAgents)
      .values({ multiAgentRunId: multiRun2!.id, agentRunId: runningAgentRun!.id });

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/multi-agent/history` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(2);

    // Newest-first, and each row identifies its OWN PR (repo-wide, not scoped
    // to a single PR — 2026-08-27 requester decision).
    expect(body[0]).toMatchObject({
      id: multiRun2!.id,
      pr_number: pr2.number,
      pr_title: pr2.title,
      agent_count: 1,
      total_duration_ms: 0,
      total_cost_usd: null,
      status: 'running',
    });
    expect(body[1]).toMatchObject({
      id: multiRun1!.id,
      pr_number: pr1.number,
      pr_title: pr1.title,
      agent_count: 2,
      total_duration_ms: 5000,
      total_cost_usd: 0.05,
      status: 'failed',
    });

    // Cross-workspace repo → not_found, same tenancy guard as /latest.
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-ws-${repoSeq++}` })
      .returning();
    const { repo: otherRepo } = await seedRepoAndPr(pg.handle.db, otherWs!.id);
    const crossWsRes = await app.inject({
      method: 'GET',
      url: `/repos/${otherRepo.id}/multi-agent/history`,
    });
    expect(crossWsRes.statusCode).toBe(404);
    expect(crossWsRes.json().error.code).toBe('not_found');

    await app.close();
  });
});
