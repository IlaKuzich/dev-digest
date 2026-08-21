import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class ExportRepository {
  constructor(private db: Db) {}

  async listFindings(workspaceId: string, repoId: string) {
    return this.db
      .select()
      .from(t.findings)
      .where(and(eq(t.findings.workspaceId, workspaceId), eq(t.findings.repoId, repoId)));
  }
}
