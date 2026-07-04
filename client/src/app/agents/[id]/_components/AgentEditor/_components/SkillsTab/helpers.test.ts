import { describe, it, expect } from "vitest";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import { mergeSkillsWithLinks, reorder } from "./helpers";

function makeSkill(id: string): Skill {
  return {
    id,
    name: `Skill ${id}`,
    description: `Description for ${id}`,
    type: "convention",
    source: "manual",
    body: `# ${id}`,
    enabled: true,
    version: 1,
  };
}

function makeLink(skillId: string, order: number, enabled: boolean): AgentSkillLink {
  return { agent_id: "agent-1", skill_id: skillId, order, enabled };
}

describe("mergeSkillsWithLinks", () => {
  it("orders linked skills by link.order, carries each link's own enabled bit, and appends unlinked skills as disabled", () => {
    const skills = [makeSkill("sk1"), makeSkill("sk2"), makeSkill("sk3")];
    const links = [makeLink("sk2", 0, true), makeLink("sk1", 1, false)];

    const result = mergeSkillsWithLinks(skills, links);

    expect(result).toEqual([
      { skill: skills[1], enabled: true },
      { skill: skills[0], enabled: false },
      { skill: skills[2], enabled: false },
    ]);
  });

  it("drops a link whose skill_id has no matching skill instead of crashing", () => {
    const skills = [makeSkill("sk1")];
    const links = [makeLink("sk1", 0, true), makeLink("missing", 1, true)];

    const result = mergeSkillsWithLinks(skills, links);

    expect(result).toEqual([{ skill: skills[0], enabled: true }]);
  });

  it("returns all skills unlinked and disabled when there are no links", () => {
    const skills = [makeSkill("sk1"), makeSkill("sk2")];

    const result = mergeSkillsWithLinks(skills, []);

    expect(result).toEqual([
      { skill: skills[0], enabled: false },
      { skill: skills[1], enabled: false },
    ]);
  });
});

describe("reorder", () => {
  it("moves an item forward (index 0 to 2) without duplication or loss", () => {
    const list = ["a", "b", "c", "d"];

    const result = reorder(list, 0, 2);

    expect(result).toEqual(["b", "c", "a", "d"]);
    expect(result).toHaveLength(4);
  });

  it("moves an item backward (index 2 to 0) without duplication or loss", () => {
    const list = ["a", "b", "c", "d"];

    const result = reorder(list, 2, 0);

    expect(result).toEqual(["c", "a", "b", "d"]);
    expect(result).toHaveLength(4);
  });

  it("does not mutate the original array", () => {
    const list = ["a", "b", "c", "d"];

    reorder(list, 0, 2);

    expect(list).toEqual(["a", "b", "c", "d"]);
  });
});
