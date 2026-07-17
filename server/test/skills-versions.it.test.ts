import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsService } from '../src/modules/skills/service.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';
import type { Container } from '../src/platform/container.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-versions] Docker not available — skipping integration tests.');
}

/**
 * Skill version history + restore. `skill_versions` snapshots the NEW body under
 * the NEW version number, so the newest row always mirrors the live skill.
 * Restore is forward-only: re-applying an old body appends a version rather than
 * rewinding, so eval runs stay reproducible against the text they scored.
 */
d('skill versions', () => {
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
    name: 'Versioned Skill',
    description: 'A skill under version control.',
    type: 'rubric' as const,
    body: '# v1 body',
  };

  async function createSkill(app: Awaited<ReturnType<typeof makeApp>>): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  it('a new skill has exactly one version (v1) capturing its body', async () => {
    const app = await makeApp();
    const skillId = await createSkill(app);

    const res = await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` });
    expect(res.statusCode).toBe(200);
    const versions = res.json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ skill_id: skillId, version: 1, body: '# v1 body' });
    expect(typeof versions[0].created_at).toBe('string');
    await app.close();
  });

  it('a body edit appends a new version holding the NEW body; list is newest-first', async () => {
    const app = await makeApp();
    const skillId = await createSkill(app);

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: '# v2 body', note: 'Added Security dimension' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);

    const versions = (await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    // The newest snapshot mirrors the live skill — not the body it replaced.
    expect(versions[0].body).toBe('# v2 body');
    expect(versions[0].note).toBe('Added Security dimension');
    expect(versions[1].body).toBe('# v1 body');
    await app.close();
  });

  it('metadata-only and enabled-only changes do NOT create a new version', async () => {
    const app = await makeApp();
    const skillId = await createSkill(app);

    await app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { enabled: false } });
    await app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { name: 'Renamed' } });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('re-saving an identical body does not bump the version', async () => {
    const app = await makeApp();
    const skillId = await createSkill(app);

    const res = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: '# v1 body' },
    });
    expect(res.json().version).toBe(1);

    const versions = (await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('GET /skills/:id/versions/:version returns one snapshot', async () => {
    const app = await makeApp();
    const skillId = await createSkill(app);
    await app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { body: '# v2 body' } });

    const v1 = await app.inject({ method: 'GET', url: `/skills/${skillId}/versions/1` });
    expect(v1.statusCode).toBe(200);
    expect(v1.json()).toMatchObject({ version: 1, body: '# v1 body' });
    await app.close();
  });

  it('restore re-applies an old body as a NEW version; history is not rewritten', async () => {
    const app = await makeApp();
    const skillId = await createSkill(app);
    await app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { body: '# v2 body' } });

    const res = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/versions/1/restore`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    // Forward-only: v3 carries v1's body rather than rewinding to v1.
    expect(res.json()).toMatchObject({ version: 3, body: '# v1 body' });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    expect(versions[0].note).toBe('Restored v1');
    // The intermediate version survives the restore.
    expect(versions[1].body).toBe('# v2 body');
    await app.close();
  });

  it('restore accepts a caller-supplied note', async () => {
    const app = await makeApp();
    const skillId = await createSkill(app);
    await app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { body: '# v2 body' } });

    await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/versions/1/restore`,
      payload: { note: 'v2 was too strict' },
    });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })).json();
    expect(versions[0].note).toBe('v2 was too strict');
    await app.close();
  });

  it('404s for an unknown skill and an unknown version', async () => {
    const app = await makeApp();
    const skillId = await createSkill(app);
    const ghost = '00000000-0000-0000-0000-000000000000';

    expect((await app.inject({ method: 'GET', url: `/skills/${ghost}/versions` })).statusCode).toBe(
      404,
    );
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${ghost}/versions/1` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${skillId}/versions/99` })).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/skills/${skillId}/versions/99/restore`,
          payload: {},
        })
      ).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('a non-numeric :version is rejected at the edge (422, not 404)', async () => {
    const app = await makeApp();
    const skillId = await createSkill(app);
    const res = await app.inject({ method: 'GET', url: `/skills/${skillId}/versions/abc` });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('versions are workspace-scoped: another tenant cannot read or restore them', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-skills' }).returning();
    const repo = new SkillsRepository(db);
    const foreign = await repo.insert({
      workspaceId: otherWs!.id,
      name: 'Foreign Skill',
      description: 'x',
      type: 'custom',
      body: '# foreign',
    });

    const service = new SkillsService({ db } as unknown as Container);
    const [{ id: defaultWs }] = await db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));

    expect(await service.listVersions(otherWs!.id, foreign.id)).toHaveLength(1);
    expect(await service.listVersions(defaultWs!, foreign.id)).toBeUndefined();
    expect(await service.getVersion(defaultWs!, foreign.id, 1)).toBeUndefined();
    expect(await service.restoreVersion(defaultWs!, foreign.id, 1)).toBeUndefined();
  });

  it('a legacy skill with no snapshot rows still reports its live version', async () => {
    const { db } = pg.handle;
    const [{ id: defaultWs }] = await db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));

    // Simulate a pre-snapshot-on-insert row: skill exists, skill_versions empty.
    const [legacy] = await db
      .insert(t.skills)
      .values({
        workspaceId: defaultWs!,
        name: 'Legacy Skill',
        description: 'Created before snapshots existed.',
        type: 'custom',
        source: 'manual',
        body: '# legacy body',
        version: 4,
      })
      .returning();

    const service = new SkillsService({ db } as unknown as Container);
    const versions = await service.listVersions(defaultWs!, legacy!.id);
    expect(versions).toHaveLength(1);
    expect(versions![0]).toMatchObject({ version: 4, body: '# legacy body', note: null });
  });
});
