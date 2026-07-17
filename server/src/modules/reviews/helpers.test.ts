import { describe, it, expect } from 'vitest';
import { formatSkillsForPrompt } from './helpers.js';

describe('formatSkillsForPrompt', () => {
  it('labels each skill with a ### heading', () => {
    expect(
      formatSkillsForPrompt([
        { name: 'Security rubric', body: '- Flag hardcoded secrets' },
        { name: 'Style', body: '- Prefer const' },
      ]),
    ).toEqual(['### Security rubric\n- Flag hardcoded secrets', '### Style\n- Prefer const']);
  });

  it('returns [] for no rows', () => {
    expect(formatSkillsForPrompt([])).toEqual([]);
  });
});
