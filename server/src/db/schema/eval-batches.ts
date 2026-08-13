import { pgTable, uuid, integer, timestamp, doublePrecision, numeric, index } from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { agents } from './agents';

// ============================================================ Eval batches
//
// `eval_batches` — one row per "Run all evals" / "Run all agents" batch
// execution: the aggregate scored result across every case run in that
// batch, at a specific agent version. `eval_runs.batch_id` (added in the
// SAME migration, `schema/eval.ts`) links the per-case rows back to their
// batch. Carries `workspace_id` directly (rather than relying on a join to
// `agents`) so batch reads scope by tenancy without a join — see
// server/INSIGHTS.md's IDOR note on child tables keyed only by another
// entity's id.

export const evalBatches = pgTable(
  'eval_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    agentVersion: integer('agent_version').notNull(),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    tracesPassed: integer('traces_passed').notNull().default(0),
    tracesTotal: integer('traces_total').notNull().default(0),
    // NUMERIC not doublePrecision — financial column (server/INSIGHTS.md 2026-06-25);
    // this value is a SUM across every case in a batch, so float drift would compound.
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }),
  },
  (t) => ({
    // Postgres does not auto-index FK columns; this table is read scoped by
    // (workspaceId, agentId) for both the per-agent detail and dashboard-home.
    workspaceAgentIdx: index('eval_batches_workspace_agent_idx').on(t.workspaceId, t.agentId),
  }),
);
