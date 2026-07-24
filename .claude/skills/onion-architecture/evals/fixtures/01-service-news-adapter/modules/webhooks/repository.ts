import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class WebhookRepository {
  constructor(private db: Db) {}

  async getConfig(workspaceId: string) {
    const [row] = await this.db
      .select()
      .from(t.webhookConfigs)
      .where(eq(t.webhookConfigs.workspaceId, workspaceId));
    return row;
  }

  async markNotified(workspaceId: string, prNumber: number): Promise<void> {
    await this.db
      .update(t.webhookConfigs)
      .set({ lastNotifiedPr: prNumber })
      .where(eq(t.webhookConfigs.workspaceId, workspaceId));
  }
}
