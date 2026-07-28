import type { SyncRunRow } from './repository.js';

export function toSyncRunDto(row: SyncRunRow) {
  return { id: row.id, repoId: row.repoId, status: row.status, startedAt: row.startedAt };
}
