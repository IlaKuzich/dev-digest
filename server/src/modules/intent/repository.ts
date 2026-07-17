import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { Intent } from '@devdigest/shared';

/**
 * The ONLY place touching `pr_intent` going forward. Relocated here (T4) from
 * `reviews/repository/pull.repo.ts` so the dependency runs one way:
 * `reviews` (run-executor) → `intent` (service) — no cycle, one repository per
 * table (onion "single owner" rule).
 */
export class IntentRepository {
  constructor(private db: Db) {}

  // ---- pr_intent CRUD -------------------------------------------------------

  /** Workspace-scoped: `pr_intent` has no `workspace_id` column of its own, so
   *  tenancy is enforced by joining to `pull_requests` (mirrors `getPull` and
   *  the sibling Conventions module's workspace-scoped reads) — a `prId`
   *  belonging to another workspace returns null instead of leaking the row. */
  async getIntent(workspaceId: string, prId: string): Promise<Intent | null> {
    const [row] = await this.db
      .select({
        intent: t.prIntent.intent,
        inScope: t.prIntent.inScope,
        outOfScope: t.prIntent.outOfScope,
      })
      .from(t.prIntent)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prIntent.prId))
      .where(and(eq(t.prIntent.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)));
    if (!row) return null;
    return { intent: row.intent, in_scope: row.inScope, out_of_scope: row.outOfScope };
  }

  async upsertIntent(prId: string, intent: Intent): Promise<void> {
    await this.db
      .insert(t.prIntent)
      .values({
        prId,
        intent: intent.intent,
        inScope: intent.in_scope,
        outOfScope: intent.out_of_scope,
      })
      .onConflictDoUpdate({
        target: t.prIntent.prId,
        set: { intent: intent.intent, inScope: intent.in_scope, outOfScope: intent.out_of_scope },
      });
  }

  // ---- reads used by derivation ---------------------------------------------

  async getPull(workspaceId: string, prId: string) {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        base: t.pullRequests.base,
        headSha: t.pullRequests.headSha,
        repoId: t.pullRequests.repoId,
      })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async getRepoRef(repoId: string) {
    const [row] = await this.db
      .select({
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    return row;
  }

  async getPrFiles(prId: string) {
    return this.db
      .select({ path: t.prFiles.path, patch: t.prFiles.patch })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }
}
