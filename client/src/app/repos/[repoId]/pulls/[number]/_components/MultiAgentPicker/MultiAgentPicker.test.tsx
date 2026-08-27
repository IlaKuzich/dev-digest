import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/multiAgent.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const agents = [
  { id: "a1", name: "Security", model: "gpt-4.1", enabled: true },
  { id: "a2", name: "Performance", model: "gpt-4.1", enabled: true },
];
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: agents }),
}));

const mutate = vi.fn();
vi.mock("@/lib/hooks/multi-agent", () => ({
  useAgentEstimates: () => ({
    data: [
      { agent_id: "a1", agent_name: "Security", runs: 4, avg_duration_ms: 6000, avg_cost_usd: 0.05, summary: null },
      { agent_id: "a2", agent_name: "Performance", runs: 0, avg_duration_ms: null, avg_cost_usd: null, summary: null },
    ],
  }),
  useTriggerMultiAgentRun: () => ({ mutate, isPending: false }),
}));

import { MultiAgentPicker } from "./MultiAgentPicker";

afterEach(() => {
  cleanup();
  push.mockClear();
  mutate.mockClear();
});

function renderPicker() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      <MultiAgentPicker prId="pr1" prNumber={482} repoId="repo1" />
    </NextIntlClientProvider>,
  );
}

describe("MultiAgentPicker", () => {
  it("shows one row per agent with its time estimate, updates the trigger count as rows are toggled, and disables the trigger at zero", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /run multi-agent review/i }));

    // AC-1: one row per agent, each with its own time estimate.
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("~6.0s")).toBeInTheDocument();
    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.getByText("no history yet")).toBeInTheDocument();

    // AC-7: both selected by default → footer reads (2).
    const footer = screen.getByRole("button", { name: /run multi-agent review \(2\)/i });
    expect(footer).toBeInTheDocument();
    expect(footer).not.toBeDisabled();

    // Deselect both agents → AC-8: trigger disables at zero.
    for (const cb of screen.getAllByRole("checkbox")) fireEvent.click(cb);
    const disabledFooter = screen.getByRole("button", { name: /run multi-agent review \(0\)/i });
    expect(disabledFooter).toBeDisabled();
  });

  it("navigates to Configure run with the current PR preselected (AC-31)", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /run multi-agent review/i }));
    fireEvent.click(screen.getByRole("button", { name: /configure agents/i }));
    expect(push).toHaveBeenCalledWith("/repos/repo1/multi-agent/configure?pr=482");
  });
});
