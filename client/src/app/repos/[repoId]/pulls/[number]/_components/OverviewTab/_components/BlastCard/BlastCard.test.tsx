import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastResponse } from "@/lib/hooks/blast";
import messages from "../../../../../../../../../../messages/en/blast.json";

const FULL_RESPONSE: BlastResponse = {
  changed_symbols: [{ name: "chargeCard", file: "src/billing/charge.ts", kind: "function" }],
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

let mockResult: { data: BlastResponse | undefined; isLoading: boolean };

vi.mock("@/lib/hooks/blast", () => ({
  useBlast: () => mockResult,
}));

import { BlastCard } from "./BlastCard";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("BlastCard", () => {
  it("shows the counts and calls onOpenBlast when 'View blast radius' is clicked", () => {
    mockResult = { data: FULL_RESPONSE, isLoading: false };
    const onOpenBlast = vi.fn();
    renderWithIntl(<BlastCard prId="pr1" onOpenBlast={onOpenBlast} />);

    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    expect(screen.getByText("symbols")).toBeInTheDocument();
    expect(screen.getByText("callers")).toBeInTheDocument();
    expect(screen.getByText("endpoints")).toBeInTheDocument();
    expect(screen.getByText("POST /checkout")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /view blast radius/i }));
    expect(onOpenBlast).toHaveBeenCalledTimes(1);
  });

  it("shows the degradation badge and does not render a bare empty card", () => {
    mockResult = { data: DEGRADED_RESPONSE, isLoading: false };
    renderWithIntl(<BlastCard prId="pr1" onOpenBlast={vi.fn()} />);

    expect(screen.getByText("Index incomplete")).toBeInTheDocument();
    // Crons unknown on the degraded path — never a fabricated "0".
    expect(screen.getByText("unknown")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    // The card still renders its summary — never a bare empty card.
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    expect(screen.getByText("POST /checkout")).toBeInTheDocument();
  });
});
