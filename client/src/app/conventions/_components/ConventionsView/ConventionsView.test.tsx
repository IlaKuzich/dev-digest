import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../messages/en/conventions.json";

const updateMutate = vi.fn();
const extractMutate = vi.fn();

vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "r1", activeRepo: { full_name: "acme/payments-api" } }),
}));
vi.mock("../../../../lib/hooks/conventions", () => ({
  useConventions: () => ({ data: CONVENTIONS, isLoading: false, isError: false, refetch: vi.fn() }),
  useExtractConventions: () => ({ mutate: extractMutate, isPending: false, isError: false, data: undefined }),
  useUpdateConvention: () => ({ mutate: updateMutate }),
  useCreateConventionSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ConventionsView } from "./ConventionsView";

afterEach(() => {
  cleanup();
  updateMutate.mockClear();
});

let CONVENTIONS: ConventionCandidate[] = [];

const candidate: ConventionCandidate = {
  id: "c1",
  scan_id: "s1",
  category: "naming",
  rule: "Always use async/await instead of .then() chains",
  edited_rule: null,
  evidence_path: "src/api/users.ts",
  evidence_line_start: 23,
  evidence_line_end: 31,
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  status: "candidate",
  skill_id: null,
  created_at: "2026-07-08T00:00:00.000Z",
};

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionsView />
    </NextIntlClientProvider>,
  );
}

describe("ConventionsView", () => {
  it("renders one card per convention with file:line and confidence", () => {
    CONVENTIONS = [candidate];
    renderView();
    expect(screen.getByText("Always use async/await instead of .then() chains")).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-31")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
  });

  it("Accept calls useUpdateConvention with status accepted", () => {
    CONVENTIONS = [candidate];
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(updateMutate).toHaveBeenCalledWith({ id: "c1", patch: { status: "accepted" } });
  });

  it("Create skill is disabled until at least one convention is accepted", () => {
    CONVENTIONS = [candidate];
    const { rerender } = renderView();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();

    CONVENTIONS = [{ ...candidate, status: "accepted" }];
    rerender(
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <ConventionsView />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Create skill" })).toBeEnabled();
  });
});
