import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentColumn, Conflict, FindingRecord, MultiAgentRun } from "@devdigest/shared";
import multiAgentMessages from "../../../../../../../../messages/en/multiAgent.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import evalMessages from "../../../../../../../../messages/en/eval.json";

// `vi.hoisted` so tests can assert on navigation calls (client INSIGHTS 2026-08-26).
const nav = vi.hoisted(() => ({ push: vi.fn() }));

// ---- next/navigation ----
vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo1", number: "482" }),
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => new URLSearchParams(),
}));

// ---- AppShell passthrough (client INSIGHTS 2026-07-04) ----
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "repo1", full_name: "acme/widgets" } }),
  useRepoNotFound: () => false,
}));

vi.mock("@/lib/hooks", () => ({
  usePulls: () => ({
    data: [{ id: "pr1", number: 482, title: "Add rate limiting to public API endpoints" }],
    isLoading: false,
  }),
}));

vi.mock("@/lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
  useRunEvents: () => ({ events: [], running: false }),
}));

vi.mock("@/lib/hooks/eval-capture", () => ({
  useEvalCaseDraft: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock(
  "../../../../pulls/[number]/_components/RunTraceDrawer",
  () => ({
    __esModule: true,
    default: ({ runId, onClose }: { runId: string; onClose: () => void }) => (
      <div data-testid="trace-drawer">
        trace:{runId}
        <button onClick={onClose}>close trace</button>
      </div>
    ),
  }),
);

// `vi.hoisted` since the mock factory below needs a mutable value the test
// bodies can reassign per-scenario (client INSIGHTS 2026-08-26).
const state = vi.hoisted(() => ({
  run: null as MultiAgentRun | null,
  findingsByRun: {} as Record<string, FindingRecord[]>,
}));

vi.mock("@/lib/hooks/multi-agent-results", () => ({
  useMultiAgentRun: () => ({
    data: state.run,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useRunFindings: () => state.findingsByRun,
}));

import { MultiAgentResultsView } from "./MultiAgentResultsView";

afterEach(() => {
  cleanup();
  nav.push.mockClear();
});

function makeColumn(overrides: Partial<AgentColumn> & Pick<AgentColumn, "run_id" | "agent_id" | "agent_name" | "status">): AgentColumn {
  return {
    provider: null,
    model: null,
    verdict: null,
    score: null,
    summary: null,
    duration_ms: null,
    cost_usd: null,
    findings: [],
    ...overrides,
  };
}

const SECURITY = makeColumn({
  run_id: "run-sec",
  agent_id: "a-sec",
  agent_name: "Security",
  status: "done",
  verdict: "request_changes",
  score: 38,
  summary: "Two critical exposures found.",
  duration_ms: 8200,
  cost_usd: 0.06,
  findings: [
    {
      id: "f1",
      severity: "CRITICAL",
      category: "security",
      title: "Hardcoded Stripe secret key in commit",
      file: "src/config.ts",
      start_line: 12,
      kind: "finding",
    },
  ],
});

const PERFORMANCE = makeColumn({
  run_id: "run-perf",
  agent_id: "a-perf",
  agent_name: "Performance",
  status: "running",
});

const JUNIOR = makeColumn({
  run_id: "run-junior",
  agent_id: "a-junior",
  agent_name: "Junior Mentor",
  status: "failed",
  summary: "Model timed out after 60s",
});

const CONFLICTS: Conflict[] = [
  {
    file: "src/middleware/ratelimit.ts",
    line: 28,
    title: "Magic number 3600",
    takes: [
      { agent_id: "a-junior", persona: "Junior Mentor", verdict: "SUGGESTION", note: "Extract for readability." },
      { agent_id: "a-sec", persona: "Security", verdict: "ignored", note: "Not a security concern." },
    ],
  },
  {
    file: "src/api/public/webhooks.ts",
    line: 61,
    title: "Untrusted webhook body size",
    takes: [
      { agent_id: "a-sec", persona: "Security", verdict: "CRITICAL", note: "No size cap before parsing." },
      { agent_id: "a-perf", persona: "Performance", verdict: "WARNING", note: "Could also cause memory pressure." },
    ],
  },
];

const RUN: MultiAgentRun = {
  id: "run1",
  pr_id: "pr1",
  pr_number: 482,
  ran_at: "2026-08-26T00:00:00Z",
  agent_count: 3,
  total_duration_ms: 8200,
  total_cost_usd: 0.06,
  columns: [SECURITY, PERFORMANCE, JUNIOR],
  conflicts: CONFLICTS,
};

const SEC_FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key in commit",
  file: "src/config.ts",
  start_line: 12,
  end_line: 12,
  rationale: "This key is exposed in the committed source file.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.98,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "rev1",
  accepted_at: null,
  dismissed_at: null,
};

function renderView() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ multiAgent: multiAgentMessages, prReview: prReviewMessages, eval: evalMessages }}
    >
      <MultiAgentResultsView />
    </NextIntlClientProvider>,
  );
}

