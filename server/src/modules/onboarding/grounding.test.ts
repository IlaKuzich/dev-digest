import { describe, it, expect } from "vitest";
import {
  applyGrounding,
  enforceNodeCap,
  ensurePackageCoverage,
} from "./grounding.js";
import type {
  Onboarding,
  ArchitectureSection,
  CriticalPathItem,
} from "@devdigest/shared";

function makeOnboarding(overrides?: Partial<Onboarding>): Onboarding {
  return {
    repoName: "owner/repo",
    filesIndexed: 100,
    generatedAt: "2026-07-04T00:00:00Z",
    headSha: "abc123",
    sections: {
      architecture: {
        overview: "A monorepo with client and server.",
        style: "monorepo",
        nodes: [
          { id: "client", label: "client", kind: "package" },
          { id: "server", label: "server", kind: "package" },
          { id: "src/app.ts", label: "app.ts", kind: "file" },
        ],
        edges: [{ from: "client", to: "server", label: "HTTP" }],
      },
      criticalPaths: [
        {
          file: "src/app.ts",
          whyItMatters: "Entry point",
          openUrl: "https://github.com/owner/repo/blob/HEAD/src/app.ts",
        },
        {
          file: "src/hallucinated.ts",
          whyItMatters: "Does not exist",
          openUrl: "https://github.com/...",
        },
      ],
      howToRun: {
        packageManager: "pnpm",
        commands: ["pnpm install", "pnpm dev"],
        envVars: ["DATABASE_URL"],
        entrypoint: "pnpm dev",
      },
      readingPath: [
        {
          order: 1,
          file: "src/app.ts",
          reason: "Start here",
          openUrl: "https://github.com/...",
        },
        {
          order: 2,
          file: "src/unknown.ts",
          reason: "Does not exist",
          openUrl: "https://github.com/...",
        },
      ],
      firstTasks: [
        {
          title: "Add tests",
          suggestedPath: "src/new-test.test.ts",
          gapType: "missing-test",
          rationale: "No tests for app.ts",
          patternPointer: "src/app.ts",
          complexity: "Medium",
          verificationHint: "Run vitest",
          packageId: "server",
        },
        {
          title: "Bad task — path exists",
          suggestedPath: "src/app.ts",
          gapType: "missing-doc",
          rationale: "Existing file path",
          patternPointer: "src/app.ts",
          complexity: "Low",
          verificationHint: "Check",
        },
      ],
    },
    ...overrides,
  };
}

const knownFacts = {
  filePaths: new Set(["src/app.ts"]),
  packageNames: new Set(["client", "server"]),
  serviceNames: new Set<string>(),
};

describe("applyGrounding", () => {
  it("strips hallucinated file paths from criticalPaths", () => {
    const result = applyGrounding(makeOnboarding(), knownFacts);
    expect(result.sections.criticalPaths).toHaveLength(1);
    expect(result.sections.criticalPaths[0]!.file).toBe("src/app.ts");
  });

  it("strips hallucinated file paths from readingPath", () => {
    const result = applyGrounding(makeOnboarding(), knownFacts);
    expect(result.sections.readingPath).toHaveLength(1);
    expect(result.sections.readingPath[0]!.file).toBe("src/app.ts");
  });

  it("drops firstTask when suggestedPath is an existing file", () => {
    const result = applyGrounding(makeOnboarding(), knownFacts);
    // "src/new-test.test.ts" is NOT known → kept; "src/app.ts" IS known → dropped
    expect(result.sections.firstTasks).toHaveLength(1);
    expect(result.sections.firstTasks[0]!.suggestedPath).toBe(
      "src/new-test.test.ts",
    );
  });

  it("does not mutate the original object", () => {
    const original = makeOnboarding();
    applyGrounding(original, knownFacts);
    expect(original.sections.criticalPaths).toHaveLength(2);
  });

  it("drops a criticalPaths item whose 'file' is really a service name, not a real file (AC-10)", () => {
    // CriticalPathItem has no `kind` field — a `kind:'service'` item can only
    // surface as one whose `file` string points at a service, not a real path.
    // Since that "file" isn't in the known file-paths set, isKnownPath drops it
    // — Critical Paths admits only real, openable files.
    const onboarding = makeOnboarding({
      sections: {
        ...makeOnboarding().sections,
        criticalPaths: [
          {
            file: "src/app.ts",
            whyItMatters: "Entry point",
            openUrl: "https://github.com/owner/repo/blob/HEAD/src/app.ts",
          },
          {
            file: "postgres", // a docker-compose service name, not a file
            whyItMatters: "Database service",
            openUrl: "https://github.com/...",
          },
        ],
      },
    });
    const known = {
      filePaths: new Set(["src/app.ts"]),
      packageNames: new Set<string>(),
      serviceNames: new Set(["postgres"]),
    };
    const result = applyGrounding(onboarding, known);
    expect(result.sections.criticalPaths).toHaveLength(1);
    expect(result.sections.criticalPaths[0]!.file).toBe("src/app.ts");
  });
});

