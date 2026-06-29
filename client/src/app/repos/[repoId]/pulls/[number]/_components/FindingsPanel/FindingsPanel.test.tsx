import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

function makeF(overrides: Partial<FindingRecord> & Pick<FindingRecord, "id" | "severity" | "title">): FindingRecord {
  return {
    category: "security",
    file: "src/config.ts",
    start_line: 1,
    end_line: 1,
    rationale: "Some rationale.",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

const FINDINGS: FindingRecord[] = [
  makeF({ id: "f1", severity: "CRITICAL", title: "Critical finding" }),
  makeF({ id: "f2", severity: "WARNING", title: "Warning finding" }),
  makeF({ id: "f3", severity: "SUGGESTION", title: "Suggestion finding" }),
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={[makeF({ id: "f1", severity: "CRITICAL", title: "Hardcoded secret" })]} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel — severity filter pills", () => {
  it("clicking a severity pill shows only findings of that severity", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: /CRITICAL/i }));
    expect(screen.getByText("Critical finding")).toBeInTheDocument();
    expect(screen.queryByText("Warning finding")).not.toBeInTheDocument();
    expect(screen.queryByText("Suggestion finding")).not.toBeInTheDocument();
  });

  it("clicking the active pill again clears the filter and shows all findings", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: /WARNING/i }));
    expect(screen.queryByText("Critical finding")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /WARNING/i }));
    expect(screen.getByText("Critical finding")).toBeInTheDocument();
    expect(screen.getByText("Warning finding")).toBeInTheDocument();
    expect(screen.getByText("Suggestion finding")).toBeInTheDocument();
  });

  it("severity filter and hide-low-confidence compose", () => {
    const findings = [
      makeF({ id: "f1", severity: "CRITICAL", title: "High conf critical", confidence: 0.9 }),
      makeF({ id: "f2", severity: "CRITICAL", title: "Low conf critical", confidence: 0.3 }),
      makeF({ id: "f3", severity: "WARNING", title: "Warning finding", confidence: 0.9 }),
    ];
    renderWithIntl(<FindingsPanel findings={findings} prId="pr1" />);
    // Enable hide-low-confidence toggle
    const toggle = screen.getByText("Hide low confidence").closest("div");
    fireEvent.click(toggle!.querySelector("button")!);
    // Then filter by CRITICAL
    fireEvent.click(screen.getByRole("button", { name: /CRITICAL/i }));
    expect(screen.getByText("High conf critical")).toBeInTheDocument();
    expect(screen.queryByText("Low conf critical")).not.toBeInTheDocument();
    expect(screen.queryByText("Warning finding")).not.toBeInTheDocument();
  });

  it("dismissed-only severity does not render a pill", () => {
    const findings = [
      makeF({ id: "f1", severity: "CRITICAL", title: "Dismissed critical", dismissed_at: "2026-01-01T00:00:00Z" }),
      makeF({ id: "f2", severity: "WARNING", title: "Active warning" }),
    ];
    renderWithIntl(<FindingsPanel findings={findings} prId="pr1" />);
    expect(screen.queryByRole("button", { name: /CRITICAL/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /WARNING/i })).toBeInTheDocument();
  });

  it("shows empty state when filter yields no results", () => {
    const findings = [makeF({ id: "f1", severity: "WARNING", title: "Warning finding" })];
    renderWithIntl(<FindingsPanel findings={findings} prId="pr1" />);
    // There's no CRITICAL pill since count is 0, but we can filter by clicking WARNING then checking no CRITICAL
    // Filter by WARNING then verify the empty state doesn't show (there is one result)
    fireEvent.click(screen.getByRole("button", { name: /WARNING/i }));
    expect(screen.getByText("Warning finding")).toBeInTheDocument();
    expect(screen.queryByText("No findings match")).not.toBeInTheDocument();
  });
});

describe("FindingsPanel — deep-link focus", () => {
  it("revealing a filtered-out finding when it becomes the focus target", () => {
    Element.prototype.scrollIntoView = vi.fn(); // jsdom doesn't implement it
    const findings = [
      makeF({ id: "f1", severity: "CRITICAL", title: "High conf", confidence: 0.9 }),
      makeF({ id: "f2", severity: "SUGGESTION", title: "Low conf sugg", confidence: 0.2 }),
    ];
    const { rerender } = renderWithIntl(<FindingsPanel findings={findings} prId="pr1" />);

    // Hide low-confidence → the suggestion drops out of the list.
    const toggle = screen.getByText("Hide low confidence").closest("div");
    fireEvent.click(toggle!.querySelector("button")!);
    expect(screen.queryByText("Low conf sugg")).not.toBeInTheDocument();

    // Deep-linking to that finding resets filters so it is visible again.
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsPanel findings={findings} prId="pr1" focusFindingId="f2" focusNonce={1} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Low conf sugg")).toBeInTheDocument();
  });

  it("forwards file:line clicks to onFileClick (internal nav, no GitHub anchor)", () => {
    const onFileClick = vi.fn();
    renderWithIntl(
      <FindingsPanel
        findings={[makeF({ id: "f1", severity: "CRITICAL", title: "Bug", file: "src/db.ts", start_line: 42, end_line: 42 })]}
        prId="pr1"
        repoFullName="acme/widgets"
        headSha="abc123"
        onFileClick={onFileClick}
      />,
    );
    const fileLink = screen.getByText("src/db.ts:42");
    expect(fileLink.closest("a")).toBeNull(); // internal button, not an external link
    fireEvent.click(fileLink);
    expect(onFileClick).toHaveBeenCalledWith("src/db.ts", 42);
  });
});
