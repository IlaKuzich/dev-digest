import type { SkillType } from "@devdigest/shared";

/**
 * The in-progress edit. Owned by SkillEditorView (above the tab switch) so that
 * switching Config → Preview → Versions never discards unsaved work.
 */
export interface SkillDraft {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
  /** "What changed" — recorded on the snapshot when `body` differs on save. */
  note: string;
}

export type DraftPatch = (patch: Partial<SkillDraft>) => void;
