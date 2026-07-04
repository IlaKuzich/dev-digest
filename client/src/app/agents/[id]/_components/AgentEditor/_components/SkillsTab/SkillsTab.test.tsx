import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../../../lib/toast";

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS }),
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgentSkills: () => ({ data: LINKS }),
  useSetAgentSkills: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "x",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

const SKILLS: Skill[] = [
  { id: "sk1", name: "Security rubric", description: "", type: "security", source: "manual", body: "b1", enabled: true, version: 1 },
  { id: "sk2", name: "Style guide", description: "", type: "convention", source: "manual", body: "b2", enabled: true, version: 1 },
];

// sk1 linked+enabled, sk2 NOT linked → appended unchecked by the merge helper.
const LINKS: AgentSkillLink[] = [{ agent_id: "ag1", skill_id: "sk1", order: 0, enabled: true }];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("Agent editor SkillsTab (smoke)", () => {
  it("merges linked + unlinked skills and shows the enabled count", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(screen.getByText("Security rubric")).toBeInTheDocument();
    expect(screen.getByText("Style guide")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 enabled")).toBeInTheDocument();
  });
});
