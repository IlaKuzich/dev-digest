import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class SyncRepository {
  constructor(private db: Db) {}

  async getPrRef(workspaceId: string, prId: string) {
    const [row] = await this.db
      .select({ owner: t.repos.owner, repo: t.repos.name, sha: t.pullRequests.headSha })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async markSynced(workspaceId: string, prId: string): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({ statusSyncedAt: new Date() })
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  }
}
