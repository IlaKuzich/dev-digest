import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalTrendPoint } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";

import { MetricTrendChart } from "./MetricTrendChart";

afterEach(cleanup);

function renderChart(trend: EvalTrendPoint[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <MetricTrendChart trend={trend} />
    </NextIntlClientProvider>,
  );
}

const TREND: EvalTrendPoint[] = [
  { ran_at: "2026-05-19T10:08:00Z", recall: 0.78, precision: 0.92, citation_accuracy: 0.89, pass_rate: 0.75, cost_usd: 0.2 },
  { ran_at: "2026-05-29T09:14:00Z", recall: 0.82, precision: 0.91, citation_accuracy: 0.95, pass_rate: 0.85, cost_usd: 0.23 },
];

describe("MetricTrendChart", () => {
  it("renders the legend and heading when there is trend data (AC-23)", () => {
    renderChart(TREND);
    expect(screen.getByText("Metric trend")).toBeInTheDocument();
    expect(screen.getByText("Recall")).toBeInTheDocument();
    expect(screen.getByText("Precision")).toBeInTheDocument();
    expect(screen.getByText("Citation")).toBeInTheDocument();
  });

  it("shows the empty-state message when there are no runs yet", () => {
    renderChart([]);
    expect(screen.getByText(/no runs yet/i)).toBeInTheDocument();
  });
});
