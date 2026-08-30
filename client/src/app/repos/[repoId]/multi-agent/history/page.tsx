import { MultiAgentHistoryView } from "./_components/MultiAgentHistoryView";

/* Route: /repos/:repoId/multi-agent/history — "Previous Runs" (2026-08-27
   follow-on; supersedes the plan's original "no browsable history" non-goal;
   requester decision: repo-wide across all the repo's PRs, not scoped to a
   single PR). Thin route entry — the view and its list layout are colocated
   under _components/MultiAgentHistoryView. */
export default function MultiAgentHistoryPage() {
  return <MultiAgentHistoryView />;
}
