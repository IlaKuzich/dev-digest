import { describe, it, expect } from 'vitest';
import { ConventionsService } from './service.js';

/**
 * The extract orchestration reads the clone from disk and persists to Postgres,
 * so its real behavioural coverage (grounding drop, re-scan hygiene, skill
 * provenance) lives in `server/test/conventions.it.test.ts`. The pure grounding
 * and merge logic is unit-tested in `helpers.test.ts`. This hermetic unit only
 * pins the service's public surface.
 */
describe('ConventionsService (unit — surface)', () => {
  it('exposes extract / list / update / createSkill', () => {
    expect(typeof ConventionsService.prototype.extract).toBe('function');
    expect(typeof ConventionsService.prototype.list).toBe('function');
    expect(typeof ConventionsService.prototype.update).toBe('function');
    expect(typeof ConventionsService.prototype.createSkill).toBe('function');
  });
});
