import type { Container } from '../../platform/container.js';
import { BookmarkRepository } from './repository.js';
import { toBookmarkDto } from './helpers.js';

export class BookmarkService {
  private repo: BookmarkRepository;

  constructor(private container: Container) {
    this.repo = new BookmarkRepository(container.db);
  }

  async list(workspaceId: string) {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toBookmarkDto);
  }
}
