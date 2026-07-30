import type { BlastRadius, Provider } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { PullsService } from '../pulls/service.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { toBlastRadius, toCoverage, toIndexStateDto } from './helpers.js';
import { buildBlastSummaryMessages, BlastSummary } from './summary.js';
import { BLAST_SUMMARY_MAX_RETRIES } from './constants.js';
import { BlastRepository, type PriorPrRow } from './repository.js';

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

/**
 * A prior PR that touched one of the current PR's changed files — the
 * "history" half of blast radius (T11). Not part of `brief.ts` — same
 * local-copy convention as `BlastIndexState`. `merged_at` has no dedicated
 * DB column (`pull_requests` has no `merged_at` timestamp); it is derived
 * as `updated_at` ONLY when `status === 'merged'`, else `null` — see
 * `toPriorPr` below.
 */
export interface PriorPr {
  id: string;
  number: number;
  title: string;
  author: string | null;
  merged_at: string | null;
}

/**
 * How much of the PR the map covers. The index snapshots the DEFAULT BRANCH, so
 * files the PR creates are absent from it and produce no symbols — legitimately,
 * since new code has no downstream callers yet. Without this the UI reports a
 * 22-file PR as "3 symbols / 0 endpoints" on a `full` index, which reads as
 * "nothing is affected". Same local-copy convention as `BlastIndexState`.
 */
export interface BlastCoverage {
  /** Changed files the indexer could analyze — code files only, no lockfiles. */
  changed_code_files: number;
  /** Of those, how many actually had symbols in the index. */
  analyzed_files: number;
  /** The rest — new in this PR, or otherwise absent from the indexed snapshot. */
  unanalyzed_files: string[];
}

export type BlastResponse = BlastRadius & {
  index_state: BlastIndexState;
  prior_prs: PriorPr[];
  coverage: BlastCoverage;
};

/**
 * Blast radius use case — read-only over the repo-intel facade
 * (`container.repoIntel`). The facade already performs the graph traversal
 * (finds callers, excludes the declaration's own file); this service and its
 * `helpers.ts` only group/sort/cap/attribute what the facade returns. Zero
 * analysis at review time, zero LLM calls on this path (an optional
 * "explain" LLM call is a later task — `summary` stays `''` here).
 */
export class BlastService {
  private repo: BlastRepository;

  constructor(private container: Container) {
    this.repo = new BlastRepository(container.db);
  }

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

    const [res, state, priorRows] = await Promise.all([
      this.container.repoIntel.getBlastRadius(pull.repoId, changedFiles),
      this.container.repoIntel.getIndexState(pull.repoId),
      // T11 — "Prior PRs touching these files". `workspaceId` is re-passed
      // (not just `pull.repoId`) so the join in `BlastRepository.getPriorPrs`
      // enforces tenancy itself rather than trusting `repoId` alone.
      this.repo.getPriorPrs(workspaceId, pull.repoId, prId, changedFiles),
    ]);

    // `res.degraded`/`res.reason` describe the data actually returned and are
    // folded into index_state — the two facade calls can disagree (see
    // toIndexStateDto).
    return {
      ...toBlastRadius(res),
      index_state: toIndexStateDto(state, res.degraded, res.reason),
      // Built from `res.changedSymbols` (what the index actually knows), not
      // from `toBlastRadius`'s output — `downstream` omits symbols with no
      // callers, which would understate coverage.
      coverage: toCoverage(changedFiles, res.changedSymbols),
      prior_prs: priorRows.map(toPriorPr),
    };
  }

  /**
   * Optional, user-triggered "explain this map in one paragraph" call. Reuses
   * `getBlast` for its IDOR guard + already-computed map — never re-runs the
   * facade or any analysis. `GET /pulls/:id/blast` itself stays LLM-free
   * (`summary: ''`); this is a SEPARATE call, never invoked automatically.
   */
  async explain(workspaceId: string, prId: string): Promise<{ summary: string }> {
    const data: BlastRadius = await this.getBlast(workspaceId, prId);

    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'blast_explain');
    const llm = await this.container.llm(provider as Provider);
    const res = await llm.completeStructured({
      model,
      schema: BlastSummary,
      schemaName: 'BlastSummary',
      messages: buildBlastSummaryMessages(data),
      maxRetries: BLAST_SUMMARY_MAX_RETRIES,
    });

    return { summary: res.data.summary };
  }
}

/**
 * Maps a `BlastRepository.getPriorPrs` row to the response DTO. `merged_at`
 * has no dedicated DB column — see the `PriorPr` doc comment above.
 */
function toPriorPr(row: PriorPrRow): PriorPr {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    author: row.author,
    merged_at: row.status === 'merged' && row.updatedAt ? row.updatedAt.toISOString() : null,
  };
}
