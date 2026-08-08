import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Brief } from "@devdigest/shared";
import type { RunSummary } from "@devdigest/shared";
import briefMessages from "../../../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../../../messages/en/prReview.json";

const HIGH_RISK_BRIEF: Brief = {
  risk_level: "high",
  what: "Adds a token-bucket rate limiter to the public API.",
  why: "A committed secret and an N+1 query block merge.",
  risks: [],
  review_focus: [{ file: "src/config.ts", line: 12, reason: "live Stripe key committed in plaintext" }],
};

const DONE_RUN: RunSummary = {
  run_id: "run1",
  agent_id: "agent1",
  agent_name: "Reviewer",
  provider: "openai",
  model: "gpt-4.1",
  status: "done",
  error: null,
  duration_ms: 4200,
  tokens_in: 8200,
  tokens_out: 1300,
  findings_count: 6,
  grounding: null,
  ran_at: "2026-08-08T00:00:00.000Z",
  score: 61,
  blockers: 2,
  cost_usd: 0.014,
};

let mockBriefResult: {
  data: Brief | null | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
};
let mockGenResult: { mutate: ReturnType<typeof vi.fn>; isPending: boolean };
let mockRunsResult: { data: RunSummary[] | undefined };

vi.mock("@/lib/hooks/brief", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks/brief")>();
  return {
    ...actual,
    useBrief: () => mockBriefResult,
    useGenerateBrief: () => mockGenResult,
  };
});

vi.mock("@/lib/hooks/reviews", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks/reviews")>();
  return {
    ...actual,
    usePrRuns: () => mockRunsResult,
  };
});

import { PrBriefCard } from "./PrBriefCard";

afterEach(cleanup);

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, prReview: prReviewMessages }}>
      <PrBriefCard prId="pr1" />
    </NextIntlClientProvider>,
  );
}

describe("PrBriefCard", () => {
  it("shows an explicit Generate prompt when no Brief has been generated yet, and Generate triggers the mutation", () => {
    mockBriefResult = { data: null, isLoading: false, isError: false };
    mockGenResult = { mutate: vi.fn(), isPending: false };
    mockRunsResult = { data: [] };
    renderCard();

    expect(screen.getByText("No brief generated yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /generate brief/i }));
    expect(mockGenResult.mutate).toHaveBeenCalledTimes(1);
  });

  it("renders the risk headline, findings/blockers, score, and cost/tokens when a completed run exists", () => {
    mockBriefResult = { data: HIGH_RISK_BRIEF, isLoading: false, isError: false };
    mockGenResult = { mutate: vi.fn(), isPending: false };
    mockRunsResult = { data: [DONE_RUN] };
    renderCard();

    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(screen.getByText(/6 findings/)).toBeInTheDocument();
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
    expect(screen.getByText("PR score")).toBeInTheDocument();
    expect(screen.getByText(/\$0\.014/)).toBeInTheDocument();
    expect(screen.getByText(/8\.2K.*1\.3K/)).toBeInTheDocument();
    expect(screen.getByText(HIGH_RISK_BRIEF.what)).toBeInTheDocument();
    expect(screen.getByText(HIGH_RISK_BRIEF.why)).toBeInTheDocument();
  });

  it("omits findings/blockers/score/cost when no completed run exists, without erroring", () => {
    mockBriefResult = { data: HIGH_RISK_BRIEF, isLoading: false, isError: false };
    mockGenResult = { mutate: vi.fn(), isPending: false };
    mockRunsResult = { data: [] };
    renderCard();

    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(screen.getByText(HIGH_RISK_BRIEF.what)).toBeInTheDocument();
    expect(screen.queryByText("PR score")).not.toBeInTheDocument();
    expect(screen.queryByText(/findings/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("renders a degraded error state with a Regenerate action instead of crashing or going blank", () => {
    mockBriefResult = { data: undefined, isLoading: false, isError: true, error: new Error("boom") };
    mockGenResult = { mutate: vi.fn(), isPending: false };
    mockRunsResult = { data: [] };
    renderCard();

    expect(screen.getByText("Couldn't generate the brief")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: /regenerate/i });
    fireEvent.click(retry);
    expect(mockGenResult.mutate).toHaveBeenCalledTimes(1);
  });
});
