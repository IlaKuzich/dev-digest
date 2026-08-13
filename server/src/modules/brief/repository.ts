import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { Brief } from '@devdigest/shared';

/**
 * The ONLY place touching `pr_brief` (mirrors `IntentRepository`'s ownership
 * note over `pr_intent`). `pr_brief` has no `workspace_id` column of its own
 * — every read is workspace-scoped by joining to `pull_requests` (IDOR guard,
 * server INSIGHTS 2026-07-15).
 */
export class BriefRepository {
  constructor(private db: Db) {}

  /** Workspace-scoped cached read. A row whose `json` no longer matches the
   *  current `Brief` shape (a stale/old-shape row) reads as "not generated" —
   *  never surfaced as a parse error to the caller. */
  async getBrief(workspaceId: string, prId: string): Promise<Brief | null> {
    const [row] = await this.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prBrief.prId))
      .where(and(eq(t.prBrief.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)));
    if (!row) return null;
    const parsed = Brief.safeParse(row.json);
    return parsed.success ? parsed.data : null;
  }

  async upsertBrief(prId: string, brief: Brief): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: brief })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
  }
}
