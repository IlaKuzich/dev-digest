import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiRun } from "@devdigest/shared";
import messages from "../../../../../messages/en/ci.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

// AppShell pulls in shell i18n + usePathname + theme; mock it as a passthrough
// (client INSIGHTS.md precedent for any page-level view rendering AppShell).
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

let RUNS: CiRun[] = [];
const refreshMutate = vi.fn();

// A static `vi.mock` factory replaces the whole module — stub every export
// `CiRunsView` calls (`useCiRuns` + `useRefreshCiRuns`), per client INSIGHTS.md.
vi.mock("@/lib/hooks/ci", () => ({
  useCiRuns: () => ({ data: { runs: RUNS }, isLoading: false, isError: false, refetch: vi.fn() }),
  useRefreshCiRuns: () => ({ mutate: refreshMutate, isPending: false }),
}));

import { CiRunsView } from "./CiRunsView";

const baseRun: CiRun = {
  id: "run-1",
  ci_installation_id: "inst-1",
  pr_number: 482,
  pr_title: "Add rate limiting to public endpoints",
  ran_at: "2026-06-01T08:42:00.000Z",
  status: "succeeded",
  findings_count: 2,
  critical: 1,
  warning: 1,
  suggestion: 0,
  cost_usd: 0.07,
  duration_ms: 7400,
  github_url: "https://github.com/acme/payments-api/actions/runs/123",
  source: "gha",
  repo: "acme/payments-api",
  target_type: "gha",
  agent: "Security Reviewer",
  findings: [
    {
      id: "f1",
      severity: "CRITICAL",
      category: "security",
      title: "SQL injection risk",
      file: "src/api/rate-limit.ts",
      start_line: 10,
      end_line: 12,
      rationale: "User input flows into a raw query without parameterization.",
      confidence: 0.9,
    },
    {
      id: "f2",
      severity: "WARNING",
      category: "bug",
      title: "Off-by-one in window calc",
      file: "src/api/rate-limit.ts",
      start_line: 20,
      end_line: 20,
      rationale: "The window boundary is inclusive when it should be exclusive.",
      confidence: 0.7,
    },
  ],
};

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
      <CiRunsView />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  push.mockClear();
  refreshMutate.mockClear();
});

describe("CiRunsView", () => {
  it("renders CI runs into the table with PR, agent, and status", () => {
    RUNS = [baseRun];
    renderView();
    expect(screen.getByText("#482")).toBeInTheDocument();
    expect(screen.getByText("Add rate limiting to public endpoints")).toBeInTheDocument();
    // "Security Reviewer" also appears as an option in the agent filter dropdown.
    expect(screen.getAllByText("Security Reviewer").length).toBeGreaterThanOrEqual(1);
    // "Succeeded" also appears as an option in the status filter dropdown.
    expect(screen.getAllByText("Succeeded").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the empty state with a Set up CI CTA that navigates to /agents", () => {
    RUNS = [];
    renderView();
    expect(screen.getByText("No CI runs yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /set up ci for an agent/i }));
    expect(push).toHaveBeenCalledWith("/agents");
  });

  it("opens the Trace drawer and omits the GitHub logs link when github_url is null", () => {
    RUNS = [{ ...baseRun, github_url: null }];
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Trace" }));
    expect(screen.getByText("Run trace")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /view full logs on github actions/i })).not.toBeInTheDocument();
  });

  it("shows the GitHub logs link in the Trace drawer when github_url is present", () => {
    RUNS = [baseRun];
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Trace" }));
    const link = screen.getByRole("link", { name: /view full logs on github actions/i });
    expect(link).toHaveAttribute("href", baseRun.github_url);
  });

  it("Refresh button triggers the refresh hook", () => {
    RUNS = [baseRun];
    renderView();
    refreshMutate.mockClear(); // clear the mount-time auto-sync call (AC-27)
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refreshMutate).toHaveBeenCalled();
  });
});
