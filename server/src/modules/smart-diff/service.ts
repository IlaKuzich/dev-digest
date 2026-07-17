import type { SmartDiff } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { ReviewRepository } from '../reviews/repository.js';
import { PullsService } from '../pulls/service.js';
import { buildSmartDiff } from './classifier.js';

/**
 * L03/Smart Diff use case. Pure read composition — NO new LLM call and NO
 * new table/migration (feature spec KEY PRINCIPLE + `server/CLAUDE.md`
 * Do-not-touch zones). Composes already-fetched PR files with already-fetched
 * review findings via the classifier.
 */
export class SmartDiffService {
  private readonly reviews: Pick<ReviewRepository, 'activeFindingsForPrs'>;

  constructor(
    private container: Container,
    reviews: Pick<ReviewRepository, 'activeFindingsForPrs'> = container.reviewRepo,
  ) {
    this.reviews = reviews;
  }

  async getSmartDiff(workspaceId: string, prId: string): Promise<SmartDiff> {
    // Tenancy guard: PullsService.getDetail is workspace-scoped and throws
    // NotFoundError if the PR isn't in this workspace (IDOR guard). Reuse its
    // files rather than re-implementing the PR fetch.
    const detail = await new PullsService(this.container).getDetail(workspaceId, prId);

    const rows = await this.reviews.activeFindingsForPrs([prId]);
    const findingsByFile = new Map<string, number[]>();
    for (const row of rows) {
      const lines = findingsByFile.get(row.file);
      if (lines) lines.push(row.startLine);
      else findingsByFile.set(row.file, [row.startLine]);
    }

    return buildSmartDiff(detail.files, findingsByFile);
  }
}
