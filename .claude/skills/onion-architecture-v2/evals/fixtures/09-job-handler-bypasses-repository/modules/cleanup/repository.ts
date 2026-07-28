import { and, eq, lt } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class CleanupRepository {
  constructor(private db: Db) {}

  async deleteOldRuns(workspaceId: string, before: Date): Promise<number> {
    const deleted = await this.db
      .delete(t.agentRuns)
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), lt(t.agentRuns.createdAt, before)))
      .returning({ id: t.agentRuns.id });
    return deleted.length;
  }
}
