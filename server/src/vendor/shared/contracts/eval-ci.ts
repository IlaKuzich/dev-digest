import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import {
  EvalRun,
  EvalOwnerKind,
  Conformance,
  Provider,
  CiFailOn,
  AgentVersionConfig,
} from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted run record + dashboard
// ===========================================================================

/** Create/update payload for an eval case (id + owner resolved by the route). */
export const EvalCaseInput = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string().min(1),
  input_diff: z.string().default(''),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

/** A persisted eval run row (one execution of a case), returned by the API. */
export const EvalRunRecord = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string().nullish(),
  ran_at: z.string(),
  actual_output: z.unknown(),
  pass: z.boolean().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

/** Result of running a single case: the metrics (EvalRun) + the persisted row id. */
export const EvalRunResult = z.object({
  run_id: z.string(),
  case_id: z.string(),
  result: EvalRun,
});
export type EvalRunResult = z.infer<typeof EvalRunResult>;

/** One point on the dashboard trend (per run, chronological). */
export const EvalTrendPoint = z.object({
  ran_at: z.string(),
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
  pass_rate: z.number(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Aggregate dashboard for an owner (agent/skill) or the whole workspace. */
export const EvalDashboard = z.object({
  owner_kind: EvalOwnerKind.nullable(),
  owner_id: z.string().nullable(),
  cases_total: z.number().int(),
  current: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
    traces_passed: z.number().int(),
    traces_total: z.number().int(),
    cost_usd: z.number().nullable(),
  }),
  delta: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
  }),
  trend: z.array(EvalTrendPoint),
  recent_runs: z.array(EvalRunRecord),
  alert: z.string().nullable(),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

// ===========================================================================
// Eval — batch runs (run-groups) + cross-agent dashboard + compare + promote
// ===========================================================================

/**
 * One `eval_batches` row: a single execution of the whole case set at a given
 * agent version (AC-24, AC-41). Aggregates are null when the batch produced no
 * scored cases (e.g. every case errored).
 */
export const EvalBatchRun = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_name: z.string().nullish(),
  agent_version: z.number().int(),
  status: z.enum(['running', 'done', 'error']),
  ran_at: z.string(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  cost_usd: z.number().nullable(),
});
export type EvalBatchRun = z.infer<typeof EvalBatchRun>;

/** Response of `POST /agents/:id/eval-runs` (Run all evals). */
export const EvalBatchResult = z.object({
  batch: EvalBatchRun,
  results: z.array(EvalRunResult),
});
export type EvalBatchResult = z.infer<typeof EvalBatchResult>;

/** Dashboard-home per-agent row (AC-18). */
export const AgentEvalSummary = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  provider: Provider,
  model: z.string(),
  last_version: z.number().int().nullable(),
  last_ran_at: z.string().nullable(),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  sparkline: z.array(z.number()),
});
export type AgentEvalSummary = z.infer<typeof AgentEvalSummary>;

/** `GET /eval-dashboard` — cross-agent dashboard home (AC-18/19). */
export const EvalDashboardHome = z.object({
  agents: z.array(AgentEvalSummary),
  recent_runs: z.array(EvalBatchRun),
});
export type EvalDashboardHome = z.infer<typeof EvalDashboardHome>;

/**
 * `GET /agents/:id/eval-dashboard` — per-agent detail; feeds BOTH the Evals
 * tab tiles (AC-8) and the eval detail page (AC-23/24/25).
 */
export const AgentEvalDashboard = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  provider: Provider,
  model: z.string(),
  current: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
    traces_passed: z.number().int(),
    traces_total: z.number().int(),
    cost_usd: z.number().nullable(),
  }),
  delta: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
  }),
  trend: z.array(EvalTrendPoint),
  recent_runs: z.array(EvalBatchRun),
  /** True while a "Run all evals" batch is genuinely in flight for this
   *  agent (server-tracked — survives a client reload; see EvalBatchRun.status). */
  running: z.boolean(),
  alert: z.string().nullable(),
});
export type AgentEvalDashboard = z.infer<typeof AgentEvalDashboard>;

/** A single metric's old→new comparison (AC-27). */
export const EvalCompareMetric = z.object({
  old: z.number().nullable(),
  new: z.number().nullable(),
  delta: z.number().nullable(),
});
export type EvalCompareMetric = z.infer<typeof EvalCompareMetric>;

/**
 * `GET /agents/:id/eval-runs/compare?a=<batchId>&b=<batchId>` — two batch
 * runs, their metric deltas, and the recorded system-prompt configs for the
 * prompt diff (AC-27/28). `old_config`/`new_config` are null when the
 * corresponding `agent_versions` snapshot is missing/malformed — the compare
 * degrades gracefully rather than 500ing (AC-28 edge case).
 */
