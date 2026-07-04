import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agent-skills] Docker not available — skipping integration tests.');
}

d('Agent skill links — enabled + ordering', () => {
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

  async function makeAgentAndSkills(app: Awaited<ReturnType<typeof makeApp>>) {
    const agentId = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Reviewer', provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
      })
    ).json().id as string;
    const skillA = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'A', description: 'd', type: 'convention', body: 'body-a' },
      })
    ).json();
    const skillB = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'B', description: 'd', type: 'security', body: 'body-b' },
      })
    ).json();
    return { agentId, skillA, skillB };
  }

  it('POST sets the ordered links; GET round-trips enabled + order', async () => {
    const app = await makeApp();
    const { agentId, skillA, skillB } = await makeAgentAndSkills(app);

    const set = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: {
        links: [
          { skill_id: skillB.id, enabled: true },
          { skill_id: skillA.id, enabled: false },
        ],
      },
    });
    expect(set.statusCode).toBe(200);

    const get = (await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })).json();
    expect(get).toEqual([
      { agent_id: agentId, skill_id: skillB.id, order: 0, enabled: true },
      { agent_id: agentId, skill_id: skillA.id, order: 1, enabled: false },
    ]);
    await app.close();
  });

  it('enabledSkillsForAgent requires BOTH the per-agent AND the global toggle, ordered', async () => {
    const app = await makeApp();
    const { agentId, skillA, skillB } = await makeAgentAndSkills(app);

    // A: per-agent enabled, global enabled → included.
    // B: per-agent enabled, but globally disabled → excluded.
    await app.inject({ method: 'PUT', url: `/skills/${skillB.id}`, payload: { enabled: false } });
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: {
        links: [
          { skill_id: skillA.id, enabled: true },
          { skill_id: skillB.id, enabled: true },
        ],
      },
    });

    const repo = new AgentsRepository(pg.handle.db);
    const enabled = await repo.enabledSkillsForAgent(agentId);
    expect(enabled).toEqual([{ name: 'A', body: 'body-a' }]);
    await app.close();
  });

  it('a per-agent-disabled skill is excluded even when globally enabled', async () => {
    const app = await makeApp();
    const { agentId, skillA } = await makeAgentAndSkills(app);

    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { links: [{ skill_id: skillA.id, enabled: false }] },
    });

    const repo = new AgentsRepository(pg.handle.db);
    expect(await repo.enabledSkillsForAgent(agentId)).toEqual([]);
    await app.close();
  });

  it('re-POSTing a smaller set drops skills no longer included', async () => {
    const app = await makeApp();
    const { agentId, skillA, skillB } = await makeAgentAndSkills(app);

    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: {
        links: [
          { skill_id: skillA.id, enabled: true },
          { skill_id: skillB.id, enabled: true },
        ],
      },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { links: [{ skill_id: skillA.id, enabled: true }] },
    });

    const get = (await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })).json();
    expect(get).toHaveLength(1);
    expect(get[0].skill_id).toBe(skillA.id);
    await app.close();
  });
});
