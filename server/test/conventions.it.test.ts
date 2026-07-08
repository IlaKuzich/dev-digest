import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { LLMProvider } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

/** Drafts the stub model returns on the next extract; each test sets this. */
let nextDrafts: unknown[] = [];

/** Minimal LLM stub — only completeStructured is exercised by extract. */
const stubLlm = {
  id: 'openrouter',
  async listModels() {
    return [];
  },
  async complete() {
    throw new Error('not used');
  },
  async completeStructured() {
    return {
      data: { candidates: nextDrafts },
      model: 'deepseek/deepseek-v4-flash',
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

d('conventions module (it)', () => {
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
    nextDrafts = [];
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), llm: { openrouter: stubLlm } },
    });
  }

  /** Insert a fresh repo pointing at a tmp clone dir with the given files; return its id. */
  async function seedRepo(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'conv-'));
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(dir, rel);
      await mkdir(join(abs, '..'), { recursive: true });
      await writeFile(abs, content, 'utf8');
    }
    const slug = randomUUID().slice(0, 8);
    const [row] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: slug,
        fullName: `acme/${slug}`,
        clonePath: dir,
      })
      .returning();
    return row!.id;
  }

  const FILE_A = ['export function findUser(id) {', '  return db.users.find(id);', '}'].join('\n');

  it('extract persists only GROUNDED candidates and drops the rest', async () => {
    const app = await makeApp();
    const repoId = await seedRepo({ 'src/a.ts': FILE_A });
    nextDrafts = [
      { category: 'structure', rule: 'Data access goes through db', evidence: { file: 'src/a.ts', line: 2, snippet: 'return db.users.find(id);' }, confidence: 0.9 },
      { category: 'naming', rule: 'ghost', evidence: { file: 'src/a.ts', line: 5, snippet: 'return cache.get(id);' }, confidence: 0.4 },
      { category: 'imports', rule: 'ghost file', evidence: { file: 'src/missing.ts', line: 1, snippet: 'whatever' }, confidence: 0.3 },
    ];

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.candidates).toHaveLength(1);
    expect(body.dropped).toBe(2);
    expect(body.candidates[0].evidence_line_start).toBe(2);
    expect(body.candidates[0].status).toBe('candidate');
    await app.close();
  });

  it('GET returns latest-scan candidates plus accepted (accepted survives a re-scan)', async () => {
    const app = await makeApp();
    const repoId = await seedRepo({ 'src/a.ts': FILE_A });

    nextDrafts = [
      { category: 'structure', rule: 'Rule ONE', evidence: { file: 'src/a.ts', line: 2, snippet: 'return db.users.find(id);' }, confidence: 0.9 },
    ];
    const first = (await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })).json();
    await app.inject({ method: 'PATCH', url: `/conventions/${first.candidates[0].id}`, payload: { status: 'accepted' } });

    // Re-scan yields a NEW, different candidate.
    nextDrafts = [
      { category: 'naming', rule: 'Rule TWO', evidence: { file: 'src/a.ts', line: 1, snippet: 'export function findUser(id) {' }, confidence: 0.8 },
    ];
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });

    const list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    const rules = list.map((c: { rule: string }) => c.rule).sort();
    expect(rules).toEqual(['Rule ONE', 'Rule TWO']); // accepted ONE survived + new TWO
    await app.close();
  });

  it('PATCH accept / reject / edit round-trips', async () => {
    const app = await makeApp();
    const repoId = await seedRepo({ 'src/a.ts': FILE_A });
    nextDrafts = [
      { category: 'structure', rule: 'original rule', evidence: { file: 'src/a.ts', line: 2, snippet: 'return db.users.find(id);' }, confidence: 0.9 },
    ];
    const id = (await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })).json().candidates[0].id;

    const accepted = await app.inject({ method: 'PATCH', url: `/conventions/${id}`, payload: { status: 'accepted' } });
    expect(accepted.json().status).toBe('accepted');

    const edited = await app.inject({ method: 'PATCH', url: `/conventions/${id}`, payload: { rule: 'edited rule' } });
    expect(edited.json().edited_rule).toBe('edited rule');
    expect(edited.json().rule).toBe('original rule'); // original preserved

    const missing = await app.inject({ method: 'PATCH', url: `/conventions/${randomUUID()}`, payload: { status: 'rejected' } });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('POST /skill merges accepted into a convention skill and stamps skill_id', async () => {
    const app = await makeApp();
    const repoId = await seedRepo({ 'src/a.ts': FILE_A });
    nextDrafts = [
      { category: 'structure', rule: 'Data access goes through db', evidence: { file: 'src/a.ts', line: 2, snippet: 'return db.users.find(id);' }, confidence: 0.9 },
    ];
    const id = (await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })).json().candidates[0].id;
    await app.inject({ method: 'PATCH', url: `/conventions/${id}`, payload: { status: 'accepted' } });

    const created = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { name: 'repo-conventions', description: 'house rules', body: '# repo-conventions\n\n## structure\nData access goes through db' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ type: 'convention', source: 'extracted' });
    const skillId = created.json().id;

    const list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    expect(list.find((c: { id: string }) => c.id === id).skill_id).toBe(skillId);
    await app.close();
  });

  it('re-scan clears candidate+rejected but keeps accepted (deduped, not re-added)', async () => {
    const app = await makeApp();
    const repoId = await seedRepo({ 'src/a.ts': FILE_A });
    const draft = { category: 'structure', rule: 'Rule R', evidence: { file: 'src/a.ts', line: 2, snippet: 'return db.users.find(id);' }, confidence: 0.9 };

    nextDrafts = [draft];
    const id = (await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })).json().candidates[0].id;
    await app.inject({ method: 'PATCH', url: `/conventions/${id}`, payload: { status: 'accepted' } });

    // Re-extract proposing the SAME rule → deduped against accepted.
    nextDrafts = [draft];
    const second = (await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` })).json();
    expect(second.candidates).toHaveLength(0);
    expect(second.dropped).toBe(1);

    const list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    expect(list.filter((c: { rule: string }) => c.rule === 'Rule R')).toHaveLength(1); // accepted once
    await app.close();
  });
});
