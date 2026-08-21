/** Pure helpers for AgentDetail — no React import. */
import type { EvalBatchRun } from "@devdigest/shared";

/**
 * Order two selected batch ids chronologically so the Compare modal always
 * opens as old→new (AC-27/28), regardless of click/selection order.
 */
export function orderForCompare(runs: EvalBatchRun[], ids: string[]): [string, string] | null {
  if (ids.length !== 2) return null;
  const byId = new Map(runs.map((r) => [r.id, r] as const));
  const [x, y] = ids as [string, string];
  const rx = byId.get(x);
  const ry = byId.get(y);
  if (!rx || !ry) return [x, y];
  return new Date(rx.ran_at).getTime() <= new Date(ry.ran_at).getTime() ? [x, y] : [y, x];
}
