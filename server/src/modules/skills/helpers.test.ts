import { describe, it, expect } from 'vitest';
import { toSkillDto } from './helpers.js';
import type { SkillRow } from './repository.js';

const row: SkillRow = {
  id: 'sk-1',
  workspaceId: 'ws-1',
  name: 'PR quality rubric',
  description: 'Checks structure',
  type: 'rubric',
  source: 'manual',
  body: '# Rule\ncite lines',
  enabled: true,
  version: 1,
  evidenceFiles: null,
  createdAt: new Date(),
};

describe('toSkillDto', () => {
  it('maps a persisted row to the Skill DTO', () => {
    expect(toSkillDto(row)).toEqual({
      id: 'sk-1',
      name: 'PR quality rubric',
      description: 'Checks structure',
      type: 'rubric',
      source: 'manual',
      body: '# Rule\ncite lines',
      enabled: true,
      version: 1,
      evidence_files: null,
    });
  });

  it('defaults a null evidence_files to null (not undefined)', () => {
    expect(toSkillDto({ ...row, evidenceFiles: null }).evidence_files).toBeNull();
  });
});
