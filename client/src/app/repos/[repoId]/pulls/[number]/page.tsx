import { PrDetailView } from "./_components/PrDetailView";

/* Route: /repos/:repoId/pulls/:number (PR detail). Thin route entry — the view,
   its tabs, header, trace drawer, styles and helpers are colocated under
   _components/PrDetailView. */
export default function PRDetailPage() {
  return <PrDetailView />;
}
