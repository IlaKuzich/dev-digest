import { AgentDetail } from "../_components/AgentDetail";

/* Route: /eval/:agentId (per-agent Eval detail, Surface D). Thin route entry —
   AgentDetail reads `:agentId` from useParams (App Router client hook), so this
   page stays a synchronous, prop-less entry, mirroring the /agents/:id and
   /skills/:id route entries. */
export default function EvalAgentDetailPage() {
  return <AgentDetail />;
}
