import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastResponse } from "@/lib/hooks/blast";
import messages from "../../../../../../../../messages/en/blast.json";

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
};

const EMPTY_RESPONSE: BlastResponse = {
  changed_symbols: [],
  downstream: [],
  summary: "",
  index_state: { status: "full", filesIndexed: 5, filesSkipped: 0 },
};

let mockResult: {
  data: BlastResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

vi.mock("@/lib/hooks/blast", () => ({
  useBlast: () => mockResult,
}));

import { BlastTab } from "./BlastTab";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("BlastTab", () => {
  it("renders the tree and expanding a symbol reveals its callers with a correct GitHub deep-link", () => {
    mockResult = { data: FULL_RESPONSE, isLoading: false, isError: false, refetch: vi.fn() };
    renderWithIntl(
      <BlastTab prId="pr1" repoFullName="acme/payments-api" headSha="deadbeef" />,
    );

    expect(screen.getByText("chargeCard")).toBeInTheDocument();
    // Collapsed by default — caller rows are not yet rendered.
    expect(screen.queryByText("handleCheckout")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /expand callers of chargecard/i }));

    expect(screen.getByText("handleCheckout")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /handleCheckout/i })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/deadbeef/src/routes/checkout.ts#L42",
    );
  });

  it("shows the honest-degradation badge and labels crons unknown, never an empty screen", () => {
    mockResult = { data: DEGRADED_RESPONSE, isLoading: false, isError: false, refetch: vi.fn() };
    renderWithIntl(
      <BlastTab prId="pr1" repoFullName="acme/payments-api" headSha="deadbeef" />,
    );

    expect(screen.getByText("Index incomplete")).toBeInTheDocument();
    expect(screen.getByText(/no index has been built/i)).toBeInTheDocument();
    // Stat strip + the symbol's cron chip label crons "unknown", never a
    // fabricated "0".
    expect(screen.getAllByText("unknown").length).toBeGreaterThan(0);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    // The tree itself still renders — not an empty screen.
    expect(screen.getByText("chargeCard")).toBeInTheDocument();
  });

  it("renders the empty state when there are no changed symbols", () => {
    mockResult = { data: EMPTY_RESPONSE, isLoading: false, isError: false, refetch: vi.fn() };
    renderWithIntl(
      <BlastTab prId="pr1" repoFullName="acme/payments-api" headSha="deadbeef" />,
    );

    expect(screen.getByText("No blast radius data")).toBeInTheDocument();
  });
});
