import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class DigestRepository {
  constructor(private db: Db) {}

  async listSubscribers(workspaceId: string) {
    return this.db
      .select()
      .from(t.digestSubscriptions)
      .where(eq(t.digestSubscriptions.workspaceId, workspaceId));
  }
}
