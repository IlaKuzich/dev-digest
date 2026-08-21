import { describe, it, expect } from 'vitest';
import {
  overlaps,
  matchFindings,
  scoreCase,
  citationAccuracy,
  microAggregate,
  degradationAlert,
  type Located,
} from '../src/modules/eval/scoring.js';

/**
 * T3 — pure deterministic scoring module (Group E, RULE 2). Hermetic: pure
 * function tests, no DB/HTTP/LLM. Covers every row of the spec's Edge cases
 * table (specs/eval-pipeline.md § Edge cases).
 */

const loc = (file: string, start_line: number, end_line: number): Located => ({
  file,
  start_line,
  end_line,
});

describe('overlaps (AC-34)', () => {
  it('is true for same-file overlapping ranges and false for different files or disjoint ranges', () => {
    expect(overlaps(loc('a.ts', 10, 20), loc('a.ts', 15, 25))).toBe(true);
    expect(overlaps(loc('a.ts', 10, 20), loc('a.ts', 20, 30))).toBe(true); // touching at one line
    expect(overlaps(loc('a.ts', 10, 20), loc('b.ts', 10, 20))).toBe(false); // different file
    expect(overlaps(loc('a.ts', 10, 20), loc('a.ts', 21, 30))).toBe(false); // disjoint, adjacent
  });
});

describe('matchFindings (AC-35) — range-tie one-to-one assignment', () => {
  it('credits only one match when two expected findings overlap the same produced finding', () => {
    const produced = [loc('a.ts', 10, 15)];
    const expected = [loc('a.ts', 10, 12), loc('a.ts', 13, 15)];
    const result = matchFindings(produced, expected);
    expect(result).toEqual({ tp: 1, fp: 0, fn: 1 });
  });
});

describe('scoreCase (AC-36, AC-38, AC-39) — edge cases table', () => {
  it('empty expected set, agent produces nothing: precision 1.0, recall omitted, case passes', () => {
    const result = scoreCase({ produced: [], expected: [] });
    expect(result.caseType).toBe('must_not_flag');
    expect(result.recall).toBeNull();
    expect(result.precision).toBe(1.0);
    expect(result.pass).toBe(true);
  });

  it('must_not_flag case, agent produces a finding: that finding is FP, precision < 1, case fails', () => {
    const result = scoreCase({ produced: [loc('a.ts', 1, 5)], expected: [] });
    expect(result.caseType).toBe('must_not_flag');
    expect(result.fp).toBe(1);
    expect(result.precision).toBeLessThan(1);
    expect(result.precision).toBe(0);
    expect(result.pass).toBe(false);
  });

  it('must_find case, agent matches expected plus an extra real one: case passes (FN=0), extra is FP', () => {
    const result = scoreCase({
      produced: [loc('a.ts', 10, 12), loc('b.ts', 1, 3)],
      expected: [loc('a.ts', 10, 12)],
    });
    expect(result.caseType).toBe('must_find');
    expect(result.fn).toBe(0);
    expect(result.fp).toBe(1);
    expect(result.pass).toBe(true);
    expect(result.precision).toBeLessThan(1); // the extra finding lowers this case's own precision
  });

  it('must_find case, agent produces zero findings: FN=1, recall 0, case fails', () => {
    const result = scoreCase({ produced: [], expected: [loc('a.ts', 10, 12)] });
    expect(result.caseType).toBe('must_find');
    expect(result.fn).toBe(1);
    expect(result.recall).toBe(0);
    expect(result.pass).toBe(false);
  });
});

describe('citationAccuracy (AC-37)', () => {
  it('reports 1.0 when zero findings were produced (empty denominator)', () => {
    expect(citationAccuracy(0, 0)).toBe(1.0);
  });

  it('otherwise reports kept / (kept + dropped)', () => {
    expect(citationAccuracy(3, 1)).toBe(0.75);
  });
});

describe('microAggregate (AC-40)', () => {
  it('lowers aggregate precision when a must_find case has an extra unmatched produced finding', () => {
    // Case 1: must_find, matched exactly (tp=1,fp=0,fn=0). Case 2: must_find, matched + 1 extra FP.
    const perCase = [
      { tp: 1, fp: 0, fn: 0, caseType: 'must_find' as const, pass: true },
      { tp: 1, fp: 1, fn: 0, caseType: 'must_find' as const, pass: true },
    ];
    const agg = microAggregate(perCase);
    expect(agg.precision).toBeCloseTo(2 / 3, 5);
    expect(agg.recall).toBe(1); // both cases fully matched their expected findings
    expect(agg.tracesPassed).toBe(2);
    expect(agg.tracesTotal).toBe(2);
  });

  it('omits the recall term for an all-must_not_flag set while precision stays defined', () => {
    const perCase = [
      { tp: 0, fp: 0, fn: 0, caseType: 'must_not_flag' as const, pass: true },
      { tp: 0, fp: 1, fn: 0, caseType: 'must_not_flag' as const, pass: false },
    ];
    const agg = microAggregate(perCase);
    expect(agg.recall).toBeNull();
    expect(agg.precision).toBe(0); // 0 tp / (0 tp + 1 fp)
    expect(agg.tracesPassed).toBe(1);
    expect(agg.tracesTotal).toBe(2);
  });
});

describe('degradationAlert (AC-25)', () => {
  it('fires when precision or recall drops by at least 2 percentage points', () => {
    const prior = { recall: 0.78, precision: 0.93 };
    const latest = { recall: 0.82, precision: 0.91 }; // precision dipped 2pts, recall rose
    const alert = degradationAlert(latest, prior);
    expect(alert).not.toBeNull();
    expect(alert).toMatch(/precision/i);
    expect(alert).toMatch(/2pts/);
  });

  it('does not fire when the drop is under 2 percentage points, or when there is no prior run', () => {
    expect(degradationAlert({ recall: 0.8, precision: 0.9 }, null)).toBeNull();

    const prior = { recall: 0.8, precision: 0.9 };
    const latest = { recall: 0.79, precision: 0.891 }; // both drops < 2pp
    expect(degradationAlert(latest, prior)).toBeNull();
  });
});
