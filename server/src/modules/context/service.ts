import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ContextSummary, SpecFile } from "@devdigest/shared";
import type { Container } from "../../platform/container.js";
import { NotFoundError } from "../../platform/errors.js";

/**
 * ContextService — pure filesystem service for project context documents.
 * No DB access. Lives in the context module, accessible via container.contextService.
 *
 * Scans specs/, docs/, and insights/ directories under a repo's clone path,
 * returning SpecFile[] with path, content, size, updated_at, and estimated_tokens.
 */
export class ContextService {
  constructor(private container: Container) {}

  /**
   * Look up a repo by workspace + id, then return all context docs for its
   * clone path. Throws NotFoundError when the repo does not exist.
   */
  async listDocsForRepo(
    workspaceId: string,
    repoId: string,
  ): Promise<SpecFile[]> {
    const repo = await this.container.reposRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError("Repo not found");
    return this.listDocs(repo.clonePath ?? "");
  }

  /**
   * Look up a repo by workspace + id, then reindex its context docs.
   * Throws NotFoundError when the repo does not exist.
   */
  async reindexForRepo(
    workspaceId: string,
    repoId: string,
  ): Promise<ContextSummary> {
    const repo = await this.container.reposRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError("Repo not found");
    return this.reindex(repo.clonePath ?? "");
  }

  /**
   * Recursively find all .md files under ANY directory named specs/, docs/, or
   * insights/ at any depth in the clone tree (glob **\/{specs,docs,insights}\/**\/*.md).
   * Returns [] when clonePath is falsy or does not exist on disk.
   * Skips node_modules and .git to avoid scanning dependencies.
   */
  async listDocs(clonePath: string): Promise<SpecFile[]> {
    if (!clonePath) return [];

    const files: SpecFile[] = [];
    try {
      await this.collectRootMd(clonePath, files);
      await this.walkForContextDirs(clonePath, clonePath, files);
      await this.collectModuleRootMd(clonePath, files);
    } catch {
      // clonePath does not exist or is not readable.
    }
    return files;
  }

  /**
   * Re-reads clone FS and returns a ContextSummary (file count + token total +
   * ISO timestamp). Delegates to listDocs.
   */
  async reindex(clonePath: string): Promise<ContextSummary> {
    const files = await this.listDocs(clonePath);
    const tokensTotal = files.reduce(
      (sum, f) => sum + (f.estimated_tokens ?? 0),
      0,
    );
    return {
      files_count: files.length,
      tokens_total: tokensTotal,
      refreshed_at: new Date().toISOString(),
    };
  }

  /**
   * Read each path (relative to clonePath) and return { path, content }[].
   *
   * Path traversal guard: any path containing `..` is skipped and
   * `onMissing` is called for it.
   *
   * ENOENT: path is skipped and `onMissing` is called.
   */
  async readDocsByPaths(
    clonePath: string,
    paths: string[],
    onMissing?: (path: string) => void,
  ): Promise<Array<{ path: string; content: string }>> {
    const results: Array<{ path: string; content: string }> = [];

    for (const p of paths) {
      // Path traversal guard
      if (p.includes("..")) {
        onMissing?.(p);
        continue;
      }

      const absPath = join(clonePath, p);
      try {
        const content = await readFile(absPath, "utf8");
        results.push({ path: p, content });
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          onMissing?.(p);
        } else {
          // Re-throw unexpected errors
          throw err;
        }
      }
    }

    return results;
  }

  // ---- Private helpers -------------------------------------------------------

  private static readonly CONTEXT_DIR_NAMES = new Set([
    "specs",
    "docs",
    "insights",
  ]);
  private static readonly SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
  ]);

  /** Returns true for directories that should never be entered by any scan. */
  private shouldSkipDir(name: string): boolean {
    return ContextService.SKIP_DIRS.has(name) || name.startsWith(".");
  }

  /** Collect .md files sitting directly at the clone root (depth 0). */
  private async collectRootMd(
    clonePath: string,
    out: SpecFile[],
  ): Promise<void> {
    const entries = await readdir(clonePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".md")) continue;
      if (entry.name.toLowerCase() === "claude.md") continue;
      const absPath = join(clonePath, entry.name);
      try {
        const fileStat = await stat(absPath);
        const content = await readFile(absPath, "utf8");
        out.push({
          path: entry.name,
          content,
          size: fileStat.size,
          updated_at: fileStat.mtime.toISOString(),
          estimated_tokens: Math.ceil(content.length / 4),
        });
      } catch {
        // File disappeared or is unreadable — skip.
      }
    }
  }

  /** Collect .md files sitting directly inside each top-level directory (depth 1, non-recursive). */
  private async collectModuleRootMd(
    clonePath: string,
    out: SpecFile[],
  ): Promise<void> {
    const entries = await readdir(clonePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (this.shouldSkipDir(entry.name)) continue;
      if (ContextService.CONTEXT_DIR_NAMES.has(entry.name)) continue;
      const modulePath = join(clonePath, entry.name);
      let nestedEntries;
      try {
        nestedEntries = await readdir(modulePath, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const nested of nestedEntries) {
        if (!nested.isFile()) continue;
        if (!nested.name.endsWith(".md")) continue;
        if (nested.name.toLowerCase() === "claude.md") continue;
        const absPath = join(modulePath, nested.name);
        try {
          const fileStat = await stat(absPath);
          const content = await readFile(absPath, "utf8");
          out.push({
            path: `${entry.name}/${nested.name}`,
            content,
            size: fileStat.size,
            updated_at: fileStat.mtime.toISOString(),
            estimated_tokens: Math.ceil(content.length / 4),
          });
        } catch {
          // File disappeared or is unreadable — skip.
        }
      }
    }
  }

  /**
   * Walk the full clone tree. When a directory named specs/docs/insights is
   * found, collect all .md files inside it (recursively). Other directories
   * are traversed to find nested context dirs, but their .md files are ignored.
   */
  private async walkForContextDirs(
    clonePath: string,
    absDir: string,
    out: SpecFile[],
  ): Promise<void> {
    const entries = await readdir(absDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (this.shouldSkipDir(entry.name)) continue;

      const absChild = join(absDir, entry.name);

      if (ContextService.CONTEXT_DIR_NAMES.has(entry.name)) {
        // Found a context directory — collect all .md inside it.
        await this.collectMdFiles(clonePath, absChild, out);
      } else {
        // Keep walking to find nested context dirs.
        await this.walkForContextDirs(clonePath, absChild, out);
      }
    }
  }

  private async collectMdFiles(
    clonePath: string,
    absDir: string,
    out: SpecFile[],
  ): Promise<void> {
    const entries = await readdir(absDir, { withFileTypes: true });

    for (const entry of entries) {
      const absPath = join(absDir, entry.name);

      if (entry.isDirectory()) {
        await this.collectMdFiles(clonePath, absPath, out);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        try {
          const fileStat = await stat(absPath);
          const content = await readFile(absPath, "utf8");
          // Relative path from the clone root (e.g. "specs/foo.md")
          const relativePath = absPath.slice(clonePath.length + 1);
          const estimatedTokens = Math.ceil(content.length / 4);

          out.push({
            path: relativePath,
            content,
            size: fileStat.size,
            updated_at: fileStat.mtime.toISOString(),
            estimated_tokens: estimatedTokens,
          });
        } catch {
          // File disappeared between readdir and stat/readFile — skip.
        }
      }
    }
  }
}
