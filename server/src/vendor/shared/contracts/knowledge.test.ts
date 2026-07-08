import { describe, it, expect } from 'vitest';
import {
  AgentSkillLink,
  CreateSkillInput,
  UpdateSkillInput,
  ConventionCandidate,
  ConventionDraft,
  UpdateConventionInput,
  CreateConventionSkillInput,
} from './knowledge.js';

describe('skills contracts', () => {
  it('AgentSkillLink requires enabled', () => {
    expect(() => AgentSkillLink.parse({ agent_id: 'a', skill_id: 's', order: 0 })).toThrow();
    expect(
      AgentSkillLink.parse({ agent_id: 'a', skill_id: 's', order: 0, enabled: true }),
    ).toEqual({ agent_id: 'a', skill_id: 's', order: 0, enabled: true });
  });

  it('CreateSkillInput requires name/description/type/body', () => {
    expect(() => CreateSkillInput.parse({ name: 'x' })).toThrow();
    expect(
      CreateSkillInput.parse({ name: 'x', description: 'd', type: 'convention', body: '# r' }),
    ).toMatchObject({ name: 'x', type: 'convention' });
  });

  it('UpdateSkillInput is fully optional, including enabled', () => {
    expect(UpdateSkillInput.parse({})).toEqual({});
    expect(UpdateSkillInput.parse({ enabled: false })).toEqual({ enabled: false });
  });
});

describe('Conventions contracts', () => {
  it('ConventionCandidate carries status/category/skill provenance', () => {
    const parsed = ConventionCandidate.parse({
      id: 'c1',
      scan_id: 's1',
      category: 'naming',
      rule: 'Use async/await',
      edited_rule: null,
      evidence_path: 'src/a.ts',
      evidence_line_start: 23,
      evidence_line_end: 31,
      evidence_snippet: 'const x = await f();',
      confidence: 0.9,
      status: 'candidate',
      skill_id: null,
      created_at: '2026-07-08T00:00:00.000Z',
    });
    expect(parsed.status).toBe('candidate');
  });

  it('ConventionDraft is the model-output shape (nested evidence)', () => {
    const d = ConventionDraft.parse({
      category: 'error-handling',
      rule: 'Return Result<T,E>',
      evidence: { file: 'src/b.ts', line: 14, snippet: 'return ok(x);' },
      confidence: 0.7,
    });
    expect(d.evidence.file).toBe('src/b.ts');
  });

  it('rejects an out-of-taxonomy category', () => {
    expect(() =>
      ConventionDraft.parse({
        category: 'nonsense',
        rule: 'x',
        evidence: { file: 'a', line: 1, snippet: 's' },
        confidence: 0.5,
      }),
    ).toThrow();
  });

  it('UpdateConventionInput allows status-only or edit-only', () => {
    expect(UpdateConventionInput.parse({ status: 'accepted' }).status).toBe('accepted');
    expect(UpdateConventionInput.parse({ rule: 'new' }).rule).toBe('new');
  });

  it('CreateConventionSkillInput requires name+description+body', () => {
    expect(() => CreateConventionSkillInput.parse({ name: 'x' })).toThrow();
  });
});
