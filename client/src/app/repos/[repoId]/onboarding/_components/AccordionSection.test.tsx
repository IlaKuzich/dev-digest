import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AccordionSection } from "./AccordionSection";

afterEach(cleanup);

describe("AccordionSection", () => {
  it("toggles expanded state when the header is clicked (AC-26)", () => {
    render(
      <AccordionSection id="section-test" title="Test Section" icon="🏗️" defaultOpen={false}>
        <div>Section body</div>
      </AccordionSection>,
    );
    expect(screen.queryByText("Section body")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Test Section"));
    expect(screen.getByText("Section body")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Test Section"));
    expect(screen.queryByText("Section body")).not.toBeInTheDocument();
  });

  it("expands and scrolls into view when the scroll-spy custom event fires (AC-27)", () => {
    render(
      <AccordionSection id="section-test" title="Test Section" icon="🏗️" defaultOpen={false}>
        <div>Section body</div>
      </AccordionSection>,
    );
    expect(screen.queryByText("Section body")).not.toBeInTheDocument();

    const el = document.getElementById("section-test")!;
    const scrollIntoView = vi.fn();
    el.scrollIntoView = scrollIntoView;

    fireEvent(el, new CustomEvent("onboarding:scrollTo"));

    expect(screen.getByText("Section body")).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalled();
  });
});
