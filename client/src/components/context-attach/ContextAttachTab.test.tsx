import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextAttachment, ContextDoc, ContextDocContent } from "@devdigest/shared";
import messages from "../../../messages/en/context-attach.json";
import { ToastProvider } from "@/lib/toast";

const setAgentMutate = vi.fn();
const setSkillMutate = vi.fn();

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "r1" }),
}));

let mockDocsResult: { data?: { docs: ContextDoc[] }; isLoading: boolean };
let mockAgentAttachments: { data?: ContextAttachment[]; isLoading: boolean };
let mockContent: { data?: ContextDocContent; isLoading: boolean };

vi.mock("@/lib/hooks/context", () => ({
  useContextDocs: () => mockDocsResult,
  useContextDocContent: () => mockContent,
  useAgentContext: () => mockAgentAttachments,
  useSetAgentContext: () => ({ mutate: setAgentMutate, isPending: false }),
  // This owner is always "agent" in these tests — the skill pair is a
  // disabled no-op, exercised the same way the real hooks disable via `enabled`.
  useSkillContext: () => ({ data: undefined, isLoading: false }),
  useSetSkillContext: () => ({ mutate: setSkillMutate, isPending: false }),
}));

import { ContextAttachTab } from "./ContextAttachTab";

afterEach(() => {
  cleanup();
  setAgentMutate.mockClear();
  setSkillMutate.mockClear();
});

const DOCS: ContextDoc[] = [
  { path: "specs/billing/pricing.md", root: "specs", bytes: 500, token_estimate: 100, used_by_agents: 1 },
  { path: "docs/product/readme.md", root: "docs", bytes: 800, token_estimate: 200, used_by_agents: 0 },
  { path: "insights/notes.md", root: "insights", bytes: 300, token_estimate: 50, used_by_agents: 2 },
];

// Only readme.md attached initially — it therefore sorts first (attached-first).
const ATTACHMENTS: ContextAttachment[] = [{ path: "docs/product/readme.md", order: 0, attached: true }];

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ contextAttach: messages }}>
      <ToastProvider>
        <ContextAttachTab owner={{ kind: "agent", id: "a1" }} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ContextAttachTab", () => {
  it("merges attached-first, shows N of M attached, and updates the token estimate purely from local toggles — no network call (AC-7, AC-8, AC-12, AC-13)", () => {
    mockDocsResult = { data: { docs: DOCS }, isLoading: false };
    mockAgentAttachments = { data: ATTACHMENTS, isLoading: false };
    mockContent = { data: undefined, isLoading: false };
    renderTab();

    // Attached-first order.
    const filenames = screen.getAllByText(/\.md$/).map((el) => el.textContent);
    expect(filenames).toEqual(["readme.md", "pricing.md", "notes.md"]);

    expect(screen.getByText("1 of 3 attached")).toBeInTheDocument();
    // Only readme.md (200) is attached initially.
    expect(screen.getByText(/≈ 200 tokens/)).toBeInTheDocument();

    // Attach pricing.md too — the estimate must grow by exactly its own
    // token_estimate, computed locally (the docs list is never re-fetched).
    fireEvent.click(screen.getByRole("checkbox", { name: "pricing.md" }));
    expect(screen.getByText("2 of 3 attached")).toBeInTheDocument();
    expect(screen.getByText(/≈ 300 tokens/)).toBeInTheDocument();
  });

  it("filter narrows visible rows without touching stored order, and reordering + Save persists the full ordered SetContextBody (AC-9, AC-7 reorder, AC-10 UI)", () => {
    mockDocsResult = { data: { docs: DOCS }, isLoading: false };
    mockAgentAttachments = { data: ATTACHMENTS, isLoading: false };
    mockContent = { data: undefined, isLoading: false };
    const { unmount } = renderTab();

    // AC-9: filtering only narrows what's shown.
    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), { target: { value: "notes" } });
    expect(screen.getByText("notes.md")).toBeInTheDocument();
    expect(screen.queryByText("readme.md")).not.toBeInTheDocument();
    expect(screen.queryByText("pricing.md")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Filter documents…"), { target: { value: "" } });
    // Order is unaffected by having filtered a moment ago.
    expect(screen.getAllByText(/\.md$/).map((el) => el.textContent)).toEqual([
      "readme.md",
      "pricing.md",
      "notes.md",
    ]);
    unmount();

    // Reorder via the keyboard-reachable move button (no pointer needed),
    // then Save must post paths + attached in the NEW order (AC-10 UI).
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Move readme.md down" }));
    expect(screen.getAllByText(/\.md$/).map((el) => el.textContent)).toEqual([
      "pricing.md",
      "readme.md",
      "notes.md",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(setAgentMutate).toHaveBeenCalledWith(
      {
        docs: [
          { path: "specs/billing/pricing.md", attached: false },
          { path: "docs/product/readme.md", attached: true },
          { path: "insights/notes.md", attached: false },
        ],
      },
      expect.anything(),
    );
    expect(setSkillMutate).not.toHaveBeenCalled();
  });

  it("states the untrusted-block heading (AC-28) and keeps drag handle, checkbox, and Preview as separate, non-nested controls", () => {
    mockDocsResult = { data: { docs: DOCS }, isLoading: false };
    mockAgentAttachments = { data: ATTACHMENTS, isLoading: false };
    mockContent = { data: { path: "docs/product/readme.md", text: "# Readme\n\nSome grounding text." }, isLoading: false };
    renderTab();

    expect(screen.getByText(/## Project context/)).toBeInTheDocument();
    expect(screen.getByText(/untrusted/i)).toBeInTheDocument();

    const dragHandle = screen.getByRole("button", { name: "Drag readme.md to reorder" });
    const checkbox = screen.getByRole("checkbox", { name: "readme.md" });
    const preview = screen.getByRole("button", { name: "Preview readme.md" });
    // Three distinct, separately focusable controls — none nested in another.
    expect(dragHandle).not.toBe(checkbox);
    expect(dragHandle.contains(checkbox)).toBe(false);
    expect(dragHandle.contains(preview)).toBe(false);
    expect(checkbox.contains(preview)).toBe(false);

    // The checkbox carries an accessible name identifying its document.
    expect(checkbox).toHaveAccessibleName("readme.md");

    // Preview renders the document read-only.
    fireEvent.click(preview);
    expect(screen.getByText(/Some grounding text/)).toBeInTheDocument();
  });
});
