import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type CommentRow = typeof t.reviewComments.$inferSelect;

export class CommentRepository {
  constructor(private db: Db) {}

  async listForPr(workspaceId: string, prId: string): Promise<CommentRow[]> {
    return this.db
      .select()
      .from(t.reviewComments)
      .where(and(eq(t.reviewComments.workspaceId, workspaceId), eq(t.reviewComments.prId, prId)));
  }

  async insert(workspaceId: string, prId: string, authorUserId: string, body: string): Promise<CommentRow> {
    const [row] = await this.db
      .insert(t.reviewComments)
      .values({ workspaceId, prId, authorUserId, body })
      .returning();
    return row!;
  }
}
