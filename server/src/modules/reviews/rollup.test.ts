import { describe, it, expect } from 'vitest';
import { rollupRunsByPr, countFindings, toMetricsRollup, type RollupRunRow } from './rollup.js';

const mk = (over: Partial<RollupRunRow>): RollupRunRow => ({
  prId: 'pr-1',
  runId: 'run-x',
  agentId: 'agent-a',
  ranAt: '2026-08-01T00:00:00.000Z',
  score: 80,
  costUsd: 0.01,
  tokensIn: 100,
  tokensOut: 50,
  ...over,
});

describe('rollupRunsByPr', () => {
  it('MINs the score across two different agents', () => {
    const map = rollupRunsByPr([
      mk({ runId: 'r1', agentId: 'security', score: 61 }),
      mk({ runId: 'r2', agentId: 'general', score: 78 }),
    ]);
    expect(map.get('pr-1')!.score).toBe(61);
  });

  it('keeps only the newest done run per agent (older done run dropped)', () => {
    const map = rollupRunsByPr([
      mk({ runId: 'old', agentId: 'security', ranAt: '2026-08-01T00:00:00.000Z', score: 40 }),
      mk({ runId: 'new', agentId: 'security', ranAt: '2026-08-02T00:00:00.000Z', score: 90 }),
    ]);
    const agg = map.get('pr-1')!;
    expect(agg.score).toBe(90);
    expect(agg.runIds).toEqual(['new']);
  });

  it('treats each null-agent_id run as its own singleton group — never merged', () => {
    const map = rollupRunsByPr([
      mk({ runId: 'r1', agentId: null, score: 50, costUsd: 0.02 }),
      mk({ runId: 'r2', agentId: null, score: 30, costUsd: 0.03 }),
    ]);
    const agg = map.get('pr-1')!;
    expect(agg.runIds.sort()).toEqual(['r1', 'r2']);
    expect(agg.score).toBe(30); // MIN across both singleton groups
    expect(agg.costUsd).toBeCloseTo(0.05); // SUM across both singleton groups
  });

  it('omits cost when every retained run has a null cost', () => {
    const map = rollupRunsByPr([
      mk({ runId: 'r1', agentId: 'a', costUsd: null }),
      mk({ runId: 'r2', agentId: 'b', costUsd: null }),
    ]);
    expect(map.get('pr-1')!.costUsd).toBeNull();
  });

  it('omits score when every retained run has a null score', () => {
    const map = rollupRunsByPr([
      mk({ runId: 'r1', agentId: 'a', score: null }),
      mk({ runId: 'r2', agentId: 'b', score: null }),
    ]);
    expect(map.get('pr-1')!.score).toBeNull();
  });

  it('sums tokens_in and tokens_out independently, treating null as 0', () => {
    const map = rollupRunsByPr([
      mk({ runId: 'r1', agentId: 'a', tokensIn: 100, tokensOut: null }),
      mk({ runId: 'r2', agentId: 'b', tokensIn: null, tokensOut: 200 }),
    ]);
    const agg = map.get('pr-1')!;
    expect(agg.tokensIn).toBe(100);
    expect(agg.tokensOut).toBe(200);
  });

  it('returns an empty map for an empty input (no runs at all)', () => {
    expect(rollupRunsByPr([]).size).toBe(0);
  });
});

describe('countFindings', () => {
  it('counts total findings and CRITICAL-only blockers', () => {
    const counts = countFindings([
      { severity: 'CRITICAL' },
      { severity: 'CRITICAL' },
      { severity: 'WARNING' },
      { severity: 'SUGGESTION' },
    ]);
    expect(counts.findingsCount).toBe(4);
    expect(counts.blockers).toBe(2);
  });

  it('returns zero counts for an empty pool', () => {
    expect(countFindings([])).toEqual({ findingsCount: 0, blockers: 0 });
  });
});

describe('toMetricsRollup', () => {
  it('returns null when the agg is undefined (empty rollup set)', () => {
    expect(toMetricsRollup(undefined, { findingsCount: 0, blockers: 0 })).toBeNull();
  });

  it('assembles the PrMetricsRollup DTO from an agg + counts', () => {
    const dto = toMetricsRollup(
      { runIds: ['r1'], score: 61, costUsd: 0.014, tokensIn: 8200, tokensOut: 1300 },
      { findingsCount: 6, blockers: 2 },
    );
    expect(dto).toEqual({
      score: 61,
      findings_count: 6,
      blockers: 2,
      cost_usd: 0.014,
      tokens_in: 8200,
      tokens_out: 1300,
    });
  });
});
