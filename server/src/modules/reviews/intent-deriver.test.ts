import { describe, it, expect, vi } from "vitest";
import type { Container } from "../../platform/container.js";
import type { ReviewRepository, PullRow } from "./repository.js";
import type { UnifiedDiff } from "@devdigest/shared";
import { RunLogger } from "../../platform/run-logger.js";
import { RunBus } from "../../platform/sse.js";
import { deriveIntent } from "./intent-deriver.js";

/**
 * AC-024: intent-deriver runs inside the background review pipeline (not an
 * HTTP handler) — a missing feature-model override must degrade (skip intent
 * derivation, log, continue) rather than crash the whole review run. This is
 * a deliberate, documented deviation from AC-14's literal "throw 422" wording,
 * scoped to this call site only.
 */

function makeContainer(opts: { hasOverride: boolean }): Container {
  return {
    llm: vi.fn().mockResolvedValue({
      completeStructured: vi.fn(),
    }),
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(
            opts.hasOverride
              ? [
                  {
                    key: "feature_models",
                    value: {
                      review_intent: { provider: "openai", model: "gpt-4.1" },
                    },
                  },
                ]
              : [],
          ),
        }),
      }),
    },
  } as unknown as Container;
}

function makeRepo(): ReviewRepository {
  return {
    getIntent: vi.fn().mockResolvedValue(null),
    upsertIntent: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReviewRepository;
}

function makePull(): PullRow {
  return {
    id: "pr-1",
    repoId: "repo-1",
    number: 42,
    title: "Add feature X",
    body: null,
    headSha: "sha-1",
    lastReviewedSha: null,
  } as unknown as PullRow;
}

function makeDiff(): UnifiedDiff {
  return {
    files: [
      {
        path: "src/a.ts",
        additions: 1,
        deletions: 0,
        hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2 }],
      },
    ],
    raw: "diff --git a/src/a.ts b/src/a.ts",
  } as unknown as UnifiedDiff;
}

describe("deriveIntent — feature-model strict resolution degrade (AC-024)", () => {
  it("returns undefined (does not throw) when no workspace override is configured", async () => {
    const container = makeContainer({ hasOverride: false });
    const repo = makeRepo();
    const runLog = new RunLogger(new RunBus(), ["run-1"]);

    const result = await deriveIntent(
      container,
      repo,
      "ws-1",
      makePull(),
      makeDiff(),
      runLog,
    );

    expect(result).toBeUndefined();
    // Never reaches the LLM call — resolveFeatureModelStrict throws before it.
    expect(container.llm).not.toHaveBeenCalled();
  });

  it("proceeds to call the LLM when a workspace override IS configured", async () => {
    const container = makeContainer({ hasOverride: true });
    const repo = makeRepo();
    const runLog = new RunLogger(new RunBus(), ["run-1"]);
    (container.llm as ReturnType<typeof vi.fn>).mockResolvedValue({
      completeStructured: vi.fn().mockResolvedValue({
        data: { intent: "Adds feature X", in_scope: ["src/a.ts"], out_of_scope: [] },
      }),
    });

    const result = await deriveIntent(
      container,
      repo,
      "ws-1",
      makePull(),
      makeDiff(),
      runLog,
    );

    expect(container.llm).toHaveBeenCalledWith("openai");
    expect(result).toContain("Adds feature X");
  });
});
