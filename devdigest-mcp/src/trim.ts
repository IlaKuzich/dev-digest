/**
 * Pure output-shaping helpers (no I/O): trimming rich server DTOs down to the
 * few fields a tool response needs (design principle 3 — "Concise structured
 * response"), pagination, and a hard character-budget guard.
 */
import { CHARACTER_LIMIT, DEFAULT_LIMIT, MAX_LIMIT } from './config.js';

export interface FindingLike {
  id: string;
  severity: string;
  title: string;
  file: string;
  start_line: number | null;
}

export interface TrimmedFinding {
  id: string;
  severity: string;
  title: string;
  file: string;
  line: number | null;
}

/** Reduce a rich finding DTO to `{ id, severity, title, file, line }`. */
export function trimFinding(f: FindingLike): TrimmedFinding {
  return {
    id: f.id,
    severity: f.severity,
    title: f.title,
    file: f.file,
    line: f.start_line,
  };
}

export interface PaginateResult<T> {
  items: T[];
  has_more: boolean;
}

/** Slice `items` to a page, clamping `limit` to `[1, MAX_LIMIT]`. */
export function paginate<T>(items: T[], limit?: number, offset?: number): PaginateResult<T> {
  const clampedLimit = Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const clampedOffset = Math.max(offset ?? 0, 0);
  const page = items.slice(clampedOffset, clampedOffset + clampedLimit);
  return {
    items: page,
    has_more: clampedOffset + clampedLimit < items.length,
  };
}

/**
 * If `JSON.stringify(payload)` exceeds `CHARACTER_LIMIT`, progressively halve
 * the first array-valued field until the payload fits (or the array is
 * empty), and mark the result `truncated: true`. Otherwise returns `payload`
 * unchanged.
 */
export function guardCharacterLimit<T extends Record<string, unknown>>(payload: T): T {
  if (JSON.stringify(payload).length <= CHARACTER_LIMIT) return payload;

  const arrayKey = Object.keys(payload).find((key) => Array.isArray(payload[key]));
  if (!arrayKey) return payload;

  const result: Record<string, unknown> = { ...payload, truncated: true };
  let arr = [...(payload[arrayKey] as unknown[])];

  while (arr.length > 0 && JSON.stringify({ ...result, [arrayKey]: arr }).length > CHARACTER_LIMIT) {
    const nextLength = arr.length > 1 ? Math.floor(arr.length / 2) : 0;
    arr = arr.slice(0, nextLength);
  }

  result[arrayKey] = arr;
  return result as T;
}
