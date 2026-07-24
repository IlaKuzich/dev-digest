import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class NotificationRepository {
  constructor(private db: Db) {}

  async insert(workspaceId: string, userId: string, message: string) {
    const [row] = await this.db
      .insert(t.notifications)
      .values({ workspaceId, userId, message, read: false })
      .returning();
    return row!;
  }

  async listUnread(workspaceId: string, userId: string) {
    return this.db
      .select()
      .from(t.notifications)
      .where(
        and(
          eq(t.notifications.workspaceId, workspaceId),
          eq(t.notifications.userId, userId),
          eq(t.notifications.read, false),
        ),
      );
  }
}
