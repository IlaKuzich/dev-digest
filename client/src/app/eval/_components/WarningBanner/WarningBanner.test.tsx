import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/eval.json";

import { WarningBanner } from "./WarningBanner";

afterEach(cleanup);

function renderBanner(message: string | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <WarningBanner message={message} />
    </NextIntlClientProvider>,
  );
}

describe("WarningBanner", () => {
  it("renders the server-computed alert message when present (AC-25)", () => {
    renderBanner("Precision dipped 2pts on v7 — a new false positive slipped in. Recall and citation both up.");
    expect(screen.getByRole("alert")).toHaveTextContent("Precision dipped 2pts on v7");
  });

  it("renders nothing when there is no alert", () => {
    renderBanner(null);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
