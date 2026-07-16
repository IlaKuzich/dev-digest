import { describe, it, expect } from 'vitest';
import { toBlastRadius, toIndexStateDto } from './helpers.js';
import type { BlastCallerRow, BlastResult, IndexState } from '../repo-intel/types.js';

/** Hermetic — no Docker, no container. Pure fixtures of BlastResult/IndexState. */

function caller(overrides: Partial<BlastCallerRow> = {}): BlastCallerRow {
  return {
    file: 'src/callers/default.ts',
    symbol: 'defaultCaller',
    viaSymbol: 'changedFn',
    line: 1,
    rank: 0,
    ...overrides,
  };
}

describe('toBlastRadius', () => {
  it('groups callers by viaSymbol into one DownstreamImpact per symbol-with-callers', () => {
    const res: BlastResult = {
      changedSymbols: [
        { file: 'src/a.ts', name: 'fnA', kind: 'function' },
        { file: 'src/b.ts', name: 'fnB', kind: 'function' },
      ],
      callers: [
        caller({ viaSymbol: 'fnA', symbol: 'callerA1', file: 'src/x.ts', line: 10, rank: 1 }),
        caller({ viaSymbol: 'fnA', symbol: 'callerA2', file: 'src/y.ts', line: 20, rank: 2 }),
        caller({ viaSymbol: 'fnB', symbol: 'callerB1', file: 'src/z.ts', line: 30, rank: 1 }),
      ],
      impactedEndpoints: [],
    };

    const out = toBlastRadius(res);
    expect(out.downstream).toHaveLength(2);
    expect(out.downstream.map((d) => d.symbol).sort()).toEqual(['fnA', 'fnB']);
  });

  it('sorts callers within a group by rank descending', () => {
    const res: BlastResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'fnA', kind: 'function' }],
      callers: [
        caller({ viaSymbol: 'fnA', symbol: 'low', file: 'src/x.ts', line: 1, rank: 1 }),
        caller({ viaSymbol: 'fnA', symbol: 'high', file: 'src/y.ts', line: 2, rank: 9 }),
        caller({ viaSymbol: 'fnA', symbol: 'mid', file: 'src/z.ts', line: 3, rank: 5 }),
      ],
      impactedEndpoints: [],
    };

    const out = toBlastRadius(res);
    expect(out.downstream[0]!.callers.map((c) => c.name)).toEqual(['high', 'mid', 'low']);
  });

  it('caps at 20 callers per symbol, keeping the highest-ranked', () => {
    const callers = Array.from({ length: 25 }, (_, i) =>
      caller({ viaSymbol: 'fnA', symbol: `c${i}`, file: `src/f${i}.ts`, line: i, rank: i }),
    );
    const res: BlastResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'fnA', kind: 'function' }],
      callers,
      impactedEndpoints: [],
    };

    const out = toBlastRadius(res);
    const kept = out.downstream[0]!.callers;
    expect(kept).toHaveLength(20);
    // Ranks 0..24: the top 20 (ranks 5..24) are kept, sorted rank-desc → c24..c5.
    expect(kept.map((c) => c.name)).toEqual(Array.from({ length: 20 }, (_, i) => `c${24 - i}`));
  });

  it('attributes endpoints/crons per symbol from factsByFile using the FULL group, even when the cap drops all of a file\'s callers', () => {
    // 20 high-rank callers on src/kept.ts (fill the cap exactly) + 5 low-rank
    // callers on src/hot.ts (all get dropped by the cap, entirely).
    const callers = [
      ...Array.from({ length: 20 }, (_, i) =>
        caller({ viaSymbol: 'fnA', symbol: `kept${i}`, file: 'src/kept.ts', line: i, rank: 100 + i }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        caller({ viaSymbol: 'fnA', symbol: `hot${i}`, file: 'src/hot.ts', line: i, rank: i }),
      ),
    ];
    const res: BlastResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'fnA', kind: 'function' }],
      callers,
      impactedEndpoints: ['GET /flat'],
      factsByFile: {
        'src/kept.ts': { endpoints: ['GET /kept'], crons: ['cron-kept'] },
        'src/hot.ts': { endpoints: ['GET /hot'], crons: ['cron-hot'] },
      },
    };

    const out = toBlastRadius(res);
    const group = out.downstream[0]!;
    // The cap kept exactly the 20 'src/kept.ts' callers; none of 'src/hot.ts'
    // survives in `callers`, yet its facts must still be attributed.
    expect(group.callers).toHaveLength(20);
    expect(group.callers.every((c) => c.file === 'src/kept.ts')).toBe(true);
    expect(group.endpoints_affected).toEqual(['GET /hot', 'GET /kept']);
    expect(group.crons_affected).toEqual(['cron-hot', 'cron-kept']);
  });

  it('falls back to the flat impactedEndpoints union and empty crons when factsByFile is absent (degraded path)', () => {
    const res: BlastResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'fnA', kind: 'function' }],
      callers: [caller({ viaSymbol: 'fnA', symbol: 'c1', rank: 0 })],
      impactedEndpoints: ['GET /a', 'POST /b'],
      degraded: true,
      reason: 'no_data',
    };

    const out = toBlastRadius(res);
    const group = out.downstream[0]!;
    expect(group.endpoints_affected).toEqual(['GET /a', 'POST /b']);
    expect(group.crons_affected).toEqual([]);
  });

  it('excludes a changed symbol with zero callers from downstream but keeps it in changed_symbols', () => {
    const res: BlastResult = {
      changedSymbols: [
        { file: 'src/a.ts', name: 'fnA', kind: 'function' },
        { file: 'src/b.ts', name: 'fnB', kind: 'function' },
      ],
      callers: [caller({ viaSymbol: 'fnA', symbol: 'c1', rank: 0 })],
      impactedEndpoints: [],
    };

    const out = toBlastRadius(res);
    expect(out.changed_symbols.map((s) => s.name)).toEqual(['fnA', 'fnB']);
    expect(out.downstream.map((d) => d.symbol)).toEqual(['fnA']);
  });

  it('always sets summary to the empty string', () => {
    const res: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [] };
    expect(toBlastRadius(res).summary).toBe('');
  });
});

