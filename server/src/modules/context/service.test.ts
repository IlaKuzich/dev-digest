import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContextService } from "./service.js";
import type { Container } from "../../platform/container.js";

// Each test gets its own temp directory to avoid cross-test interference.
let tempDir: string;
let service: ContextService;

// Tests here only exercise pure-FS methods (listDocs, reindex, readDocsByPaths).
// The new repo-lookup methods (listDocsForRepo, reindexForRepo) are tested via
// integration tests that have a real Container. A stub container is sufficient here.
const stubContainer = {} as Container;

beforeEach(async () => {
  tempDir = join(
    tmpdir(),
    `ctx-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  service = new ContextService(stubContainer);
  await mkdir(tempDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ---- listDocs ---------------------------------------------------------------

describe("ContextService.listDocs()", () => {
  it("returns [] when clonePath is empty string", async () => {
    const files = await service.listDocs("");
    expect(files).toEqual([]);
  });

  it("returns [] when clonePath does not exist on disk", async () => {
    const files = await service.listDocs(join(tempDir, "nonexistent"));
    expect(files).toEqual([]);
  });

  it("returns [] when none of the top-level dirs exist", async () => {
    const files = await service.listDocs(tempDir);
    expect(files).toEqual([]);
  });

  it("finds .md files under specs/", async () => {
    await mkdir(join(tempDir, "specs"), { recursive: true });
    await writeFile(join(tempDir, "specs", "foo.md"), "# Hello\ncontent here");

    const files = await service.listDocs(tempDir);
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe("specs/foo.md");
    expect(files[0]!.content).toBe("# Hello\ncontent here");
    expect(files[0]!.estimated_tokens).toBe(
      Math.ceil("# Hello\ncontent here".length / 4),
    );
  });

  it("finds .md files under docs/ and insights/", async () => {
    await mkdir(join(tempDir, "docs"), { recursive: true });
    await mkdir(join(tempDir, "insights"), { recursive: true });
    await writeFile(join(tempDir, "docs", "arch.md"), "arch");
    await writeFile(join(tempDir, "insights", "gotchas.md"), "gotchas");

    const files = await service.listDocs(tempDir);
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual(["docs/arch.md", "insights/gotchas.md"]);
  });

  it("recurses into subdirectories", async () => {
    await mkdir(join(tempDir, "specs", "sub"), { recursive: true });
    await writeFile(join(tempDir, "specs", "sub", "nested.md"), "nested");

    const files = await service.listDocs(tempDir);
    expect(files[0]!.path).toBe("specs/sub/nested.md");
  });

  it("ignores non-.md files", async () => {
    await mkdir(join(tempDir, "specs"), { recursive: true });
    await writeFile(join(tempDir, "specs", "ignore.ts"), "code");
    await writeFile(join(tempDir, "specs", "keep.md"), "keep");

    const files = await service.listDocs(tempDir);
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe("specs/keep.md");
  });

  it("sets size and updated_at on each file", async () => {
    await mkdir(join(tempDir, "specs"), { recursive: true });
    await writeFile(join(tempDir, "specs", "sized.md"), "hello");

    const files = await service.listDocs(tempDir);
    expect(files[0]!.size).toBeGreaterThan(0);
    expect(files[0]!.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});

// ---- reindex ----------------------------------------------------------------

describe("ContextService.reindex()", () => {
  it("returns summary with files_count and tokens_total", async () => {
    await mkdir(join(tempDir, "specs"), { recursive: true });
    await writeFile(join(tempDir, "specs", "a.md"), "aaaa"); // 4 chars → 1 token
    await writeFile(join(tempDir, "specs", "b.md"), "bbbbbbbb"); // 8 chars → 2 tokens

    const summary = await service.reindex(tempDir);
    expect(summary.files_count).toBe(2);
    expect(summary.tokens_total).toBe(3); // 1 + 2
    expect(summary.refreshed_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("returns empty summary when no docs found", async () => {
    const summary = await service.reindex(tempDir);
    expect(summary.files_count).toBe(0);
    expect(summary.tokens_total).toBe(0);
  });
});

// ---- readDocsByPaths --------------------------------------------------------

describe("ContextService.readDocsByPaths()", () => {
  it("reads existing files", async () => {
    await mkdir(join(tempDir, "specs"), { recursive: true });
    await writeFile(join(tempDir, "specs", "doc.md"), "content");

    const results = await service.readDocsByPaths(tempDir, ["specs/doc.md"]);
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe("specs/doc.md");
    expect(results[0]!.content).toBe("content");
  });

  it("calls onMissing and skips ENOENT files", async () => {
    const missing: string[] = [];
    const results = await service.readDocsByPaths(
      tempDir,
      ["specs/nonexistent.md"],
      (p) => missing.push(p),
    );
    expect(results).toHaveLength(0);
    expect(missing).toEqual(["specs/nonexistent.md"]);
  });

  it("skips paths containing .. (path traversal guard)", async () => {
    const missing: string[] = [];
    const results = await service.readDocsByPaths(
      tempDir,
      ["../etc/passwd", "specs/../../../etc/shadow"],
      (p) => missing.push(p),
    );
    expect(results).toHaveLength(0);
    expect(missing).toHaveLength(2);
    expect(missing).toContain("../etc/passwd");
    expect(missing).toContain("specs/../../../etc/shadow");
  });

  it("returns only successfully read files when mixed", async () => {
    await mkdir(join(tempDir, "specs"), { recursive: true });
    await writeFile(join(tempDir, "specs", "present.md"), "yes");

    const missing: string[] = [];
    const results = await service.readDocsByPaths(
      tempDir,
      ["specs/present.md", "specs/absent.md"],
      (p) => missing.push(p),
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.path).toBe("specs/present.md");
    expect(missing).toEqual(["specs/absent.md"]);
  });
});

// ---- root and module-root scan ----------------------------------------------

describe("root and module-root scan", () => {
  it("AC-001: picks up .md files at the clone root (depth 0)", async () => {
    await writeFile(join(tempDir, "README.md"), "root readme");

    const files = await service.listDocs(tempDir);
    const paths = files.map((f) => f.path);
    expect(paths).toContain("README.md");
    expect(files.find((f) => f.path === "README.md")!.content).toBe(
      "root readme",
    );
  });

  it("AC-002: picks up .md files at depth 1 inside each top-level directory", async () => {
    await mkdir(join(tempDir, "server"), { recursive: true });
    await mkdir(join(tempDir, "client"), { recursive: true });
    await writeFile(join(tempDir, "server", "README.md"), "server readme");
    await writeFile(join(tempDir, "client", "README.md"), "client readme");

    const files = await service.listDocs(tempDir);
    const paths = files.map((f) => f.path);
    expect(paths).toContain("server/README.md");
    expect(paths).toContain("client/README.md");
  });

  it("AC-003: does NOT pick up .md files deeper than depth 1 in non-context dirs", async () => {
    await mkdir(join(tempDir, "server", "sub"), { recursive: true });
    await writeFile(join(tempDir, "server", "sub", "note.md"), "deep note");

    const files = await service.listDocs(tempDir);
    const paths = files.map((f) => f.path);
    expect(paths).not.toContain("server/sub/note.md");
  });

  it("AC-004: excludes CLAUDE.md at root and case-insensitive claude.md in modules", async () => {
    await mkdir(join(tempDir, "server"), { recursive: true });
    await writeFile(join(tempDir, "CLAUDE.md"), "root claude");
    await writeFile(join(tempDir, "server", "claude.md"), "module claude");

    const files = await service.listDocs(tempDir);
    const paths = files.map((f) => f.path);
    expect(paths).not.toContain("CLAUDE.md");
    expect(paths).not.toContain("server/claude.md");
  });

  it("AC-005: skips .claude/ directory entirely (never entered)", async () => {
    await mkdir(join(tempDir, ".claude", "docs"), { recursive: true });
    await writeFile(join(tempDir, ".claude", "docs", "notes.md"), "secret");

    const files = await service.listDocs(tempDir);
    const paths = files.map((f) => f.path);
    expect(paths).not.toContain(".claude/docs/notes.md");
    expect(paths.some((p) => p.startsWith(".claude"))).toBe(false);
  });

  it("AC-006: docs/ top-level appears exactly once (no duplication)", async () => {
    await mkdir(join(tempDir, "docs"), { recursive: true });
    await writeFile(join(tempDir, "docs", "README.md"), "docs readme");

    const files = await service.listDocs(tempDir);
    const paths = files.map((f) => f.path);
    expect(paths.filter((p) => p === "docs/README.md")).toHaveLength(1);
  });
});
