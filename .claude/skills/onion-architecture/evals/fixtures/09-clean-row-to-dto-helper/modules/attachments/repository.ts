import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type AttachmentRow = typeof t.attachments.$inferSelect;

export class AttachmentRepository {
  constructor(private db: Db) {}

  async listForReview(workspaceId: string, reviewId: string): Promise<AttachmentRow[]> {
    return this.db
      .select()
      .from(t.attachments)
      .where(and(eq(t.attachments.workspaceId, workspaceId), eq(t.attachments.reviewId, reviewId)));
  }

  async insert(workspaceId: string, reviewId: string, storageKey: string, sizeBytes: number): Promise<AttachmentRow> {
    const [row] = await this.db
      .insert(t.attachments)
      .values({ workspaceId, reviewId, storageKey, sizeBytes })
      .returning();
    return row!;
  }
}
