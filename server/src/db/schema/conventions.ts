import { pgTable, uuid, text, integer } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

/** One row per convention extraction run (drives the "N sample files · last scan" header). */
export const conventionScans = pgTable('convention_scans', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repos.id, { onDelete: 'cascade' }),
  sampleCount: integer('sample_count').notNull().default(0),
  model: text('model').notNull(),
  createdAt: now(),
});
