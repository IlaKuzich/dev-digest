import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { BaseRepository } from '../_shared/base-repository.js';

export type SyncRunRow = typeof t.syncRuns.$inferSelect;

export class SyncOrchestratorRepository extends BaseRepository<SyncRunRow> {
  constructor(db: Db) {
    super(db, t.syncRuns);
  }

  async list(workspaceId: string): Promise<SyncRunRow[]> {
    return this.listScoped(workspaceId);
  }

  async recordRun(workspaceId: string, repoId: string, status: string) {
    const [row] = await this.db
      .insert(t.syncRuns)
      .values({ workspaceId, repoId, status, startedAt: new Date() })
      .returning();
    return row!;
  }
}
