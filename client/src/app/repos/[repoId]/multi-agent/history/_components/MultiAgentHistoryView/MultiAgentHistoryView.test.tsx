import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { MultiAgentRunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/multiAgent.json";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo1" }),
  useRouter: () => ({ push: nav.push }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/repo-not-found", () => ({
  RepoNotFound: () => <div>repo not found</div>,
}));

vi.mock("@/lib/repo-context", () => ({
  useRepoNotFound: () => false,
}));

const state = vi.hoisted(() => ({
  runs: [] as MultiAgentRunSummary[],
  isLoading: false,
}));

vi.mock("@/lib/hooks/multi-agent-results", () => ({
  useMultiAgentRunHistory: () => ({
    data: state.runs,
    isLoading: state.isLoading,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

import { MultiAgentHistoryView } from "./MultiAgentHistoryView";

afterEach(() => {
  cleanup();
  nav.push.mockClear();
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      <MultiAgentHistoryView />
    </NextIntlClientProvider>,
  );
}

describe("MultiAgentHistoryView", () => {
  it("shows an empty state when the repo has never had a multi-agent run", () => {
    state.runs = [];
    state.isLoading = false;
    renderView();

    expect(screen.getByText("No previous runs yet")).toBeInTheDocument();
  });

  it("lists runs across DIFFERENT PRs in the repo, newest-first, each showing its own PR — 'View' opens that run", () => {
    state.runs = [
      {
        id: "run-2",
        pr_number: 9,
        pr_title: "Add order returns & refunds workflow",
        ran_at: "2026-08-27T00:00:00Z",
        agent_count: 4,
        total_duration_ms: 8200,
        total_cost_usd: 0.2,
        status: "done",
      },
      {
        id: "run-1",
        pr_number: 482,
        pr_title: "Add rate limiting to public API endpoints",
        ran_at: "2026-08-20T00:00:00Z",
        agent_count: 2,
        total_duration_ms: 6000,
        total_cost_usd: 0.1,
        status: "failed",
      },
    ];
    state.isLoading = false;
    renderView();

    expect(screen.getByText("Add order returns & refunds workflow")).toBeInTheDocument();
    expect(screen.getByText("Add rate limiting to public API endpoints")).toBeInTheDocument();
    expect(screen.getByText("#9")).toBeInTheDocument();
    expect(screen.getByText("#482")).toBeInTheDocument();

    const viewButtons = screen.getAllByRole("button", { name: "View" });
    fireEvent.click(viewButtons[0]!);
    expect(nav.push).toHaveBeenCalledWith("/repos/repo1/multi-agent/9?run=run-2");
  });

  it("shows 'Running…' instead of a misleading 0s/$0 total for a still-in-progress run", () => {
    state.runs = [
      {
        id: "run-live",
        pr_number: 9,
        pr_title: "Add order returns & refunds workflow",
        ran_at: "2026-08-27T00:00:00Z",
        agent_count: 4,
        total_duration_ms: 0,
        total_cost_usd: null,
        status: "running",
      },
    ];
    state.isLoading = false;
    renderView();

    expect(screen.getByText("Running…")).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00 total/)).not.toBeInTheDocument();
  });

  it("'Back' returns to the repo's Multi-Agent Review landing", () => {
    state.runs = [];
    renderView();

    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(nav.push).toHaveBeenCalledWith("/repos/repo1/multi-agent");
  });
});
