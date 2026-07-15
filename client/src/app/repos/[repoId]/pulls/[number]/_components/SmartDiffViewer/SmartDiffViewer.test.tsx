import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/shell.json";

// Small real unified-diff patches (not summaries) — parsed by the shared
// diff engine's `parsePatch`, same as any other DiffViewer usage. Core's
// patch adds TWO lines (NEW-file lines 2-3) so the finding below can span a
// multi-line range.
const CORE_PATCH =
  "@@ -1,3 +1,5 @@\n keep this context\n+risky business logic here\n+more risky logic continues\n more context";
const WIRING_PATCH = "@@ -1,1 +1,1 @@\n wiring context line";
const BOILERPLATE_PATCH = "@@ -1,1 +1,1 @@\n-old lockfile line\n+generated content line";

const FILES: PrFile[] = [
  { path: "src/service.ts", additions: 2, deletions: 0, patch: CORE_PATCH },
  { path: "src/index.ts", additions: 0, deletions: 0, patch: WIRING_PATCH },
  { path: "pnpm-lock.yaml", additions: 1, deletions: 1, patch: BOILERPLATE_PATCH },
];

const SMART_DIFF: SmartDiff = {
  groups: [
    {
      role: "core",
      files: [{ path: "src/service.ts", pseudocode_summary: null, additions: 2, deletions: 0, finding_lines: [2, 3] }],
    },
    {
      role: "wiring",
      files: [{ path: "src/index.ts", pseudocode_summary: null, additions: 0, deletions: 0, finding_lines: [] }],
    },
    {
      role: "boilerplate",
      files: [{ path: "pnpm-lock.yaml", pseudocode_summary: null, additions: 1, deletions: 1, finding_lines: [] }],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
};

// The patch's two added lines are parsePatch'd to NEW-file lines 2 and 3
// (hunk starts at +1, one leading context line) — the finding covers both.
const REVIEWS: ReviewRecord[] = [
  {
    id: "r1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run1",
    agent_name: "Security",
    kind: "review",
    verdict: "request_changes",
    summary: "issues found",
    score: 40,
    model: "gpt-4.1",
    grounding: null,
    created_at: "2026-07-01T00:00:00.000Z",
    findings: [
      {
        id: "f1",
        severity: "CRITICAL",
        category: "bug",
        title: "Unsafe access",
        file: "src/service.ts",
        start_line: 2,
        end_line: 3,
        rationale: "This leaks a secret to the logs.",
        suggestion: null,
        confidence: 0.9,
        kind: "finding",
        trifecta_components: null,
        evidence: null,
        review_id: "r1",
        accepted_at: null,
        dismissed_at: null,
      },
    ],
  },
];

vi.mock("@/lib/hooks/smart-diff", () => ({
  useSmartDiff: () => ({ data: SMART_DIFF, isSuccess: true, isLoading: false, isError: false }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: REVIEWS }),
}));

import { SmartDiffViewer } from "./SmartDiffViewer";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SmartDiffViewer", () => {
  it("IS the files-changed diff: real diff content grouped by role, Core expanded, Boilerplate collapsed", () => {
    renderWithIntl(<SmartDiffViewer prId="pr1" files={FILES} onFocusLine={() => {}} />);

    expect(screen.getByText("Core logic")).toBeInTheDocument();
    expect(screen.getByText("Wiring")).toBeInTheDocument();
    expect(screen.getByText("Boilerplate")).toBeInTheDocument();

    // Core's file is expanded by default — its real added-line code is visible.
    expect(screen.getByText("risky business logic here")).toBeInTheDocument();
    // Boilerplate's file is collapsed by default — its code is NOT rendered.
    expect(screen.queryByText("generated content line")).not.toBeInTheDocument();
  });

  it("highlights the finding's FULL line range, shows a labeled severity badge once (at the anchor line), and opens its detail on click", () => {
    const onFocusLine = vi.fn();
    renderWithIntl(<SmartDiffViewer prId="pr1" files={FILES} onFocusLine={onFocusLine} />);

    // Full-range highlight: both NEW-file lines 2 and 3 (the finding's whole
    // start_line..end_line) carry the CRITICAL border colour, not just line 2.
    // (Exhaustive range/tie-break coverage lives in the pure-logic
    // diff-viewer/helpers.test.ts — this is a smoke check on real rendering.)
    expect(screen.getByText("risky business logic here").parentElement).toHaveStyle({
      boxShadow: "inset 3px 0 0 var(--crit)",
    });
    expect(screen.getByText("more risky logic continues").parentElement).toHaveStyle({
      boxShadow: "inset 3px 0 0 var(--crit)",
    });

    // Labeled badge (icon + text word), not icon-only — and only ONE badge for
    // the finding, anchored at its start_line (line 2), not repeated at line 3.
    expect(screen.getAllByText("Critical")).toHaveLength(1);

    // Clicking the badge opens a portaled popover with the finding's detail.
    expect(screen.queryByText("This leaks a secret to the logs.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /blocker finding: unsafe access/i }));
    expect(screen.getByText("Unsafe access")).toBeInTheDocument();
    expect(screen.getByText("This leaks a secret to the logs.")).toBeInTheDocument();

    // The existing deep-link mechanism still fires alongside the popover.
    expect(onFocusLine).toHaveBeenCalledWith("src/service.ts", 2);
  });

  it("Original order toggle renders the same real diffs flat, with no group headers", () => {
    renderWithIntl(<SmartDiffViewer prId="pr1" files={FILES} onFocusLine={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Original order" }));

    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    expect(screen.queryByText("Wiring")).not.toBeInTheDocument();
    expect(screen.queryByText("Boilerplate")).not.toBeInTheDocument();
    // Still the real diffs, in the PR's own file order.
    expect(screen.getByText("src/service.ts")).toBeInTheDocument();
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
  });
});
