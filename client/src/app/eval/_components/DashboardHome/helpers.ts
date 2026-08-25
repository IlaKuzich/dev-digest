/** Pure helpers for DashboardHome — no React import. */
import type { AgentEvalSummary } from "@devdigest/shared";
import { formatRunTimestamp } from "../RecentRunsTable";

/** "Last run v7 · 2026-05-29 09:14 · 17/20 pass", or a neutral fallback when never run. */
export function formatAgentRowSubtitle(agent: AgentEvalSummary, neverRunLabel: string): string {
  if (agent.last_version == null || agent.last_ran_at == null) return neverRunLabel;
  return `Last run v${agent.last_version} · ${formatRunTimestamp(agent.last_ran_at)} · ${agent.traces_passed}/${agent.traces_total} pass`;
}
