import type { SkillType } from "@devdigest/shared";

/** Selectable skill types (labels are i18n'd in the component). */
export const TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Default type for a new skill. */
export const DEFAULT_TYPE: SkillType = "convention";

/** Modal width (px). */
export const MODAL_WIDTH = 560;
