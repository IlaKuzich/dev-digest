import type { ContextAttachment, SetContextBody } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { approxTokens, type Tokenizer } from '../../adapters/tokenizer/index.js';
import { TOKENIZER_SAFE_CHAR_LIMIT } from './constants.js';

/**
 * Pure helpers for the `context` module. No DB/FS/network here — discovery
 * walks and path-guarded reads live in `service.ts`; persistence lives in
 * `repository.ts`.
 */

/** One persisted attachment row (path + its stored order). */
export interface ContextAttachmentRow {
  path: string;
  order: number;
}

/** Map a persisted attachment row to the public DTO. Every row in
 *  `agent_context`/`skill_context` IS an attached doc (the tables carry no
 *  `attached` column — an unattached document simply has no row), so
 *  `attached` is always `true` here. */
export function toContextAttachment(row: ContextAttachmentRow): ContextAttachment {
  return { path: row.path, order: row.order, attached: true };
}

/**
 * Skill-inherited paths (already ordered) followed by agent-attached paths
 * (already ordered), deduplicated by path so a doc attached at both levels is
 * injected exactly once, at its FIRST position (AC-14).
 */
export function dedupeFirstWins(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/**
 * Turn a POSTed `SetContextBody` into the ordered set of rows to persist:
 * only the `attached: true` entries become rows (order = their index among
 * the attached subset), and every attached path MUST already exist in the
 * discovered doc set — an unrecognised path (never surfaced by discovery,
 * never a real repo-relative doc) is rejected rather than silently persisted.
 * `validPaths` is the union of paths currently discoverable across the
 * workspace's repos (see `ContextService.validAttachPaths` — agents/skills
 * aren't repo-scoped, so validation isn't either).
 */
export function toAttachedRows(
  body: SetContextBody,
  validPaths: ReadonlySet<string>,
): ContextAttachmentRow[] {
  const attachedPaths = body.docs.filter((d) => d.attached).map((d) => d.path);
  const unknown = attachedPaths.filter((p) => !validPaths.has(p));
  if (unknown.length > 0) {
    throw new ValidationError(`Unknown context document path(s): ${unknown.join(', ')}`);
  }
  return attachedPaths.map((path, order) => ({ path, order }));
}

/**
 * Bounded token estimate for UNTRUSTED text (architecture-review W1 fix —
 * `docs/plans/2026-07-17-project-context.md` T4). Real BPE (`Tokenizer.count`)
 * is merge-based and NOT linear on adversarial input: a long run of one
 * repeated character — a legal `.md` commit, still well under
 * `CONTEXT_MAX_DOC_BYTES` — can peg a worker on CPU for minutes (measured;
 * see `TOKENIZER_SAFE_CHAR_LIMIT`'s comment in `constants.ts`). Only the first
 * `TOKENIZER_SAFE_CHAR_LIMIT` characters ever reach the real encoder; any
 * remainder falls back to the O(n) chars/4 heuristic. This bounds the COUNT
 * only — it never truncates what is actually sent to the model.
 */
export function estimateTokensBounded(tokenizer: Tokenizer, text: string): number {
  if (text.length <= TOKENIZER_SAFE_CHAR_LIMIT) return tokenizer.count(text);
  const head = text.slice(0, TOKENIZER_SAFE_CHAR_LIMIT);
  const tail = text.slice(TOKENIZER_SAFE_CHAR_LIMIT);
  return tokenizer.count(head) + approxTokens(tail);
}
