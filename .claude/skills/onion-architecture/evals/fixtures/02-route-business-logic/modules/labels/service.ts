import type { Container } from '../../platform/container.js';
import { LabelRepository } from './repository.js';

export class LabelService {
  private repo: LabelRepository;

  constructor(private container: Container) {
    this.repo = new LabelRepository(container.db);
  }

  async listRaw(workspaceId: string, prId: string) {
    return this.repo.list(workspaceId, prId);
  }

  async replace(workspaceId: string, prId: string, names: string[]): Promise<void> {
    await this.repo.replace(workspaceId, prId, names);
  }
}
