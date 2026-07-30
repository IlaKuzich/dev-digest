import { describe, expect, it } from 'vitest';
import { CHARACTER_LIMIT, MAX_LIMIT } from '../src/config.js';
import { guardCharacterLimit, paginate, trimFinding } from '../src/trim.js';

describe('trimFinding', () => {
  it('reduces a rich finding DTO to exactly the 5 allowed fields', () => {
    const trimmed = trimFinding({
      id: 'f-1',
      severity: 'CRITICAL',
      title: 'SQL injection',
      file: 'src/db.ts',
      start_line: 42,
      // Extra fields a real ReviewDtoFinding carries (rationale, suggestion,
      // evidence, etc.) must NOT leak into the trimmed shape.
      rationale: 'because ...',
      suggestion: 'use parameterized queries',
      confidence: 0.9,
    } as never);

    expect(trimmed).toEqual({
      id: 'f-1',
      severity: 'CRITICAL',
      title: 'SQL injection',
      file: 'src/db.ts',
      line: 42,
    });
    expect(Object.keys(trimmed)).toHaveLength(5);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => i);

  it('slices a page and reports has_more when items remain', () => {
    const page = paginate(items, 10, 0);
    expect(page.items).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(page.has_more).toBe(true);
  });

  it('reports has_more=false on the last page', () => {
    const page = paginate(items, 10, 20);
    expect(page.items).toEqual([20, 21, 22, 23, 24]);
    expect(page.has_more).toBe(false);
  });

  it('applies DEFAULT_LIMIT when limit is omitted and clamps to MAX_LIMIT', () => {
    const bigList = Array.from({ length: MAX_LIMIT + 50 }, (_, i) => i);
    const page = paginate(bigList, MAX_LIMIT + 999, 0);
    expect(page.items).toHaveLength(MAX_LIMIT);
  });
});

describe('guardCharacterLimit', () => {
  it('returns the payload unchanged when under CHARACTER_LIMIT', () => {
    const payload = { findings: [{ id: '1' }], has_more: false };
    expect(guardCharacterLimit(payload)).toEqual(payload);
  });

  it('truncates the array field and marks truncated:true when over CHARACTER_LIMIT', () => {
    const bigFindings = Array.from({ length: 2000 }, (_, i) => ({
      id: `f-${i}`,
      severity: 'CRITICAL',
      title: 'x'.repeat(50),
      file: 'src/very/long/path/to/a/file.ts',
      line: i,
    }));
    const payload = { findings: bigFindings, has_more: false };
    expect(JSON.stringify(payload).length).toBeGreaterThan(CHARACTER_LIMIT);

    const result = guardCharacterLimit(payload) as typeof payload & { truncated: boolean };

    expect(result.truncated).toBe(true);
    expect(result.findings.length).toBeLessThan(bigFindings.length);
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(CHARACTER_LIMIT);
  });

  it('returns the payload unchanged when no array field exists to trim', () => {
    const payload = { note: 'x'.repeat(CHARACTER_LIMIT + 100) };
    expect(guardCharacterLimit(payload)).toEqual(payload);
  });
});
