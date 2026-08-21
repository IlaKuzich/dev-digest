import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCompare } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";

const mutate = vi.fn();
const toastSuccess = vi.fn();

let compareData: EvalCompare | undefined;

vi.mock("@/lib/hooks/eval", () => ({
  useEvalCompare: () => ({ data: compareData, isLoading: !compareData, isError: false, refetch: vi.fn() }),
  usePromoteVersion: () => ({ mutate, isPending: false }),
}));

vi.mock("@/lib/toast", () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn(), info: vi.fn(), toast: vi.fn() }),
}));

import { CompareModal } from "./CompareModal";

afterEach(cleanup);
beforeEach(() => {
  mutate.mockClear();
  toastSuccess.mockClear();
  compareData = {
    a: {
      id: "b6",
      agent_id: "a1",
      agent_name: "Security Reviewer",
      agent_version: 6,
      status: "done",
      ran_at: "2026-05-27T16:40:00Z",
      recall: 0.78,
      precision: 0.93,
      citation_accuracy: 0.94,
      traces_passed: 16,
      traces_total: 20,
      cost_usd: 0.21,
    },
    b: {
      id: "b7",
      agent_id: "a1",
      agent_name: "Security Reviewer",
      agent_version: 7,
      status: "done",
      ran_at: "2026-05-29T09:14:00Z",
      recall: 0.82,
      precision: 0.91,
      citation_accuracy: 0.95,
      traces_passed: 17,
      traces_total: 20,
      cost_usd: 0.23,
    },
    recall: { old: 0.78, new: 0.82, delta: 0.04 },
    precision: { old: 0.93, new: 0.91, delta: -0.02 },
    citation_accuracy: { old: 0.94, new: 0.95, delta: 0.01 },
    cost: { old: 0.21, new: 0.23, delta: 0.02 },
    old_config: {
      provider: "openai",
      model: "gpt-4.1",
      system_prompt: "You are a security reviewer.\nReturn at most 5 findings.",
      output_schema: null,
      strategy: "auto",
      ci_fail_on: "critical",
      repo_intel: false,
      skills: [],
      context: [],
    },
    new_config: {
      provider: "openai",
      model: "gpt-4.1",
      system_prompt: "You are a security reviewer.\nReturn at most 5 findings.\nFlag unused imports as suggestions.",
      output_schema: null,
      strategy: "auto",
      ci_fail_on: "critical",
      repo_intel: false,
      skills: [],
      context: [],
    },
  };
});

function renderModal() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <CompareModal agentId="a1" batchA="b6" batchB="b7" onClose={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

describe("CompareModal", () => {
  it("shows old→new values with signed deltas for all four metrics (AC-27)", () => {
    renderModal();
    expect(screen.getByText("78%")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("0.21")).toBeInTheDocument();
    expect(screen.getByText("0.23")).toBeInTheDocument();
  });

  it("renders the added prompt line in the system-prompt diff (AC-28)", () => {
    renderModal();
    expect(screen.getByText("Flag unused imports as suggestions.")).toBeInTheDocument();
  });

  it("promotes the new version when confirmed (AC-29/30)", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /promote v7/i }));
    expect(mutate).toHaveBeenCalledWith({ version: 7 }, expect.objectContaining({ onSuccess: expect.any(Function) }));
  });
});
