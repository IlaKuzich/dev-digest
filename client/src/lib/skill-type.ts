/* Presentation tokens for a skill's `type`. Shared, because the type is shown in two
   places that must agree: the Skills workbench card and the Agent editor's Skills tab. */
import type { SkillType } from "@devdigest/shared";

/** Foreground + background for a skill type, keyed to the theme's palette vars so
    both light and dark follow automatically (see vendor/ui/styles.css).
    Colour is never the only signal — every badge here also carries its label. */
export const SKILL_TYPE_COLOR: Record<SkillType, { c: string; bg: string }> = {
  security: { c: "var(--crit)", bg: "var(--crit-bg)" }, // red
  convention: { c: "var(--ok)", bg: "var(--ok-bg)" }, // green
  rubric: { c: "var(--accent)", bg: "var(--accent-bg)" }, // blue
  custom: { c: "var(--warn)", bg: "var(--warn-bg)" }, // yellow
};
