import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  startPg,
  dockerAvailable,
  type PgFixture,
} from "../../../test/helpers/pg.js";
import { buildApp } from "../../app.js";
import { loadConfig } from "../../platform/config.js";
import { seed } from "../../db/seed.js";
import * as t from "../../db/schema.js";
import { MockLLMProvider, MockGitHubClient } from "../../adapters/mocks.js";
import type { RepoIntel, IndexState } from "../repo-intel/types.js";

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () =>
  loadConfig({ ...process.env, NODE_ENV: "test" } as NodeJS.ProcessEnv);

const VALID_ONBOARDING_FIXTURE = {
  repoName: "acme/onboarding-fixture",
  filesIndexed: 42,
  generatedAt: new Date().toISOString(),
  headSha: "sha-1",
  sections: {
    architecture: {
      overview: "A simple single-package repo.",
      style: "api-only",
      nodes: [{ id: "server", label: "server", kind: "package" }],
      edges: [],
    },
    criticalPaths: [
      {
        file: "src/app.ts",
        whyItMatters: "Entry point",
        openUrl: "https://github.com/acme/onboarding-fixture/blob/sha-1/src/app.ts",
      },
    ],
    howToRun: {
      packageManager: "npm",
      commands: ["npm install", "npm run dev"],
      envVars: [],
      entrypoint: "npm run dev",
    },
    readingPath: [
      {
        order: 1,
        file: "src/app.ts",
        reason: "Start here",
        openUrl: "https://github.com/acme/onboarding-fixture/blob/sha-1/src/app.ts",
      },
    ],
    firstTasks: [],
  },
};

/** Minimal RepoIntel mock — state is mutable so tests can simulate headSha /
 * index-status changes across sequential calls. */
function makeMockRepoIntel(state: {
  lastIndexedSha: string;
  status?: IndexState["status"];
}): RepoIntel {
  return {
    indexRepo: async () => ({
      status: "full",
      filesIndexed: 42,
      filesSkipped: 0,
      durationMs: 10,
    }),
    refreshIndex: async () => ({
      status: "full",
      filesIndexed: 42,
      filesSkipped: 0,
      durationMs: 10,
    }),
    getIndexState: async (repoId: string) => ({
      repoId,
      status: state.status ?? "full",
      filesIndexed: 42,
      filesSkipped: 0,
      durationMs: 10,
      lastIndexedSha: state.lastIndexedSha,
      indexerVersion: 1,
      updatedAt: new Date(),
    }),
    getBlastRadius: async () => ({
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
    }),
    getRepoMap: async () => ({ text: "", tokens: 0, cached: false }),
    getFileRank: async (_repoId: string, paths: string[]) =>
      paths.map((p, i) => ({ path: p, percentile: 1 - i * 0.1 })),
    getSymbolsInFiles: async () => [],
    getCallerSignatures: async () => [],
    getUnresolvedReferences: async () => [],
    getConventionSamples: async () => [],
    getTopFilesByRank: async () => ["src/app.ts"],
    getCriticalPaths: async () => [["src/app.ts"]],
  } as unknown as RepoIntel;
}

