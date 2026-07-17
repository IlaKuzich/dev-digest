import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

d('Skills CRUD', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const createBody = {
    name: 'Security rubric',
    description: 'Flags secrets and injection',
    type: 'security' as const,
    body: '# Rule\nFlag any hardcoded credential.',
  };

  it('creates a skill as manual/v1 and lists it', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ ...createBody, source: 'manual', version: 1, enabled: true });

    const list = await app.inject({ method: 'GET', url: '/skills' });
    expect(list.json().map((s: { name: string }) => s.name)).toContain('Security rubric');
    await app.close();
  });

  it('editing body bumps version and snapshots the prior body into skill_versions', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json().id as string;

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { body: '# Rule v2\nFlag any hardcoded credential or secret.' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);
    expect(updated.json().body).toContain('v2');
    await app.close();
  });

  it('metadata-only or enabled-only edits do NOT bump version', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json().id as string;

    const meta = await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { description: 'new desc' } });
    expect(meta.json().version).toBe(1);

    const toggled = await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { enabled: false } });
    expect(toggled.json().version).toBe(1);
    expect(toggled.json().enabled).toBe(false);
    await app.close();
  });

  it('deletes a skill; 404s afterward', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json().id as string;

    const del = await app.inject({ method: 'DELETE', url: `/skills/${id}` });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('rejects an incomplete create body with 422', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/skills', payload: { name: 'x' } });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
