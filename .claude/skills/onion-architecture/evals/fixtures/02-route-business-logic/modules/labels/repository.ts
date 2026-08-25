import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class LabelRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string, prId: string) {
    return this.db
      .select()
      .from(t.prLabels)
      .where(and(eq(t.prLabels.workspaceId, workspaceId), eq(t.prLabels.prId, prId)));
  }

  async replace(workspaceId: string, prId: string, names: string[]): Promise<void> {
    await this.db
      .delete(t.prLabels)
      .where(and(eq(t.prLabels.workspaceId, workspaceId), eq(t.prLabels.prId, prId)));
    for (const name of names) {
      await this.db.insert(t.prLabels).values({ workspaceId, prId, name });
    }
  }
}
