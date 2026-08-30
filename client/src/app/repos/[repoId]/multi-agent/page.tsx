import { MultiAgentLandingView } from "./_components/MultiAgentLandingView";

/* Route: /repos/:repoId/multi-agent (no PR number — the global nav item's
   href). Thin route entry — resolves the repo's latest multi-agent run and
   redirects to it, or to Configure when there is none yet. See
   _components/MultiAgentLandingView for the "return to last run" fix. */
export default function MultiAgentLandingPage() {
  return <MultiAgentLandingView />;
}
