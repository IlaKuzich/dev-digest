import type { ReviewerRow } from './repository.js';

export function toReviewerDto(row: ReviewerRow) {
  return { userId: row.userId, activeCount: row.activeCount };
}
