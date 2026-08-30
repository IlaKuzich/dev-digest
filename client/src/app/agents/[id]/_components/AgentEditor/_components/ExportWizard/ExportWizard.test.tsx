/* ExportWizard.test.tsx — `fireEvent`, NOT `userEvent` (client INSIGHTS.md:19,
   46; `@testing-library/user-event` is not a dependency of this package).

   `YamlEditor` is stubbed as a plain controlled `<textarea>` (via
   `importOriginal` so the REAL `parseYamlSafe`/`lintWorkflowYml` still run) —
   simulating real keystrokes into a CodeMirror-6 contentEditable view under
   jsdom is unreliable without `user-event`, and the behavior under test is
   the wizard's OWN parse/lint gating, not CodeMirror's DOM internals.

   `@/lib/hooks/ci` is mocked with a static factory stubbing every export
   `ExportWizard` calls (`useExportCiPreview`/`useExportCiInstall`/
   `useExportCiZip`), per client INSIGHTS.md's "complete the mock's shape"
   lesson. Install success/failure are driven by mutating a module-scoped
   mock-state object and calling RTL's `rerender` with the same tree — the
   mocked hook re-reads that object on every render, so no reactive
   (useState-in-mock) simulation is needed. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, CiExport } from "@devdigest/shared";
import ciMessages from "../../../../../../../../messages/en/ci.json";

const previewMutate = vi.fn();
const installMutate = vi.fn();
const zipMutate = vi.fn();

let installState: {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  data: CiExport | undefined;
  error: Error | null;
} = { isPending: false, isSuccess: false, isError: false, data: undefined, error: null };

const WORKFLOW_PATH = ".github/workflows/devdigest-review.yml";
const LIVE_WORKFLOW_YML = [
  "name: DevDigest Review",
  "on:",
  "  pull_request:",
  "    types: [opened, synchronize]",
  "permissions:",
  "  contents: read",
  "  pull-requests: write",
  "jobs:",
  "  review:",
  "    runs-on: ubuntu-latest",
  "    steps:",
  "      - uses: actions/checkout@v4",
  "      - run: node .devdigest/runner/index.js",
  "        env:",
  "          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}",
].join("\n");

const PREVIEW_FILES = [
  { path: ".devdigest/agents/security-reviewer.yaml", contents: "name: Security Reviewer\n", editable: false },
  { path: ".devdigest/memory.jsonl", contents: "", editable: false },
  { path: WORKFLOW_PATH, contents: LIVE_WORKFLOW_YML, editable: true },
  { path: ".devdigest/runner/index.js", contents: "// bundled runner — never shown", editable: false },
];

vi.mock("@/lib/hooks/ci", () => ({
  useExportCiPreview: () => ({
    mutate: previewMutate,
    isPending: false,
    isError: false,
    data: { files: PREVIEW_FILES, installation: null, pr_url: null },
  }),
  useExportCiInstall: () => ({ mutate: installMutate, ...installState }),
  useExportCiZip: () => ({ mutate: zipMutate, isPending: false, isSuccess: false, isError: false, error: null }),
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/payments-api" }, repos: [], repoId: "r1" }),
}));

vi.mock("@/lib/hooks/core", () => ({
  useSecretsStatus: () => ({ data: { openai: false, anthropic: false, openrouter: true, github: true } }),
}));

vi.mock("@/components/yaml-editor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/yaml-editor")>();
  return {
    ...actual,
    YamlEditor: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
      <textarea
        data-testid="yaml-editor-stub"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      />
    ),
  };
});

import { ExportWizard } from "./ExportWizard";

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

function renderWizard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
      <ExportWizard agent={AGENT} onClose={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  installState = { isPending: false, isSuccess: false, isError: false, data: undefined, error: null };
  previewMutate.mockClear();
  installMutate.mockReset();
  zipMutate.mockClear();
});

afterEach(cleanup);

describe("ExportWizard", () => {
  it("keeps GitHub Actions selected when a disabled target card is clicked, and only a real Continue advances to Preview", () => {
    renderWizard();

    // The repo field defaults from the active workspace repo (AC-9).
    expect(screen.getByDisplayValue("acme/payments-api")).toBeInTheDocument();

    const circleCard = screen.getByRole("button", { name: /circleci/i });
    expect(circleCard).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(circleCard);
    // Still on Target — the repo field (Target-step-only content) is present.
    expect(screen.getByDisplayValue("acme/payments-api")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Reaching Preview fetches the live bundle (AC-10) — it renders here
    // (not a hardcoded sample), and the committed runner bundle is excluded.
    expect(previewMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByText("FILES TO CREATE")).toBeInTheDocument();
    expect(screen.getByText(WORKFLOW_PATH)).toBeInTheDocument();
    expect(screen.queryByText(".devdigest/runner/index.js")).not.toBeInTheDocument();
  });

  it("Preview: renders the live workflow.yml, hard-blocks Continue on invalid YAML, and soft-warns without blocking on a lint violation", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Select the editable workflow file — its LIVE contents render verbatim.
    fireEvent.click(screen.getByText(WORKFLOW_PATH));
    const editor = screen.getByTestId("yaml-editor-stub") as HTMLTextAreaElement;
    expect(editor.value).toContain("OPENROUTER_API_KEY");
    expect(editor.value).not.toContain("OPENAI_API_KEY");

    // Invalid YAML hard-blocks Continue (AC-12).
    fireEvent.change(editor, { target: { value: "{ not: [ valid" } });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();

    // A structurally-valid-but-insecure edit is a SOFT warning only (AC-13) —
    // Continue re-enables once the YAML parses.
    fireEvent.change(editor, {
      target: {
        value: "name: DevDigest Review\npermissions:\n  contents: write\njobs:\n  review:\n    steps:\n      - run: echo hi\n",
      },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
  });

  it("Install: open_pr surfaces the returned pr_url on success, and surfaces the error without a phantom PR on failure", () => {
    const { rerender } = renderWizard();
    // A fresh element each call — reusing the SAME element object across two
    // `rerender()` calls gives React an identical `props` reference with no
    // internal state change, which triggers its bailout-on-unchanged-props
    // optimization and skips re-rendering the subtree entirely.
    const renderTree = () => (
      <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
        <ExportWizard agent={AGENT} onClose={vi.fn()} />
      </NextIntlClientProvider>
    );

    // Target → Preview → Configure → Install.
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    const installButton = screen.getByRole("button", { name: /^install$/i });

    installMutate.mockImplementation(() => {
      installState = {
        isPending: false,
        isSuccess: true,
        isError: false,
        data: {
          installation: { id: "inst1", agent_id: "ag1", repo: "acme/payments-api", target_type: "gha", installed_at: "2026-08-25T00:00:00Z" },
          files: PREVIEW_FILES,
          pr_url: "https://github.com/acme/payments-api/pull/42",
        },
        error: null,
      };
    });
    fireEvent.click(installButton);
    rerender(renderTree());

    expect(installMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /view pull request/i })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/pull/42",
    );

    installMutate.mockImplementation(() => {
      installState = {
        isPending: false,
        isSuccess: false,
        isError: true,
        data: undefined,
        error: new Error("Edited workflow.yml failed the security lint"),
      };
    });
    fireEvent.click(screen.getByRole("button", { name: /^install$/i }));
    rerender(renderTree());

    expect(screen.queryByRole("link", { name: /view pull request/i })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Edited workflow.yml failed the security lint");
  });
});
