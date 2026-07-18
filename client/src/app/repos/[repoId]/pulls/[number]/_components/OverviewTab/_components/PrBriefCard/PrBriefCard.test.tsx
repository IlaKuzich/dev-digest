/* PrBriefCard.test.tsx — mocks @/lib/hooks/brief the same way BlastCard.test.tsx
   / ResyncButton.test.tsx mock their hooks: a controllable `mockResult` for the
   query and a `vi.fn()` spy for the mutation's `mutate`. Counting `mutate` calls
   is this codebase's established proxy for "how many POSTs fired" (see
   ResyncButton.test.tsx `expect(resyncMutate).toHaveBeenCalledTimes(1)`).
   `fireEvent`, not `userEvent` — the latter is not a dependency here
   (client INSIGHTS.md:19,46). */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Brief, BriefEnvelope } from "@devdigest/shared";
import type { PrReviewSummary } from "./helpers";
import messages from "../../../../../../../../../../messages/en/brief.json";

const BRIEF: Brief = {
  what: "Adds rate limiting middleware to the public API endpoints.",
  why: "Prevents abuse from unauthenticated clients hitting public endpoints.",
  risk_level: "high",
  risks: [
    {
      kind: "secret",
      title: "Stripe secret key committed in plaintext",
      explanation: "A live Stripe key is committed in config.",
      severity: "high",
      file_refs: ["src/config.ts:12"],
    },
    {
      kind: "perf",
      title: "N+1 query under the new limiter",
      explanation: "Adds a per-user lookup that will be hit harder under the rate limiter.",
      severity: "medium",
      file_refs: ["src/api/users.ts:46"],
    },
  ],
  review_focus: [
    {
      file_ref: "src/middleware/ratelimit.ts",
      line: 52,
      reason: "429 branch omits the Retry-After header the PR scope promises",
    },
    {
      file_ref: "src/api/public/webhooks.ts",
      line: 61,
      reason: "callback_url forwards the account token to a caller-controlled URL",
    },
  ],
};

const ENVELOPE: BriefEnvelope = { brief: BRIEF, generated_at: "2026-07-17T10:00:00Z", stale: false };
const STALE_ENVELOPE: BriefEnvelope = { ...ENVELOPE, stale: true };
const EMPTY_ENVELOPE: BriefEnvelope = {
  brief: { what: "Small fix.", why: "Typo.", risk_level: "low", risks: [], review_focus: [] },
  generated_at: "2026-07-17T10:00:00Z",
  stale: false,
};

const NO_REVIEW: PrReviewSummary = {
  verdict: null,
  score: null,
  costUsd: null,
  findingsCount: 0,
  blockers: 0,
};
const REVIEW: PrReviewSummary = {
  verdict: "request_changes",
  score: 61,
  costUsd: 0.014,
  findingsCount: 6,
  blockers: 2,
};

let mockResult: {
  data: BriefEnvelope | null | undefined;
  isLoading: boolean;
  isError?: boolean;
  refetch?: () => void;
};
const regenerateMutate = vi.fn();
const focusDiffLine = vi.fn();
let regenerateState: { mutate: () => void; isPending: boolean; isError: boolean };

vi.mock("@/lib/hooks/brief", () => ({
  useBrief: () => mockResult,
  useRegenerateBrief: () => regenerateState,
}));

import { PrBriefCard } from "./PrBriefCard";

beforeEach(() => {
  regenerateMutate.mockClear();
  focusDiffLine.mockClear();
  regenerateState = { mutate: regenerateMutate, isPending: false, isError: false };
});

afterEach(cleanup);

function cardEl(props?: {
  prId?: string | null;
  repoFullName?: string | null;
  reviewSummary?: PrReviewSummary;
}) {
  return (
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <PrBriefCard
        prId={props?.prId === undefined ? "pr1" : props.prId}
        repoFullName={props?.repoFullName === undefined ? "acme/payments-api" : props.repoFullName}
        headSha="abc123"
        reviewSummary={props?.reviewSummary ?? NO_REVIEW}
        onFocusDiffLine={focusDiffLine}
      />
    </NextIntlClientProvider>
  );
}

function renderCard(props?: { prId?: string | null; repoFullName?: string | null; reviewSummary?: PrReviewSummary }) {
  return render(cardEl(props));
}

