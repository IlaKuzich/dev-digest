import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type MemberRow = typeof t.members.$inferSelect;

export class MemberRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<MemberRow[]> {
    return this.db.select().from(t.members).where(eq(t.members.workspaceId, workspaceId));
  }
}
