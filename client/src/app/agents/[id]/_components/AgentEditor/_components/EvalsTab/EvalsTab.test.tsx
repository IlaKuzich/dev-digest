/* EvalsTab.test.tsx — `fireEvent`, NOT `userEvent` (client INSIGHTS.md:19,46;
   `@testing-library/user-event` is not a dependency of this package). */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import type { AgentEvalDashboard } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/eval.json";
import type { EvalCaseWithLastRun } from "@/lib/hooks/eval-cases";

const runAllMutate = vi.fn();
const runCaseMutate = vi.fn();
const deleteCaseMutate = vi.fn();
let dashboardData: AgentEvalDashboard | undefined;
let casesData: EvalCaseWithLastRun[] | undefined;

vi.mock("@/lib/hooks/eval-cases", () => ({
  useAgentEvalDashboard: () => ({ data: dashboardData }),
  useEvalCases: () => ({ data: casesData }),
  useRunAllEvals: () => ({ mutate: runAllMutate, isPending: false }),
  useRunEvalCase: () => ({ mutate: runCaseMutate, isPending: false }),
  useDeleteEvalCase: () => ({ mutate: deleteCaseMutate, isPending: false }),
  useCreateEvalCase: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEvalCase: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { EvalsTab } from "./EvalsTab";

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
  version: 7,
};

const DASHBOARD: AgentEvalDashboard = {
  agent_id: "ag1",
  agent_name: "Security Reviewer",
  provider: "openai",
  model: "gpt-4.1",
  current: { recall: 0.82, precision: 0.91, citation_accuracy: 0.95, traces_passed: 17, traces_total: 20, cost_usd: 0.04 },
  delta: { recall: 0.04, precision: -0.02, citation_accuracy: 0.01 },
  trend: [],
  recent_runs: [],
  alert: null,
};

const CASES: EvalCaseWithLastRun[] = [
  {
    id: "c1",
    owner_kind: "agent",
    owner_id: "ag1",
    name: "stripe-key-leak",
    input_diff: "diff",
    input_files: null,
    input_meta: null,
    expected_output: [{ severity: "CRITICAL", category: "security", title: "x", file: "a.ts", start_line: 1 }],
    notes: null,
    last_run: {
      pass: true,
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
      duration_ms: 1800,
      cost_usd: 0.02,
      actual_output: [{ file: "a.ts", start_line: 1, end_line: 1 }],
      ran_at: "2026-07-20T00:00:00Z",
    },
  },
  {
    id: "c2",
    owner_kind: "agent",
    owner_id: "ag1",
    name: "clean-refactor-no-flags",
    input_diff: "diff",
    input_files: null,
    input_meta: null,
    expected_output: [],
    notes: null,
    last_run: { pass: true, recall: null, precision: 1, citation_accuracy: 1, duration_ms: 900, cost_usd: 0.01, actual_output: [], ran_at: "2026-07-20T00:00:00Z" },
  },
  {
    id: "c3",
    owner_kind: "agent",
    owner_id: "ag1",
    name: "service-role-in-client",
    input_diff: "diff",
    input_files: null,
    input_meta: null,
    expected_output: [{ severity: "CRITICAL", category: "security", title: "x", file: "b.ts", start_line: 4 }],
    notes: null,
    last_run: null,
  },
];

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  runAllMutate.mockClear();
  runCaseMutate.mockClear();
  deleteCaseMutate.mockClear();
  dashboardData = DASHBOARD;
  casesData = CASES;
});

afterEach(cleanup);

describe("EvalsTab", () => {
  it("renders the metric tiles from the dashboard and every eval case with its state", () => {
    const { container } = renderTab();

    // Four tiles (AC-8).
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("95%")).toBeInTheDocument();
    expect(screen.getByText("17/20")).toBeInTheDocument();

    // Cases list (AC-9) + passing pill (AC-10): 2 of the 3 cases have a last
    // run and both passed → "2 / 2 passing".
    expect(screen.getByText("stripe-key-leak")).toBeInTheDocument();
    expect(screen.getByText("clean-refactor-no-flags")).toBeInTheDocument();
    expect(screen.getByText("service-role-in-client")).toBeInTheDocument();
    expect(screen.getByText("2 / 2 passing")).toBeInTheDocument();

    // A never-run case shows the neutral "never run" state (AC-17), not an
    // expected/got summary.
    expect(screen.getByText("never run")).toBeInTheDocument();
    expect(screen.getByText("expected 1 finding(s), got 1")).toBeInTheDocument();
    expect(screen.getByText("empty []")).toBeInTheDocument();

    // The never-run row renders the distinct neutral state (not "pass"/"fail").
    expect(container.querySelector('[data-case-state="never-run"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-case-state="pass"]')).toHaveLength(2);
  });

  it("runs a single case via its own run control without affecting the others, and Run all evals fires the batch mutation", () => {
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: /run stripe-key-leak/i }));
    expect(runCaseMutate).toHaveBeenCalledWith("c1", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: /run all evals/i }));
    expect(runAllMutate).toHaveBeenCalledTimes(1);
  });

  it("delete control removes only that case's row action, and edit opens the case editor modal", () => {
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: /delete stripe-key-leak/i }));
    expect(deleteCaseMutate).toHaveBeenCalledWith("c1");

    fireEvent.click(screen.getByRole("button", { name: /edit stripe-key-leak/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