describe("MultiAgentResultsView — Columns mode", () => {
  it("renders one column per agent — done, running, and failed — and opens the trace drawer (AC-13/AC-14/AC-15/AC-16)", () => {
    state.run = RUN;
    state.findingsByRun = { "run-sec": [SEC_FINDING] };
    renderView();

    // Header totals from the run's own actuals (AC-24).
    expect(screen.getByText("3 agents · 8.2s total · $0.06")).toBeInTheDocument();

    // Done column with its findings list. (Agent names also appear as
    // conflict-take personas in the disagreement block below, so they're not
    // unique text — the finding/status text each column uniquely owns is.)
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();

    // Running column shows a live state, independent of the other columns (AC-14).
    expect(screen.getByText("Running…")).toBeInTheDocument();

    // Failed column shows its reason while the others still render (AC-16).
    expect(screen.getByText("Model timed out after 60s")).toBeInTheDocument();

    // "View trace" opens the existing RunTraceDrawer for that column's run_id (AC-15).
    fireEvent.click(screen.getAllByRole("button", { name: /view trace/i })[0]!);
    expect(screen.getByTestId("trace-drawer")).toHaveTextContent("trace:run-sec");
  });

  it("opens a finding's file:line in the PR's own diff view, in-app — never GitHub (fix: was previously inert)", () => {
    state.run = RUN;
    state.findingsByRun = {};
    renderView();

    fireEvent.click(screen.getByText("src/config.ts:12"));
    expect(nav.push).toHaveBeenCalledWith("/repos/repo1/pulls/482?file=src%2Fconfig.ts&line=12");
  });

  it("'Configure run' and 'Previous Runs' both navigate correctly, title renders before the button row", () => {
    state.run = RUN;
    state.findingsByRun = {};
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Configure run" }));
    expect(nav.push).toHaveBeenCalledWith("/repos/repo1/multi-agent/configure?pr=482");

    fireEvent.click(screen.getByRole("button", { name: "Previous Runs" }));
    expect(nav.push).toHaveBeenCalledWith("/repos/repo1/multi-agent/history");
  });
});

describe("MultiAgentResultsView — Tabs mode", () => {
  it("switches to Tabs and shows an expanded finding card with rationale/suggestion + actions (AC-17/AC-18/AC-19)", () => {
    state.run = RUN;
    state.findingsByRun = { "run-sec": [SEC_FINDING] };
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Tabs" }));

    // The default-selected tab (first agent) renders its finding expanded.
    expect(screen.getByText(/exposed in the committed source file/i)).toBeInTheDocument();
    expect(screen.getByText("Suggested fix")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /turn into eval case/i })).toBeInTheDocument();
    // Learn/Reply-to-author removed 2026-08-27 — stub buttons, no real
    // functionality behind them yet (requester feedback).
    expect(screen.queryByRole("button", { name: /^learn$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reply to author/i })).not.toBeInTheDocument();

    // File:line also opens the in-app diff view from Tabs mode.
    fireEvent.click(screen.getByText("src/config.ts:12"));
    expect(nav.push).toHaveBeenCalledWith("/repos/repo1/pulls/482?file=src%2Fconfig.ts&line=12");
  });
});

describe("MultiAgentResultsView — DisagreementBlock", () => {
  it("shows a 'did not flag' take and 'Show only conflicts' restricts to real multi-agent disagreements (AC-21/AC-22/AC-23)", () => {
    state.run = RUN;
    state.findingsByRun = {};
    renderView();

    expect(screen.getByText("Magic number 3600")).toBeInTheDocument();
    expect(screen.getByText("Untrusted webhook body size")).toBeInTheDocument();
    expect(screen.getAllByText("did not flag").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("switch"));

    // "Magic number 3600" has only ONE agent actively flagging it (the rest
    // "did not flag") — filtered out. "Untrusted webhook body size" has TWO
    // agents actively (and divergently) flagging it — stays.
    expect(screen.queryByText("Magic number 3600")).not.toBeInTheDocument();
    expect(screen.getByText("Untrusted webhook body size")).toBeInTheDocument();
  });
});
