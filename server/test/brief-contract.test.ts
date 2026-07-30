import { describe, it, expect } from 'vitest';
import { Brief, ReviewFocus, BriefEnvelope } from '@devdigest/shared';

/**
 * Contract tests for T1 — Why+Risk Brief output shapes: `Brief`, `ReviewFocus`,
 * `BriefEnvelope`. Hermetic: pure Zod parse, no I/O. AC-23.
 */
describe('Why+Risk Brief contracts', () => {
  it('Brief parses a full sample brief', () => {
    const brief = Brief.parse({
      what: 'Adds rate limiting to public API endpoints.',
      why: 'Prevent abuse of unauthenticated endpoints.',
      risk_level: 'medium',
      risks: [
        {
          kind: 'security',
          title: 'Missing per-IP limit on legacy route',
          explanation: 'One route was not covered by the new middleware.',
          severity: 'medium',
          file_refs: ['src/routes/legacy.ts'],
        },
      ],
      review_focus: [
        { file_ref: 'src/middleware/rate-limit.ts', reason: 'Core new logic', line: 12 },
      ],
    });
    expect(brief.risk_level).toBe('medium');
    expect(brief.risks).toHaveLength(1);
    expect(brief.review_focus[0]!.line).toBe(12);
  });

  it('Brief accepts empty risks and review_focus lists (AC-7)', () => {
    const brief = Brief.parse({
      what: 'Trivial doc-only change.',
      why: 'Fixes a typo.',
      risk_level: 'low',
      risks: [],
      review_focus: [],
    });
    expect(brief.risks).toEqual([]);
    expect(brief.review_focus).toEqual([]);
  });

  it('Brief rejects an unknown risk_level', () => {
    expect(() =>
      Brief.parse({
        what: 'x',
        why: 'y',
        risk_level: 'critical',
        risks: [],
        review_focus: [],
      }),
    ).toThrow();
  });

  it('ReviewFocus parses a row with a line and without one', () => {
    expect(() =>
      ReviewFocus.parse({ file_ref: 'src/a.ts', reason: 'Entry point', line: 5 }),
    ).not.toThrow();
    expect(() =>
      ReviewFocus.parse({ file_ref: 'src/b.ts', reason: 'Config change' }),
    ).not.toThrow();
  });

  it('BriefEnvelope parses the { brief, generated_at, stale } transport wrapper', () => {
    const envelope = BriefEnvelope.parse({
      brief: {
        what: 'what',
        why: 'why',
        risk_level: 'high',
        risks: [],
        review_focus: [],
      },
      generated_at: '2026-07-17T00:00:00.000Z',
      stale: false,
    });
    expect(envelope.stale).toBe(false);
    expect(envelope.brief.risk_level).toBe('high');
  });
});
