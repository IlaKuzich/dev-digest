/**
 * T4 — run-time injection + version snapshot (AC-27 write). DB-backed
 * (Docker). Exercises the FULL vertical: attach → `POST /pulls/:id/review` →
 * background run → persisted `run_traces` — through the same HTTP surface
 * `test/reviews.it.test.ts` uses, extended with a repo clone dir holding
 * real context docs (project-context's `resolveForAgent` reads `repos.clonePath`
 * directly; it never touches `container.git`).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq, and, desc } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockLLMProvider, MockEmbedder } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Embedder, Review } from '@devdigest/shared';
import { CONTEXT_MAX_DOC_BYTES, TOKENIZER_SAFE_CHAR_LIMIT } from '../src/modules/context/constants.js';
import { approxTokens } from '../src/adapters/tokenizer/index.js';

// Same passthrough-mock pattern as `test/context.it.test.ts`'s
// `server/INSIGHTS.md` entry: `vi.spyOn` cannot redefine `node:fs/promises`'s
// (non-configurable) ESM exports; `vi.mock` with a spread-passthrough factory
// is the working way to observe `readFile` calls while every other export
// (mkdtemp/mkdir/writeFile/unlink) keeps its real behavior.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context-injection] Docker not available — skipping integration tests.');
}

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

class CountingEmbedder implements Embedder {
  readonly dims = 1536;
  calls = 0;
  private inner = new MockEmbedder();
  async embed(texts: string[]): Promise<number[][]> {
    this.calls++;
    return this.inner.embed(texts);
  }
}

d('context injection (it) — run-executor + AC-27 snapshot', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(embedder: Embedder, llmCalls: MockLLMProvider, tokenizerCount?: (text: string) => number) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        embedder,
        llm: { openrouter: llmCalls },
        // Deterministic, cheap token counter — real `cl100k_base` BPE on a
        // long RUN of a single repeated character (the AC-18 overflow
        // fixture below) is a pathological worst case for merge-based BPE
        // and can take minutes; this test asserts the overflow ARITHMETIC,
        // not js-tiktoken's exact encoding (mirrors `context.it.test.ts`).
        tokenizer: { count: tokenizerCount ?? approxTokens },
      },
    });
  }

  /** A fresh repo whose clone is a tmp dir with `files`, plus a PR whose
   *  pr_files patch matches DIFF (mirrors `reviews.it.test.ts`'s setup). */
  async function seedRepoAndPr(files: Record<string, string>) {
    const clonePath = await mkdtemp(join(tmpdir(), 'context-inj-'));
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(clonePath, rel);
      await mkdir(join(abs, '..'), { recursive: true });
      await writeFile(abs, content, 'utf8');
    }
    const name = `payments-api-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 482,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'Add rate limiting.',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    return { repo: repo!, pr: pr!, clonePath };
  }

  async function createAgent(
    app: Awaited<ReturnType<typeof makeApp>>,
    opts: { model?: string } = {},
  ): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Agent ${randomUUID().slice(0, 8)}`,
        provider: 'openrouter',
        model: opts.model ?? 'deepseek/deepseek-v4-flash',
        system_prompt: 'You are a reviewer.',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  async function createSkill(app: Awaited<ReturnType<typeof makeApp>>): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: `Skill ${randomUUID().slice(0, 8)}`,
        description: 'house rule',
        type: 'custom',
        body: '# Rule\nfollow it',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  async function attachAgentContext(
    app: Awaited<ReturnType<typeof makeApp>>,
    agentId: string,
    paths: string[],
  ) {
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context`,
      payload: { docs: paths.map((path) => ({ path, attached: true })) },
    });
    expect(res.statusCode).toBe(200);
  }

  async function attachSkillContext(
    app: Awaited<ReturnType<typeof makeApp>>,
    skillId: string,
    paths: string[],
  ) {
    const res = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/context`,
      payload: { docs: paths.map((path) => ({ path, attached: true })) },
    });
    expect(res.statusCode).toBe(200);
  }

  /** Poll THIS specific run (by id, not PR) until it reaches a terminal
   *  status — `waitForPrRuns`'s `expected` count is PR-scoped, which is
   *  ambiguous when a test runs a second review against the same PR (an
   *  already-terminal earlier run would satisfy `expected:1` immediately). */
  async function waitForRun(runId: string, timeoutMs = 30_000) {
    const start = Date.now();
    for (;;) {
      const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
      if (run && ['done', 'failed', 'cancelled'].includes(run.status ?? '')) return run;
      if (Date.now() - start > timeoutMs) throw new Error(`run ${runId} did not terminate in ${timeoutMs}ms`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  async function runReviewAndGetTrace(
    app: Awaited<ReturnType<typeof makeApp>>,
    prId: string,
    agentId: string,
  ) {
    const posted = await app.inject({
      method: 'POST',
      url: `/pulls/${prId}/review`,
      payload: { agentId },
    });
    expect(posted.statusCode).toBe(200);
    const runId = posted.json().runs[0].run_id as string;
    const run = await waitForRun(runId);
    // `completeAgentRun` (status → terminal) and `saveRunTrace` are two
    // separate writes a beat apart — retry briefly for the trace doc to land.
    let trace: { specs_read?: unknown } = {};
    for (let attempt = 0; attempt < 40; attempt++) {
      const res = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
      const body = res.json();
      if (body && body.specs_read !== undefined) {
        trace = body;
        break;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    return { trace, run: run!, runId };
  }

  it('AC-25 release gate: an attached doc\'s invariant text reaches the `## Project context` block; AC-22 fills specs_read', async () => {
    const INVARIANT = 'INVARIANT: api/ must not import db/ directly, verify-me-9f3a';
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await makeApp(new MockEmbedder(), llm);
    const { pr, clonePath } = await seedRepoAndPr({ 'specs/rule.md': `# Rule\n${INVARIANT}` });
    const agentId = await createAgent(app);
    await attachAgentContext(app, agentId, ['specs/rule.md']);

    const { trace, run } = await runReviewAndGetTrace(app, pr.id, agentId);
    expect(run.status).toBe('done');
    expect(trace.specs_read).toEqual(['specs/rule.md']);
    expect(trace.prompt_assembly.specs).toContain(INVARIANT);
    expect(trace.prompt_assembly.user).toContain('## Project context');
    expect(trace.prompt_assembly.user).toContain(INVARIANT);
    void clonePath;
    await app.close();
  });

  it('AC-20: no attachments → specs_read is empty and no Project context block is rendered (byte-identical to before)', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await makeApp(new MockEmbedder(), llm);
    const { pr } = await seedRepoAndPr({});
    const agentId = await createAgent(app);

    const { trace, run } = await runReviewAndGetTrace(app, pr.id, agentId);
    expect(run.status).toBe('done');
    expect(trace.specs_read).toEqual([]);
    expect(trace.prompt_assembly.specs).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('## Project context');
    await app.close();
  });

  it('AC-14: a doc attached to both an enabled skill AND the agent is injected once, at its skill-inherited position', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await makeApp(new MockEmbedder(), llm);
    const { pr } = await seedRepoAndPr({
      'specs/shared.md': '# Shared rule',
      'docs/agent-only.md': '# Agent-only doc',
    });
    const agentId = await createAgent(app);
    const skillId = await createSkill(app);

    await attachSkillContext(app, skillId, ['specs/shared.md']);
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { links: [{ skill_id: skillId, enabled: true }] },
    });
    // Agent attaches the SAME doc again plus its own — dedupe keeps it once,
    // at the skill-inherited (first) position.
    await attachAgentContext(app, agentId, ['specs/shared.md', 'docs/agent-only.md']);

    const { trace, run } = await runReviewAndGetTrace(app, pr.id, agentId);
    expect(run.status).toBe('done');
    expect(trace.specs_read).toEqual(['specs/shared.md', 'docs/agent-only.md']);
    const occurrences = (trace.prompt_assembly.specs.match(/Shared rule/g) ?? []).length;
    expect(occurrences).toBe(1);
    await app.close();
  });

  it('AC-16/AC-17: attached-then-deleted doc is skipped, surfaced in the run log, and the run completes', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await makeApp(new MockEmbedder(), llm);
    const { pr, clonePath } = await seedRepoAndPr({
      'specs/kept.md': '# Kept doc',
      'specs/gone.md': '# Will be deleted before the run',
    });
    const agentId = await createAgent(app);
    await attachAgentContext(app, agentId, ['specs/kept.md', 'specs/gone.md']);
    await unlink(join(clonePath, 'specs/gone.md'));

    const { trace, run } = await runReviewAndGetTrace(app, pr.id, agentId);
    expect(run.status).toBe('done');
    expect(trace.specs_read).toEqual(['specs/kept.md']);
    expect(trace.log.some((l: { msg: string }) => l.msg.includes('skipped attached document'))).toBe(true);
    await app.close();
  });

  it('AC-29: an oversized attached doc fails the run naming the doc + size, WITHOUT reading its bytes', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await makeApp(new MockEmbedder(), llm);
    const bigContent = 'x'.repeat(CONTEXT_MAX_DOC_BYTES + 1);
    const { pr } = await seedRepoAndPr({ 'docs/big.md': bigContent });
    const agentId = await createAgent(app);
    await attachAgentContext(app, agentId, ['docs/big.md']);

    vi.mocked(readFile).mockClear();
    const { run } = await runReviewAndGetTrace(app, pr.id, agentId);
    expect(run.status).toBe('failed');
    expect(run.error).toContain('docs/big.md');
    expect(run.error).toContain(String(CONTEXT_MAX_DOC_BYTES + 1));
    const readBigDoc = vi.mocked(readFile).mock.calls.some((call) => String(call[0]).includes('big.md'));
    expect(readBigDoc).toBe(false);
    await app.close();
  });

  it('AC-18 + W1 (architecture review): enough attached text overflows a small mapped model window and fails naming the project-context block; the real encoder only ever sees a BOUNDED slice; an unknown model performs no encode at all', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    // Spy on the (fast, deterministic) count fn so we can assert on the
    // ARGUMENT it was called with, without ever running real `cl100k_base`
    // BPE over a huge repeated-character string in this test (that's exactly
    // the pathological input `TOKENIZER_SAFE_CHAR_LIMIT` bounds against).
    const countSpy = vi.fn(approxTokens);
    const app = await makeApp(new MockEmbedder(), llm, countSpy);
    // gpt-3.5-turbo's mapped window (16,385) is the smallest entry so this
    // fixture stays modest: ~70,000 chars ≈ 17,500 estimated tokens (chars/4
    // fallback, no BPE dictionary needed) clears window*0.9 ≈ 14,746.
    const hugeText = 'x'.repeat(70_000);
    const { pr } = await seedRepoAndPr({ 'specs/huge.md': hugeText });
    const overflowAgentId = await createAgent(app, { model: 'gpt-3.5-turbo' });
    await attachAgentContext(app, overflowAgentId, ['specs/huge.md']);

    countSpy.mockClear();
    const overflow = await runReviewAndGetTrace(app, pr.id, overflowAgentId);
    expect(overflow.run.status).toBe('failed');
    expect(overflow.run.error).toContain('Project context');
    expect(overflow.run.error).toContain('gpt-3.5-turbo');
    // W1 — a MAPPED model still runs the check, but every count() call was
    // fed a BOUNDED slice (`TOKENIZER_SAFE_CHAR_LIMIT`), never the full
    // 70,000-char doc: the real encoder's worst-case cost is capped
    // regardless of how large (or adversarially-shaped) the attached text is.
    expect(countSpy).toHaveBeenCalled();
    for (const call of countSpy.mock.calls) {
      expect((call[0] as string).length).toBeLessThanOrEqual(TOKENIZER_SAFE_CHAR_LIMIT);
    }

    // Same huge doc, but an agent on a model NOT in MODEL_CONTEXT_WINDOWS —
    // W1: the overflow check (and its encode) is skipped ENTIRELY, not just
    // the size comparison, so count() is invoked ZERO times for this run.
    const unknownAgentId = await createAgent(app, { model: 'totally-unknown-model-xyz' });
    await attachAgentContext(app, unknownAgentId, ['specs/huge.md']);
    countSpy.mockClear();
    const unknown = await runReviewAndGetTrace(app, pr.id, unknownAgentId);
    expect(unknown.run.status).toBe('done');
    expect(countSpy).not.toHaveBeenCalled();
    await app.close();
  });

  it('AC-19: zero embedder calls, and no LLM calls beyond the review itself', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const embedder = new CountingEmbedder();
    const app = await makeApp(embedder, llm);
    const { pr } = await seedRepoAndPr({ 'specs/a.md': '# a' });
    const agentId = await createAgent(app);
    await attachAgentContext(app, agentId, ['specs/a.md']);

    const { run } = await runReviewAndGetTrace(app, pr.id, agentId);
    expect(run.status).toBe('done');
    expect(embedder.calls).toBe(0);
    // TWO completeStructured calls: `executeRuns`'s pre-existing (unrelated to
    // this feature) once-per-PR intent auto-derive, plus one for the review
    // itself (single-pass, one file, small diff). Zero — this feature adds no
    // additional model call of its own; resolveForAgent/discovery/attach are
    // pure fs + DB.
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(2);
    expect(llm.calls.filter((c) => c.method === 'embed')).toHaveLength(0);
    await app.close();
  });

  it('AC-27: after attach + a config edit, agent_versions.config_json.context holds the attached paths', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await makeApp(new MockEmbedder(), llm);
    await seedRepoAndPr({ 'specs/a.md': '# a', 'docs/b.md': '# b' });
    const agentId = await createAgent(app);
    await attachAgentContext(app, agentId, ['specs/a.md', 'docs/b.md']);

    // Context-tab-only save must NOT itself bump the version (no config
    // change) — confirm the paths are captured at the NEXT config-change
    // snapshot instead, exactly like linked skills.
    await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}`,
      payload: { system_prompt: 'Updated prompt to force a version bump.' },
    });

    const [latest] = await pg.handle.db
      .select()
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId)))
      .orderBy(desc(t.agentVersions.version))
      .limit(1);
    expect(latest!.version).toBe(2);
    const configJson = latest!.configJson as { context: string[] };
    expect(configJson.context.sort()).toEqual(['docs/b.md', 'specs/a.md']);
    await app.close();
  });
});
