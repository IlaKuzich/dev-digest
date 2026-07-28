import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class InviteRepository {
  constructor(private db: Db) {}

  async create(workspaceId: string, email: string): Promise<void> {
    await this.db.insert(t.invites).values({ workspaceId, email, status: 'pending' });
  }

  async list(workspaceId: string) {
    return this.db.select().from(t.invites).where(eq(t.invites.workspaceId, workspaceId));
  }
}
