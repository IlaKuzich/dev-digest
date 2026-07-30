import { describe, it, expect } from 'vitest';
import type { Brief } from '@devdigest/shared';
import { groundBrief, normalizeFileRef } from '../src/modules/brief/grounding.js';
import { assembleFileSet } from '../src/modules/brief/helpers.js';

/**
 * Hermetic — pure fixtures, no I/O, no container. Grounding is a SECURITY
 * control (spec §Non-functional › Security): a `file_ref` the model invents
 * must never reach the UI as a link. AC-5/AC-6/AC-7.
 */

function baseBrief(overrides: Partial<Brief> = {}): Brief {
  return {
    what: 'Adds rate limiting to public API endpoints.',
    why: 'Prevent abuse of unauthenticated endpoints.',
    risk_level: 'medium',
    risks: [],
    review_focus: [],
    ...overrides,
  };
}

describe('normalizeFileRef', () => {
  it('strips a trailing :line suffix', () => {
    expect(normalizeFileRef('src/x.ts:12')).toBe('src/x.ts');
  });

  it('strips a trailing :start-end range suffix', () => {
    expect(normalizeFileRef('src/x.ts:12-18')).toBe('src/x.ts');
  });

  it('leaves an endpoint ref (no trailing digits) unchanged', () => {
    expect(normalizeFileRef('GET /api/public/items')).toBe('GET /api/public/items');
  });

  it('leaves a bare path with no suffix unchanged', () => {
    expect(normalizeFileRef('src/x.ts')).toBe('src/x.ts');
  });
});

describe('groundBrief', () => {
  it('drops an ungrounded file_ref from a risk but keeps the risk if another ref survives', () => {
    const fileSet = new Set(['src/real.ts']);
    const brief = baseBrief({
      risks: [
        {
          kind: 'security',
          title: 'Partial coverage',
          explanation: 'x',
          severity: 'medium',
          file_refs: ['src/real.ts', 'src/does/not/exist.ts'],
        },
      ],
    });

    const { brief: grounded, dropped } = groundBrief(brief, fileSet);
    expect(grounded.risks).toHaveLength(1);
    expect(grounded.risks[0]!.file_refs).toEqual(['src/real.ts']);
    expect(dropped).toEqual(['src/does/not/exist.ts']);
  });

  it('drops the WHOLE risk when it retains no valid file_ref (AC-5)', () => {
    const fileSet = new Set(['src/real.ts']);
    const brief = baseBrief({
      risks: [
        {
          kind: 'security',
          title: 'Hallucinated risk',
          explanation: 'x',
          severity: 'high',
          file_refs: ['src/does/not/exist.ts'],
        },
      ],
    });

    const { brief: grounded, dropped } = groundBrief(brief, fileSet);
    expect(grounded.risks).toEqual([]);
    expect(dropped).toEqual(['src/does/not/exist.ts']);
  });

  it('grounds a line-annotated ref (src/x.ts:12-18) against the bare path in the set', () => {
    const fileSet = new Set(['src/x.ts']);
    const brief = baseBrief({
      risks: [
        {
          kind: 'correctness',
          title: 'Off-by-one',
          explanation: 'x',
          severity: 'low',
          file_refs: ['src/x.ts:12-18'],
        },
      ],
    });

    const { brief: grounded, dropped } = groundBrief(brief, fileSet);
    expect(grounded.risks).toHaveLength(1);
    expect(grounded.risks[0]!.file_refs).toEqual(['src/x.ts:12-18']);
    expect(dropped).toEqual([]);
  });

  it('matches an endpoint ref verbatim (no suffix stripping needed)', () => {
    const fileSet = new Set(['GET /api/public/items']);
    const brief = baseBrief({
      risks: [
        {
          kind: 'security',
          title: 'Unauthenticated endpoint',
          explanation: 'x',
          severity: 'high',
          file_refs: ['GET /api/public/items'],
        },
      ],
    });

    const { brief: grounded } = groundBrief(brief, fileSet);
    expect(grounded.risks).toHaveLength(1);
  });

  it('drops an ungrounded review_focus item (AC-6)', () => {
    const fileSet = new Set(['src/real.ts']);
    const brief = baseBrief({
      review_focus: [
        { file_ref: 'src/real.ts', reason: 'Core logic', line: 1 },
        { file_ref: 'src/ghost.ts', reason: 'Hallucinated', line: null },
      ],
    });

    const { brief: grounded, dropped } = groundBrief(brief, fileSet);
    expect(grounded.review_focus).toEqual([
      { file_ref: 'src/real.ts', reason: 'Core logic', line: 1 },
    ]);
    expect(dropped).toEqual(['src/ghost.ts']);
  });

  it('grounding-removes-all yields empty lists with the brief still valid (AC-7)', () => {
    const fileSet = new Set<string>(); // nothing grounds
    const brief = baseBrief({
      risks: [
        { kind: 'x', title: 'x', explanation: 'x', severity: 'high', file_refs: ['src/ghost1.ts'] },
      ],
      review_focus: [{ file_ref: 'src/ghost2.ts', reason: 'x', line: null }],
    });

    const { brief: grounded, dropped } = groundBrief(brief, fileSet);
    expect(grounded.risks).toEqual([]);
    expect(grounded.review_focus).toEqual([]);
    expect(grounded.what).toBe(brief.what); // rest of the brief untouched
    expect(dropped.sort()).toEqual(['src/ghost1.ts', 'src/ghost2.ts']);
  });
});

describe('assembleFileSet', () => {
  it('unions changed files, blast files/callers/endpoints/crons, and context-doc paths', () => {
    const set = assembleFileSet({
      changedFiles: ['src/a.ts'],
      blast: {
        changed_symbols: [{ name: 'fn', file: 'src/b.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'fn',
            callers: [{ name: 'caller', file: 'src/c.ts', line: 1 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['nightly'],
          },
        ],
        summary: '',
      },
      contextDocPaths: ['docs/architecture.md'],
    });

    expect([...set].sort()).toEqual(
      ['GET /x', 'docs/architecture.md', 'nightly', 'src/a.ts', 'src/b.ts', 'src/c.ts'].sort(),
    );
  });
});