export const EvalCompare = z.object({
  a: EvalBatchRun,
  b: EvalBatchRun,
  recall: EvalCompareMetric,
  precision: EvalCompareMetric,
  citation_accuracy: EvalCompareMetric,
  cost: EvalCompareMetric,
  old_config: AgentVersionConfig.nullable(),
  new_config: AgentVersionConfig.nullable(),
});
export type EvalCompare = z.infer<typeof EvalCompare>;

/**
 * Request body for `POST /agents/:id/promote` — forward-only re-apply of a
 * past version's config as the new highest version (AC-29..31), mirroring
 * the skills forward-only restore pattern. Response is the existing `Agent`
 * shape (no new response contract needed).
 */
export const EvalPromoteInput = z.object({
  version: z.number().int(),
});
export type EvalPromoteInput = z.infer<typeof EvalPromoteInput>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio (`CiService.agentYaml`) WRITES this shape to
 * `.devdigest/agents/<slug>.yaml`; the agent-runner READS it. Keeping one Zod
 * schema for both ends guarantees the formats never drift. `skills` are slugs
 * resolved to `.devdigest/skills/<slug>.md`.
 */
export const AgentManifest = z.object({
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch) — normalize both
  // to an empty array so manifests without skills validate cleanly.
  skills: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy (see CiFailOn) — when the posted review should BLOCK
  // (REQUEST_CHANGES + fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiExportInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget.default('gha'),
  /** "open_pr" opens a PR with the files; "files" returns a zip; "preview" returns files as JSON for the wizard. */
  action: z.enum(['open_pr', 'files', 'preview']).default('open_pr'),
  post_as: z.enum(['github_review', 'pr_comment', 'none']).default('github_review'),
  triggers: z.array(z.string()).default(['opened', 'synchronize', 'reopened']),
  base: z.string().default('main'),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci`. */
export const CiExport = z.object({
  installation: CiInstallation,
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
});
export type CiExport = z.infer<typeof CiExport>;

/** One installation row for the agent CI tab (installation + latest-run join). */
export const CiInstallationRow = CiInstallation.extend({
  last_run_status: z.string().nullable(),
  last_ran_at: z.string().nullable(),
});
export type CiInstallationRow = z.infer<typeof CiInstallationRow>;

/** Response of `GET /agents/:id/ci-installations`. */
export const CiInstallationsResponse = z.object({
  installations: z.array(CiInstallationRow),
  active_count: z.number().int(),
});
export type CiInstallationsResponse = z.infer<typeof CiInstallationsResponse>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  ci_installation_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  pr_title: z.string().nullable(),
  ran_at: z.string().nullable(),
  status: z.string().nullable(),
  findings_count: z.number().int().nullable(),
  critical: z.number().int().nullable(),
  warning: z.number().int().nullable(),
  suggestion: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  github_url: z.string().nullable(),
  source: z.string().nullable(),
  /** repo (from ci_installations join) — used by the CI Runs table + Trace. */
  repo: z.string().nullish(),
  /** target_type (from ci_installations join) — SOURCE column. */
  target_type: CiTarget.nullish(),
  agent: z.string().nullish(),
  duration_s: z.number().nullish(),
  /** Individual findings joined from ci_run_findings (unordered; render-sorted). */
  findings: z.array(Finding).default([]),
});
export type CiRun = z.infer<typeof CiRun>;

/**
 * The artifact shape uploaded by the CI action (`devdigest-result.json`).
 * Ingested back on refresh to populate `ci_runs` (L06).
 */
export const CiResultArtifact = z.object({
  findings_count: z.number().int(),
  critical: z.number().int().nullish(),
  warning: z.number().int().nullish(),
  suggestion: z.number().int().nullish(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullish(),
  agent: z.string(),
  version: z.string().nullish(),
  pr_number: z.number().int().nullish(),
  findings: z.array(Finding),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

/** Server-side filters for `GET /ci-runs` (all optional). */
export const CiRunsQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  agent: z.string().optional(),
  repo: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
});
export type CiRunsQuery = z.infer<typeof CiRunsQuery>;

/** Response of `GET /ci-runs`. */
export const CiRunsResponse = z.object({
  runs: z.array(CiRun),
});
export type CiRunsResponse = z.infer<typeof CiRunsResponse>;

/** Body for `POST /ci-runs/refresh` (optional repo filter). */
export const CiRefreshInput = z.object({
  repo: z.string().optional(),
});
export type CiRefreshInput = z.infer<typeof CiRefreshInput>;

/** Result of an ingest refresh (shown by AutoTriggerStatus). */
export const CiRefreshResult = z.object({
  synced_at: z.string(),
  ingested: z.number().int(),
  installations_checked: z.number().int(),
});
export type CiRefreshResult = z.infer<typeof CiRefreshResult>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
