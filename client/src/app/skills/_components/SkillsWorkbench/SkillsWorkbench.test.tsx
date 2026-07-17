import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const push = vi.fn();
/** `useParams` returns {} on /skills and { id } on /skills/:id — this drives that split. */
let params: { id?: string } = {};
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useParams: () => params,
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => searchParams,
}));

// AppShell pulls in shell i18n + usePathname + theme; mock it as a passthrough.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// The pane has its own test; stub it so this one is about the workbench.
vi.mock("../SkillEditorPane", () => ({
  SkillEditorPane: () => <div data-testid="pane">pane</div>,
}));

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillsWorkbench } from "./SkillsWorkbench";

afterEach(cleanup);
beforeEach(() => {
  params = {};
  searchParams = new URLSearchParams();
  push.mockClear();
});

const SKILLS: Skill[] = [
  {
    id: "sk1",
    name: "Security rubric",
    description: "Flags secrets and injection",
    type: "security",
    source: "manual",
    body: "# Rule",
    enabled: true,
    version: 3,
  },
  {
    id: "sk2",
    name: "No then chains",
    description: "Prefer async/await",
    type: "convention",
    source: "manual",
    body: "# Rule",
    enabled: true,
    version: 1,
  },
];

function renderWorkbench() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillsWorkbench />
    </NextIntlClientProvider>,
  );
}

describe("SkillsWorkbench", () => {
  it("lists every skill in the column", () => {
    renderWorkbench();
    expect(screen.getByText("Security rubric")).toBeInTheDocument();
    expect(screen.getByText("No then chains")).toBeInTheDocument();
  });

  it("shows the empty pane when no skill is selected", () => {
    renderWorkbench();
    expect(screen.getByText("Select a skill")).toBeInTheDocument();
    expect(screen.queryByTestId("pane")).not.toBeInTheDocument();
  });

  it("renders the editor pane — with the list still mounted — when a skill is selected", () => {
    params = { id: "sk1" };
    renderWorkbench();
    expect(screen.getByTestId("pane")).toBeInTheDocument();
    // The point of the workbench: selecting never unmounts the list.
    expect(screen.getByText("No then chains")).toBeInTheDocument();
  });

  it("filters the list by name or description", () => {
    const { container } = renderWorkbench();
    fireEvent.change(container.querySelector("input")!, { target: { value: "async" } });
    expect(screen.getByText("No then chains")).toBeInTheDocument();
    expect(screen.queryByText("Security rubric")).not.toBeInTheDocument();
  });

  it("navigates to a skill on card click, carrying the open tab", () => {
    searchParams = new URLSearchParams("tab=versions");
    renderWorkbench();
    fireEvent.click(screen.getByText("Security rubric"));
    expect(push).toHaveBeenCalledWith("/skills/sk1?tab=versions");
  });

  it("defaults the carried tab to config", () => {
    renderWorkbench();
    fireEvent.click(screen.getByText("Security rubric"));
    expect(push).toHaveBeenCalledWith("/skills/sk1?tab=config");
  });
});
