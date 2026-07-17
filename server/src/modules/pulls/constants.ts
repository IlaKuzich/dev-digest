/** PR-list module literals (pure — no I/O). */

/** Max diff-stat backfills per list request (each is a GitHub detail fetch). */
export const BACKFILL_LIMIT = 10;

/** Findings shown in a PR's list-row preview, after severity+confidence sort. */
export const TOP_FINDINGS_LIMIT = 6;

export type SevKey = 'CRITICAL' | 'WARNING' | 'SUGGESTION';

/** Sort order for the top-findings preview (lower = higher priority). */
export const SEV_ORDER: Record<SevKey, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };
