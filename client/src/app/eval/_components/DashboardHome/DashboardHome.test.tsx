import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalDashboardHome } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

// AppShell pulls in shell i18n + usePathname + theme; mock it as a passthrough.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const runAllMutate = vi.fn();
let dashboardHome: EvalDashboardHome;

vi.mock("@/lib/hooks/eval", () => ({
  useEvalDashboardHome: () => ({ data: dashboardHome, isLoading: false, isError: false, refetch: vi.fn() }),
  useRunAllAgents: () => ({ mutate: runAllMutate, isPending: false }),
}));

import { DashboardHome } from "./DashboardHome";

afterEach(cleanup);
beforeEach(() => {
  push.mockClear();
  runAllMutate.mockClear();
  dashboardHome = {
    agents: [
      {
        agent_id: "a1",
        agent_name: "Security Reviewer",
        provider: "openai",
        model: "gpt-4.1",
        last_version: 7,
        last_ran_at: "2026-05-29T09:14:00Z",
        traces_passed: 17,
        traces_total: 20,
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        sparkline: [0.78, 0.8, 0.82],
      },
      {
        agent_id: "a2",
        agent_name: "Custom Mentor",
        provider: "openai",
        model: "gpt-4o-mini",
        last_version: null,
        last_ran_at: null,
        traces_passed: 0,
        traces_total: 0,
        recall: null,
        precision: null,
        citation_accuracy: null,
        sparkline: [],
      },
    ],
    recent_runs: [
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
    ],
  };
});

function renderDashboard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <DashboardHome />
    </NextIntlClientProvider>,
  );
}

describe("DashboardHome", () => {
  it("renders every agent row with its model, sparkline metrics, and last-run subtitle (AC-18)", () => {
    renderDashboard();
    // "Security Reviewer" also appears in the recent-runs table's Agent column.
    expect(screen.getAllByText("Security Reviewer").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText(/Last run v7/)).toBeInTheDocument();
    expect(screen.getByText(/never run/i)).toBeInTheDocument();
  });

  it("renders the recent-runs table across all agents (AC-19)", () => {
    renderDashboard();
    expect(screen.getByText("Recent eval runs · all agents")).toBeInTheDocument();
  });

  it("navigates to the agent's detail page when a row is clicked (AC-21)", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /open security reviewer/i }));
    expect(push).toHaveBeenCalledWith("/eval/a1");
  });

  it("runs all agents' eval sets when the button is clicked (AC-20)", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /run all agents/i }));
    expect(runAllMutate).toHaveBeenCalled();
  });
});
