import type { Container } from '../../platform/container.js';
import { FlagRepository } from './repository.js';

export class FlagService {
  private repo: FlagRepository;

  constructor(private container: Container) {
    this.repo = new FlagRepository(container.db);
  }

  async get(workspaceId: string, prId: string) {
    return this.repo.getForPr(workspaceId, prId);
  }

  async set(workspaceId: string, prId: string, key: string, value: boolean): Promise<void> {
    await this.repo.set(workspaceId, prId, key, value);
  }
}
