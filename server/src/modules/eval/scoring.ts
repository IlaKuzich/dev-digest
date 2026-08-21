/**
 * Deterministic eval scoring (Group E, RULE 2 — load-bearing).
 *
 * Pure, framework-free TypeScript: no DB / HTTP / `reviewPullRequest` /
 * `groundFindings` calls live here — this module ONLY compares already-produced
 * findings against an already-frozen expected set by file + line-range overlap.
 * Given the same inputs it always returns the same output (spec's Non-functional
 * → Determinism). Wiring this into the eval run pipeline is T4's job.
 */

/** Minimal shape needed to compare two findings by location (AC-33). */
export interface Located {
  file: string;
  start_line: number;
  end_line: number;
}

/**
 * WHEN two located items share the same `file` AND their `[start_line,
 * end_line]` ranges overlap (AC-34).
 */
export function overlaps(a: Located, b: Located): boolean {
  if (a.file !== b.file) return false;
  return Math.max(0, Math.min(a.end_line, b.end_line) - Math.max(a.start_line, b.start_line) + 1) > 0;
}

export interface MatchResult {
  tp: number;
  fp: number;
  fn: number;
}

/**
 * Resolves produced↔expected matches as a one-to-one assignment (AC-35) —
 * a single produced finding cannot satisfy two expected findings and vice
 * versa. Sets are tiny (≤ ~20 traces per spec's Non-functional → Performance),
 * so a small augmenting-path (Kuhn's algorithm) maximum bipartite match is
 * used rather than pulling in an external dependency.
 *
 * `tp` = matched pairs, `fp` = unmatched produced, `fn` = unmatched expected.
 */
export function matchFindings(produced: Located[], expected: Located[]): MatchResult {
  // adjacency[expectedIndex] = compatible producedIndex list (overlap-compatible).
  const adjacency: number[][] = expected.map((e) =>
    produced.reduce<number[]>((acc, p, pi) => {
      if (overlaps(p, e)) acc.push(pi);
      return acc;
    }, []),
  );

  // matchOfProduced[producedIndex] = the expectedIndex it's currently matched to, or -1.
  const matchOfProduced = new Array<number>(produced.length).fill(-1);

  function tryAugment(expectedIndex: number, visited: boolean[]): boolean {
    // adjacency has exactly one entry per expected item, and tryAugment is only ever
    // called with an expectedIndex in [0, expected.length) (see call sites below), so
    // this lookup is always in-range under noUncheckedIndexedAccess.
    const candidates = adjacency[expectedIndex]!;
    for (const producedIndex of candidates) {
      if (visited[producedIndex]) continue;
      visited[producedIndex] = true;
      // matchOfProduced was pre-filled with -1 and is only ever reassigned to a valid
      // expectedIndex below, so a lookup at an in-range producedIndex is never undefined.
      const currentMatch = matchOfProduced[producedIndex]!;
      if (currentMatch === -1 || tryAugment(currentMatch, visited)) {
        matchOfProduced[producedIndex] = expectedIndex;
        return true;
      }
    }
    return false;
  }

  let tp = 0;
  for (let expectedIndex = 0; expectedIndex < expected.length; expectedIndex++) {
    const visited = new Array<boolean>(produced.length).fill(false);
    if (tryAugment(expectedIndex, visited)) tp++;
  }

  return { tp, fp: produced.length - tp, fn: expected.length - tp };
}

export type CaseType = 'must_find' | 'must_not_flag';

export interface ScoreCaseInput {
  produced: Located[];
  expected: Located[];
}

export interface ScoreCaseResult {
  caseType: CaseType;
  tp: number;
  fp: number;
  fn: number;
  /** `null` for `must_not_flag` cases (recall is undefined, not zero) (AC-38). */
  recall: number | null;
  precision: number;
  pass: boolean;
}

/**
 * Scores one eval case: caseType derives from whether the case has any
 * expected findings; recall/precision/pass are all case-type-aware
 * (AC-36, AC-38, AC-39).
 */
export function scoreCase({ produced, expected }: ScoreCaseInput): ScoreCaseResult {
  const caseType: CaseType = expected.length === 0 ? 'must_not_flag' : 'must_find';
  const { tp, fp, fn } = matchFindings(produced, expected);

  const recall = caseType === 'must_not_flag' ? null : tp + fn === 0 ? 0 : tp / (tp + fn);
  const precision = tp + fp === 0 ? 1.0 : tp / (tp + fp);

  // must_find PASSES when every expected finding is matched (extras tolerated);
  // must_not_flag PASSES only when zero findings were produced (AC-39).
  const pass = caseType === 'must_find' ? fn === 0 : fp === 0;

  return { caseType, tp, fp, fn, recall, precision, pass };
}

/**
 * Fraction of produced findings that survive the citation-grounding gate
 * (AC-37). Zero produced findings → `1.0` (empty denominator convention).
 */
export function citationAccuracy(keptCount: number, droppedCount: number): number {
  return keptCount + droppedCount === 0 ? 1.0 : keptCount / (keptCount + droppedCount);
}

export interface MicroAggregateInput {
  tp: number;
  fp: number;
  fn: number;
  caseType: CaseType;
}

export interface MicroAggregateResult {
  /** `null` when the recall denominator (summed over `must_find` cases only) is 0. */
  recall: number | null;
  precision: number;
  tracesPassed: number;
  tracesTotal: number;
}

/**
 * Micro-averages a set run: sums TP/FP/FN across cases and divides once
 * (AC-40). The recall denominator EXCLUDES `must_not_flag` cases' FN (they
 * have no expected findings to recall), so an all-`must_not_flag` set yields
 * a `null` recall while precision stays defined.
 */
export function microAggregate(
  perCase: (MicroAggregateInput & { pass: boolean })[],
): MicroAggregateResult {
  let tpSum = 0;
  let fpSum = 0;
  let recallNumerator = 0;
  let recallDenominator = 0;
  let tracesPassed = 0;

  for (const c of perCase) {
    tpSum += c.tp;
    fpSum += c.fp;
    if (c.caseType === 'must_find') {
      recallNumerator += c.tp;
      recallDenominator += c.tp + c.fn;
    }
    if (c.pass) tracesPassed++;
  }

  return {
    recall: recallDenominator === 0 ? null : recallNumerator / recallDenominator,
    precision: tpSum + fpSum === 0 ? 1.0 : tpSum / (tpSum + fpSum),
    tracesPassed,
    tracesTotal: perCase.length,
  };
}

export interface BatchMetrics {
  recall: number | null;
  precision: number;
}

const DEGRADATION_THRESHOLD_PP = 0.02;

/**
 * `null` when there is no prior batch or neither precision nor recall
 * dropped by at least 2 percentage points relative to it; otherwise a message
 * naming the metric and the drop size in points (AC-25). Precision is
 * checked first (matches the mockup's "Precision dipped 2pts…" wording) —
 * either metric alone is sufficient to trigger.
 */
export function degradationAlert(latest: BatchMetrics, prior: BatchMetrics | null): string | null {
  if (!prior) return null;

  const precisionDrop = prior.precision - latest.precision;
  if (precisionDrop >= DEGRADATION_THRESHOLD_PP) {
    return `Precision dipped ${Math.round(precisionDrop * 100)}pts`;
  }

  if (prior.recall !== null && latest.recall !== null) {
    const recallDrop = prior.recall - latest.recall;
    if (recallDrop >= DEGRADATION_THRESHOLD_PP) {
      return `Recall dipped ${Math.round(recallDrop * 100)}pts`;
    }
  }

  return null;
}
