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

let mockResult: {
  data: BriefEnvelope | null | undefined;
  isLoading: boolean;
  isError?: boolean;
  refetch?: () => void;
};
const regenerateMutate = vi.fn();
let regenerateState: { mutate: () => void; isPending: boolean; isError: boolean };

vi.mock("@/lib/hooks/brief", () => ({
  useBrief: () => mockResult,
  useRegenerateBrief: () => regenerateState,
}));

import { PrBriefCard } from "./PrBriefCard";

beforeEach(() => {
  regenerateMutate.mockClear();
  regenerateState = { mutate: regenerateMutate, isPending: false, isError: false };
});

afterEach(cleanup);

function renderCard(props?: { prId?: string | null; repoFullName?: string | null }) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <PrBriefCard
        prId={props?.prId === undefined ? "pr1" : props.prId}
        repoFullName={props?.repoFullName === undefined ? "acme/payments-api" : props.repoFullName}
        headSha="abc123"
      />
    </NextIntlClientProvider>,
  );
}

describe("PrBriefCard", () => {
  it("renders a non-interactive placeholder and issues no request when prId is null", () => {
    mockResult = { data: undefined, isLoading: false };
    renderCard({ prId: null });

    expect(screen.getByText("Open a PR to see its brief.")).toBeInTheDocument();
    expect(regenerateMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /regenerate/i })).not.toBeInTheDocument();
  });

  it("renders the loaded brief: color-coded risk_level with a text label, review_focus rows linking to files with reasons, and risk rows with severity + file links", () => {
    mockResult = { data: ENVELOPE, isLoading: false };
    renderCard();

    // risk_level: a visible text label accompanies the color (never color alone).
    expect(screen.getByText("Risk level")).toBeInTheDocument();
    expect(screen.getAllByText("High risk").length).toBeGreaterThan(0);

    // review_focus rows: file link (+ line) plus its reason.
    const focusLink = screen.getByRole("link", { name: "src/middleware/ratelimit.ts:52" });
    expect(focusLink).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/abc123/src/middleware/ratelimit.ts#L52",
    );
    expect(screen.getByText(/429 branch omits the Retry-After header/)).toBeInTheDocument();

    // risks rows: severity badge + explanation + a link per file_ref.
    expect(screen.getByText("N+1 query under the new limiter")).toBeInTheDocument();
    const riskLink = screen.getByRole("link", { name: "src/api/users.ts:46" });
    expect(riskLink).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/abc123/src/api/users.ts#L46",
    );
    expect(regenerateMutate).not.toHaveBeenCalled();
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
    rerender(
      <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
        <PrBriefCard prId="pr1" repoFullName="acme/payments-api" headSha="abc123" />
      </NextIntlClientProvider>,
    );
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
      rerender(
        <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
          <PrBriefCard prId="pr1" repoFullName="acme/payments-api" headSha="abc123" />
        </NextIntlClientProvider>,
      );
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
