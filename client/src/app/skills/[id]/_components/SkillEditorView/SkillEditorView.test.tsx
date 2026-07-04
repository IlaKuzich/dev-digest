import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../lib/toast";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "sk1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../../../../lib/hooks/skills", () => ({
  useSkill: () => ({ data: SKILL, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillEditorView } from "./SkillEditorView";

afterEach(cleanup);

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
});
