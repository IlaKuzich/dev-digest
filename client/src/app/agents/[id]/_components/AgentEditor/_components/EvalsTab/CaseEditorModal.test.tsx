/* CaseEditorModal.test.tsx — `fireEvent`, NOT `userEvent` (client
   INSIGHTS.md:19,46). A multi-line controlled `Textarea` is grabbed via
   `container.querySelector`/`querySelectorAll` rather than
   `getByDisplayValue`, which is unreliable for multi-line bodies
   (client INSIGHTS.md:19). */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/eval.json";

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
const runMutateAsync = vi.fn();

vi.mock("@/lib/hooks/eval-cases", () => ({
  useCreateEvalCase: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateEvalCase: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  useRunEvalCase: () => ({ mutateAsync: runMutateAsync, isPending: false }),
}));

import { CaseEditorModal } from "./CaseEditorModal";

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
  version: 7,
};

function renderModal(onClose = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <CaseEditorModal agent={AGENT} evalCase={null} onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

/** In the default "Diff" input tab, the Expected-output textarea is the
    second `<textarea>` in document order (Diff textarea renders first). */
function expectedOutputTextarea(container: HTMLElement): HTMLTextAreaElement {
  const areas = container.querySelectorAll("textarea");
  return areas[areas.length - 1] as HTMLTextAreaElement;
}

beforeEach(() => {
  createMutateAsync.mockClear();
  updateMutateAsync.mockClear();
  runMutateAsync.mockClear();
});

afterEach(cleanup);

describe("CaseEditorModal", () => {
  it("shows 'valid JSON' by default and blocks Save once the Expected-output editor holds invalid JSON", () => {
    const { container } = renderModal();

    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeEnabled();

    fireEvent.change(expectedOutputTextarea(container), { target: { value: "{not valid json" } });

    expect(screen.getByText("invalid JSON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("'Finding skeleton' inserts a template finding exposing severity/category/title/file/start_line", () => {
    const { container } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: /finding skeleton/i }));

    const value = expectedOutputTextarea(container).value;
    const parsed = JSON.parse(value);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toMatchObject({ severity: "CRITICAL", category: "security", file: "", start_line: 1 });
    expect(parsed[0]).toHaveProperty("title");
    // Still valid JSON — Save is not blocked by the inserted template.
    expect(screen.getByText("valid JSON")).toBeInTheDocument();
  });
});
