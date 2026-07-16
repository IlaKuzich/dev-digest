import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { MAX_PRIOR_PRS } from './constants.js';

/**
 * Blast radius data-access. The ONLY place in this module that touches
 * `pr_files` / `pull_requests` directly — everything else in `blast/` reads
 * through the repo-intel facade (`container.repoIntel`), which is why T1
 * shipped without a `repository.ts`. T11 ("Prior PRs touching these files")
 * needs a direct join over `pr_files`, so this module gets one now.
 */

export interface PriorPrRow {
  id: string;
  number: number;
  title: string;
  author: string;
  status: string;
  updatedAt: Date | null;
}

export class BlastRepository {
  constructor(private db: Db) {}

  /**
   * Other PRs in the SAME workspace + repo that touched any of `paths`,
   * newest-first, capped at `MAX_PRIOR_PRS`. Distinct on the PR — a PR that
   * touched multiple overlapping paths must appear only once.
   *
   * IDOR guard: workspace-scoping happens via the `pull_requests` join in
   * THIS query (`workspaceId` is filtered here, not assumed from the
   * caller). `repoId`/`prId` alone are never sufficient — see
   * `BlastService.getBlast`, which resolves `workspaceId` + `repoId` from
   * the already-tenancy-checked `pullsRepo.getById(workspaceId, prId)` call
   * before ever reaching this method.
   */
  async getPriorPrs(
    workspaceId: string,
    repoId: string,
    prId: string,
    paths: string[],
  ): Promise<PriorPrRow[]> {
    if (paths.length === 0) return [];

    return this.db
      .selectDistinct({
        id: t.pullRequests.id,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        author: t.pullRequests.author,
        status: t.pullRequests.status,
        updatedAt: t.pullRequests.updatedAt,
      })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prFiles.prId))
      .where(
        and(
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          ne(t.pullRequests.id, prId),
          inArray(t.prFiles.path, paths),
        ),
      )
      .orderBy(desc(t.pullRequests.updatedAt))
      .limit(MAX_PRIOR_PRS);
  }
}
