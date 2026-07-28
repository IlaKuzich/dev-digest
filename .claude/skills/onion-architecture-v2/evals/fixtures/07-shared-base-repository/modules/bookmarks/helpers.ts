import type { BookmarkRow } from './repository.js';

export function toBookmarkDto(row: BookmarkRow) {
  return { id: row.id, prId: row.prId, note: row.note };
}
