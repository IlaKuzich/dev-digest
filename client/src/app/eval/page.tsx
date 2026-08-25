import { DashboardHome } from "./_components/DashboardHome";

/* Route: /eval (standalone Eval Dashboard home, Surface C). Thin route entry —
   the view, its per-agent rows, and the recent-runs table are colocated under
   _components/DashboardHome. */
export default function EvalDashboardPage() {
  return <DashboardHome />;
}
