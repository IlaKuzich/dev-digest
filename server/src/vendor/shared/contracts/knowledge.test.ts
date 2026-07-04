import { describe, it, expect } from 'vitest';
import { AgentSkillLink, CreateSkillInput, UpdateSkillInput } from './knowledge.js';

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
