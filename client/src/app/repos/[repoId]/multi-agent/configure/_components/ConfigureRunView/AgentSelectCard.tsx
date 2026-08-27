/* AgentSelectCard — one per-agent row in the Configure-run screen's step 2
   (AC-3, AC-5, AC-6): name, per-agent time+cost estimate, "no history yet"
   when the agent has never run, the agent's latest per-PR summary or a
   neutral placeholder when it has none, and a selection checkbox. */
"use client";

import React from "react";
import { Card, Checkbox } from "@devdigest/ui";
import { formatCost } from "@/components/run-cost-badge/RunCostBadge";
import type { Agent } from "@devdigest/shared";
import type { AgentEstimate } from "@/lib/hooks/multi-agent";
import { formatTimeMs } from "./helpers";

export function AgentSelectCard({
  agent,
  estimate,
  selected,
  onToggle,
  noHistoryLabel,
  noSummaryLabel,
}: {
  agent: Agent;
  estimate: AgentEstimate | undefined;
  selected: boolean;
  onToggle: () => void;
  noHistoryLabel: string;
  noSummaryLabel: string;
}) {
  const hasHistory = !!estimate && estimate.runs > 0;
  const estimateLabel = hasHistory
    ? `${formatTimeMs(estimate.avg_duration_ms)} · ${formatCost(estimate.avg_cost_usd)}`
    : noHistoryLabel;
  const summary = estimate?.summary ?? null;

  return (
    <Card style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <Checkbox checked={selected} onChange={onToggle} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{agent.name}</span>
          <span className="mono tnum" style={{ fontSize: 12.5, color: "var(--text-muted)", flexShrink: 0 }}>
            {estimateLabel}
          </span>
        </div>
        <div
          style={{
            fontSize: 13,
            color: summary ? "var(--text-secondary)" : "var(--text-muted)",
            fontStyle: summary ? undefined : "italic",
          }}
        >
          {summary ?? noSummaryLabel}
        </div>
      </div>
    </Card>
  );
}
