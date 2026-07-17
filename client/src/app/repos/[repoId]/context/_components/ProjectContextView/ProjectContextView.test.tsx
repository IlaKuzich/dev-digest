import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextDocContent, ContextDocsResponse } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/context.json";

const resyncMutate = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
}));

// AppShell pulls in shell i18n + usePathname + theme — mock as a passthrough
// (client/INSIGHTS.md:37).
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/payments-api", default_branch: "main" } }),
  useRepoNotFound: () => false,
}));

vi.mock("@/lib/hooks/repo-intel", () => ({
  useResyncRepoIntel: () => ({ mutate: resyncMutate, isPending: false }),
}));

let mockDocs: {
  data?: ContextDocsResponse;
  isLoading: boolean;
  isError?: boolean;
  error?: unknown;
  refetch?: () => void;
};
let mockContent: {
  data?: ContextDocContent;
  isLoading: boolean;
  isError?: boolean;
  refetch?: () => void;
};

vi.mock("@/lib/hooks/context", () => ({
  useContextDocs: () => mockDocs,
  useContextDocContent: () => mockContent,
}));

import { ProjectContextView } from "./ProjectContextView";

afterEach(() => {
  cleanup();
  resyncMutate.mockClear();
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ProjectContextView />
    </NextIntlClientProvider>,
  );
}

const THREE_HOURS_AGO = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

const TWO_DOCS_RESPONSE: ContextDocsResponse = {
  docs: [
    { path: "specs/billing/pricing.md", root: "specs", bytes: 1200, token_estimate: 300, used_by_agents: 2 },
    { path: "docs/product/readme.md", root: "docs", bytes: 400, token_estimate: 100, used_by_agents: 0 },
  ],
  clone: { synced_at: THREE_HOURS_AGO, present: true },
};

const NO_CLONE_RESPONSE: ContextDocsResponse = {
  docs: [],
  clone: { synced_at: null, present: false },
};

const EMPTY_ROOTS_RESPONSE: ContextDocsResponse = {
  docs: [],
  clone: { synced_at: THREE_HOURS_AGO, present: true },
};

describe("ProjectContextView", () => {
  it("lists documents with root badges in the left column, and a footer naming count/tokens/age (AC-1, AC-4)", () => {
    mockDocs = { data: TWO_DOCS_RESPONSE, isLoading: false };
    mockContent = { data: undefined, isLoading: false };
    renderView();

    // The first doc auto-selects, so its filename appears in both the list row
    // and the detail header — hence getAllByText for it.
    expect(screen.getAllByText("pricing.md").length).toBeGreaterThan(0);
    expect(screen.getByText("readme.md")).toBeInTheDocument();
    expect(screen.getByText("specs")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();

    // AC-4: document count, aggregate token estimate, last-synced age.
    expect(screen.getByText("2 documents")).toBeInTheDocument();
    expect(screen.getByText(/≈ 400 tokens/)).toBeInTheDocument();
    expect(screen.getByText(/Last synced 3h ago/)).toBeInTheDocument();
  });

  it("shows the selected document's attach count in the detail pane, and updates it when another is selected (AC-26)", () => {
    mockDocs = { data: TWO_DOCS_RESPONSE, isLoading: false };
    mockContent = { data: undefined, isLoading: false };
    renderView();

    // pricing.md is auto-selected first (used_by_agents: 2).
    expect(screen.getByText("Used by 2 agents")).toBeInTheDocument();

    // Select readme.md (used_by_agents: 0) — the count follows the selection.
    fireEvent.click(screen.getByText("readme.md"));
    expect(screen.getByText("Not attached to any agent")).toBeInTheDocument();
  });

  it("previews the selected document as read-only Markdown inline, with no edit/create/upload/delete affordance (AC-6)", () => {
    mockDocs = { data: TWO_DOCS_RESPONSE, isLoading: false };
    mockContent = {
      data: { path: "specs/billing/pricing.md", text: "# Pricing rule\n\nNever discount below cost." },
      isLoading: false,
    };
    renderView();

    // Auto-selected first doc renders inline — no modal, no click needed.
    expect(screen.getByText(/Never discount below cost/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new folder/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("degraded and empty at once — no clone renders the reason and Resync INSIDE the empty branch, never a bare empty list (AC-2)", () => {
    mockDocs = { data: NO_CLONE_RESPONSE, isLoading: false };
    mockContent = { data: undefined, isLoading: false };
    renderView();

    // The reason lives inside THIS branch, not a bare "no docs" message.
    expect(screen.getByText("No local clone yet")).toBeInTheDocument();
    expect(screen.getByText(/resync the repo to fetch one/i)).toBeInTheDocument();
    expect(screen.queryByText("No documents found")).not.toBeInTheDocument();

    const resyncButton = screen.getByRole("button", { name: "Resync" });
    fireEvent.click(resyncButton);
    expect(resyncMutate).toHaveBeenCalledTimes(1);
  });

  it("empty roots names the searched roots and describes manual attach, never claiming automatic reading (AC-3)", () => {
    mockDocs = { data: EMPTY_ROOTS_RESPONSE, isLoading: false };
    mockContent = { data: undefined, isLoading: false };
    renderView();

    expect(screen.getByText("No documents found")).toBeInTheDocument();
    expect(screen.getByText(/specs, docs, insights/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is read automatically/i)).toBeInTheDocument();
    // The corrected copy must not resurrect the old, wrong claim.
    expect(screen.queryByText(/every agent and the pr brief read/i)).not.toBeInTheDocument();
    // No clone problem here — no Resync action offered.
    expect(screen.queryByRole("button", { name: "Resync" })).not.toBeInTheDocument();
  });

  it("shows a loading state while in flight, and a retry-able error state on failure (AC-5)", () => {
    mockDocs = { data: undefined, isLoading: true };
    mockContent = { data: undefined, isLoading: false };
    const { unmount } = renderView();
    expect(screen.getByRole("heading", { name: "Project Context" })).toBeInTheDocument();
    expect(screen.queryByText("No documents found")).not.toBeInTheDocument();
    unmount();

    const refetch = vi.fn();
    mockDocs = { data: undefined, isLoading: false, isError: true, refetch };
    renderView();

    expect(screen.getByText(/couldn.t load documents/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
