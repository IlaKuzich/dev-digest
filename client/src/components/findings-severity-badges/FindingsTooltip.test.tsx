import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { FindingsTooltip, toTopFinding } from "./index";
import type { TopFinding } from "./index";
import type { FindingRecord } from "@devdigest/shared";

afterEach(cleanup);

function makeFinding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    review_id: "r1",
    severity: "CRITICAL",
    category: "bug",
    title: "SQL injection",
    file: "server.ts",
    start_line: 10,
    end_line: 12,
    rationale: "User input is passed directly to the query.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

describe("toTopFinding", () => {
  it("copies all required fields", () => {
    const f = makeFinding();
    const top = toTopFinding(f);
    expect(top.id).toBe("f1");
    expect(top.severity).toBe("CRITICAL");
    expect(top.title).toBe("SQL injection");
    expect(top.confidence).toBe(0.95);
  });

  it("keeps rationale unchanged when ≤ 120 chars", () => {
    const rationale = "Short rationale.";
    const top = toTopFinding(makeFinding({ rationale }));
    expect(top.rationale_snippet).toBe("Short rationale.");
  });

  it("truncates at word boundary and appends '…' when > 120 chars", () => {
    // 116 'a's + " word" = 121 chars total → should truncate
    const rationale = "a".repeat(116) + " word";
    const top = toTopFinding(makeFinding({ rationale }));
    expect(top.rationale_snippet).toBe("a".repeat(116) + "…");
  });

  it("does not truncate a 120-char rationale", () => {
    const rationale = "a".repeat(120);
    const top = toTopFinding(makeFinding({ rationale }));
    expect(top.rationale_snippet).toBe(rationale);
  });
});

describe("FindingsTooltip", () => {
  const findings: TopFinding[] = [
    {
      id: "f1",
      severity: "CRITICAL",
      category: "bug",
      title: "SQL injection",
      file: "server.ts",
      start_line: 10,
      end_line: 12,
      confidence: 0.95,
      rationale_snippet: "User input passed directly.",
    },
  ];

  it("shows finding title in tooltip when clicked", () => {
    const { container } = render(
      <FindingsTooltip
        bySeverity={{ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 }}
        findings={findings}
      />
    );
    fireEvent.click(container.firstChild!);
    expect(screen.getByText("SQL injection")).toBeInTheDocument();
    expect(screen.getByText("1 FINDINGS")).toBeInTheDocument();
  });

  it("hides tooltip on second click (toggle)", () => {
    const { container } = render(
      <FindingsTooltip
        bySeverity={{ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 }}
        findings={findings}
      />
    );
    fireEvent.click(container.firstChild!);
    expect(screen.getByText("SQL injection")).toBeInTheDocument();
    fireEvent.click(container.firstChild!);
    expect(screen.queryByText("SQL injection")).not.toBeInTheDocument();
  });

  it("does not open tooltip when findings and bySeverity are empty", () => {
    const { container } = render(
      <FindingsTooltip bySeverity={null} findings={[]} />
    );
    fireEvent.click(container.firstChild!);
    expect(screen.queryByText(/FINDINGS/)).not.toBeInTheDocument();
  });

  it("calls onFindingClick with the finding id and closes the popup", () => {
    const onFindingClick = vi.fn();
    const { container } = render(
      <FindingsTooltip
        bySeverity={{ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 }}
        findings={findings}
        onFindingClick={onFindingClick}
      />
    );
    fireEvent.click(container.firstChild!);
    fireEvent.click(screen.getByText("SQL injection"));
    expect(onFindingClick).toHaveBeenCalledWith("f1");
    expect(screen.queryByText("SQL injection")).not.toBeInTheDocument();
  });

  it("does not bubble a finding click to a parent onClick (portal event-bubbling guard)", () => {
    // Reproduces the PRRow regression: the popup is portaled, but React events
    // bubble through the React tree to the row's onClick — which would navigate
    // to the PR Overview and clobber the finding deep-link.
    const onFindingClick = vi.fn();
    const parentClick = vi.fn();
    const { container } = render(
      <div onClick={parentClick}>
        <FindingsTooltip
          bySeverity={{ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 }}
          findings={findings}
          onFindingClick={onFindingClick}
        />
      </div>
    );
    const anchor = (container.firstChild as HTMLElement).firstChild!; // tooltip anchor
    fireEvent.click(anchor); // open the popup
    fireEvent.click(screen.getByText("SQL injection"));
    expect(onFindingClick).toHaveBeenCalledWith("f1");
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("calls onFileClick with file + start line (internal nav, no GitHub link)", () => {
    const onFileClick = vi.fn();
    const { container } = render(
      <FindingsTooltip
        bySeverity={{ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 }}
        findings={findings}
        repoFullName="acme/widgets"
        headSha="abc123"
        onFileClick={onFileClick}
      />
    );
    fireEvent.click(container.firstChild!);
    const fileLink = screen.getByText("server.ts:10-12");
    // With an internal handler we render a button, not an external anchor.
    expect(fileLink.closest("a")).toBeNull();
    fireEvent.click(fileLink);
    expect(onFileClick).toHaveBeenCalledWith("server.ts", 10);
  });
});
