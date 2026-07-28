import type { Container } from '../../platform/container.js';
import { SyncRepository } from './repository.js';

export class SyncService {
  private repo: SyncRepository;

  constructor(private container: Container) {
    this.repo = new SyncRepository(container.db);
  }

  async syncStatus(workspaceId: string, prId: string, state: string): Promise<void> {
    const pr = await this.repo.getPrRef(workspaceId, prId);
    if (!pr) return;
    await this.container.githubStatus.setStatus(pr.owner, pr.repo, pr.sha, state);
    await this.repo.markSynced(workspaceId, prId);
  }
}
