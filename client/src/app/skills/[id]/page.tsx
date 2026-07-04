import { SkillEditorView } from "./_components/SkillEditorView";

/* Route: /skills/:id (Skill editor). Thin route entry — the view, its styles,
   constants and i18n are colocated under _components/SkillEditorView. */
export default function SkillEditorPage() {
  return <SkillEditorView />;
}
