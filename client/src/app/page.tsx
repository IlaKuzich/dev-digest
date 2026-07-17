import { HomeView } from "./_components/HomeView";

/* Route: / (root). Thin route entry — redirects to the first repo or onboarding;
   the view is colocated under _components/HomeView. */
export default function HomePage() {
  return <HomeView />;
}
