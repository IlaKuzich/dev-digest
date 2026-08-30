/* Pure helpers for ConfigureRunView — no React import (client-project-structure).
   The aggregate math (AC-9) lives here specifically so it is unit-testable
   without rendering. */
import type { AgentEstimate } from "@/lib/hooks/multi-agent";

export interface AggregateEstimate {
  /** Parallel wall-clock estimate = max of the selected agents' averages. */
  timeMs: number | null;
  /** Total spend estimate = sum of the selected agents' averages. */
  costUsd: number | null;
}

/** AC-9: time = max (parallel fan-out), cost = sum, over the SELECTED agents'
   own estimates. Agents with no run history (null estimate) are excluded from
   both aggregates rather than treated as a 0-cost/0-time agent. */
export function aggregateEstimates(
  estimates: AgentEstimate[] | undefined,
  selectedIds: Set<string>,
): AggregateEstimate {
  const selected = (estimates ?? []).filter((e) => selectedIds.has(e.agent_id));
  const times = selected.map((e) => e.avg_duration_ms).filter((v): v is number => v != null);
  const costs = selected.map((e) => e.avg_cost_usd).filter((v): v is number => v != null);
  return {
    timeMs: times.length > 0 ? Math.max(...times) : null,
    costUsd: costs.length > 0 ? costs.reduce((a, b) => a + b, 0) : null,
  };
}

/** This agent's estimate row, if the server has produced one for it. */
export function estimateFor(
  estimates: AgentEstimate[] | undefined,
  agentId: string,
): AgentEstimate | undefined {
  return estimates?.find((e) => e.agent_id === agentId);
}

/** "8.2s" for a numeric estimate, or "—" when there is none. */
export function formatTimeMs(ms: number | null): string {
  if (ms == null) return "—";
  const seconds = ms / 1000;
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
}
