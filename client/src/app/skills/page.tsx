import { SkillsWorkbench } from "./_components/SkillsWorkbench";

/* Route: /skills (Skills workbench, nothing selected). Thin route entry — the same
   workbench serves /skills/:id; with no id it renders the skill list beside an
   empty right pane. */
export default function SkillsPage() {
  return <SkillsWorkbench />;
}
