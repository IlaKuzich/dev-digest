/**
 * Unit tests for CiService.
 *
 * Tests the pure `deriveRunStatus` logic (table-driven) and verifies that
 * exportCi with action=files does NOT create a ci_installation row.
 *
 * All DB + GitHub calls are mocked — no Postgres required.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { deriveRunStatus, CiService } from "./service.js";
import { lintWorkflowYml } from "./generators/lint.js";
import { workflowYml } from "./generators/workflow.js";
import type { Container } from "../../platform/container.js";
import type { CiInstallation } from "@devdigest/shared";

// ---------------------------------------------------------------------------
// Mock assembleFiles so tests don't need agent-runner/dist/index.js on disk
// ---------------------------------------------------------------------------
vi.mock("./generators/index.js", () => ({
  assembleFiles: vi.fn().mockReturnValue([
    {
      path: ".github/workflows/devdigest-review.yml",
      contents: "# workflow",
      editable: true,
    },
    {
      path: ".devdigest/agents/test-agent.yaml",
      contents: "name: test\n",
      editable: false,
    },
  ]),
  kebabSlug: (s: string) => s.toLowerCase().replace(/\s+/g, "-"),
  dedupeSlugs: (names: string[]) =>
    names.map((n: string) => n.toLowerCase().replace(/\s+/g, "-")),
  agentYaml: () => "name: test\n",
  workflowYml: () => "# workflow\n",
}));

// ---------------------------------------------------------------------------
// deriveRunStatus — table-driven tests
// ---------------------------------------------------------------------------

describe("deriveRunStatus", () => {
  it.each([
    {
      desc: "no artifact → failed",
      hasArtifact: false,
      findingsCount: 0,
      expected: "failed",
    },
    {
      desc: "no artifact (even with findings would be) → failed",
      hasArtifact: false,
      findingsCount: 5,
      expected: "failed",
    },
    {
      desc: "artifact + findings > 0 → succeeded",
      hasArtifact: true,
      findingsCount: 3,
      expected: "succeeded",
    },
    {
      desc: "artifact + 0 findings → no_findings",
      hasArtifact: true,
      findingsCount: 0,
      expected: "no_findings",
    },
    {
      // Gate-blocked: GH Actions job is red because DevDigest found issues,
      // BUT the artifact WAS uploaded → runner completed successfully.
      desc: "gate-blocked run (artifact exists, conclusion=failure) → succeeded",
      hasArtifact: true,
      findingsCount: 5,
      expected: "succeeded",
    },
  ])("$desc", ({ hasArtifact, findingsCount, expected }) => {
    expect(deriveRunStatus(hasArtifact, findingsCount)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// exportCi action=files — does NOT create a ci_installation
// ---------------------------------------------------------------------------

describe("CiService.exportCi action=files", () => {
  const mockInstallRow = {
    id: "install-1",
    agentId: "agent-1",
    repo: "owner/repo",
    targetType: "gha" as const,
    installedAt: new Date(),
    lastSyncedEtag: null,
    lastSyncedAt: null,
  };

  const mockAgent = {
    id: "agent-1",
    name: "Test Agent",
    provider: "openrouter",
    model: "gpt-4.1",
    systemPrompt: "Review this PR.",
    strategy: "auto",
    ciFailOn: "critical",
  };

  function makeMockContainer(upsertInstallation: ReturnType<typeof vi.fn>) {
    return {
      agentsRepo: {
        getById: vi.fn().mockResolvedValue(mockAgent),
        linkedSkills: vi.fn().mockResolvedValue([]),
      },
      reposRepo: {
        // Repo lookup drives the memory-snapshot attach (TASK-006) — not what
        // these exportCi tests exercise, so "no repo found" degrades cleanly.
        findByFullName: vi.fn().mockResolvedValue(undefined),
      },
      ciRepo: {
        upsertInstallation,
        listInstallationsForAgent: vi.fn().mockResolvedValue({
          installations: [],
          active_count: 0,
        }),
        listInstallationsAllWithWorkspace: vi.fn().mockResolvedValue([]),
        upsertRun: vi.fn(),
        insertAgentRun: vi.fn(),
        insertRunFindings: vi.fn(),
        updateSyncState: vi.fn(),
        listRuns: vi.fn().mockResolvedValue([]),
      },
      github: vi.fn(),
    } as unknown as Container;
  }

  it("does NOT call upsertInstallation when action=files", async () => {
    const upsertInstallation = vi.fn().mockResolvedValue(mockInstallRow);
    const container = makeMockContainer(upsertInstallation);
    const service = new CiService(container);

    const result = await service.exportCi(
      "agent-1",
      {
        repo: "owner/repo",
        target: "gha",
        action: "files",
        post_as: "github_review",
        triggers: ["opened", "synchronize"],
        base: "main",
      },
      "workspace-1",
    );

    expect(upsertInstallation).not.toHaveBeenCalled();
    expect(result.installation).toBeNull();
    expect(result.pr_url).toBeNull();
    expect(result.files.length).toBeGreaterThan(0);
  });

  it("calls upsertInstallation and opens PR when action=open_pr", async () => {
    const upsertInstallation = vi.fn().mockResolvedValue(mockInstallRow);
    const mockGh = {
      commitFiles: vi.fn().mockResolvedValue({ branch: "devdigest/ci" }),
      findOpenPr: vi.fn().mockResolvedValue(null),
      openPullRequest: vi
        .fn()
        .mockResolvedValue({ url: "https://github.com/owner/repo/pull/1" }),
    };
    const container = makeMockContainer(upsertInstallation);
    (container as any).github = vi.fn().mockResolvedValue(mockGh);

    const service = new CiService(container);
    const result = await service.exportCi(
      "agent-1",
      {
        repo: "owner/repo",
        target: "gha",
        action: "open_pr",
        post_as: "github_review",
        triggers: ["opened", "synchronize"],
        base: "main",
      },
      "workspace-1",
    );

    expect(upsertInstallation).toHaveBeenCalledOnce();
    expect(mockGh.commitFiles).toHaveBeenCalledOnce();
    expect(mockGh.openPullRequest).toHaveBeenCalledOnce();
    expect(result.installation).not.toBeNull();
    expect(result.pr_url).toBe("https://github.com/owner/repo/pull/1");
  });

  it("reuses existing open PR instead of opening a second one", async () => {
    const upsertInstallation = vi.fn().mockResolvedValue(mockInstallRow);
    const mockGh = {
      commitFiles: vi.fn().mockResolvedValue({ branch: "devdigest/ci" }),
      findOpenPr: vi
        .fn()
        .mockResolvedValue({ url: "https://github.com/owner/repo/pull/99" }),
      openPullRequest: vi.fn(),
    };
    const container = makeMockContainer(upsertInstallation);
    (container as any).github = vi.fn().mockResolvedValue(mockGh);

    const service = new CiService(container);
    const result = await service.exportCi(
      "agent-1",
      {
        repo: "owner/repo",
        target: "gha",
        action: "open_pr",
        post_as: "github_review",
        triggers: ["opened"],
        base: "main",
      },
      "workspace-1",
    );

    expect(mockGh.openPullRequest).not.toHaveBeenCalled();
    expect(result.pr_url).toBe("https://github.com/owner/repo/pull/99");
  });
});

// ---------------------------------------------------------------------------
// exportCi + workflow_yml override (AC-14/38/48)
// ---------------------------------------------------------------------------

describe("CiService.exportCi workflow_yml override", () => {
  const mockInstallRow = {
    id: "install-1",
    agentId: "agent-1",
    repo: "owner/repo",
    targetType: "gha" as const,
    installedAt: new Date(),
    lastSyncedEtag: null,
    lastSyncedAt: null,
  };

  const mockAgent = {
    id: "agent-1",
    name: "Test Agent",
    provider: "openrouter",
    model: "gpt-4.1",
    systemPrompt: "Review this PR.",
    strategy: "auto",
    ciFailOn: "critical",
  };

  const VIOLATING_WORKFLOW_YML = `name: DevDigest Review
on:
  pull_request_target:
    types:
      - opened
permissions:
  contents: write
jobs:
  devdigest-review:
    runs-on: ubuntu-latest
    steps:
      - name: Run DevDigest Review
        env:
          OPENROUTER_API_KEY: sk-hardcoded-secret-value
        run: echo "not the runner"
`;

  const CLEAN_EDITED_WORKFLOW_YML = `name: DevDigest Review (edited)
on:
  pull_request:
    types:
      - opened
      - synchronize
permissions:
  contents: read
  pull-requests: write
jobs:
  devdigest-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run DevDigest Review
        env:
          OPENROUTER_API_KEY: \${{ secrets.OPENROUTER_API_KEY }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: node .devdigest/runner/index.js
`;

  function makeMockContainer(upsertInstallation: ReturnType<typeof vi.fn>) {
    return {
      agentsRepo: {
        getById: vi.fn().mockResolvedValue(mockAgent),
        linkedSkills: vi.fn().mockResolvedValue([]),
      },
      reposRepo: {
        findByFullName: vi.fn().mockResolvedValue(undefined),
      },
      ciRepo: {
        upsertInstallation,
      },
      github: vi.fn(),
    } as unknown as Container;
  }

  it("throws and never calls commitFiles when workflow_yml violates the security lint", async () => {
    const upsertInstallation = vi.fn().mockResolvedValue(mockInstallRow);
    const commitFiles = vi.fn();
    const mockGh = {
      commitFiles,
      findOpenPr: vi.fn(),
      openPullRequest: vi.fn(),
    };
    const container = makeMockContainer(upsertInstallation);
    (container as any).github = vi.fn().mockResolvedValue(mockGh);

    const service = new CiService(container);

    await expect(
      service.exportCi(
        "agent-1",
        {
          repo: "owner/repo",
          target: "gha",
          action: "open_pr",
          post_as: "github_review",
          triggers: ["opened"],
          base: "main",
          workflow_yml: VIOLATING_WORKFLOW_YML,
        },
        "workspace-1",
      ),
    ).rejects.toThrow();

    expect(commitFiles).not.toHaveBeenCalled();
    expect(upsertInstallation).not.toHaveBeenCalled();
  });

  it("commits the exact override content when workflow_yml is clean (open_pr)", async () => {
    const upsertInstallation = vi.fn().mockResolvedValue(mockInstallRow);
    const mockGh = {
      commitFiles: vi.fn().mockResolvedValue({ branch: "devdigest/ci" }),
      findOpenPr: vi.fn().mockResolvedValue(null),
      openPullRequest: vi
        .fn()
        .mockResolvedValue({ url: "https://github.com/owner/repo/pull/1" }),
    };
    const container = makeMockContainer(upsertInstallation);
    (container as any).github = vi.fn().mockResolvedValue(mockGh);

    const service = new CiService(container);
    await service.exportCi(
      "agent-1",
      {
        repo: "owner/repo",
        target: "gha",
        action: "open_pr",
        post_as: "github_review",
        triggers: ["opened"],
        base: "main",
        workflow_yml: CLEAN_EDITED_WORKFLOW_YML,
      },
      "workspace-1",
    );

    const committedWorkflow = mockGh.commitFiles.mock.calls[0]![1].files.find(
      (f: { path: string }) => f.path === ".github/workflows/devdigest-review.yml",
    );
    expect(committedWorkflow?.contents).toBe(CLEAN_EDITED_WORKFLOW_YML);
  });
});

// ---------------------------------------------------------------------------
// lintWorkflowYml — direct unit cases (AC-39/40/41 invariants)
// ---------------------------------------------------------------------------

describe("lintWorkflowYml", () => {
  it("accepts the real generator's own output (no false positives)", () => {
    const generated = workflowYml({
      triggers: ["opened", "synchronize", "reopened"],
      postAs: "github_review",
    });
    expect(lintWorkflowYml(generated)).toEqual({ ok: true });
  });

  it("rejects permissions broader than contents:read + pull-requests:write", () => {
    const yml = workflowYml({
      triggers: ["opened"],
      postAs: "github_review",
    }).replace("  contents: read\n  pull-requests: write", "  contents: write");

    const result = lintWorkflowYml(yml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.some((v) => v.includes("permissions"))).toBe(
        true,
      );
    }
  });

  it("rejects a job-level permissions escalation even when the top-level block is compliant", () => {
    // Regression test (pr-self-review finding): GitHub Actions allows a
    // `permissions:` block at BOTH the workflow level and per-job — a
    // job-level block REPLACES the workflow-level one for that job (not
    // merged). Checking only the FIRST `permissions:` occurrence in the
    // file is a full escalation bypass.
    const yml = `name: DevDigest Review
on:
  pull_request:
    types:
      - opened
permissions:
  contents: read
  pull-requests: write
jobs:
  devdigest-review:
    permissions:
      contents: write
      actions: write
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run DevDigest Review
        env:
          OPENROUTER_API_KEY: \${{ secrets.OPENROUTER_API_KEY }}
        run: node .devdigest/runner/index.js
`;

    const result = lintWorkflowYml(yml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.some((v) => v.includes("permissions"))).toBe(
        true,
      );
      // Must name the job-level escalation specifically, not just re-report
      // the (compliant) top-level block.
      expect(
        result.violations.some(
          (v) => v.includes("actions") || v.includes("contents: write"),
        ),
      ).toBe(true);
    }
  });

  it("rejects a pull_request_target trigger", () => {
    const yml = workflowYml({
      triggers: ["opened"],
      postAs: "github_review",
    }).replace("pull_request:", "pull_request_target:");

    const result = lintWorkflowYml(yml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.violations.some((v) => v.includes("pull_request_target")),
      ).toBe(true);
    }
  });

  it("rejects a hardcoded secret instead of ${{ secrets.* }}", () => {
    const yml = workflowYml({
      triggers: ["opened"],
      postAs: "github_review",
    }).replace(
      "OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}",
      "OPENROUTER_API_KEY: sk-hardcoded-value",
    );

    const result = lintWorkflowYml(yml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.violations.some((v) => v.includes("hardcoded secret")),
      ).toBe(true);
    }
  });

  it("rejects a workflow missing the runner invocation step", () => {
    const yml = workflowYml({
      triggers: ["opened"],
      postAs: "github_review",
    }).replace(
      "run: node .devdigest/runner/index.js",
      'run: echo "not the runner"',
    );

    const result = lintWorkflowYml(yml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.violations.some((v) => v.includes("runner/index.js")),
      ).toBe(true);
    }
  });
});
