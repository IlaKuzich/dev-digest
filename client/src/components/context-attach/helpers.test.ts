import { describe, it, expect } from "vitest";
import type { ContextAttachment, ContextDoc } from "@devdigest/shared";
import {
  attachedCount,
  attachedTokenEstimate,
  docDirectory,
  docFilename,
  filterRows,
  mergeDocsWithAttachments,
  reorder,
  toSetContextBody,
} from "./helpers";

const DOCS: ContextDoc[] = [
  { path: "specs/billing/pricing.md", root: "specs", bytes: 500, token_estimate: 100, used_by_agents: 1 },
  { path: "docs/product/readme.md", root: "docs", bytes: 800, token_estimate: 200, used_by_agents: 0 },
  { path: "insights/notes.md", root: "insights", bytes: 300, token_estimate: 50, used_by_agents: 2 },
];

describe("mergeDocsWithAttachments", () => {
  it("orders attached docs first (in saved order), then unattached docs appended unchecked", () => {
    const attachments: ContextAttachment[] = [{ path: "docs/product/readme.md", order: 0, attached: true }];
    const rows = mergeDocsWithAttachments(DOCS, attachments);

    expect(rows.map((r) => r.doc.path)).toEqual([
      "docs/product/readme.md",
      "specs/billing/pricing.md",
      "insights/notes.md",
    ]);
    expect(rows[0]!.attached).toBe(true);
    expect(rows[1]!.attached).toBe(false);
    expect(rows[2]!.attached).toBe(false);
  });

  it("respects the saved multi-doc order and drops an attachment for a doc no longer discovered", () => {
    const attachments: ContextAttachment[] = [
      { path: "insights/notes.md", order: 0, attached: true },
      { path: "docs/product/readme.md", order: 1, attached: false },
      { path: "specs/gone.md", order: 2, attached: true }, // no longer discovered — silently dropped
    ];
    const rows = mergeDocsWithAttachments(DOCS, attachments);
    expect(rows.map((r) => r.doc.path)).toEqual([
      "insights/notes.md",
      "docs/product/readme.md",
      "specs/billing/pricing.md",
    ]);
    expect(rows[1]!.attached).toBe(false);
  });
});

describe("reorder", () => {
  it("moves an item from one index to another without mutating the input", () => {
    const list = ["a", "b", "c"];
    const moved = reorder(list, 0, 2);
    expect(moved).toEqual(["b", "c", "a"]);
    expect(list).toEqual(["a", "b", "c"]); // original untouched
  });
});

describe("filterRows (AC-9 — display-only)", () => {
  it("narrows visible rows by path while preserving each row's REAL index into the unfiltered list", () => {
    const rows = mergeDocsWithAttachments(DOCS, []);
    const visible = filterRows(rows, "readme");

    expect(visible).toHaveLength(1);
    expect(visible[0]!.row.doc.path).toBe("docs/product/readme.md");
    // The real index in `rows` (unfiltered order), not the filtered position.
    expect(visible[0]!.index).toBe(rows.findIndex((r) => r.doc.path === "docs/product/readme.md"));
  });

  it("returns every row, in original order, when the filter is empty", () => {
    const rows = mergeDocsWithAttachments(DOCS, []);
    const visible = filterRows(rows, "");
    expect(visible.map((v) => v.row.doc.path)).toEqual(rows.map((r) => r.doc.path));
  });
});

describe("attachedTokenEstimate / attachedCount (AC-12/13)", () => {
  it("sums token_estimate over ONLY the attached rows, ignoring unattached ones", () => {
    const attachments: ContextAttachment[] = [
      { path: "docs/product/readme.md", order: 0, attached: true },
      { path: "insights/notes.md", order: 1, attached: false },
    ];
    const rows = mergeDocsWithAttachments(DOCS, attachments);
    expect(attachedTokenEstimate(rows)).toBe(200); // readme only (200), not pricing/notes
    expect(attachedCount(rows)).toBe(1);
  });

  it("is 0 when nothing is attached", () => {
    const rows = mergeDocsWithAttachments(DOCS, []);
    expect(attachedTokenEstimate(rows)).toBe(0);
    expect(attachedCount(rows)).toBe(0);
  });
});

describe("toSetContextBody", () => {
  it("serializes paths + attached flag ONLY, in the rows' display order — never document text", () => {
    const attachments: ContextAttachment[] = [{ path: "docs/product/readme.md", order: 0, attached: true }];
    const rows = mergeDocsWithAttachments(DOCS, attachments);
    expect(toSetContextBody(rows)).toEqual({
      docs: [
        { path: "docs/product/readme.md", attached: true },
        { path: "specs/billing/pricing.md", attached: false },
        { path: "insights/notes.md", attached: false },
      ],
    });
  });
});

describe("docFilename / docDirectory", () => {
  it("splits a repo-relative path into filename and directory", () => {
    expect(docFilename("specs/billing/pricing.md")).toBe("pricing.md");
    expect(docDirectory("specs/billing/pricing.md")).toBe("specs/billing");
  });

  it("returns an empty directory for a doc at a root's top level", () => {
    expect(docFilename("readme.md")).toBe("readme.md");
    expect(docDirectory("readme.md")).toBe("");
  });
});
