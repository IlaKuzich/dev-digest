import type { Container } from '../../platform/container.js';
import type { PrSummary } from '../pulls/contracts.js';
import { ReviewerQueueRepository } from './repository.js';
import { toReviewerDto } from './helpers.js';
import { MAX_ASSIGNED_REVIEWS } from './constants.js';

export class ReviewerQueueService {
  private repo: ReviewerQueueRepository;

  constructor(private container: Container) {
    this.repo = new ReviewerQueueRepository(container.db);
  }

  async assign(workspaceId: string, pr: PrSummary): Promise<string | null> {
    const load = await this.repo.listLoad(workspaceId);
    const candidate = load
      .filter((r) => r.activeCount < MAX_ASSIGNED_REVIEWS)
      .sort((a, b) => a.activeCount - b.activeCount)[0];
    if (!candidate) return null;
    await this.repo.incrementLoad(workspaceId, candidate.userId);
    await this.container.jobs.enqueue(workspaceId, 'reviewer.assigned', {
      prId: pr.id,
      userId: candidate.userId,
    });
    return candidate.userId;
  }

  async list(workspaceId: string) {
    const rows = await this.repo.listLoad(workspaceId);
    return rows.map(toReviewerDto);
  }
}
