import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type FlagRow = typeof t.prFlags.$inferSelect;

export class FlagRepository {
  constructor(private db: Db) {}

  async getForPr(workspaceId: string, prId: string): Promise<FlagRow | undefined> {
    const [row] = await this.db.select().from(t.prFlags).where(eq(t.prFlags.prId, prId));
    return row;
  }

  async set(workspaceId: string, prId: string, key: string, value: boolean): Promise<void> {
    await this.db
      .insert(t.prFlags)
      .values({ prId, key, value })
      .onConflictDoUpdate({ target: [t.prFlags.prId, t.prFlags.key], set: { value } });
  }
}
