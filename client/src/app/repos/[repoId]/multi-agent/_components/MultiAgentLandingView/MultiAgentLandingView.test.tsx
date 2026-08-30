import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/multiAgent.json";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo1" }),
  useRouter: () => ({ replace, push: vi.fn() }),
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

// `vi.hoisted` since the mock factory needs a mutable value the test bodies
// reassign per-scenario (MultiAgentResultsView.test.tsx's pattern, client
// INSIGHTS 2026-08-26).
const state = vi.hoisted(() => ({
  latest: null as { pr_number: number } | null,
  isLoading: false,
}));

vi.mock("@/lib/hooks/multi-agent-results", () => ({
  useLatestMultiAgentRunForRepo: () => ({
    data: state.latest,
    isLoading: state.isLoading,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { MultiAgentLandingView } from "./MultiAgentLandingView";

afterEach(() => {
  cleanup();
  replace.mockClear();
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      <MultiAgentLandingView />
    </NextIntlClientProvider>,
  );
}

describe("MultiAgentLandingView", () => {
  it("redirects to the repo's latest multi-agent run's results page when one exists", () => {
    state.latest = { pr_number: 482 };
    state.isLoading = false;
    renderView();

    expect(replace).toHaveBeenCalledWith("/repos/repo1/multi-agent/482");
  });

  it("redirects to Configure when the repo has never had a multi-agent run", () => {
    state.latest = null;
    state.isLoading = false;
    renderView();

    expect(replace).toHaveBeenCalledWith("/repos/repo1/multi-agent/configure");
  });

  it("does not redirect while the latest-run lookup is still loading", () => {
    state.latest = null;
    state.isLoading = true;
    renderView();

    expect(replace).not.toHaveBeenCalled();
  });
});