describe('toIndexStateDto', () => {
  it('picks status/filesIndexed/filesSkipped/degraded/degradedReason', () => {
    const state: IndexState = {
      repoId: 'repo-1',
      status: 'partial',
      filesIndexed: 10,
      filesSkipped: 2,
      durationMs: 500,
      lastIndexedSha: 'abc',
      indexerVersion: 1,
      updatedAt: new Date(),
      degraded: true,
      degradedReason: 'index_partial',
    };

    expect(toIndexStateDto(state)).toEqual({
      status: 'partial',
      filesIndexed: 10,
      filesSkipped: 2,
      degraded: true,
      degradedReason: 'index_partial',
    });
  });

  /**
   * The divergent pair: the persisted row claims a healthy index, but the
   * blast result we are about to return came from the degraded path (e.g.
   * REPO_INTEL_ENABLED=false — getBlastRadius honours the flag, getIndexState
   * does not). Reporting `full` here would present the degraded path's empty
   * `crons_affected` as fact.
   */
  function fullState(): IndexState {
    return {
      repoId: 'repo-1',
      status: 'full',
      filesIndexed: 100,
      filesSkipped: 0,
      durationMs: 500,
      lastIndexedSha: 'abc',
      indexerVersion: 1,
      updatedAt: new Date(),
    };
  }

  it('downgrades a full index row to degraded when the blast result is degraded', () => {
    expect(toIndexStateDto(fullState(), true, 'no_data')).toEqual({
      status: 'degraded',
      filesIndexed: 100,
      filesSkipped: 0,
      degraded: true,
      degradedReason: 'no_data',
    });
  });

  it('leaves a full index row intact when the blast result is not degraded', () => {
    expect(toIndexStateDto(fullState(), false, undefined)).toEqual({
      status: 'full',
      filesIndexed: 100,
      filesSkipped: 0,
      degraded: undefined,
      degradedReason: undefined,
    });
  });

  it('keeps the row degradedReason when the result carries no reason', () => {
    const state = { ...fullState(), degraded: true, degradedReason: 'index_partial' as const };
    const dto = toIndexStateDto(state, true, 'no_data');
    expect(dto.degradedReason).toBe('index_partial');
    expect(dto.degraded).toBe(true);
  });

  it('never reports failed as anything softer', () => {
    const state = { ...fullState(), status: 'failed' as const };
    expect(toIndexStateDto(state, true, 'index_failed').status).toBe('failed');
  });
});
