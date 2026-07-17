/* Pure-logic unit tests for the diff-viewer's opt-in inline-findings overlay
   helpers (`highlightByLine`, `findingsByStartLine`). `parsePatch` is already
   exercised indirectly via FileCard/SmartDiffViewer rendering tests. */
import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { highlightByLine, findingsByStartLine } from "./helpers";

function finding(overrides: Partial<FindingRecord> & Pick<FindingRecord, "id">): FindingRecord {
  return {
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

describe("highlightByLine", () => {
  it("highlights every line in a multi-line finding's start_line..end_line range", () => {
    const map = highlightByLine([finding({ id: "f1", severity: "WARNING", start_line: 10, end_line: 13 })]);
    expect(map.get(10)).toBe("WARNING");
    expect(map.get(11)).toBe("WARNING");
    expect(map.get(12)).toBe("WARNING");
    expect(map.get(13)).toBe("WARNING");
    expect(map.has(14)).toBe(false);
  });

  it("tie-breaks overlapping ranges from different findings to the highest severity", () => {
    const map = highlightByLine([
      finding({ id: "f1", severity: "WARNING", start_line: 10, end_line: 12 }),
      finding({ id: "f2", severity: "CRITICAL", start_line: 11, end_line: 14 }),
    ]);
    expect(map.get(10)).toBe("WARNING"); // only f1 covers it
    expect(map.get(11)).toBe("CRITICAL"); // overlap — CRITICAL wins
    expect(map.get(12)).toBe("CRITICAL"); // overlap — CRITICAL wins
    expect(map.get(13)).toBe("CRITICAL"); // only f2 covers it
  });
});

describe("findingsByStartLine", () => {
  it("groups findings by their anchor (start_line), supporting multiple findings on one line", () => {
    const f1 = finding({ id: "f1", start_line: 10, end_line: 10 });
    const f2 = finding({ id: "f2", start_line: 10, end_line: 15 });
    const f3 = finding({ id: "f3", start_line: 20, end_line: 20 });
    const map = findingsByStartLine([f1, f2, f3]);
    expect(map.get(10)?.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(map.get(20)?.map((f) => f.id)).toEqual(["f3"]);
    expect(map.has(15)).toBe(false); // f2's END line is not an anchor
  });
});