describe("PrBriefCard", () => {
  it("renders a non-interactive placeholder and issues no request when prId is null", () => {
    mockResult = { data: undefined, isLoading: false };
    renderCard({ prId: null });

    expect(screen.getByText("Open a PR to see its brief.")).toBeInTheDocument();
    expect(regenerateMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /regenerate/i })).not.toBeInTheDocument();
  });

  it("renders the loaded brief: color-coded risk_level with a text label, review_focus rows (internal file buttons) with reasons, and risk rows with severity + github file links", () => {
    mockResult = { data: ENVELOPE, isLoading: false };
    renderCard();

    // risk_level: a visible text label accompanies the color (never color alone).
    expect(screen.getByText("Risk level")).toBeInTheDocument();
    expect(screen.getAllByText("High risk").length).toBeGreaterThan(0);

    // review_focus rows: an INTERNAL button (not a github link) + its reason.
    expect(screen.getByRole("button", { name: "src/middleware/ratelimit.ts:52" })).toBeInTheDocument();
    expect(screen.getByText(/429 branch omits the Retry-After header/)).toBeInTheDocument();

    // risks rows: severity badge + explanation + a (github) link per file_ref.
    expect(screen.getByText("N+1 query under the new limiter")).toBeInTheDocument();
    const riskLink = screen.getByRole("link", { name: "src/api/users.ts:46" });
    expect(riskLink).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/abc123/src/api/users.ts#L46",
    );
    expect(regenerateMutate).not.toHaveBeenCalled();
  });

  it("review-focus click opens the INTERNAL Files-changed tab (onFocusDiffLine with file+line), not GitHub", () => {
    mockResult = { data: ENVELOPE, isLoading: false };
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "src/middleware/ratelimit.ts:52" }));
    expect(focusDiffLine).toHaveBeenCalledWith("src/middleware/ratelimit.ts", 52);
    // Review-focus is no longer a github link.
    expect(
      screen.queryByRole("link", { name: "src/middleware/ratelimit.ts:52" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a non-file review-focus ref (endpoint) as plain text, not an internal link", () => {
    const withEndpoint: Brief = {
      ...BRIEF,
      review_focus: [{ file_ref: "GET /api/public/items", line: null, reason: "rate-limited path" }],
    };
    mockResult = { data: { brief: withEndpoint, generated_at: "now", stale: false }, isLoading: false };
    renderCard();

    expect(screen.queryByRole("button", { name: "GET /api/public/items" })).not.toBeInTheDocument();
    expect(screen.getByText("GET /api/public/items")).toBeInTheDocument();
  });

  it("renders the review header band — aggregate verdict, PR score, cost, and findings·blockers — when a review exists", () => {
    mockResult = { data: ENVELOPE, isLoading: false };
    renderCard({ reviewSummary: REVIEW });

    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText(/6 findings/)).toBeInTheDocument();
    expect(screen.getByText(/· 2 blockers/)).toBeInTheDocument();
    expect(screen.getByText("PR score")).toBeInTheDocument();
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("renders an 'Approve' verdict when the review has no blockers", () => {
    mockResult = { data: ENVELOPE, isLoading: false };
    renderCard({ reviewSummary: { verdict: "approve", score: 95, costUsd: 0.002, findingsCount: 0, blockers: 0 } });

    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.queryByText("Request changes")).not.toBeInTheDocument();
  });

  it("omits the review band when there is no review yet (no score, no findings)", () => {
    mockResult = { data: ENVELOPE, isLoading: false };
    renderCard({ reviewSummary: NO_REVIEW });

    expect(screen.queryByText("PR score")).not.toBeInTheDocument();
    expect(screen.queryByText(/findings/)).not.toBeInTheDocument();
  });

  it("shows explicit 'none flagged' copy for empty risks and review_focus, never a blank region", () => {
    mockResult = { data: EMPTY_ENVELOPE, isLoading: false };
    renderCard();

    expect(screen.getByText("No grounded risks flagged.")).toBeInTheDocument();
    expect(screen.getByText("No specific files flagged for focused review.")).toBeInTheDocument();
  });

  it("shows a STALE badge and Regenerate prompt without auto-regenerating", () => {
    mockResult = { data: STALE_ENVELOPE, isLoading: false };
    renderCard();

    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(screen.getByText(/new commits since the brief was generated/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /regenerate/i })).toBeInTheDocument();
    expect(regenerateMutate).not.toHaveBeenCalled();
  });

  it("clicking Regenerate fires the mutation once, and disables/shows loading while pending", () => {
    mockResult = { data: ENVELOPE, isLoading: false };
    const { rerender } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));
    expect(regenerateMutate).toHaveBeenCalledTimes(1);

    regenerateState = { mutate: regenerateMutate, isPending: true, isError: false };
    rerender(cardEl());
    expect(screen.getByRole("button", { name: /regenerate/i })).toBeDisabled();
  });

  it("auto-generates exactly once when there is no cache, and never fires again across re-renders", async () => {
    mockResult = { data: null, isLoading: false };
    const { rerender } = renderCard();

    expect(screen.getByText("Generating brief…")).toBeInTheDocument();
    await waitFor(() => expect(regenerateMutate).toHaveBeenCalledTimes(1));

    // Re-render several times with the same (still-null) data — must not
    // fire a second POST (AC-25 client-side guard).
    for (let i = 0; i < 3; i++) {
      rerender(cardEl());
    }
    await waitFor(() => expect(regenerateMutate).toHaveBeenCalledTimes(1));
  });

  it("shows an error state with retry when the initial GET fails, and refetches on retry", () => {
    const refetch = vi.fn();
    mockResult = { data: undefined, isLoading: false, isError: true, refetch };
    renderCard();

    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't generate the brief/i);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows an error + retry when first-open auto-generation fails (no cache to fall back to)", () => {
    mockResult = { data: null, isLoading: false };
    regenerateState = { mutate: regenerateMutate, isPending: false, isError: true };
    renderCard();

    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't generate the brief/i);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(regenerateMutate).toHaveBeenCalledTimes(1);
  });

  it("keeps the cached brief visible and surfaces an inline error when Regenerate fails (cache preserved)", () => {
    mockResult = { data: ENVELOPE, isLoading: false };
    regenerateState = { mutate: regenerateMutate, isPending: false, isError: true };
    renderCard();

    // The prior brief is still rendered — a failed regenerate must not erase it.
    expect(screen.getAllByText("High risk").length).toBeGreaterThan(0);
    expect(screen.getByRole("alert")).toHaveTextContent(/something went wrong generating the pr brief/i);
  });

  it("renders model text (what/why) as inert data — no dangerouslySetInnerHTML, and raw HTML never executes", () => {
    const hostile: Brief = {
      ...BRIEF,
      what: "Summary with <script>window.__pwned = true</script> embedded.",
    };
    mockResult = { data: { brief: hostile, generated_at: "now", stale: false }, isLoading: false };
    renderCard();

    // react-markdown (no rehype-raw) renders the tag as literal text, not a
    // live DOM node — nothing runs, and no <script> element is created.
    expect(document.querySelectorAll("script").length).toBe(0);
    expect(screen.getByText(/<script>window\.__pwned = true<\/script>/)).toBeInTheDocument();
  });
});
