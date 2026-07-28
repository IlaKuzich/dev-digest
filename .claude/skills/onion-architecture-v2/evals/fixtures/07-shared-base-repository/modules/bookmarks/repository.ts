import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { BaseRepository } from '../_shared/base-repository.js';

export type BookmarkRow = typeof t.bookmarks.$inferSelect;

export class BookmarkRepository extends BaseRepository<BookmarkRow> {
  constructor(db: Db) {
    super(db, t.bookmarks);
  }

  async list(workspaceId: string): Promise<BookmarkRow[]> {
    return this.listScoped(workspaceId);
  }

  async get(workspaceId: string, id: string): Promise<BookmarkRow | undefined> {
    return this.findScoped(workspaceId, id);
  }
}
