import { ConfigureRunView } from "./_components/ConfigureRunView";

/* Route: /repos/:repoId/multi-agent/configure. Thin route entry — the view,
   its step 1/2 layout, and helpers are colocated under
   _components/ConfigureRunView. */
export default function ConfigureRunPage() {
  return <ConfigureRunView />;
}
