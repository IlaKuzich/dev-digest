import type {
  Onboarding,
  CriticalPathItem,
  DiagramNode,
  DiagramEdge,
  ArchitectureSection,
} from "@devdigest/shared";
import { NODE_MAX } from "./constants.js";

/**
 * grounding.ts — strips hallucinated references from the LLM output.
 * All functions are pure: (llmOutput, knownFacts) → cleaned output.
 */

export interface KnownFacts {
  /** All real file paths known from rank/edges/facts */
  filePaths: Set<string>;
  /** Package names from package.json files */
  packageNames: Set<string>;
  /** Service names from docker-compose */
  serviceNames: Set<string>;
}

/**
 * Apply grounding gate to a raw LLM-produced Onboarding object.
 * Mutates a deep clone; never mutates the input.
 */
export function applyGrounding(raw: Onboarding, known: KnownFacts): Onboarding {
  const result = structuredClone(raw);

  // 1. Critical paths: admit only kind:'file' items whose file is known
  result.sections.criticalPaths = result.sections.criticalPaths.filter((item) =>
    isKnownPath(item.file, known.filePaths),
  );

  // 2. Reading path: keep only items pointing to known files
  result.sections.readingPath = result.sections.readingPath.filter((item) =>
    isKnownPath(item.file, known.filePaths),
  );

  // 3. First tasks: suggestedPath should NOT be an existing file
  // (it's a new location — we keep it as-is but drop items duplicating a known path)
  result.sections.firstTasks = result.sections.firstTasks.filter(
    (task) => !known.filePaths.has(task.suggestedPath),
  );

  // 4. Architecture: strip nodes whose id isn't in the known union
  result.sections.architecture = applyArchitectureGrounding(
    result.sections.architecture,
    known,
  );

  return result;
}

/**
 * Enforce node-cap on architecture section.
 * Top-NODE_MAX nodes by appearance order; remainder → one overflow node.
 */
export function enforceNodeCap(
  section: ArchitectureSection,
): ArchitectureSection {
  if (section.nodes.length <= NODE_MAX) return section;

  const kept = section.nodes.slice(0, NODE_MAX);
  const overflow = section.nodes.slice(NODE_MAX);

  const keptIds = new Set(kept.map((n) => n.id));

  const overflowNode: DiagramNode = {
    id: "__overflow__",
    label: `+${overflow.length} more`,
    kind: "package",
    isOverflow: true,
  };

  // Keep only edges between kept nodes (+ edges to overflow aggregated)
  const filteredEdges: DiagramEdge[] = section.edges.filter(
    (e) => keptIds.has(e.from) && keptIds.has(e.to),
  );

  return {
    ...section,
    nodes: [...kept, overflowNode],
    edges: filteredEdges,
  };
}

function applyArchitectureGrounding(
  section: ArchitectureSection,
  known: KnownFacts,
): ArchitectureSection {
  const allKnownIds = new Set([
    ...known.filePaths,
    ...known.packageNames,
    ...known.serviceNames,
  ]);

  const validNodes = section.nodes.filter(
    (n) =>
      n.isOverflow ||
      allKnownIds.has(n.id) ||
      // allow short labels that map to known package/service names
      known.packageNames.has(n.label) ||
      known.serviceNames.has(n.label),
  );

  const validNodeIds = new Set(validNodes.map((n) => n.id));
  const validEdges = section.edges.filter(
    (e) => validNodeIds.has(e.from) && validNodeIds.has(e.to),
  );

  const grounded: ArchitectureSection = {
    ...section,
    nodes: validNodes,
    edges: validEdges,
  };
  return enforceNodeCap(grounded);
}

/**
 * WHERE a repo has multiple packages, Critical Paths must reserve at least
 * 1-2 slots per detected package before filling the rest by global rank
 * (AC-18/R21). The LLM's own `criticalPaths` selection is free-form (given
 * ranked files as context, not a "use as-is" precomputed list like howToRun/
 * firstTasks), so a single-package-dominant selection is possible — this is a
 * deterministic supplement, never an LLM decision. Single-package repos are
 * trivially satisfied (nothing to reserve) and returned unchanged.
 */
export function ensurePackageCoverage(
  criticalPaths: CriticalPathItem[],
  packages: Array<{ name?: string; relativePath: string }>,
  rankedPaths: string[],
  buildOpenUrl: (file: string) => string,
): CriticalPathItem[] {
  if (packages.length <= 1) return criticalPaths;

  const result = [...criticalPaths];
  for (const pkg of packages) {
    const pkgDir = pkg.relativePath.replace(/\/package\.json$/, "");
    const belongsToPkg = (p: string) =>
      pkgDir === "" || p === pkgDir || p.startsWith(`${pkgDir}/`);

    if (result.some((item) => belongsToPkg(item.file))) continue;

    const topFileForPkg = rankedPaths.find(belongsToPkg);
    if (!topFileForPkg) continue; // no known ranked file for this package yet

    result.push({
      file: topFileForPkg,
      whyItMatters: `Top-ranked file in the ${pkg.name ?? pkgDir} package`,
      openUrl: buildOpenUrl(topFileForPkg),
    });
  }
  return result;
}

/**
 * Fuzzy path check: exact match OR the known set contains a path ending with the
 * provided suffix (e.g. LLM says "service.ts" but known path is "src/modules/x/service.ts").
 */
function isKnownPath(path: string, knownPaths: Set<string>): boolean {
  if (knownPaths.has(path)) return true;
  // allow suffix match for short paths
  if (!path.includes("/")) {
    for (const known of knownPaths) {
      if (known.endsWith("/" + path)) return true;
    }
  }
  return false;
}
