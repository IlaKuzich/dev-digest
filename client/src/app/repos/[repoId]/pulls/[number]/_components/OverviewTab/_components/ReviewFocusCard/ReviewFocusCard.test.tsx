import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Brief } from "@devdigest/shared";
import briefMessages from "../../../../../../../../../../messages/en/brief.json";

const BRIEF_WITH_FOCUS: Brief = {
  risk_level: "high",
  what: "what",
  why: "why",
  risks: [],
  review_focus: [
    { file: "src/config.ts", line: 12, reason: "live Stripe key committed in plaintext" },
    { file: "src/api/users.ts", line: 46, reason: "N+1 query under the new limiter" },
  ],
};

const BRIEF_NO_FOCUS: Brief = {
  risk_level: "low",
  what: "what",
  why: "why",
  risks: [],
  review_focus: [],
};

let mockBriefResult: { data: Brief | null | undefined };

vi.mock("@/lib/hooks/brief", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks/brief")>();
  return {
    ...actual,
    useBrief: () => mockBriefResult,
  };
});

import { ReviewFocusCard } from "./ReviewFocusCard";

afterEach(cleanup);

function renderCard(onFocusDiffLine?: (file: string, line: number) => void) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages }}>
      <ReviewFocusCard prId="pr1" onFocusDiffLine={onFocusDiffLine} />
    </NextIntlClientProvider>,
  );
}

describe("ReviewFocusCard", () => {
  it("renders each review_focus entry as a real button naming the file+line, and activating one calls onFocusDiffLine", () => {
    mockBriefResult = { data: BRIEF_WITH_FOCUS };
    const onFocusDiffLine = vi.fn();
    renderCard(onFocusDiffLine);

    const first = screen.getByRole("button", { name: /src\/config\.ts:12/i });
    expect(first).toBeInTheDocument();
    expect(screen.getByText(/live Stripe key committed in plaintext/)).toBeInTheDocument();

    const second = screen.getByRole("button", { name: /src\/api\/users\.ts:46/i });
    fireEvent.click(second);

    expect(onFocusDiffLine).toHaveBeenCalledTimes(1);
    expect(onFocusDiffLine).toHaveBeenCalledWith("src/api/users.ts", 46);

    fireEvent.click(first);
    expect(onFocusDiffLine).toHaveBeenCalledWith("src/config.ts", 12);
  });

  it("shows an explicit 'nothing flagged' state, not an empty card, when review_focus is empty", () => {
    mockBriefResult = { data: BRIEF_NO_FOCUS };
    renderCard();

    expect(screen.getByText("Nothing flagged to read first.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders nothing when no Brief has been generated yet", () => {
    mockBriefResult = { data: null };
    const { container } = renderCard();

    expect(container).toBeEmptyDOMElement();
  });
});
