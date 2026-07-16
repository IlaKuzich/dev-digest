import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastResponse } from "@/lib/hooks/blast";
import messages from "../../../../../../../../../../messages/en/blast.json";

const FULL_RESPONSE: BlastResponse = {
  changed_symbols: [
    { name: "chargeCard", file: "src/billing/charge.ts", kind: "function" },
    { name: "unusedHelper", file: "src/billing/charge.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "chargeCard",
      callers: [
        { name: "handleCheckout", file: "src/routes/checkout.ts", line: 42 },
        { name: "retryJob", file: "src/jobs/retryBilling.ts", line: 10 },
      ],
      endpoints_affected: ["POST /checkout"],
      crons_affected: ["nightly-retry"],
    },
  ],
  summary: "",
  index_state: { status: "full", filesIndexed: 120, filesSkipped: 0 },
  prior_prs: [
    { id: "p9", number: 9, title: "Earlier billing refactor", author: "ada", merged_at: "2026-05-01T00:00:00Z" },
  ],
  coverage: { changed_code_files: 1, analyzed_files: 1, unanalyzed_files: [] },
};

const DEGRADED_RESPONSE: BlastResponse = {
  changed_symbols: [{ name: "chargeCard", file: "src/billing/charge.ts", kind: "function" }],
  downstream: [
    {
      symbol: "chargeCard",
      callers: [{ name: "handleCheckout", file: "src/routes/checkout.ts", line: 42 }],
      endpoints_affected: ["POST /checkout"],
      crons_affected: [],
    },
  ],
  summary: "",
  index_state: { status: "degraded", filesIndexed: 0, filesSkipped: 0, degraded: true, degradedReason: "no_data" },
  prior_prs: [],
  coverage: { changed_code_files: 1, analyzed_files: 1, unanalyzed_files: [] },
};

/** Degraded AND nothing indexed — the case that used to render a bare
    "No blast radius data" with no reason at all. */
const DEGRADED_EMPTY_RESPONSE: BlastResponse = {
  changed_symbols: [],
  downstream: [],
  summary: "",
  index_state: {
    status: "partial",
    filesIndexed: 3,
    filesSkipped: 40,
    degraded: true,
    degradedReason: "index_partial",
  },
  prior_prs: [],
  coverage: { changed_code_files: 2, analyzed_files: 0, unanalyzed_files: ["a.ts", "b.ts"] },
};

/** Index claims to be `full` but recorded nothing for these files — in
    practice a stale snapshot, NOT "nothing is affected". */
const EMPTY_BUT_FULL_RESPONSE: BlastResponse = {
  changed_symbols: [],
  downstream: [],
  summary: "",
  index_state: { status: "full", filesIndexed: 133, filesSkipped: 0 },
  prior_prs: [],
  coverage: { changed_code_files: 0, analyzed_files: 0, unanalyzed_files: [] },
};

/** The IlaKuzich/next_js_harness_testing#3 shape: a +1592-line, 22-file PR that
    is almost entirely NEW files, so a healthy `full` index legitimately knows
    about only 2 of them. Without the coverage line this reads as "nothing is
    affected". */
const MOSTLY_NEW_FILES_RESPONSE: BlastResponse = {
  changed_symbols: [{ name: "HeaderUserDropdown", file: "src/ui/components/header/header-user.tsx", kind: "function" }],
  downstream: [
    {
      symbol: "HeaderUserDropdown",
      callers: [{ name: "Header", file: "src/ui/components/header/header.tsx", line: 12 }],
      endpoints_affected: [],
      crons_affected: [],
    },
  ],
  summary: "",
  index_state: { status: "full", filesIndexed: 133, filesSkipped: 0 },
  prior_prs: [],
  coverage: {
    changed_code_files: 20,
    analyzed_files: 2,
    unanalyzed_files: ["src/api/orders/service.ts", "src/app/api/orders/route.ts"],
  },
};

let mockResult: { data: BlastResponse | undefined; isLoading: boolean; isError?: boolean; refetch?: () => void };

// useExplainBlast (T4) is stubbed as an idle mutation — BlastCard calls it
// unconditionally per the rules of hooks. Not exercised by these flows.
vi.mock("@/lib/hooks/blast", () => ({
  useBlast: () => mockResult,
  useExplainBlast: () => ({ mutate: vi.fn(), isPending: false, isError: false, data: undefined }),
}));

// mermaid is ESM-only and does real DOM/SVG work; the graph view asserts on
// the chart source it is handed, not on mermaid's rendering.
vi.mock("@/components/mermaid-diagram/MermaidDiagram", () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => <pre data-testid="chart">{chart}</pre>,
}));

import { BlastCard } from "./BlastCard";

afterEach(cleanup);

