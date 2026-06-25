import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge, formatCost, formatTokenCount } from "./RunCostBadge";

afterEach(cleanup);

// --- formatCost unit tests ---
describe("formatCost", () => {
  it("returns — for null", () => expect(formatCost(null)).toBe("—"));
  it("returns — for undefined", () => expect(formatCost(undefined)).toBe("—"));
  it("returns — for 0", () => expect(formatCost(0)).toBe("—"));
  it("formats 0.012", () => expect(formatCost(0.012)).toBe("$0.012"));
  it("formats 0.0013", () => expect(formatCost(0.0013)).toBe("$0.0013"));
  it("formats 1.5", () => expect(formatCost(1.5)).toBe("$1.50"));
  it("formats 0.06", () => expect(formatCost(0.06)).toBe("$0.06"));
  it("formats very small values", () => expect(formatCost(0.00001)).toBe("<$0.0001"));
});

// --- formatTokenCount unit tests ---
describe("formatTokenCount", () => {
  it("formats below 1k", () => expect(formatTokenCount(450)).toBe("450"));
  it("formats 9119 as 9.1K", () => expect(formatTokenCount(9119)).toBe("9.1K"));
  it("formats 15000 as 15K", () => expect(formatTokenCount(15000)).toBe("15K"));
  it("formats 1200 as 1.2K", () => expect(formatTokenCount(1200)).toBe("1.2K"));
});

// --- Component: compact variant ---
describe("RunCostBadge compact", () => {
  it("renders — when costUsd is null", () => {
    render(<RunCostBadge costUsd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders $0.012 for costUsd=0.012", () => {
    render(<RunCostBadge costUsd={0.012} />);
    expect(screen.getByText("$0.012")).toBeInTheDocument();
  });

  it("renders $0.06 for costUsd=0.06", () => {
    render(<RunCostBadge costUsd={0.06} />);
    expect(screen.getByText("$0.06")).toBeInTheDocument();
  });
});

// --- Component: inline variant ---
describe("RunCostBadge inline", () => {
  it("renders — when costUsd is null", () => {
    render(<RunCostBadge costUsd={null} variant="inline" tokensIn={9119} tokensOut={0} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders tokens · cost when costUsd is set", () => {
    render(
      <RunCostBadge costUsd={0.0013} variant="inline" tokensIn={9119} tokensOut={0} />,
    );
    expect(screen.getByText(/9\.1K tok/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.0013/)).toBeInTheDocument();
  });

  it("renders combined tokens (in + out)", () => {
    render(
      <RunCostBadge costUsd={0.06} variant="inline" tokensIn={15000} tokensOut={1200} />,
    );
    // 15000 + 1200 = 16200 → 16.2K
    expect(screen.getByText(/16\.2K tok/)).toBeInTheDocument();
  });
});
