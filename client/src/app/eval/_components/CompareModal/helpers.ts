/** Pure helpers for CompareModal — no React import. */

export type DiffOp = { type: "same" | "added" | "removed"; text: string };

/**
 * Classic LCS-backed line diff (AC-28). Cheap for the short texts a system
 * prompt is (a few dozen lines) — an O(n*m) DP table is fine here; this is
 * NOT used for large documents.
 */
export function computeLineDiff(oldText: string, newText: string): DiffOp[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ type: "removed", text: a[i]! });
      i++;
    } else {
      ops.push({ type: "added", text: b[j]! });
      j++;
    }
  }
  while (i < n) {
    ops.push({ type: "removed", text: a[i]! });
    i++;
  }
  while (j < m) {
    ops.push({ type: "added", text: b[j]! });
    j++;
  }
  return ops;
}

export type MetricDirection = "up" | "down" | "flat";

/** `0.82` → `"82%"` for percent metrics; raw 2dp for cost. */
export function formatCompareValue(value: number | null, isPercent: boolean): string {
  if (value == null) return "—";
  return isPercent ? `${Math.round(value * 100)}%` : value.toFixed(2);
}

/** `0.04` (percent) → `"4pt"`; `0.02` (cost) → `"0.02"`. Sign is rendered separately. */
export function formatCompareDelta(delta: number | null, isPercent: boolean): { text: string; direction: MetricDirection } {
  if (delta == null) return { text: "—", direction: "flat" };
  const direction: MetricDirection = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const text = isPercent ? `${Math.round(Math.abs(delta) * 100)}pt` : Math.abs(delta).toFixed(2);
  return { text, direction };
}
