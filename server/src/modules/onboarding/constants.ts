import type { GapType, Complexity } from "@devdigest/shared";

/**
 * Deterministic complexity mapping for First Tasks gap types.
 * Can be bumped one level when target fan-in is high (see service.ts).
 */
export const BASE_COMPLEXITY: Record<GapType, Complexity> = {
  "missing-doc": "Low",
  "missing-pattern": "Low",
  "missing-test": "Medium",
};

/**
 * Bump map: Low → Medium → High (capped at High).
 */
export const COMPLEXITY_BUMP: Record<Complexity, Complexity> = {
  Low: "Medium",
  Medium: "High",
  High: "High",
};

/**
 * Fan-in threshold: if a file has >= this many incoming edges, bump complexity.
 */
export const HIGH_FAN_IN_THRESHOLD = 5;

/**
 * Diagram node count limits.
 * Keep 5–8 top nodes; anything above NODE_MAX collapses into one overflow node.
 */
export const NODE_MIN = 5;
export const NODE_MAX = 8;

/**
 * How many days of commit history to fetch for hotness ranking.
 */
export const HOTNESS_DAYS = 90;

/**
 * Over-fetch multiplier: fetch N_CANDIDATES * CANDIDATE_MULTIPLIER paths from
 * getTopFilesByRank before trimming to diagram/reading-path sizes.
 */
export const CANDIDATE_MULTIPLIER = 3;

/**
 * Top-N candidates to pass to getCommitActivity (never the whole repo).
 */
export const N_HOTNESS_CANDIDATES = 25;

/**
 * v1 three-item style-conditional checklist for missing-pattern detection.
 * Each item: { packageRole, check, suggestedPattern }
 */
export const STYLE_CHECKLIST: Array<{
  role: "backend" | "frontend" | "any";
  patternName: string;
  /** glob-ish pattern that SHOULD exist somewhere in the package; absence = gap */
  markerPattern: string;
  /** Pointer to a sibling file that demonstrates the pattern */
  patternPointerHint: string;
  /** New-location template (relative to the package dir) proposed for the gap */
  suggestedPathTemplate: string;
}> = [
  {
    role: "backend",
    patternName: "health/readiness endpoint",
    markerPattern: "/health",
    patternPointerHint: "src/app.ts",
    suggestedPathTemplate: "src/routes/health.ts",
  },
  {
    role: "backend",
    patternName: "rate-limiting middleware",
    markerPattern: "rateLimit",
    patternPointerHint: "src/app.ts",
    suggestedPathTemplate: "src/platform/rate-limit.ts",
  },
  {
    role: "frontend",
    patternName: "error boundary",
    markerPattern: "ErrorBoundary",
    patternPointerHint: "src/app/layout.tsx",
    suggestedPathTemplate: "src/app/error.tsx",
  },
  {
    role: "frontend",
    patternName: "loading state",
    markerPattern: "loading.tsx",
    patternPointerHint: "src/app/loading.tsx",
    suggestedPathTemplate: "src/app/loading.tsx",
  },
];
