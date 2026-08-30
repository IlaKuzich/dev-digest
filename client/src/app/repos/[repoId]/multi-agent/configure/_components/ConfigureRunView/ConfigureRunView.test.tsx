import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/multiAgent.json";

const searchState = vi.hoisted(() => ({ pr: "482" }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo1" }),
  useSearchParams: () => new URLSearchParams(searchState.pr ? `pr=${searchState.pr}` : ""),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const pulls = [
  { id: "pr-482", number: 482, title: "Add rate limiting to public API endpoints" },
  { id: "pr-99", number: 99, title: "Fix flaky test" },
];
vi.mock("@/lib/hooks", () => ({
  usePulls: () => ({ data: pulls }),
}));

const agents = [
  { id: "a1", name: "Security", model: "gpt-4.1", enabled: true },
  { id: "a2", name: "Architecture", model: "gpt-4.1", enabled: true },
];
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: agents }),
}));

const mutate = vi.fn();
vi.mock("@/lib/hooks/multi-agent", () => ({
  useAgentEstimates: () => ({
    data: [
      { agent_id: "a1", agent_name: "Security", runs: 6, avg_duration_ms: 8200, avg_cost_usd: 0.06, summary: "Two critical exposures found." },
      { agent_id: "a2", agent_name: "Architecture", runs: 0, avg_duration_ms: null, avg_cost_usd: null, summary: null },
    ],
  }),
  useTriggerMultiAgentRun: () => ({ mutate, isPending: false }),
}));

import { ConfigureRunView } from "./ConfigureRunView";

afterEach(() => {
  cleanup();
  mutate.mockClear();
  searchState.pr = "482";
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      <ConfigureRunView />
    </NextIntlClientProvider>,
  );
}

describe("ConfigureRunView", () => {
  it("preselects the PR from ?pr= and renders one card per agent with its estimate, summary/no-history state, and the max-time/sum-cost aggregate", () => {
    renderView();

    // AC-3/AC-5/AC-6: the PR was preselected via ?pr=482, so step 2 is
    // already populated (not the empty state).
    expect(screen.queryByText(/pick a pull request first/i)).not.toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Two critical exposures found.")).toBeInTheDocument();
    expect(screen.getByText("Architecture")).toBeInTheDocument();
    expect(screen.getByText("no history yet")).toBeInTheDocument();
    expect(screen.getByText("No prior review of this PR yet")).toBeInTheDocument();

    // AC-7: both agents default-selected → footer reads (2).
    expect(screen.getByRole("button", { name: /run multi-agent review \(2\)/i })).toBeInTheDocument();

    // AC-9: aggregate = max(8.2s, no-history-excluded) · sum($0.06, excluded).
    expect(screen.getByText("≈ 8.2s · $0.06 · parallel fan-out")).toBeInTheDocument();

    // AC-10/AC-30: triggering posts exactly the selected set.
    fireEvent.click(screen.getByRole("button", { name: /run multi-agent review \(2\)/i }));
    expect(mutate).toHaveBeenCalledWith({
      prId: "pr-482",
      repoId: "repo1",
      prNumber: 482,
      agentIds: ["a1", "a2"],
    });
  });

  it("shows the empty state and disables the trigger until a pull request is chosen", () => {
    // No ?pr= this time — nothing preselected (AC-2/AC-8).
    searchState.pr = "";
    renderView();
    expect(screen.getByText(/pick a pull request first/i)).toBeInTheDocument();
    expect(screen.queryByText("Security")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run multi-agent review \(0\)/i })).toBeDisabled();
  });
});
