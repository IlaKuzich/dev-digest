import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { ScrollSpyNav } from "./ScrollSpyNav";

afterEach(cleanup);

const SECTIONS = [
  { id: "section-a", label: "Section A" },
  { id: "section-b", label: "Section B" },
];

let observedCallback: IntersectionObserverCallback | null = null;
let observedElements: Element[] = [];

class FakeIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) {
    this.callback = cb;
    observedCallback = cb;
  }
  observe(el: Element) {
    observedElements.push(el);
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  observedCallback = null;
  observedElements = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver as unknown as typeof IntersectionObserver);
});

function renderWithSections() {
  return render(
    <div>
      <div id="section-a">A content</div>
      <div id="section-b">B content</div>
      <ScrollSpyNav sections={SECTIONS} title="On this page" />
    </div>,
  );
}

describe("ScrollSpyNav", () => {
  it("renders a nav item per section with the given title", () => {
    renderWithSections();
    expect(screen.getByText("On this page")).toBeInTheDocument();
    expect(screen.getByText("Section A")).toBeInTheDocument();
    expect(screen.getByText("Section B")).toBeInTheDocument();
  });

  it("dispatches the scroll-to-and-expand event on the target section when a nav item is clicked (AC-27)", () => {
    renderWithSections();
    const target = document.getElementById("section-b")!;
    const handler = vi.fn();
    target.addEventListener("onboarding:scrollTo", handler);

    fireEvent.click(screen.getByText("Section B"));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("registers an IntersectionObserver for every section (drives the active marker)", () => {
    renderWithSections();
    expect(observedElements).toHaveLength(2);
    expect(observedElements.map((el) => el.id).sort()).toEqual(["section-a", "section-b"]);
  });

  it("marks a section active once IntersectionObserver reports it intersecting", () => {
    renderWithSections();
    const target = document.getElementById("section-b")!;

    act(() => {
      observedCallback!(
        [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    const button = screen.getByText("Section B").closest("button")!;
    expect(button.style.color).toBe("var(--accent)");
  });
});
