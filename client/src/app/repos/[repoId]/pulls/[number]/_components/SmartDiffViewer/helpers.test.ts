/* Pure-logic unit tests for SmartDiffViewer/helpers.ts. No rendering needed —
   these are the two functions the RTL suite (SmartDiffViewer.test.tsx) does
   NOT exercise directly: `activeFindingsForFile`'s dismissed-finding filter
   (per-line severity ranking now lives in `components/diff-viewer/helpers.ts`,
   see its own helpers.test.ts), and `originalOrder`'s flattening. */
import { describe, it, expect } from "vitest";
import type { ReviewRecord } from "@devdigest/shared";
import { activeFindingsForFile, originalOrder } from "./helpers";

function review(id: string, findings: ReviewRecord["findings"]): ReviewRecord {
  return {
    id,
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
    findings,
  };
}

function finding(overrides: Partial<ReviewRecord["findings"][number]>): ReviewRecord["findings"][number] {
  return {
    id: "f",
    severity: "SUGGESTION",
    category: "bug",
    title: "t",
    file: "src/service.ts",
    start_line: 5,
    end_line: 5,
    rationale: "r",
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

describe("activeFindingsForFile", () => {
  it("keeps only active (non-dismissed) findings for the given file, excluding dismissed and other-file findings", () => {
    const reviews = [
      review("r1", [
        finding({ id: "f1", severity: "WARNING", start_line: 10 }),
        // Dismissed — must NOT appear (client/INSIGHTS.md:20 — always filter dismissed findings).
        finding({ id: "f2", severity: "CRITICAL", start_line: 20, dismissed_at: "2026-07-10T00:00:00.000Z" }),
        // Different file — must not leak into this file's list.
        finding({ id: "f3", severity: "CRITICAL", start_line: 10, file: "src/other.ts" }),
      ]),
    ];

    const found = activeFindingsForFile(reviews, "src/service.ts");

    expect(found.map((f) => f.id)).toEqual(["f1"]);
  });

  it("returns an empty array for a file with no findings and treats undefined reviews as empty", () => {
    const reviews = [review("r1", [finding({ file: "src/other.ts" })])];
    expect(activeFindingsForFile(reviews, "src/service.ts")).toEqual([]);
    expect(activeFindingsForFile(undefined, "src/service.ts")).toEqual([]);
  });
});

describe("originalOrder", () => {
  it("flattens role groups back into one file list, preserving group and within-group order", () => {
    const files = originalOrder([
      { role: "core", files: [{ path: "b.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] }] },
      {
        role: "wiring",
        files: [
          { path: "a.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] },
          { path: "c.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] },
        ],
      },
    ]);
    expect(files.map((f) => f.path)).toEqual(["b.ts", "a.ts", "c.ts"]);
  });
});