describe("ensurePackageCoverage (AC-18/R21)", () => {
  const buildOpenUrl = (file: string) =>
    `https://github.com/owner/repo/blob/sha1/${file}`;

  it("returns criticalPaths unchanged for a single-package repo", () => {
    const criticalPaths: CriticalPathItem[] = [
      { file: "src/app.ts", whyItMatters: "Entry", openUrl: "x" },
    ];
    const result = ensurePackageCoverage(
      criticalPaths,
      [{ name: "solo", relativePath: "package.json" }],
      ["src/app.ts"],
      buildOpenUrl,
    );
    expect(result).toEqual(criticalPaths);
  });

  it("reserves at least one slot per detected package when a package has none", () => {
    const criticalPaths: CriticalPathItem[] = [
      {
        file: "server/src/app.ts",
        whyItMatters: "Entry point",
        openUrl: "https://github.com/owner/repo/blob/sha1/server/src/app.ts",
      },
    ];
    const packages = [
      { name: "server-pkg", relativePath: "server/package.json" },
      { name: "client-pkg", relativePath: "client/package.json" },
      { name: "worker-pkg", relativePath: "worker/package.json" },
    ];
    const rankedPaths = [
      "server/src/app.ts",
      "client/src/index.tsx",
      "worker/src/main.ts",
    ];
    const result = ensurePackageCoverage(
      criticalPaths,
      packages,
      rankedPaths,
      buildOpenUrl,
    );
    // server already represented; client + worker get a reserved slot each.
    expect(result).toHaveLength(3);
    expect(result.some((r) => r.file === "client/src/index.tsx")).toBe(true);
    expect(result.some((r) => r.file === "worker/src/main.ts")).toBe(true);
  });

  it("skips a package with no known ranked file (nothing to reserve)", () => {
    const criticalPaths: CriticalPathItem[] = [];
    const packages = [
      { name: "a", relativePath: "a/package.json" },
      { name: "b", relativePath: "b/package.json" },
    ];
    const result = ensurePackageCoverage(
      criticalPaths,
      packages,
      ["a/src/index.ts"], // no ranked file under "b/"
      buildOpenUrl,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.file).toBe("a/src/index.ts");
  });
});

describe("enforceNodeCap", () => {
  it("leaves sections with ≤ NODE_MAX nodes unchanged", () => {
    const section: ArchitectureSection = {
      overview: "x",
      style: "monorepo",
      nodes: Array.from({ length: 6 }, (_, i) => ({
        id: `n${i}`,
        label: `N${i}`,
        kind: "file" as const,
      })),
      edges: [],
    };
    const result = enforceNodeCap(section);
    expect(result.nodes).toHaveLength(6);
    expect(result.nodes.some((n) => n.isOverflow)).toBe(false);
  });

  it("collapses overflow nodes when count exceeds NODE_MAX (8)", () => {
    const nodes = Array.from({ length: 11 }, (_, i) => ({
      id: `n${i}`,
      label: `N${i}`,
      kind: "file" as const,
    }));
    const section: ArchitectureSection = {
      overview: "x",
      style: "monorepo",
      nodes,
      edges: [{ from: "n0", to: "n1" }],
    };
    const result = enforceNodeCap(section);
    expect(result.nodes).toHaveLength(9); // 8 kept + 1 overflow
    const overflow = result.nodes.find((n) => n.isOverflow);
    expect(overflow).toBeDefined();
    expect(overflow?.label).toContain("3"); // 11 - 8 = 3 more
  });
});
