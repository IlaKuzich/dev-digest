import { ProjectContextView } from "./_components/ProjectContextView";

/* Route: /repos/:repoId/context — discovery-only Project Context page (AC-1…6,
   AC-26). Thin route entry — the view, its footer/preview and styles are
   colocated under _components/ProjectContextView. */
export default function ProjectContextPage() {
  return <ProjectContextView />;
}
