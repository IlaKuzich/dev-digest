import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json"; // client/messages/en/runs.json

import { TraceBody } from "./TraceBody";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

const BASE_TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, findings: 0, grounding: "2/2 passed", cost_usd: null },
  prompt_assembly: { system: "You are a reviewer.", skills: null, memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [],
  raw_output: "",
  memory_pulled: [],
  specs_read: [],
  log: [],
};

describe("TraceBody — project context prompt-assembly visibility (AC-23, AC-24)", () => {
  it("shows the relabelled specs block, a token estimate, and the specs_read paths when specs were injected", () => {
    const specsText = "# Project context\n\nRepo invariants: never store secrets in plain text.";
    const trace: RunTrace = {
      ...BASE_TRACE,
      prompt_assembly: { ...BASE_TRACE.prompt_assembly, specs: specsText },
      specs_read: ["docs/invariants.md", "docs/style.md"],
    };
    renderWithIntl(<TraceBody trace={trace} findings={[]} />);

    // Configuration's "Specs read" row already lists the injected paths (AC-22).
    expect(screen.getByText("docs/invariants.md")).toBeInTheDocument();
    expect(screen.getByText("docs/style.md")).toBeInTheDocument();

    // Prompt assembly is collapsed by default — open it.
    fireEvent.click(screen.getByText("Prompt assembly"));

    // AC-23: relabelled, expandable entry naming the untrusted attached-specs block.
    expect(screen.getByText("Project context — attached specs (untrusted)")).toBeInTheDocument();

    // AC-24: an approximate token figure for that block (ceil(chars/4)), never exact.
    const expectedTokens = Math.ceil(specsText.length / 4);
    expect(screen.getByText(`≈ ${expectedTokens} tokens`)).toBeInTheDocument();
  });

  it("shows no specs block, no token estimate, and 'none' for specs_read when nothing was injected", () => {
    renderWithIntl(<TraceBody trace={BASE_TRACE} findings={[]} />);

    expect(screen.getByText("none")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Prompt assembly"));

    expect(screen.queryByText("Project context — attached specs (untrusted)")).not.toBeInTheDocument();
    expect(screen.queryByText(/tokens?$/)).not.toBeInTheDocument();
  });
});
