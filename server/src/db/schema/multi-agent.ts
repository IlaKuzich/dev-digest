import { pgTable, uuid, index } from 'drizzle-orm/pg-core';
import { multiAgentRuns, agentRuns } from './runs';

/**
 * Links each child `agent_runs` row fanned out by a multi-agent review to its
 * `multi_agent_runs` parent (AC-12). One agent run belongs to exactly one
 * parent, so `agent_run_id` is the primary key. A NEW file per the "don't edit
 * existing schema files" rule — `runs.ts` (which owns both referenced tables)
 * is left untouched.
 */
export const multiAgentRunAgents = pgTable(
  'multi_agent_run_agents',
  {
    multiAgentRunId: uuid('multi_agent_run_id')
      .notNull()
      .references(() => multiAgentRuns.id, { onDelete: 'cascade' }),
    agentRunId: uuid('agent_run_id')
      .primaryKey()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    multiAgentRunIdx: index('multi_agent_run_agents_multi_agent_run_id_idx').on(t.multiAgentRunId),
  }),
);
