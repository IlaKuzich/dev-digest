import type { AgentSkillLink, Skill } from "@devdigest/shared";

export interface SkillRowState {
  skill: Skill;
  enabled: boolean;
}

/**
 * Merge all workspace skills with the agent's saved links into one ordered
 * list: linked skills first (in their saved order + enabled state), then any
 * skill not yet linked to this agent, appended unchecked. Matches the spec:
 * "Skills created after an agent last saved appear appended, unchecked, and
 * get a row on the next save."
 */
export function mergeSkillsWithLinks(skills: Skill[], links: AgentSkillLink[]): SkillRowState[] {
  const bySkillId = new Map(links.map((l) => [l.skill_id, l]));
  const ordered = [...links]
    .sort((a, b) => a.order - b.order)
    .map((l) => skills.find((sk) => sk.id === l.skill_id))
    .filter((sk): sk is Skill => !!sk)
    .map((sk) => ({ skill: sk, enabled: bySkillId.get(sk.id)!.enabled }));
  const unlinked = skills
    .filter((sk) => !bySkillId.has(sk.id))
    .map((sk) => ({ skill: sk, enabled: false }));
  return [...ordered, ...unlinked];
}

/** Move the item at `from` to position `to`, returning a new array. */
export function reorder<T>(list: T[], from: number, to: number): T[] {
  const copy = [...list];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved!);
  return copy;
}
