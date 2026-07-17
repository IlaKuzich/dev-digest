import { pgTable, uuid, text, integer, primaryKey, index } from 'drizzle-orm/pg-core';
import { agents } from './agents';
import { skills } from './skills';

// ============================================================ Project context attachments
//
// `agent_context` / `skill_context` — which docs (repo-relative paths under the
// configured context roots) are attached to an agent or skill, and in what
// order they should be injected at review time (T3's `resolveForAgent`).
//
// NOTE: deliberately NO `workspace_id` column on either table — same shape as
// `agent_skills` (`schema/agents.ts:51-64`). Tenancy is enforced at the
// repository layer by joining to the owning `agents`/`skills` row (which IS
// workspace-scoped) rather than duplicating `workspace_id` here — see
// `server/INSIGHTS.md:38` for why a child table keyed only by another
// entity's id must never be queried without that join.
//
// NOTE ON FILENAME: this is NOT `schema/context.ts` — that filename is already
// taken by an unrelated repo-intel domain file (`code_chunks`/`symbols`/
// `references`/`onboarding`). Per the do-not-touch rule ("don't edit existing
// schema files — extend with a new file + migration"), these new tables live
// in their own file instead of colliding with/overwriting that one.

export const agentContext = pgTable(
  'agent_context',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    order: integer('order').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.agentId, t.path] }),
    // Postgres does not auto-index FK columns.
    agentIdx: index('agent_context_agent_idx').on(t.agentId),
  }),
);

export const skillContext = pgTable(
  'skill_context',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    order: integer('order').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.skillId, t.path] }),
    // Postgres does not auto-index FK columns.
    skillIdx: index('skill_context_skill_idx').on(t.skillId),
  }),
);
