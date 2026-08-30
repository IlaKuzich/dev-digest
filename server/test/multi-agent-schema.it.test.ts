import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[multi-agent-schema] Docker not available — skipping integration tests.');
}

d('multi_agent_run_agents schema (migration + FK/cascade)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.workspaceId, workspaceId));
    prId = pr!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('links an agent_runs row to its multi_agent_runs parent and resolves it', async () => {
    const db = pg.handle.db;

    const [parent] = await db
      .insert(t.multiAgentRuns)
      .values({ workspaceId, prId })
      .returning();
    const [child] = await db
      .insert(t.agentRuns)
      .values({ workspaceId, prId, provider: 'openrouter', model: 'test-model' })
      .returning();

    await db.insert(t.multiAgentRunAgents).values({
      multiAgentRunId: parent!.id,
      agentRunId: child!.id,
    });

    const resolved = await db
      .select({ agentRun: t.agentRuns })
      .from(t.multiAgentRunAgents)
      .innerJoin(t.agentRuns, eq(t.multiAgentRunAgents.agentRunId, t.agentRuns.id))
      .where(eq(t.multiAgentRunAgents.multiAgentRunId, parent!.id));

    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.agentRun.id).toBe(child!.id);
  });

  it('cascades the link row away when the parent multi_agent_runs row is deleted', async () => {
    const db = pg.handle.db;

    const [parent] = await db
      .insert(t.multiAgentRuns)
      .values({ workspaceId, prId })
      .returning();
    const [child] = await db
      .insert(t.agentRuns)
      .values({ workspaceId, prId, provider: 'openrouter', model: 'test-model' })
      .returning();
    await db.insert(t.multiAgentRunAgents).values({
      multiAgentRunId: parent!.id,
      agentRunId: child!.id,
    });

    await db.delete(t.multiAgentRuns).where(eq(t.multiAgentRuns.id, parent!.id));

    const remainingLinks = await db
      .select()
      .from(t.multiAgentRunAgents)
      .where(eq(t.multiAgentRunAgents.agentRunId, child!.id));
    expect(remainingLinks).toHaveLength(0);
  });
});
