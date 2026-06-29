import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SeverityFilter } from "./SeverityFilter";

afterEach(cleanup);

const COUNTS = { CRITICAL: 2, WARNING: 1, SUGGESTION: 3 };

describe("SeverityFilter", () => {
  it("renders pills only for non-zero severities", () => {
    render(
      <SeverityFilter counts={{ CRITICAL: 2, WARNING: 0, SUGGESTION: 1 }} active={null} onToggle={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /CRITICAL/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /WARNING/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /SUGGESTION/i })).toBeInTheDocument();
  });

  it("renders nothing when all counts are zero", () => {
    const { container } = render(
      <SeverityFilter counts={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }} active={null} onToggle={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders pills in CRITICAL → WARNING → SUGGESTION order", () => {
    render(<SeverityFilter counts={COUNTS} active={null} onToggle={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent(/CRITICAL/i);
    expect(buttons[1]).toHaveTextContent(/WARNING/i);
    expect(buttons[2]).toHaveTextContent(/SUGGESTION/i);
  });

  it("displays the count inside each pill", () => {
    render(<SeverityFilter counts={COUNTS} active={null} onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: /CRITICAL/i })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /WARNING/i })).toHaveTextContent("1");
  });

  it("calls onToggle with the clicked severity", () => {
    const onToggle = vi.fn();
    render(<SeverityFilter counts={COUNTS} active={null} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: /WARNING/i }));
    expect(onToggle).toHaveBeenCalledWith("WARNING");
  });

  it("active pill has aria-pressed=true; inactive pills have aria-pressed=false", () => {
    render(<SeverityFilter counts={COUNTS} active="CRITICAL" onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: /CRITICAL/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /WARNING/i })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /SUGGESTION/i })).toHaveAttribute("aria-pressed", "false");
  });
});
