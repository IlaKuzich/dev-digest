import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FindingsSeverityBadges } from "./FindingsSeverityBadges";

afterEach(cleanup);

describe("FindingsSeverityBadges", () => {
  it("renders '—' when bySeverity is null", () => {
    render(<FindingsSeverityBadges bySeverity={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders '—' when all counts are 0", () => {
    render(<FindingsSeverityBadges bySeverity={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders only the non-zero severity count", () => {
    render(<FindingsSeverityBadges bySeverity={{ CRITICAL: 3, WARNING: 0, SUGGESTION: 0 }} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    // WARNING and SUGGESTION pills must be absent (no "0" from them)
    const nums = screen.queryAllByText("0");
    expect(nums).toHaveLength(0);
  });

  it("renders multiple non-zero severities", () => {
    render(<FindingsSeverityBadges bySeverity={{ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 }} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryAllByText("0")).toHaveLength(0);
  });
});
