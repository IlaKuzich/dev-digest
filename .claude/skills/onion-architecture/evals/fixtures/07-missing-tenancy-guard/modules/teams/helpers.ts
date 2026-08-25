import type { TeamRow } from './repository.js';

export function toTeamDto(row: TeamRow) {
  return { id: row.id, name: row.name, memberCount: row.memberCount };
}
