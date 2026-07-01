import { AgentEditorView } from "./_components/AgentEditorView";

/* Route: /agents/:id (Agent editor). Thin route entry — the view, its config
   editor and agent list are colocated under _components/AgentEditorView. */
export default function AgentEditorPage() {
  return <AgentEditorView />;
}
