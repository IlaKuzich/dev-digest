import type { Container } from '../../platform/container.js';
import { InviteRepository } from './repository.js';

export class InviteService {
  private repo: InviteRepository;

  constructor(private container: Container) {
    this.repo = new InviteRepository(container.db);
  }

  async invite(workspaceId: string, email: string): Promise<void> {
    await this.repo.create(workspaceId, email);
  }

  async list(workspaceId: string) {
    return this.repo.list(workspaceId);
  }
}
