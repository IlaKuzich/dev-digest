import { describe, it, expect } from 'vitest';
import { normalizeWs, locateEvidence, mergeConventionsToSkillBody } from './helpers.js';
import type { ConventionCandidate } from '@devdigest/shared';

describe('normalizeWs', () => {
  it('collapses runs of whitespace and trims', () => {
    expect(normalizeWs('  a\t b\n  c ')).toBe('a b c');
  });
});

describe('locateEvidence (moderate grounding)', () => {
  const file = ['line one', '  const user = await db.find(id);', 'line three'].join('\n');

  it('finds a single-line snippet anywhere in the file (1-based)', () => {
    expect(locateEvidence(file, 'const user = await db.find(id);')).toEqual({
      startLine: 2,
      endLine: 2,
    });
  });

  it('matches despite whitespace-run differences (extra spaces/tabs)', () => {
    expect(locateEvidence(file, 'const   user =  await\tdb.find(id);')).toEqual({
      startLine: 2,
      endLine: 2,
    });
  });

  it('spans a multi-line snippet', () => {
    const f = ['a', 'function h() {', '  return ok();', '}', 'z'].join('\n');
    expect(locateEvidence(f, 'function h() {\n  return ok();\n}')).toEqual({
      startLine: 2,
      endLine: 4,
    });
  });

  it('returns null when the snippet is absent (dropped)', () => {
    expect(locateEvidence(file, 'not in the file at all')).toBeNull();
  });

  it('returns null for an empty snippet', () => {
    expect(locateEvidence(file, '   ')).toBeNull();
  });
});

describe('mergeConventionsToSkillBody', () => {
  const base: ConventionCandidate = {
    id: 'c1',
    scan_id: 's1',
    category: 'naming',
    rule: 'Use async/await instead of .then() chains',
    edited_rule: null,
    evidence_path: 'src/api/users.ts',
    evidence_line_start: 23,
    evidence_line_end: 31,
    evidence_snippet: 'const user = await db.users.find(id);',
    confidence: 0.91,
    status: 'accepted',
    skill_id: null,
    created_at: '2026-07-08T00:00:00.000Z',
  };

  it('renders a heading, intro, and one section per accepted rule with file:line + snippet', () => {
    const body = mergeConventionsToSkillBody('payments-api', [base]);
    expect(body).toContain('# payments-api-conventions');
    expect(body).toContain('House conventions for `payments-api`');
    expect(body).toContain('Use async/await instead of .then() chains');
    expect(body).toContain('`src/api/users.ts:23-31`');
    expect(body).toContain('const user = await db.users.find(id);');
  });

  it('prefers edited_rule over rule when present', () => {
    const body = mergeConventionsToSkillBody('r', [{ ...base, edited_rule: 'EDITED RULE' }]);
    expect(body).toContain('EDITED RULE');
    expect(body).not.toContain('Use async/await instead');
  });
});
