import { PullsListView } from "./_components/PullsListView";

/* Route: /repos/:repoId/pulls (PR list). Thin route entry — the view, its rows,
   filter bar, styles and constants are colocated under _components/PullsListView
   and the route folder. */
export default function PullsPage() {
  return <PullsListView />;
}
