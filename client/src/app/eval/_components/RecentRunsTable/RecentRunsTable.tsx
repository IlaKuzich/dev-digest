/* RecentRunsTable — one row per `eval_batches` run-group (AC-19, AC-24).
   Shared by DashboardHome ("Recent eval runs · all agents", read-only, an
   Agent column) and AgentDetail ("Recent runs", per-row checkboxes for
   Compare, a Cost column). Metric bars are always paired with their numeric
   % — state is never encoded by color alone (spec Accessibility). */
"use client";

import React from "react";
import { Checkbox } from "@devdigest/ui";
import type { EvalBatchRun } from "@devdigest/shared";
import { formatCostUsd, formatMetricPct, formatRunTimestamp } from "./helpers";
import { barFill, s } from "./styles";

const METRIC_COLOR = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation: "var(--warn)",
} as const;

function MetricBarCell({ value, color }: { value: number | null; color: string }) {
  return (
    <div style={s.barCell}>
      <div style={s.barTrack}>
        <div style={barFill(value, color)} />
      </div>
      <span style={s.barPct}>{formatMetricPct(value)}</span>
    </div>
  );
}

export interface RecentRunsTableProps {
  runs: EvalBatchRun[];
  /** Dashboard home shows which agent each row belongs to; agent detail doesn't (already scoped). */
  showAgentColumn?: boolean;
  /** Agent detail shows a Cost column; dashboard home omits it (AC-19 doesn't list it). */
  showCost?: boolean;
  /** Agent detail's per-row checkboxes driving Compare (AC-26). */
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  emptyMessage: string;
  /** Column header labels — i18n-driven (`agent`/`version` come from
      `dashboard.table.agent`/`dashboard.table.version`). */
  labels: {
    agent?: string;
    version?: string;
    ranAt: string;
    recall: string;
    precision: string;
    citation: string;
    pass: string;
    cost?: string;
  };
}

export function RecentRunsTable({
  runs,
  showAgentColumn,
  showCost,
  selectable,
  selectedIds,
  onToggleSelect,
  emptyMessage,
  labels,
}: RecentRunsTableProps) {
  if (runs.length === 0) {
    return (
      <div style={s.wrap}>
        <div style={s.empty}>{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <table style={s.table}>
        <thead>
          <tr>
            {selectable && <th style={s.th} aria-label="Select" />}
            {showAgentColumn && <th style={s.th}>{labels.agent ?? "Agent"}</th>}
            <th style={s.th}>{labels.ranAt}</th>
            <th style={s.th}>{labels.version ?? "Version"}</th>
            <th style={s.th}>{labels.recall}</th>
            <th style={s.th}>{labels.precision}</th>
            <th style={s.th}>{labels.citation}</th>
            <th style={s.th}>{labels.pass}</th>
            {showCost && <th style={s.th}>{labels.cost ?? "Cost"}</th>}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              {selectable && (
                <td style={s.checkboxCell}>
                  <Checkbox
                    checked={!!selectedIds?.has(run.id)}
                    onChange={() => onToggleSelect?.(run.id)}
                    label={<span style={s.srOnly}>{`Select run ${formatRunTimestamp(run.ran_at)}`}</span>}
                  />
                </td>
              )}
              {showAgentColumn && (
                <td style={{ ...s.td, ...s.agentName }}>{run.agent_name ?? run.agent_id}</td>
              )}
              <td style={s.td}>{formatRunTimestamp(run.ran_at)}</td>
              <td style={{ ...s.td, ...s.version }} className="mono">
                v{run.agent_version}
              </td>
              <td style={s.td}>
                <MetricBarCell value={run.recall} color={METRIC_COLOR.recall} />
              </td>
              <td style={s.td}>
                <MetricBarCell value={run.precision} color={METRIC_COLOR.precision} />
              </td>
              <td style={s.td}>
                <MetricBarCell value={run.citation_accuracy} color={METRIC_COLOR.citation} />
              </td>
              <td style={{ ...s.td, ...s.pass }} className="tnum">
                {run.traces_passed}/{run.traces_total}
              </td>
              {showCost && <td style={s.td}>{formatCostUsd(run.cost_usd)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
