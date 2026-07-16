import type { BlastRadius } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { PullsService } from '../pulls/service.js';
import { NotFoundError } from '../../platform/errors.js';
import { toBlastRadius, toIndexStateDto } from './helpers.js';

/**
 * The HTTP response of GET /pulls/:id/blast — BlastRadius PLUS one extra
 * field. Kept local (not in @devdigest/shared) mirroring the `RepoIntelState`
 * precedent (`client/src/lib/hooks/repo-intel.ts:12-13`) — repo-intel's
 * `IndexState` type lives server-side. Outer key stays snake_case
 * (`index_state`) to match the contract; inner keys stay camelCase to match
 * `IndexState` (`repo-intel/types.ts:42-50`).
 */
export interface BlastIndexState {
  status: 'full' | 'partial' | 'degraded' | 'failed';
  filesIndexed: number;
  filesSkipped: number;
  degraded?: boolean;
  degradedReason?: string;
}

export type BlastResponse = BlastRadius & { index_state: BlastIndexState };

/**
 * Blast radius use case — read-only over the repo-intel facade
 * (`container.repoIntel`). The facade already performs the graph traversal
 * (finds callers, excludes the declaration's own file); this service and its
 * `helpers.ts` only group/sort/cap/attribute what the facade returns. Zero
 * analysis at review time, zero LLM calls on this path (an optional
 * "explain" LLM call is a later task — `summary` stays `''` here).
 */
export class BlastService {
  constructor(private container: Container) {}

  async getBlast(workspaceId: string, prId: string): Promise<BlastResponse> {
    // Workspace-scoped IDOR guard AND the only source of `repoId` — PrDetail
    // has no `repo_id` (`vendor/shared/contracts/platform.ts:157-222`), so it
    // cannot come from PullsService.getDetail().
    const pull = await this.container.pullsRepo.getById(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    // Mirrors smart-diff/service.ts:23-27 — reuse PullsService for the
    // already-fetched PR files rather than re-implementing the PR fetch.
    const detail = await new PullsService(this.container).getDetail(workspaceId, prId);
    const changedFiles = detail.files.map((f) => f.path);

    const [res, state] = await Promise.all([
      this.container.repoIntel.getBlastRadius(pull.repoId, changedFiles),
      this.container.repoIntel.getIndexState(pull.repoId),
    ]);

    // `res.degraded`/`res.reason` describe the data actually returned and are
    // folded into index_state — the two facade calls can disagree (see
    // toIndexStateDto).
    return {
      ...toBlastRadius(res),
      index_state: toIndexStateDto(state, res.degraded, res.reason),
    };
  }
}
