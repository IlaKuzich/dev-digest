import type { MemberRow } from './repository.js';

export function toMemberDto(row: MemberRow) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    passwordHash: row.passwordHash,
    inviteToken: row.inviteToken,
  };
}
