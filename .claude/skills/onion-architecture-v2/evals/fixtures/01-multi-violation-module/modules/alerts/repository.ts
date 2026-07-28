import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class AlertRepository {
  constructor(private db: Db) {}

  async recordSent(workspaceId: string, repoId: string, message: string): Promise<void> {
    await this.db.insert(t.alertLog).values({ workspaceId, repoId, message, sentAt: new Date() });
  }
}
