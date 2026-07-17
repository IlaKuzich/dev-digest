import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { ContextService, ContextDocTooLargeError } from '../src/modules/context/service.js';
import { CONTEXT_MAX_DOC_BYTES, TOKENIZER_SAFE_CHAR_LIMIT } from '../src/modules/context/constants.js';
import { approxTokens } from '../src/adapters/tokenizer/index.js';

// `vi.spyOn` cannot redefine `node:fs/promises`'s exports (non-configurable
// ESM bindings) — `vi.mock` with a passthrough factory is the working way to
// observe calls to a node built-in while keeping its real behavior for every
// other export (mkdtemp/mkdir/writeFile/unlink used elsewhere in this file).
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context] Docker not available — skipping integration tests.');
}

d('context module (it)', () => {
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

  function makeApp(tokenizerCount?: (text: string) => number) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        // Deterministic, cheap token counter — this test asserts arithmetic,
        // not js-tiktoken's exact BPE output.
        tokenizer: { count: tokenizerCount ?? approxTokens },
      },
    });
  }

  /** Insert a fresh repo whose clone is a tmp dir populated with `files`
   *  (repo-relative path -> content). `clonePath: null` when `files` is
   *  omitted (no clone yet). */
  async function seedRepo(files?: Record<string, string>): Promise<{ repoId: string; clonePath: string | null }> {
    let clonePath: string | null = null;
    if (files) {
      clonePath = await mkdtemp(join(tmpdir(), 'context-it-'));
      for (const [rel, content] of Object.entries(files)) {
        const abs = join(clonePath, rel);
        await mkdir(join(abs, '..'), { recursive: true });
        await writeFile(abs, content, 'utf8');
      }
    }
    const slug = randomUUID().slice(0, 8);
    const [row] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: slug,
        fullName: `acme/${slug}`,
        clonePath,
        lastPolledAt: clonePath ? new Date() : null,
      })
      .returning();
    return { repoId: row!.id, clonePath };
  }

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Agent ${randomUUID().slice(0, 8)}`,
        provider: 'openrouter',
        model: 'deepseek/deepseek-v4-flash',
        system_prompt: 'Review the diff.',
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
        description: 'A house rule',
        type: 'custom',
        body: '# Rule\nFollow the invariant.',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  it('discovers nested .md docs under specs/docs/insights with root badges, token estimates, and used_by_agents (AC-1/4/26)', async () => {
    const app = await makeApp();
    const { repoId } = await seedRepo({
      'specs/a.md': '# Spec A\nsome invariant text here',
      'specs/nested/b.md': '# Spec B nested',
      'docs/c.md': '# Doc C',
      'README.md': '# not in a context root — must not be listed',
    });

    const before = (await app.inject({ method: 'GET', url: `/repos/${repoId}/context-docs` })).json();
    expect(before.clone.present).toBe(true);
    expect(before.clone.synced_at).toBeTruthy();
    const paths = before.docs.map((d: { path: string }) => d.path).sort();
    expect(paths).toEqual(['docs/c.md', 'specs/a.md', 'specs/nested/b.md']);
    const specA = before.docs.find((d: { path: string }) => d.path === 'specs/a.md');
    expect(specA.root).toBe('specs');
    expect(specA.token_estimate).toBe(approxTokens('# Spec A\nsome invariant text here'));
    expect(specA.bytes).toBeGreaterThan(0);
    expect(specA.used_by_agents).toBe(0);

    // Attach specs/a.md to an agent — used_by_agents should reflect it.
    const agentId = await createAgent(app);
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context`,
      payload: { docs: [{ path: 'specs/a.md', attached: true }] },
    });

    const after = (await app.inject({ method: 'GET', url: `/repos/${repoId}/context-docs` })).json();
    expect(after.docs.find((d: { path: string }) => d.path === 'specs/a.md').used_by_agents).toBe(1);
    expect(after.docs.find((d: { path: string }) => d.path === 'docs/c.md').used_by_agents).toBe(0);
    await app.close();
  });

  it('W1 sibling (architecture review): discovery (listDocs) bounds the real encoder to a fixed slice, even for a legal-but-huge doc', async () => {
    // Spy on the (fast, deterministic) count fn so we can assert on the
    // ARGUMENT it was called with, without ever running real `cl100k_base`
    // BPE over a huge string in this test — GET /repos/:repoId/context-docs
    // fires automatically on every page load (useContextDocs), with no
    // attach action required, so this path needs the same bound as the
    // run-executor's AC-18 check.
    const countSpy = vi.fn(approxTokens);
    const app = await makeApp(countSpy);
    const hugeText = 'x'.repeat(70_000);
    const { repoId } = await seedRepo({ 'docs/huge.md': hugeText, 'specs/small.md': '# small' });

    countSpy.mockClear();
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context-docs` });
    expect(res.statusCode).toBe(200);
    const docs = res.json().docs as { path: string; token_estimate: number }[];
    expect(docs.map((d) => d.path).sort()).toEqual(['docs/huge.md', 'specs/small.md']);

    // Every count() call — for EVERY discovered doc, huge or small — was fed
    // a slice no longer than TOKENIZER_SAFE_CHAR_LIMIT, never the full
    // 70,000-char doc.
    expect(countSpy).toHaveBeenCalled();
    for (const call of countSpy.mock.calls) {
      expect((call[0] as string).length).toBeLessThanOrEqual(TOKENIZER_SAFE_CHAR_LIMIT);
    }
    await app.close();
  });

  it('content endpoint returns doc text and is path-guarded (AC-6)', async () => {
    const app = await makeApp();
    const { repoId } = await seedRepo({ 'specs/a.md': '# Spec A\ninvariant text' });

    const ok = await app.inject({ method: 'GET', url: `/repos/${repoId}/context-docs/content?path=specs/a.md` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ path: 'specs/a.md', text: '# Spec A\ninvariant text' });

    const escape = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context-docs/content?path=${encodeURIComponent('../outside.md')}`,
    });
    expect(escape.statusCode).toBe(404);
    await app.close();
  });

  it('agent and skill context: POST persists paths + order for attached-only entries; GET round-trips them (AC-10/11)', async () => {
    const app = await makeApp();
    await seedRepo({
      'specs/a.md': '# a',
      'specs/b.md': '# b',
      'docs/c.md': '# c',
    });
    const agentId = await createAgent(app);

    const posted = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context`,
      payload: {
        docs: [
          { path: 'specs/a.md', attached: true },
          { path: 'specs/b.md', attached: false }, // not attached — must NOT be persisted
          { path: 'docs/c.md', attached: true },
        ],
      },
    });
    expect(posted.statusCode).toBe(200);
    expect(posted.json()).toEqual([
      { path: 'specs/a.md', order: 0, attached: true },
      { path: 'docs/c.md', order: 1, attached: true },
    ]);

    const got = (await app.inject({ method: 'GET', url: `/agents/${agentId}/context` })).json();
    expect(got).toEqual([
      { path: 'specs/a.md', order: 0, attached: true },
      { path: 'docs/c.md', order: 1, attached: true },
    ]);

    // Same round-trip for a skill.
    const skillId = await createSkill(app);
    await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/context`,
      payload: { docs: [{ path: 'docs/c.md', attached: true }] },
    });
    const skillGot = (await app.inject({ method: 'GET', url: `/skills/${skillId}/context` })).json();
    expect(skillGot).toEqual([{ path: 'docs/c.md', order: 0, attached: true }]);
    await app.close();
  });

  it('rejects an unrecognised (undiscovered) path on attach', async () => {
    const app = await makeApp();
    await seedRepo({ 'specs/a.md': '# a' });
    const agentId = await createAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context`,
      payload: { docs: [{ path: 'specs/does-not-exist.md', attached: true }] },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('cross-workspace agent/skill id resolves to 404 (IDOR — agent_context/skill_context carry no workspace_id)', async () => {
    const app = await makeApp();
    // A second, unrelated workspace + agent + skill. The default AuthProvider
    // always resolves the FIRST (seeded) workspace, so requesting these ids
    // exercises the cross-tenant path.
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${randomUUID().slice(0, 8)}` }).returning();
    const [otherAgent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId: otherWs!.id,
        name: 'Other workspace agent',
        provider: 'openrouter',
        model: 'deepseek/deepseek-v4-flash',
        systemPrompt: 'x',
      })
      .returning();
    const [otherSkill] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId: otherWs!.id,
        name: 'Other workspace skill',
        description: 'x',
        type: 'custom',
        source: 'manual',
        body: 'x',
      })
      .returning();

    const getAgent = await app.inject({ method: 'GET', url: `/agents/${otherAgent!.id}/context` });
    expect(getAgent.statusCode).toBe(404);
    const postAgent = await app.inject({
      method: 'POST',
      url: `/agents/${otherAgent!.id}/context`,
      payload: { docs: [] },
    });
    expect(postAgent.statusCode).toBe(404);
    const getSkill = await app.inject({ method: 'GET', url: `/skills/${otherSkill!.id}/context` });
    expect(getSkill.statusCode).toBe(404);
    const postSkill = await app.inject({
      method: 'POST',
      url: `/skills/${otherSkill!.id}/context`,
      payload: { docs: [] },
    });
    expect(postSkill.statusCode).toBe(404);
    await app.close();
  });

  it('no clone → present:false; a clone with no matching docs → docs: [] (AC-2/3 data side)', async () => {
    const app = await makeApp();
    const { repoId: noCloneRepoId } = await seedRepo();
    const noClone = (await app.inject({ method: 'GET', url: `/repos/${noCloneRepoId}/context-docs` })).json();
    expect(noClone).toEqual({ docs: [], clone: { present: false, synced_at: null } });

    const { repoId: emptyRepoId } = await seedRepo({ 'README.md': '# nothing under a context root' });
    const empty = (await app.inject({ method: 'GET', url: `/repos/${emptyRepoId}/context-docs` })).json();
    expect(empty.docs).toEqual([]);
    expect(empty.clone.present).toBe(true);
    await app.close();
  });

  it('resolveForAgent: skill-then-agent dedupe (first wins), skip-on-missing, and throws ContextDocTooLargeError WITHOUT reading an oversized doc (AC-14/17/29)', async () => {
    const app = await makeApp();
    const bigContent = 'x'.repeat(CONTEXT_MAX_DOC_BYTES + 1);
    const { clonePath } = await seedRepo({
      'specs/a.md': '# shared invariant',
      'docs/agent-only.md': '# agent-only doc',
      // Written so attach validation (against the discovered doc set) passes,
      // then deleted below BEFORE resolveForAgent runs — simulating "attached,
      // then deleted/renamed on disk" (AC-17), not "never existed".
      'docs/missing.md': '# will be deleted before the run',
      'docs/big.md': bigContent,
    });

    const agentId = await createAgent(app);
    const skillId = await createSkill(app);

    // Skill attaches specs/a.md; agent enables the skill AND attaches the
    // SAME path plus its own extra doc — specs/a.md must be injected once,
    // at its skill-inherited (first) position.
    await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/context`,
      payload: { docs: [{ path: 'specs/a.md', attached: true }] },
    });
    await app.inject({
      method: 'POST',
      url: '/agents/' + agentId + '/skills',
      payload: { links: [{ skill_id: skillId, enabled: true }] },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context`,
      payload: {
        docs: [
          { path: 'specs/a.md', attached: true },
          { path: 'docs/agent-only.md', attached: true },
          { path: 'docs/missing.md', attached: true },
        ],
      },
    });

    // Now remove it from disk — attached-then-deleted, the AC-17 scenario.
    await unlink(join(clonePath!, 'docs/missing.md'));

    const service = new ContextService(app.container);

    // The missing doc + the oversized doc aren't part of this call — tested
    // separately below so the dedupe assertion stays uncluttered.
    const { injected, skipped } = await service.resolveForAgent(workspaceId, agentId, clonePath);
    expect(injected.map((i) => i.path)).toEqual(['specs/a.md', 'docs/agent-only.md']);
    expect(skipped.map((s) => s.path)).toContain('docs/missing.md');
    expect(skipped.find((s) => s.path === 'docs/missing.md')?.reason).toBeTruthy();

    // Now attach the oversized doc too and confirm the run fails loudly,
    // WITHOUT ever reading its bytes.
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context`,
      payload: { docs: [{ path: 'docs/big.md', attached: true }] },
    });
    vi.mocked(readFile).mockClear();
    let caught: unknown;
    try {
      await service.resolveForAgent(workspaceId, agentId, clonePath);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ContextDocTooLargeError);
    expect((caught as ContextDocTooLargeError).path).toBe('docs/big.md');
    expect((caught as ContextDocTooLargeError).size).toBe(CONTEXT_MAX_DOC_BYTES + 1);
    const readBigDoc = vi.mocked(readFile).mock.calls.some((call) => String(call[0]).includes('big.md'));
    expect(readBigDoc).toBe(false);

    await app.close();
  });

  it('resolveForAgent returns nothing when the repo has no clone (AC-2 run-time analogue)', async () => {
    const app = await makeApp();
    const agentId = await createAgent(app);
    const service = new ContextService(app.container);
    const result = await service.resolveForAgent(workspaceId, agentId, null);
    expect(result).toEqual({ injected: [], skipped: [] });
    await app.close();
  });
});
