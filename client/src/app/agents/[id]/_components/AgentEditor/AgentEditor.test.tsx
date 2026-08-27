import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, CiInstallationsResponse } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import ciMessages from "../../../../../../messages/en/ci.json";
import { ToastProvider } from "../../../../../lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

// The CI tab (AC-17) pulls in `@/lib/hooks/ci` — stub every export the CiTab
// + ExportWizard module tree calls (client INSIGHTS.md's "complete the
// mock's shape" lesson), so switching to the CI tab doesn't throw.
let installationsData: CiInstallationsResponse | undefined;
vi.mock("@/lib/hooks/ci", () => ({
  useCiInstallations: () => ({ data: installationsData, isLoading: false, isError: false }),
  useUpdateCiConfig: () => ({ mutate: vi.fn(), isPending: false }),
  useExportCiPreview: () => ({ mutate: vi.fn(), isPending: false, isError: false, data: undefined }),
  useExportCiInstall: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false, data: undefined, error: null }),
  useExportCiZip: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false, error: null }),
}));

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages, ci: ciMessages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  installationsData = { active_count: 0, installations: [] };
});

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields and the CI tab (AC-17)", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
    // The CI tab is part of the tab bar regardless of which tab is active.
    expect(screen.getByText("CI")).toBeInTheDocument();
  });

  it("switches to the CI tab and renders its content", () => {
    let tab = "config";
    const { rerender } = renderWithIntl(
      <AgentEditor agent={AGENT} tab={tab} onTab={(t) => (tab = t)} />,
    );

    fireEvent.click(screen.getByText("CI"));
    rerender(
      <NextIntlClientProvider locale="en" messages={{ agents: messages, ci: ciMessages }}>
        <ToastProvider>
          <AgentEditor agent={AGENT} tab={tab} onTab={(t) => (tab = t)} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("CI deployment")).toBeInTheDocument();
    expect(screen.getByText("Active in 0 repos")).toBeInTheDocument();
  });
});
