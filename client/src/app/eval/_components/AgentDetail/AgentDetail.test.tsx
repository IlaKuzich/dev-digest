import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentEvalDashboard } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ agentId: "a1" }),
  useRouter: () => ({ push }),
}));

// AppShell pulls in shell i18n + usePathname + theme; mock it as a passthrough.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const runEvalMutate = vi.fn();
let dashboard: AgentEvalDashboard;

vi.mock("@/lib/hooks/eval", () => ({
  useAgentEvalDashboard: () => ({ data: dashboard, isLoading: false, isError: false, refetch: vi.fn() }),
  useRunAgentEval: () => ({ mutate: runEvalMutate, isPending: false }),
  useEvalCompare: () => ({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() }),
  usePromoteVersion: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { AgentDetail } from "./AgentDetail";

afterEach(cleanup);
beforeEach(() => {
  push.mockClear();
  runEvalMutate.mockClear();
  dashboard = {
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openai",
    model: "gpt-4.1",
    current: { recall: 0.82, precision: 0.91, citation_accuracy: 0.95, traces_passed: 17, traces_total: 20, cost_usd: 0.23 },
    delta: { recall: 0.04, precision: -0.02, citation_accuracy: 0.01 },
    trend: [
      { ran_at: "2026-05-19T10:08:00Z", recall: 0.78, precision: 0.92, citation_accuracy: 0.89, pass_rate: 0.75, cost_usd: 0.2 },
      { ran_at: "2026-05-29T09:14:00Z", recall: 0.82, precision: 0.91, citation_accuracy: 0.95, pass_rate: 0.85, cost_usd: 0.23 },
    ],
    recent_runs: [
      {
        id: "b7",
        agent_id: "a1",
        agent_version: 7,
        ran_at: "2026-05-29T09:14:00Z",
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        traces_passed: 17,
        traces_total: 20,
        cost_usd: 0.23,
      },
      {
        id: "b6",
        agent_id: "a1",
        agent_version: 6,
        ran_at: "2026-05-27T16:40:00Z",
        recall: 0.78,
        precision: 0.93,
        citation_accuracy: 0.94,
        traces_passed: 16,
        traces_total: 20,
        cost_usd: 0.21,
      },
      {
        id: "b5",
        agent_id: "a1",
        agent_version: 5,
        ran_at: "2026-05-25T11:02:00Z",
        recall: 0.8,
        precision: 0.92,
        citation_accuracy: 0.94,
        traces_passed: 16,
        traces_total: 20,
        cost_usd: 0.24,
      },
    ],
    alert: null,
  };
});

function renderDetail() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <AgentDetail />
    </NextIntlClientProvider>,
  );
}

describe("AgentDetail", () => {
  it("renders the metric cards and recent runs for the agent (AC-23/24)", () => {
    renderDetail();
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("v7")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the warning banner when the dashboard reports an alert (AC-25)", () => {
    dashboard = { ...dashboard, alert: "Precision dipped 2pts on v7 — a new false positive slipped in." };
    renderDetail();
    expect(screen.getByRole("alert")).toHaveTextContent("Precision dipped 2pts on v7");
  });

  it("enables Compare only once exactly two runs are selected (AC-26)", () => {
    renderDetail();
    const compareButton = screen.getByRole("button", { name: /compare/i });
    expect(compareButton).toBeDisabled();

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    expect(compareButton).toBeDisabled();

    fireEvent.click(checkboxes[1]!);
    expect(compareButton).not.toBeDisabled();

    fireEvent.click(checkboxes[2]!);
    expect(compareButton).toBeDisabled();
  });

  it("navigates back to the dashboard home on the back link", () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /all agents/i }));
    expect(push).toHaveBeenCalledWith("/eval");
  });
});
