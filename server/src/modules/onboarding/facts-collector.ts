import { readFile, readdir, stat, access } from "node:fs/promises";
import { join } from "node:path";

/**
 * facts-collector.ts — pure filesystem & heuristic functions.
 * NO imports from context/service.ts, repo-intel, or any module service.
 * All functions are stateless: given a clonePath, return deterministic facts.
 */

export interface PackageInfo {
  /** Path to package.json relative to clonePath */
  relativePath: string;
  /** Absolute path to the directory containing package.json */
  dir: string;
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  /** Inferred role based on dependencies */
  role: "backend" | "frontend" | "unknown";
}

export interface DockerService {
  name: string;
  image?: string;
  ports?: string[];
}

export interface CollectedFacts {
  packageManager: "pnpm" | "npm" | "yarn" | "bun" | "unknown";
  packages: PackageInfo[];
  dockerServices: DockerService[];
  envVars: string[];
  orchestrationScripts: string[];
  entrypoint: string;
}

// ---- Package manager detection -----------------------------------------------

export async function detectPackageManager(
  clonePath: string,
): Promise<CollectedFacts["packageManager"]> {
  const checks: Array<[string, CollectedFacts["packageManager"]]> = [
    ["pnpm-lock.yaml", "pnpm"],
    ["bun.lockb", "bun"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ];
  for (const [file, pm] of checks) {
    try {
      await access(join(clonePath, file));
      return pm;
    } catch {
      // not found
    }
  }
  return "unknown";
}

// ---- Package.json discovery --------------------------------------------------

export async function findPackageJsons(
  clonePath: string,
): Promise<PackageInfo[]> {
  const results: PackageInfo[] = [];
  await walkForPackageJsons(clonePath, clonePath, results, 0);
  return results;
}

async function walkForPackageJsons(
  root: string,
  dir: string,
  results: PackageInfo[],
  depth: number,
): Promise<void> {
  if (depth > 4) return;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }

  const skip = new Set([
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    "coverage",
  ]);

  for (const entry of entries) {
    if (skip.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = await stat(full);
    } catch {
      continue;
    }

    if (st.isDirectory()) {
      await walkForPackageJsons(root, full, results, depth + 1);
    } else if (entry === "package.json") {
      try {
        const raw = JSON.parse(await readFile(full, "utf-8"));
        const relativePath = full.replace(root + "/", "");
        const deps = { ...raw.dependencies, ...raw.devDependencies };
        const isBackend =
          "fastify" in deps ||
          "express" in deps ||
          "koa" in deps ||
          "hono" in deps;
        const isFrontend =
          "react" in deps ||
          "next" in deps ||
          "vue" in deps ||
          "svelte" in deps;
        results.push({
          relativePath,
          dir: join(root, relativePath.replace("/package.json", "")),
          name: raw.name,
          scripts: raw.scripts,
          dependencies: raw.dependencies,
          devDependencies: raw.devDependencies,
          role: isBackend ? "backend" : isFrontend ? "frontend" : "unknown",
        });
      } catch {
        // malformed JSON — skip
      }
    }
  }
}

// ---- docker-compose parsing --------------------------------------------------

export async function parseDockerCompose(
  clonePath: string,
): Promise<DockerService[]> {
  const candidates = [
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
  ];

  for (const name of candidates) {
    const full = join(clonePath, name);
    try {
      const raw = await readFile(full, "utf-8");
      return extractDockerServices(raw);
    } catch {
      // not found
    }
  }
  return [];
}

/** Lightweight regex-based docker-compose service extractor (no YAML lib required). */
function extractDockerServices(content: string): DockerService[] {
  const services: DockerService[] = [];
  const servicesMatch = content.match(/^services:\s*\n([\s\S]*?)(?=^\w|\Z)/m);
  if (!servicesMatch) return services;

  const block = servicesMatch[1] ?? "";
  const serviceNameRe = /^  (\w[\w-]*)\s*:/gm;
  let m: RegExpExecArray | null;

  while ((m = serviceNameRe.exec(block)) !== null) {
    const name = m[1]!;
    // Extract image if present in the next ~10 lines after the service heading
    const afterService = block.slice(m.index);
    const imageMatch = afterService.match(/^\s+image:\s*(.+)/m);
    const portsMatches = [...afterService.matchAll(/^\s+-\s+"?(\d+:\d+)"?/gm)];
    services.push({
      name,
      image: imageMatch?.[1]?.trim(),
      ports: portsMatches.map((p) => p[1]!),
    });
  }
  return services;
}

// ---- .env.example parsing ---------------------------------------------------

export async function parseEnvExample(clonePath: string): Promise<string[]> {
  const candidates = [".env.example", ".env.sample", ".env.template", ".env"];
  for (const name of candidates) {
    try {
      const raw = await readFile(join(clonePath, name), "utf-8");
      return raw
        .split("\n")
        .filter((l) => /^[A-Z_][A-Z0-9_]*\s*=/.test(l))
        .map((l) => l.split("=")[0]!.trim())
        .filter(Boolean);
    } catch {
      // not found
    }
  }
  return [];
}

// ---- Orchestration scripts discovery ----------------------------------------

export async function findOrchestrationScripts(
  clonePath: string,
): Promise<string[]> {
  const candidates = ["Makefile", "justfile", "taskfile.yml", "Taskfile.yml"];
  const found: string[] = [];
  for (const name of candidates) {
    try {
      await access(join(clonePath, name));
      found.push(name);
    } catch {
      // not present
    }
  }
  return found;
}

// ---- Entrypoint heuristic ---------------------------------------------------

export function detectEntrypoint(packages: PackageInfo[]): string {
  // Prefer a "server" or "api" package, then any backend, then any frontend
  const ordered = [...packages].sort((a, b) => {
    const scoreA = a.role === "backend" ? 2 : a.role === "frontend" ? 1 : 0;
    const scoreB = b.role === "backend" ? 2 : b.role === "frontend" ? 1 : 0;
    return scoreB - scoreA;
  });

  for (const pkg of ordered) {
    const dev = pkg.scripts?.["dev"] ?? pkg.scripts?.["start"];
    if (dev) return dev;
  }
  return "pnpm install && pnpm dev";
}

// ---- High-level collector ---------------------------------------------------

export async function collectFacts(clonePath: string): Promise<CollectedFacts> {
  const [
    packageManager,
    packages,
    dockerServices,
    envVars,
    orchestrationScripts,
  ] = await Promise.all([
    detectPackageManager(clonePath),
    findPackageJsons(clonePath),
    parseDockerCompose(clonePath),
    parseEnvExample(clonePath),
    findOrchestrationScripts(clonePath),
  ]);

  return {
    packageManager,
    packages,
    dockerServices,
    envVars,
    orchestrationScripts,
    entrypoint: detectEntrypoint(packages),
  };
}
