import { pgTable, uuid, text, jsonb, timestamp, doublePrecision, boolean, integer, vector, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';
import { skills } from './skills';
import { conventionScans } from './conventions';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

export const conventions = pgTable('conventions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
  scanId: uuid('scan_id').references(() => conventionScans.id, { onDelete: 'cascade' }),
  category: text('category'),
  rule: text('rule').notNull(),
  editedRule: text('edited_rule'),
  evidencePath: text('evidence_path'),
  evidenceLineStart: integer('evidence_line_start'),
  evidenceLineEnd: integer('evidence_line_end'),
  evidenceSnippet: text('evidence_snippet'),
  confidence: doublePrecision('confidence'),
  status: text('status', { enum: ['candidate', 'accepted', 'rejected'] })
    .notNull()
    .default('candidate'),
  skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
  // superseded by `status`; kept so the migration stays additive-only.
  accepted: boolean('accepted').notNull().default(false),
  createdAt: now(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
