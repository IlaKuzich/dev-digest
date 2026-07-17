import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from './repository.js';

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/**
 * Map a persisted `skill_versions` row to the public `SkillVersion` DTO. Unlike
 * the agent equivalent there is nothing to parse — `body` is a plain text
 * column, not untyped jsonb.
 */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    note: row.note,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * The version history as the client should see it. Skills created before the
 * snapshot-on-insert behaviour have no row for their live version, so it is
 * synthesized from the skill itself and marked with the skill's own
 * `created_at` (no better timestamp exists — `skills` has no `updated_at`).
 */
export function versionHistory(skill: SkillRow, rows: SkillVersionRow[]): SkillVersion[] {
  const history = rows.map(toSkillVersionDto);
  if (history.some((v) => v.version === skill.version)) return history;
  return [
    {
      skill_id: skill.id,
      version: skill.version,
      body: skill.body,
      note: null,
      created_at: skill.createdAt.toISOString(),
    },
    ...history,
  ];
}