function renderCard(props?: { repoFullName?: string | null }) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastCard
        prId="pr1"
        repoFullName={props?.repoFullName === undefined ? "acme/payments-api" : props.repoFullName}
        headSha="abc123"
      />
    </NextIntlClientProvider>,
  );
}

describe("BlastCard", () => {
  it("renders the tree inline: stats, symbol rows, and callers deep-linking to GitHub on expand", () => {
    mockResult = { data: FULL_RESPONSE, isLoading: false };
    renderCard();

    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    expect(screen.getByText("symbols")).toBeInTheDocument();
    expect(screen.getByText("callers")).toBeInTheDocument();

    // Callers are hidden until the symbol row is expanded.
    expect(screen.queryByText(/handleCheckout/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /expand callers of chargeCard/i }));

    expect(screen.getByText("handleCheckout")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /handleCheckout/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/abc123/src/routes/checkout.ts#L42",
    );
    expect(screen.getByText("POST /checkout")).toBeInTheDocument();
    expect(screen.getByText("nightly-retry")).toBeInTheDocument();

    // The changed symbol with no callers is reported, not silently dropped.
    expect(screen.getByText(/1 changed symbol/i)).toBeInTheDocument();
  });

  it("switches to graph mode and hands mermaid an impact-ordered chart", () => {
    mockResult = { data: FULL_RESPONSE, isLoading: false };
    renderCard();

    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /graph/i }));

    const chart = screen.getByTestId("chart").textContent ?? "";
    expect(chart.startsWith("flowchart LR")).toBe(true);
    expect(chart).toContain("chargeCard");
    expect(chart).toContain("handleCheckout");
    // Impact order: symbol → caller, and untrusted text never lands in an id.
    expect(chart).toMatch(/n0 --> n1/);
  });

  it("shows the degradation badge and labels crons unknown, never a fabricated 0", () => {
    mockResult = { data: DEGRADED_RESPONSE, isLoading: false };
    renderCard();

    expect(screen.getByText("Index incomplete")).toBeInTheDocument();
    expect(screen.getByText(/No index has been built for this repo yet/i)).toBeInTheDocument();
    // "unknown" shows in BOTH the stat strip and the symbol's cron chip —
    // every place a fabricated "0" could otherwise have appeared.
    expect(screen.getAllByText("unknown").length).toBeGreaterThan(0);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    // Still renders the map — never a bare empty card.
    expect(screen.getByText("chargeCard")).toBeInTheDocument();
  });

  it("explains itself when the index is degraded AND has no symbols — never a bare empty screen", () => {
    mockResult = { data: DEGRADED_EMPTY_RESPONSE, isLoading: false };
    renderCard();

    // The requirement: partial/degraded → badge + explanation, not an empty screen.
    expect(screen.getByText("Index incomplete")).toBeInTheDocument();
    expect(screen.getByText(/The index is only partially built/i)).toBeInTheDocument();
  });

  it("does not claim 'nothing is affected' when a full index simply has no symbols for these files", () => {
    mockResult = { data: EMPTY_BUT_FULL_RESPONSE, isLoading: false };
    renderCard();

    // A full-but-empty index most likely means a stale snapshot. Saying
    // "nothing is affected" here would be a lie.
    expect(screen.getByText(/indexed snapshot is behind this PR/i)).toBeInTheDocument();
    expect(screen.queryByText("Index incomplete")).not.toBeInTheDocument();
  });

  it("explains a small map on a big PR: says how many changed files it could analyze", () => {
    mockResult = { data: MOSTLY_NEW_FILES_RESPONSE, isLoading: false };
    renderCard();

    // The index is healthy — so this is NOT the degradation badge...
    expect(screen.queryByText("Index incomplete")).not.toBeInTheDocument();
    // ...but the reader still has to know the map covers 2 of 20 files.
    expect(screen.getByText(/2 of 20 changed code files analyzed/i)).toBeInTheDocument();
    expect(screen.getByText(/new in this PR, so nothing calls them yet/i)).toBeInTheDocument();
  });

  it("stays quiet about coverage when every changed code file was analyzed", () => {
    mockResult = { data: FULL_RESPONSE, isLoading: false };
    renderCard();

    // Full coverage → no caveat; it would be noise.
    expect(screen.queryByText(/changed code files analyzed/i)).not.toBeInTheDocument();
  });

  it("lists prior PRs touching the same files, and renders nothing when there are none", () => {
    mockResult = { data: FULL_RESPONSE, isLoading: false };
    const { unmount } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: /expand prior PRs/i }));
    expect(screen.getByText("Earlier billing refactor")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Earlier billing refactor/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/pull/9",
    );
    unmount();

    // Empty history is not a degraded state — it renders nothing at all.
    mockResult = { data: DEGRADED_RESPONSE, isLoading: false };
    renderCard();
    expect(screen.queryByText(/Prior PRs touching these files/i)).not.toBeInTheDocument();
  });
});
