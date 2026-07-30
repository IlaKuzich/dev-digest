import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { EvalBatchRun } from "@devdigest/shared";

import { RecentRunsTable } from "./RecentRunsTable";

afterEach(cleanup);

const LABELS = {
  agent: "Agent",
  version: "Version",
  ranAt: "Ran at",
  recall: "Recall",
  precision: "Precision",
  citation: "Citation",
  pass: "Pass",
  cost: "Cost",
};

const RUNS: EvalBatchRun[] = [
  {
    id: "b7",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    agent_version: 7,
    ran_at: "2026-05-29T09:14:00Z",
    recall: 0.82,
    precision: 0.91,
    citation_accuracy: 0.95,
    traces_passed: 17,
    traces_total: 20,
    cost_usd: 0.23,
  },
];

describe("RecentRunsTable", () => {
  it("renders metric bars paired with a numeric percentage, never color alone", () => {
    render(<RecentRunsTable runs={RUNS} showAgentColumn showCost emptyMessage="No runs" labels={LABELS} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("v7")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("95%")).toBeInTheDocument();
    expect(screen.getByText("17/20")).toBeInTheDocument();
    expect(screen.getByText("$0.23")).toBeInTheDocument();
  });

  it("shows the empty message when there are no runs", () => {
    render(<RecentRunsTable runs={[]} emptyMessage="No runs yet." labels={LABELS} />);
    expect(screen.getByText("No runs yet.")).toBeInTheDocument();
  });

  it("toggles row selection via the per-row checkbox when selectable", () => {
    const onToggleSelect = vi.fn();
    render(
      <RecentRunsTable
        runs={RUNS}
        selectable
        selectedIds={new Set()}
        onToggleSelect={onToggleSelect}
        emptyMessage="No runs"
        labels={LABELS}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggleSelect).toHaveBeenCalledWith("b7");
  });
});
