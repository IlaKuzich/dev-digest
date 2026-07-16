import type { SkillDraft } from "../SkillEditor";

/** Draft placeholder used until the skill query resolves. */
export const EMPTY_DRAFT: SkillDraft = {
  name: "",
  description: "",
  type: "convention",
  body: "",
  enabled: true,
  note: "",
};
