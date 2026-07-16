import { SkillsWorkbench } from "../_components/SkillsWorkbench";

/* Route: /skills/:id (Skills workbench, skill selected). Renders the same workbench
   as /skills — it reads `:id` from useParams, and the id only selects which skill
   fills the right pane, so the list never unmounts. */
export default function SkillEditorPage() {
  return <SkillsWorkbench />;
}
