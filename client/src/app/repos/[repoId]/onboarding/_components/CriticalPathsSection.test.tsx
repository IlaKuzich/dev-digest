import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CriticalPathItem } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/utils/githubUrls";
import messages from "../../../../../../messages/en/onboarding.json";
import { CriticalPathsSection } from "./CriticalPathsSection";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const ITEMS: CriticalPathItem[] = [
  { file: "server/src/index.ts", whyItMatters: "used by 14 routes", openUrl: "https://stale.example/should-not-be-used" },
];

describe("CriticalPathsSection", () => {
  it("Open link points to githubBlobUrl with repo.defaultBranch, opens in a new tab (AC-28)", () => {
    renderWithIntl(
      <CriticalPathsSection items={ITEMS} repoFullName="acme/devdigest" defaultBranch="main" />,
    );
    const link = screen.getByText("Open").closest("a")!;
    expect(link).toHaveAttribute(
      "href",
      githubBlobUrl("acme/devdigest", "main", "server/src/index.ts"),
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders the file path and the whyItMatters rationale", () => {
    renderWithIntl(
      <CriticalPathsSection items={ITEMS} repoFullName="acme/devdigest" defaultBranch="main" />,
    );
    expect(screen.getByText("server/src/index.ts")).toBeInTheDocument();
    expect(screen.getByText("used by 14 routes")).toBeInTheDocument();
  });
});
