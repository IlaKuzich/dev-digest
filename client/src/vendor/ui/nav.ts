/* nav.ts — sidebar nav groups + keyboard shortcut registry.
   hrefs use :repoId token; the web app fills it from the active repo. */
import type { IconName } from "./icons";

export interface NavItemDef {
  key: string;
  label: string;
  icon: IconName;
  /** Route template; :repoId is replaced with the active repo id by the app.
   *  Ignored (no `Link` rendered) when `disabled` is set. */
  href: string;
  /** Optional g-nav shortcut suffix (e.g. "p" → g then p). */
  gKey?: string;
  badge?: string;
  /** Non-navigable placeholder — `NavItem` renders it as inert text, no `Link`. */
  disabled?: boolean;
}

export interface NavGroup {
  section: string;
  items: NavItemDef[];
}

export const NAV: NavGroup[] = [
  {
    section: "WORKSPACE",
    items: [
      { key: "pulls", label: "Pull Requests", icon: "GitPullRequest", href: "/repos/:repoId/pulls", gKey: "p" },
      { key: "context", label: "Project Context", icon: "FileText", href: "/repos/:repoId/context", gKey: "x" },
    ],
  },
  {
    section: "SKILLS LAB",
    items: [
      { key: "skills", label: "Skills", icon: "Sparkles", href: "/skills", gKey: "s" },
      { key: "agents", label: "Agents", icon: "Cpu", href: "/agents", gKey: "a" },
      { key: "conventions", label: "Conventions", icon: "ListChecks", href: "/conventions", gKey: "c" },
      { key: "eval", label: "Eval Dashboard", icon: "Gauge", href: "/eval", gKey: "e" },
    ],
  },
  {
    section: "GLOBAL",
    items: [
      // Placeholders — separate, unbuilt features. Disabled/non-navigable: no
      // gKey shortcut, and `NavItem` renders them as inert text (no `Link`).
      { key: "memory", label: "Memory", icon: "Brain", href: "/memory", disabled: true },
      // Live — Multi-Agent Review feature. Points at the bare repo-scoped
      // route (NOT `/configure`) so it lands on the repo's LATEST run when
      // one exists — the route's page.tsx resolves and redirects to either
      // the last run's results or Configure when there is none yet.
      // `activeKeyFor` already maps "/multi-agent" → "multi-agent"
      // (app-shell/helpers.ts:28) — no change needed there.
      { key: "multi-agent", label: "Multi-Agent Review", icon: "Users", href: "/repos/:repoId/multi-agent" },
      {
        key: "agent-performance",
        label: "Agent Performance",
        icon: "TrendingUp",
        href: "/agent-performance",
        disabled: true,
      },
      // Live — CI feature.
      { key: "ci-runs", label: "CI Runs", icon: "Workflow", href: "/ci-runs" },
    ],
  },
];

export const SETTINGS_ITEM: NavItemDef = {
  key: "settings",
  label: "Settings",
  icon: "Settings",
  href: "/settings/api-keys",
  gKey: ",",
};

export const SETTINGS_SECTIONS = [
  { key: "api-keys", label: "API Keys" },
  { key: "models", label: "Feature Models" },
] as const;

/** Keyboard shortcut registry. Wiring is finalized by A6. */
export interface ShortcutDef {
  keys: string;
  label: string;
  group: "Navigation" | "Findings" | "Actions" | "Global";
}

export const SHORTCUTS: ShortcutDef[] = [
  { keys: "⌘K", label: "Open command palette", group: "Global" },
  { keys: "?", label: "Show keyboard shortcuts", group: "Global" },
  { keys: "g p", label: "Go to Pull Requests", group: "Navigation" },
  { keys: "g x", label: "Go to Project Context", group: "Navigation" },
  { keys: "g a", label: "Go to Agents", group: "Navigation" },
  { keys: "g s", label: "Go to Skills", group: "Navigation" },
  { keys: "g c", label: "Go to Conventions", group: "Navigation" },
  { keys: "g e", label: "Go to Eval Dashboard", group: "Navigation" },
  { keys: "j / k", label: "Next / previous finding", group: "Findings" },
  { keys: "a", label: "Accept finding", group: "Findings" },
  { keys: "d", label: "Dismiss finding", group: "Findings" },
];

/** Resolve an :repoId-templated href against the active repo id. */
export function resolveHref(href: string, repoId: string | null | undefined): string {
  if (!href.includes(":repoId")) return href;
  return href.replace(":repoId", repoId ?? "_");
}
