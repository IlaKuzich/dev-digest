/* CiTab.test.tsx — `fireEvent`, NOT `userEvent` (client INSIGHTS.md:19,46;
   `@testing-library/user-event` is not a dependency of this package). Mocks
   `@/lib/hooks/ci` with a static factory stubbing every export the CiTab
   module tree calls (CiTab itself + the `ExportWizard` it conditionally
   renders), per client INSIGHTS.md's "complete the mock's shape" lesson. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, CiInstallationsResponse } from "@devdigest/shared";
import ciMessages from "../../../../../../../../messages/en/ci.json";
import { ToastProvider } from "@/lib/toast";

const updateConfigMutate = vi.fn();
let installationsData: CiInstallationsResponse | undefined;

vi.mock("@/lib/hooks/ci", () => ({
  useCiInstallations: () => ({ data: installationsData, isLoading: false, isError: false }),
  useUpdateCiConfig: () => ({ mutate: updateConfigMutate, isPending: false }),
  useExportCiPreview: () => ({ mutate: vi.fn(), isPending: false, isError: false, data: undefined }),
  useExportCiInstall: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false, data: undefined, error: null }),
  useExportCiZip: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false, error: null }),
}));

vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { CiTab } from "./CiTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "x",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
      <ToastProvider>
        <CiTab agent={AGENT} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  updateConfigMutate.mockClear();
});

afterEach(cleanup);

describe("CiTab", () => {
  it("renders the active-repo count and one row per installation, including the no-runs-yet fallback", () => {
    installationsData = {
      active_count: 2,
      installations: [
        {
          id: "inst1",
          agent_id: "ag1",
          repo: "acme/payments-api",
          target_type: "gha",
          installed_at: "2026-08-20T00:00:00Z",
          last_run_status: "succeeded",
          last_ran_at: new Date(Date.now() - 4 * 60_000).toISOString(),
        },
        {
          id: "inst2",
          agent_id: "ag1",
          repo: "acme/billing-worker",
          target_type: "gha",
          installed_at: "2026-08-20T00:00:00Z",
          last_run_status: null,
          last_ran_at: null,
        },
      ],
    };

    renderTab();

    expect(screen.getByText("Active in 2 repos")).toBeInTheDocument();
    expect(screen.getByText("acme/payments-api")).toBeInTheDocument();
    expect(screen.getByText("acme/billing-worker")).toBeInTheDocument();
    expect(screen.getByText("No runs yet")).toBeInTheDocument();
    // "Update CI config" is enabled once at least one repo is active.
    expect(screen.getByRole("button", { name: /update ci config/i })).toBeEnabled();
  });

  it("disables Update CI config with a tooltip when there are no installations yet", () => {
    installationsData = { active_count: 0, installations: [] };

    renderTab();

    expect(screen.getByText("Active in 0 repos")).toBeInTheDocument();
    const updateBtn = screen.getByRole("button", { name: /update ci config/i });
    expect(updateBtn).toBeDisabled();
    expect(updateBtn.parentElement).toHaveAttribute("title", "No repos yet — use Add to CI");
  });
});
