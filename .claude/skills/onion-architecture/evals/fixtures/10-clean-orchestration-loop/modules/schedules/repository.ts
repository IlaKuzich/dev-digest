import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type ScheduleRow = typeof t.digestSchedules.$inferSelect;

export class ScheduleRepository {
  constructor(private db: Db) {}

  async listDue(workspaceId: string, now: Date): Promise<ScheduleRow[]> {
    const rows = await this.db
      .select()
      .from(t.digestSchedules)
      .where(eq(t.digestSchedules.workspaceId, workspaceId));
    return rows.filter((r) => r.nextRunAt <= now);
  }

  async bumpNextRun(workspaceId: string, id: string, next: Date): Promise<void> {
    await this.db
      .update(t.digestSchedules)
      .set({ nextRunAt: next })
      .where(and(eq(t.digestSchedules.workspaceId, workspaceId), eq(t.digestSchedules.id, id)));
  }
}
