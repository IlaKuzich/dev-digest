import { SkillsListView } from "./_components/SkillsListView";

/* Route: /skills (Skills list + preview). Thin route entry — the view, its
   create modal, styles, constants, helpers and i18n are colocated under
   _components/SkillsListView. */
export default function SkillsPage() {
  return <SkillsListView />;
}
