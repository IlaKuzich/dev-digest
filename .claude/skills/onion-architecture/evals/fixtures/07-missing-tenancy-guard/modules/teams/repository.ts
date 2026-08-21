import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type TeamRow = typeof t.teams.$inferSelect;

export class TeamRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<TeamRow[]> {
    return this.db.select().from(t.teams).where(eq(t.teams.workspaceId, workspaceId));
  }

  async getById(id: string): Promise<TeamRow | undefined> {
    const [row] = await this.db.select().from(t.teams).where(eq(t.teams.id, id));
    return row;
  }

  async rename(workspaceId: string, id: string, name: string): Promise<void> {
    await this.db
      .update(t.teams)
      .set({ name })
      .where(and(eq(t.teams.workspaceId, workspaceId), eq(t.teams.id, id)));
  }
}
