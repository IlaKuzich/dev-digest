import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../lib/toast";

const replace = vi.fn();
/** Drives `?tab=` for the view under test; mutated per-test. */
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "sk1" }),
  useRouter: () => ({ push: vi.fn(), replace }),
  useSearchParams: () => searchParams,
}));

vi.mock("../../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../../../../lib/hooks/skills", () => ({
  useSkill: () => ({ data: SKILL, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillEditorView } from "./SkillEditorView";

afterEach(cleanup);
beforeEach(() => {
  searchParams = new URLSearchParams();
  replace.mockClear();
});

const SKILL: Skill = {
  id: "sk1",
  name: "Security rubric",
  description: "Flags secrets and injection",
  type: "security",
  source: "manual",
  body: "# Rule\nFlag hardcoded credentials.",
  enabled: true,
  version: 3,
};

const VERSIONS: SkillVersion[] = [
  {
    skill_id: "sk1",
    version: 3,
    body: "# Rule\nFlag hardcoded credentials.",
    note: "Tightened the rule",
    created_at: "2026-05-30T10:00:00.000Z",
  },
  {
    skill_id: "sk1",
    version: 2,
    body: "# Rule\nOlder body.",
    note: null,
    created_at: "2026-04-18T10:00:00.000Z",
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A1 Skill Editor (smoke)", () => {
  it("renders the skill's fields and version badge", () => {
    renderWithIntl(<SkillEditorView />);
    expect(screen.getAllByText("Security rubric").length).toBeGreaterThan(0);
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("Save skill")).toBeInTheDocument();
  });

  it("defaults to Config and pushes the chosen tab into ?tab=", () => {
    renderWithIntl(<SkillEditorView />);
    expect(screen.getByText("Save skill")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Versions" }));
    expect(replace).toHaveBeenCalledWith("/skills/sk1?tab=versions");
  });

  it("renders the tab named by ?tab= on load", () => {
    searchParams = new URLSearchParams("tab=versions");
    renderWithIntl(<SkillEditorView />);
    expect(screen.getByText("Version history")).toBeInTheDocument();
    expect(screen.queryByText("Save skill")).not.toBeInTheDocument();
  });

  it("falls back to Config for an unknown ?tab=", () => {
    searchParams = new URLSearchParams("tab=bogus");
    renderWithIntl(<SkillEditorView />);
    expect(screen.getByText("Save skill")).toBeInTheDocument();
  });

  it("keeps unsaved body edits when switching to Preview", () => {
    const { container, rerender } = renderWithIntl(<SkillEditorView />);

    const body = container.querySelector("textarea")!;
    expect(body).toHaveValue("# Rule\nFlag hardcoded credentials.");
    fireEvent.change(body, { target: { value: "# Draft only" } });

    // Simulate the URL change the tab click triggers.
    searchParams = new URLSearchParams("tab=preview");
    rerender(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ToastProvider>
          <SkillEditorView />
        </ToastProvider>
      </NextIntlClientProvider>,
    );

    // The preview renders the draft, not the saved body.
    expect(screen.getByText("Draft only")).toBeInTheDocument();
    expect(screen.queryByText("Flag hardcoded credentials.")).not.toBeInTheDocument();
  });
});

describe("Versions tab", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams("tab=versions");
  });

  it("marks the live version as current and offers Restore only on older ones", () => {
    renderWithIntl(<SkillEditorView />);

    expect(screen.getByText("2 versions")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Tightened the rule")).toBeInTheDocument();
    // v2 has no note — the placeholder stands in.
    expect(screen.getByText("No description")).toBeInTheDocument();
    expect(screen.getByText("2026-04-18")).toBeInTheDocument();
    // Only v2 is restorable; v3 is already live.
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(1);
  });
});
