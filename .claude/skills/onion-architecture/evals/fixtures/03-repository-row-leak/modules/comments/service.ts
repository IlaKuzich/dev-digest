import type { Container } from '../../platform/container.js';
import { CommentRepository, type CommentRow } from './repository.js';

export class CommentService {
  private repo: CommentRepository;

  constructor(private container: Container) {
    this.repo = new CommentRepository(container.db);
  }

  async list(workspaceId: string, prId: string): Promise<CommentRow[]> {
    return this.repo.listForPr(workspaceId, prId);
  }

  async add(workspaceId: string, prId: string, userId: string, body: string): Promise<CommentRow> {
    return this.repo.insert(workspaceId, prId, userId, body);
  }
}
