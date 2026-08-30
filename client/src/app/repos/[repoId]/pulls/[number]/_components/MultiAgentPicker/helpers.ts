/* Pure helpers for MultiAgentPicker — no React import (client-project-structure). */
import type { AgentEstimate } from "@/lib/hooks/multi-agent";

/** This agent's estimate row, if the server has produced one for it. */
export function estimateFor(
  estimates: AgentEstimate[] | undefined,
  agentId: string,
): AgentEstimate | undefined {
  return estimates?.find((e) => e.agent_id === agentId);
}

/** "~6s" for an agent with run history, or the given no-history label
   otherwise (AC-5). The label is passed in so this pure function never
   owns translated copy — the component supplies it via i18n. */
export function formatTimeEstimate(
  estimate: AgentEstimate | undefined,
  noHistoryLabel: string,
): string {
  if (!estimate || estimate.runs === 0 || estimate.avg_duration_ms == null) return noHistoryLabel;
  const seconds = estimate.avg_duration_ms / 1000;
  return `~${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
}
