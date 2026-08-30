import { MultiAgentResultsView } from "./_components/MultiAgentResultsView";

/* Route: /repos/:repoId/multi-agent/:number. Thin route entry — the view,
   its Columns/Tabs/disagreement layout, and helpers are colocated under
   _components/MultiAgentResultsView. Keyed on the PR number; the server
   always resolves the PR's latest multi-agent run (AC-29). */
export default function MultiAgentResultsPage() {
  return <MultiAgentResultsView />;
}