d("Onboarding module (Testcontainers Postgres)", () => {
  let pg: PgFixture;
  let workspaceId: string;
  let clonePath: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    clonePath = await mkdtemp(join(tmpdir(), "onboarding-it-"));
  });
  afterAll(async () => {
    await pg?.stop();
    await rm(clonePath, { recursive: true, force: true });
  });

  async function seedRepo(): Promise<string> {
    const uniq = `onboarding-fixture-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [row] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: "acme",
        name: uniq,
        fullName: `acme/${uniq}`,
        clonePath,
      })
      .returning({ id: t.repos.id });
    return row!.id;
  }

  async function configureOnboardingModel(app: Awaited<ReturnType<typeof buildApp>>) {
    const res = await app.inject({
      method: "PUT",
      url: "/settings",
      payload: {
        feature_models: {
          onboarding: { provider: "openai", model: "gpt-4o" },
        },
      },
    });
    expect(res.statusCode).toBe(200);
  }

  it("AC-001/AC-002: POST generates once, second POST (unchanged headSha) hits cache with 0 new LLM calls", async () => {
    const mockLlm = new MockLLMProvider("openai", {
      structured: VALID_ONBOARDING_FIXTURE,
    });
    const repoIntel = makeMockRepoIntel({ lastIndexedSha: "sha-1" });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        repoIntel,
        llm: { openai: mockLlm },
        github: new MockGitHubClient(),
      },
    });
    await configureOnboardingModel(app);
    const repoId = await seedRepo();

    const first = await app.inject({
      method: "POST",
      url: `/repos/${repoId}/onboarding`,
    });
    expect(first.statusCode).toBe(200);
    const body = first.json();
    expect(body.sections.architecture).toBeDefined();
    expect(body.sections.criticalPaths).toBeDefined();
    expect(body.sections.howToRun).toBeDefined();
    expect(body.sections.readingPath).toBeDefined();
    expect(body.sections.firstTasks).toBeDefined();
    expect(
      mockLlm.calls.filter((c) => c.method === "completeStructured"),
    ).toHaveLength(1);

    // Second POST, same headSha, no force → cache hit, 0 new LLM calls.
    const second = await app.inject({
      method: "POST",
      url: `/repos/${repoId}/onboarding`,
    });
    expect(second.statusCode).toBe(200);
    expect(
      mockLlm.calls.filter((c) => c.method === "completeStructured"),
    ).toHaveLength(1); // still 1 — no new call
    expect(second.json()).toEqual(body);

    await app.close();
  });

  it("AC-003: changing headSha between two POSTs triggers a new LLM call", async () => {
    const mockLlm = new MockLLMProvider("openai", {
      structured: VALID_ONBOARDING_FIXTURE,
    });
    const state = { lastIndexedSha: "sha-a" };
    const repoIntel = makeMockRepoIntel(state);
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        repoIntel,
        llm: { openai: mockLlm },
        github: new MockGitHubClient(),
      },
    });
    await configureOnboardingModel(app);
    const repoId = await seedRepo();

    await app.inject({ method: "POST", url: `/repos/${repoId}/onboarding` });
    expect(
      mockLlm.calls.filter((c) => c.method === "completeStructured"),
    ).toHaveLength(1);

    state.lastIndexedSha = "sha-b"; // simulate a new commit being indexed
    await app.inject({ method: "POST", url: `/repos/${repoId}/onboarding` });
    expect(
      mockLlm.calls.filter((c) => c.method === "completeStructured"),
    ).toHaveLength(2);

    await app.close();
  });

  it("AC-004: POST ?force=true always makes a new LLM call and overwrites cache, even with unchanged headSha", async () => {
    const mockLlm = new MockLLMProvider("openai", {
      structured: VALID_ONBOARDING_FIXTURE,
    });
    const repoIntel = makeMockRepoIntel({ lastIndexedSha: "sha-1" });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        repoIntel,
        llm: { openai: mockLlm },
        github: new MockGitHubClient(),
      },
    });
    await configureOnboardingModel(app);
    const repoId = await seedRepo();

    await app.inject({
      method: "POST",
      url: `/repos/${repoId}/onboarding?force=true`,
    });
    await app.inject({
      method: "POST",
      url: `/repos/${repoId}/onboarding?force=true`,
    });
    expect(
      mockLlm.calls.filter((c) => c.method === "completeStructured"),
    ).toHaveLength(2);

    await app.close();
  });

  it("AC-005: GET before generation → 404; GET after a successful POST → 200 with cached body", async () => {
    const mockLlm = new MockLLMProvider("openai", {
      structured: VALID_ONBOARDING_FIXTURE,
    });
    const repoIntel = makeMockRepoIntel({ lastIndexedSha: "sha-1" });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        repoIntel,
        llm: { openai: mockLlm },
        github: new MockGitHubClient(),
      },
    });
    await configureOnboardingModel(app);
    const repoId = await seedRepo();

    const before = await app.inject({
      method: "GET",
      url: `/repos/${repoId}/onboarding`,
    });
    expect(before.statusCode).toBe(404);

    const post = await app.inject({
      method: "POST",
      url: `/repos/${repoId}/onboarding`,
    });
    expect(post.statusCode).toBe(200);

    const after = await app.inject({
      method: "GET",
      url: `/repos/${repoId}/onboarding`,
    });
    expect(after.statusCode).toBe(200);
    expect(after.json()).toEqual(post.json());

    await app.close();
  });

  it("AC-006: the 11th POST within 1 minute is rate-limited (429)", async () => {
    const mockLlm = new MockLLMProvider("openai", {
      structured: VALID_ONBOARDING_FIXTURE,
    });
    const repoIntel = makeMockRepoIntel({ lastIndexedSha: "sha-1" });
    // The global rate-limit plugin is deliberately disabled under NODE_ENV=test
    // (app.ts) so other integration suites can hammer endpoints via inject().
    // Route-level `config.rateLimit` only takes effect once that plugin is
    // registered, so this ONE test builds its app outside test mode to
    // exercise the real 429 path — same pattern would apply to brief's
    // identical rate-limit config, which has no existing coverage either.
    const app = await buildApp({
      config: loadConfig({
        ...process.env,
        NODE_ENV: "development",
        LOG_LEVEL: "silent",
      } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        repoIntel,
        llm: { openai: mockLlm },
        github: new MockGitHubClient(),
      },
    });
    await configureOnboardingModel(app);
    const repoId = await seedRepo();

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await app.inject({
        method: "POST",
        url: `/repos/${repoId}/onboarding`,
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);

    await app.close();
  });

  it("AC-008: two concurrent POSTs on the same repoId make exactly 1 LLM call via the advisory lock", async () => {
    const mockLlm = new MockLLMProvider("openai", {
      structured: VALID_ONBOARDING_FIXTURE,
    });
    const repoIntel = makeMockRepoIntel({ lastIndexedSha: "sha-1" });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        repoIntel,
        llm: { openai: mockLlm },
        github: new MockGitHubClient(),
      },
    });
    await configureOnboardingModel(app);
    const repoId = await seedRepo();

    const [a, b] = await Promise.all([
      app.inject({ method: "POST", url: `/repos/${repoId}/onboarding` }),
      app.inject({ method: "POST", url: `/repos/${repoId}/onboarding` }),
    ]);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(a.json()).toEqual(b.json());
    expect(
      mockLlm.calls.filter((c) => c.method === "completeStructured"),
    ).toHaveLength(1);

    await app.close();
  });

  it("AC-012: varying commit activity across candidates changes the rank order vs pure percentile", async () => {
    // Percentile order (no hotness): file-a (0.9) > file-b (0.8) > file-c (0.7).
    // Heavy commit activity on file-c should push its combinedRank above file-b.
    const repoIntel = {
      indexRepo: async () => ({ status: "full", filesIndexed: 3, filesSkipped: 0, durationMs: 1 }),
      refreshIndex: async () => ({ status: "full", filesIndexed: 3, filesSkipped: 0, durationMs: 1 }),
      getIndexState: async (repoId: string) => ({
        repoId,
        status: "full" as const,
        filesIndexed: 3,
        filesSkipped: 0,
        durationMs: 1,
        lastIndexedSha: "sha-rank",
        indexerVersion: 1,
        updatedAt: new Date(),
      }),
      getBlastRadius: async () => ({ changedSymbols: [], callers: [], impactedEndpoints: [] }),
      getRepoMap: async () => ({ text: "", tokens: 0, cached: false }),
      getFileRank: async () => [
        { path: "file-a.ts", percentile: 0.9 },
        { path: "file-b.ts", percentile: 0.8 },
        { path: "file-c.ts", percentile: 0.7 },
      ],
      getSymbolsInFiles: async () => [],
      getCallerSignatures: async () => [],
      getUnresolvedReferences: async () => [],
      getConventionSamples: async () => [],
      getTopFilesByRank: async () => ["file-a.ts", "file-b.ts", "file-c.ts"],
      getCriticalPaths: async () => [["file-a.ts", "file-b.ts", "file-c.ts"]],
    } as unknown as RepoIntel;

    const github = new MockGitHubClient({
      commitActivity: { "file-a.ts": 0, "file-b.ts": 0, "file-c.ts": 50 },
    });

    let capturedUserContent = "";
    const capturingLlm = new MockLLMProvider("openai", {
      structured: VALID_ONBOARDING_FIXTURE,
    });
    const originalComplete = capturingLlm.completeStructured.bind(capturingLlm);
    capturingLlm.completeStructured = async (req) => {
      capturedUserContent = String(
        req.messages.find((m) => m.role === "user")?.content ?? "",
      );
      return originalComplete(req);
    };

    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { repoIntel, llm: { openai: capturingLlm }, github },
    });
    await configureOnboardingModel(app);
    const repoId = await seedRepo();

    const res = await app.inject({
      method: "POST",
      url: `/repos/${repoId}/onboarding`,
    });
    expect(res.statusCode).toBe(200);

    // Extract the "Top-ranked files" section order from the prompt sent to the LLM.
    const rankSection = capturedUserContent.split("## Top-ranked files")[1] ?? "";
    const cIndex = rankSection.indexOf("file-c.ts");
    const bIndex = rankSection.indexOf("file-b.ts");
    expect(cIndex).toBeGreaterThan(-1);
    expect(bIndex).toBeGreaterThan(-1);
    // file-c (heavy commit activity) now ranks ABOVE file-b — differs from pure percentile.
    expect(cIndex).toBeLessThan(bIndex);

    await app.close();
  });

  it("AC-019: a degraded index returns 200 with a skeleton — firstTasks empty, howToRun non-empty, no LLM call", async () => {
    const mockLlm = new MockLLMProvider("openai", {
      structured: VALID_ONBOARDING_FIXTURE,
    });
    const repoIntel = makeMockRepoIntel({
      lastIndexedSha: "sha-degraded",
      status: "degraded",
    });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        repoIntel,
        llm: { openai: mockLlm },
        github: new MockGitHubClient(),
      },
    });
    // No feature-model override configured either — degraded mode must not
    // require one, since it never calls the LLM.
    const repoId = await seedRepo();

    const res = await app.inject({
      method: "POST",
      url: `/repos/${repoId}/onboarding`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.narrativeUnavailable).toBe(true);
    expect(body.sections.firstTasks).toEqual([]);
    expect(body.sections.howToRun.commands.length).toBeGreaterThan(0);
    expect(
      mockLlm.calls.filter((c) => c.method === "completeStructured"),
    ).toHaveLength(0);

    await app.close();
  });
});
