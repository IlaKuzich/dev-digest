import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class SmsRepository {
  constructor(private db: Db) {}

  async logSend(workspaceId: string, phone: string): Promise<void> {
    await this.db.insert(t.smsLog).values({ workspaceId, phone, sentAt: new Date() });
  }
}
