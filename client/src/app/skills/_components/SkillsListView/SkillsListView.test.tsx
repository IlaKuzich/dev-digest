import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn() }),
}));

import { SkillsListView } from "./SkillsListView";

afterEach(cleanup);

const SKILLS: Skill[] = [
  {
    id: "sk1",
    name: "Security rubric",
    description: "Flags secrets and injection",
    type: "security",
    source: "manual",
    body: "# Rule\nFlag hardcoded credentials.",
    enabled: true,
    version: 1,
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("A1 Skills list (smoke)", () => {
  it("renders the heading and the seeded skill card", () => {
    renderWithIntl(<SkillsListView />);
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("Security rubric")).toBeInTheDocument();
  });

  it("shows the preview panel prompt until a card is selected", () => {
    renderWithIntl(<SkillsListView />);
    expect(screen.getByText("Select a skill")).toBeInTheDocument();
  });
});
