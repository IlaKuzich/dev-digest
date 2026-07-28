import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class TranslationRepository {
  constructor(private db: Db) {}

  async getDescription(workspaceId: string, prId: string) {
    const [row] = await this.db
      .select({ description: t.pullRequests.description })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async cacheTranslation(workspaceId: string, prId: string, lang: string, text: string): Promise<void> {
    await this.db
      .insert(t.prTranslations)
      .values({ workspaceId, prId, lang, text })
      .onConflictDoUpdate({ target: [t.prTranslations.prId, t.prTranslations.lang], set: { text } });
  }
}
