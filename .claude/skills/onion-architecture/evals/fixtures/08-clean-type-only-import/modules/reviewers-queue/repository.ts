import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type ReviewerRow = typeof t.reviewerLoad.$inferSelect;

export class ReviewerQueueRepository {
  constructor(private db: Db) {}

  async listLoad(workspaceId: string): Promise<ReviewerRow[]> {
    return this.db.select().from(t.reviewerLoad).where(eq(t.reviewerLoad.workspaceId, workspaceId));
  }

  async incrementLoad(workspaceId: string, userId: string): Promise<void> {
    await this.db
      .update(t.reviewerLoad)
      .set({ activeCount: sql`${t.reviewerLoad.activeCount} + 1` })
      .where(and(eq(t.reviewerLoad.workspaceId, workspaceId), eq(t.reviewerLoad.userId, userId)));
  }
}
