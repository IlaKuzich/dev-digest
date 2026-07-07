import { randomUUID } from 'node:crypto';
import type { Container } from '../../platform/container.js';
import type {
  EvalCase,
  EvalCaseInput,
  EvalRunResult,
  EvalRun,
  EvalBatchSummary,
  EvalDashboard,
  EvalDashboardOverview,
  EvalOwnerKind,
  Provider,
} from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { sliceDiff } from '@devdigest/reviewer-core';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModelStrict } from '../settings/feature-models.js';
import { loadDiff } from '../reviews/diff-loader.js';
import { EvalsRepository, type EvalCaseRow, type EvalRunRow } from './repository.js';
import {
  parseExpectedOutput,
  toEvalCaseDto,
  toEvalRunRecordDto,
  macroAverage,
  buildDashboard,
  buildRecentBatchSummaries,
} from './helpers.js';
import { scoreCase, caseTypeOf, computePass, computeSkillPass, computeCitationAccuracy } from './scoring.js';
import { REFERENCE_PROMPT } from './reference-prompt.js';
import { RECENT_RUNS_LIMIT } from './constants.js';
import type { AgentRow } from '../agents/repository.js';
import type { SkillRow } from '../skills/repository.js';

/**
 * A6 — evals service. Orchestrates: `EvalsRepository` (own tables) +
 * `container.agentsRepo` / `container.skillsRepo` (read-only owner lookups,
 * per the Onion cross-module-read rule) + `reviewPullRequest` from
 * `@devdigest/reviewer-core` (the ONLY place LLM calls happen in this module).
 * `scoring.ts` (pure, 0 LLM) does all the metric math.
 */
export class EvalsService {
  private repo: EvalsRepository;

  constructor(private container: Container) {
    this.repo = new EvalsRepository(container.db);
  }

  // ---- eval_cases CRUD ------------------------------------------------------

  async createCase(workspaceId: string, input: EvalCaseInput): Promise<EvalCase> {
    const row = await this.repo.insertCase({
      workspaceId,
      ownerKind: input.owner_kind,
      ownerId: input.owner_id,
      name: input.name,
      inputDiff: input.input_diff,
      inputFiles: input.input_files,
      inputMeta: input.input_meta,
      expectedOutput: input.expected_output,
      notes: input.notes ?? null,
    });
    return toEvalCaseDto(row);
  }

  async listCases(
    workspaceId: string,
    ownerKind?: EvalOwnerKind,
    ownerId?: string,
  ): Promise<EvalCase[]> {
    const rows = await this.repo.listCases(workspaceId, ownerKind, ownerId);
    return rows.map(toEvalCaseDto);
  }

  async getCase(workspaceId: string, id: string): Promise<EvalCase | undefined> {
    const row = await this.repo.getCase(workspaceId, id);
    return row ? toEvalCaseDto(row) : undefined;
  }

  async updateCase(
    workspaceId: string,
    id: string,
    patch: Partial<EvalCaseInput>,
  ): Promise<EvalCase | undefined> {
    const row = await this.repo.updateCase(workspaceId, id, {
      ...(patch.owner_kind !== undefined ? { ownerKind: patch.owner_kind } : {}),
      ...(patch.owner_id !== undefined ? { ownerId: patch.owner_id } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.input_diff !== undefined ? { inputDiff: patch.input_diff } : {}),
      ...(patch.input_files !== undefined ? { inputFiles: patch.input_files } : {}),
      ...(patch.input_meta !== undefined ? { inputMeta: patch.input_meta } : {}),
      ...(patch.expected_output !== undefined
        ? { expectedOutput: patch.expected_output }
        : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    });
    return row ? toEvalCaseDto(row) : undefined;
  }

  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteCase(workspaceId, id);
  }

  // ---- running cases ---------------------------------------------------------

  /** `POST /eval-cases/:id/run` — single case, either owner kind. */
  async runCase(workspaceId: string, caseId: string): Promise<EvalRunResult> {
    const evalCase = await this.repo.getCase(workspaceId, caseId);
    if (!evalCase) throw new NotFoundError('Eval case not found');

    const batchId = randomUUID();
    const ranAt = new Date();

    if (evalCase.ownerKind === 'agent') {
      const agent = await this.container.agentsRepo.getById(workspaceId, evalCase.ownerId);
      if (!agent) throw new NotFoundError('Agent not found for this eval case');
      const { runRow, result } = await this.runOneAgentCase(agent, evalCase, batchId, ranAt);
      return { run_id: runRow.id, case_id: evalCase.id, result };
    }

    const skill = await this.container.skillsRepo.getById(workspaceId, evalCase.ownerId);
    if (!skill) throw new NotFoundError('Skill not found for this eval case');
    const { provider, model } = await resolveFeatureModelStrict(this.container, workspaceId, 'eval');
    const { runRow, result } = await this.runOneSkillCase(
      provider,
      model,
      skill,
      evalCase,
      batchId,
      ranAt,
    );
    return { run_id: runRow.id, case_id: evalCase.id, result };
  }

  /**
   * `POST /agents/:id/eval-runs` — "Run all evals" for one agent (AC-6/AC-7).
   * `preloadedAgent` lets `runAllForWorkspace` pass an already-fetched agent
   * row (from its own single batched `listEnabled()` call) instead of this
   * method re-fetching it by id per agent in that loop — no N+1 repo read.
   */
  async runAgentEvals(
    workspaceId: string,
    agentId: string,
    preloadedAgent?: AgentRow,
  ): Promise<{ summary: EvalBatchSummary; runs: EvalRunResult[] }> {
    const agent = preloadedAgent ?? (await this.container.agentsRepo.getById(workspaceId, agentId));
    if (!agent) throw new NotFoundError('Agent not found');

    const cases = await this.repo.listCases(workspaceId, 'agent', agentId);
    const batchId = randomUUID();
    const ranAt = new Date();

    const runs: EvalRunResult[] = [];
    const runRows: EvalRunRow[] = [];
    for (const c of cases) {
      const { runRow, result } = await this.runOneAgentCase(agent, c, batchId, ranAt);
      runRows.push(runRow);
      runs.push({ run_id: runRow.id, case_id: c.id, result });
    }

    const avg = macroAverage(runRows);
    const summary: EvalBatchSummary = {
      batch_id: batchId,
      agent_id: agentId,
      agent_version: agent.version,
      ran_at: ranAt.toISOString(),
      cases_total: cases.length,
      recall: avg.recall,
      precision: avg.precision,
      citation_accuracy: avg.citation_accuracy,
      traces_passed: avg.traces_passed,
      cost_usd: avg.cost_usd,
    };
    return { summary, runs };
  }

  /** `POST /skills/:id/eval-runs` — runs every case owned by the skill
   *  (2 LLM calls each — AC-24). Resolves the "eval" feature model ONCE,
   *  up front, so a missing model config fails clean (AC-26) before any
   *  case runs at all. No `EvalBatchSummary` here — `EvalBatchSummary.agent_id`
   *  is non-nullable and skill batches have no agent (Q7). */
  async runSkillEvals(workspaceId: string, skillId: string): Promise<{ runs: EvalRunResult[] }> {
    const skill = await this.container.skillsRepo.getById(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Skill not found');

    const { provider, model } = await resolveFeatureModelStrict(this.container, workspaceId, 'eval');

    const cases = await this.repo.listCases(workspaceId, 'skill', skillId);
    const batchId = randomUUID();
    const ranAt = new Date();

    const runs: EvalRunResult[] = [];
    for (const c of cases) {
      const { runRow, result } = await this.runOneSkillCase(
        provider,
        model,
        skill,
        c,
        batchId,
        ranAt,
      );
      runs.push({ run_id: runRow.id, case_id: c.id, result });
    }
    return { runs };
  }

  /** `POST /eval-runs/all` — only enabled agents with ≥1 eval case (AC-16). */
  async runAllForWorkspace(workspaceId: string): Promise<EvalBatchSummary[]> {
    const agents = await this.container.agentsRepo.listEnabled(workspaceId);
    const caseCounts = await this.repo.casesCountByOwner(workspaceId, 'agent');
    const eligible = agents.filter((a) => (caseCounts.get(a.id) ?? 0) > 0);

    const summaries: EvalBatchSummary[] = [];
    for (const agent of eligible) {
      const { summary } = await this.runAgentEvals(workspaceId, agent.id, agent);
      summaries.push(summary);
    }
    return summaries;
  }

  // ---- per-case run helpers ---------------------------------------------------

  private taskLine(evalCase: EvalCaseRow): string {
    const meta = evalCase.inputMeta as { pr_title?: string } | null;
    return `Review: ${meta?.pr_title ?? evalCase.name}`;
  }

  private prDescription(evalCase: EvalCaseRow): string | undefined {
    const meta = evalCase.inputMeta as { pr_body?: string } | null;
    return meta?.pr_body;
  }

  /** One agent-owned case: exactly 1 `reviewPullRequest` call (AC-5). */
  private async runOneAgentCase(
    agent: AgentRow,
    evalCase: EvalCaseRow,
    batchId: string,
    ranAt: Date,
  ): Promise<{ runRow: EvalRunRow; result: EvalRun }> {
    const expected = parseExpectedOutput(evalCase.expectedOutput);
    const diff = parseUnifiedDiff(evalCase.inputDiff ?? '');
    const llm = await this.container.llm(agent.provider as Provider);
    const prDescription = this.prDescription(evalCase);

    const start = Date.now();
    const outcome = await reviewPullRequest({
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      diff,
      llm,
      ...(prDescription ? { prDescription } : {}),
      task: this.taskLine(evalCase),
    });
    const durationMs = Date.now() - start;

    const score = scoreCase(expected, outcome.review.findings);
    const caseType = caseTypeOf(expected);
    const pass = computePass(caseType, score);
    const citationAccuracy = computeCitationAccuracy(
      outcome.review.findings.length,
      outcome.dropped.length,
    );

    const runRow = await this.repo.insertRun({
      caseId: evalCase.id,
      ranAt,
      actualOutput: outcome.review.findings,
      pass,
      recall: score.recall,
      precision: score.precision,
      citationAccuracy,
      durationMs,
      costUsd: outcome.costUsd,
      batchId,
      agentVersion: agent.version,
    });

    const result: EvalRun = {
      recall: score.recall,
      precision: score.precision,
      citation_accuracy: citationAccuracy,
      traces_passed: pass ? 1 : 0,
      traces_total: 1,
      duration_ms: durationMs,
      cost_usd: outcome.costUsd,
      per_trace: [{ name: evalCase.name, pass, expected, actual: outcome.review.findings }],
    };
    return { runRow, result };
  }

  /**
   * Skills from untrusted external sources (URL / community) are
   * delimiter-wrapped so their body cannot act as injected instructions —
   * the EXACT same guard `run-executor.ts` applies before injecting a skill
   * body into a normal review prompt. Required here too: `runOneSkillCase`
   * concatenates the body directly into `systemPrompt` (AC-24/Q6's specified
   * shape), which is otherwise exactly the "never concatenate untrusted
   * content directly into the system prompt" case reviewer-core's own rules
   * warn about.
   */
  private static readonly UNTRUSTED_SKILL_SOURCES = new Set(['imported_url', 'community']);
  private wrapSkillBodyIfUntrusted(skill: SkillRow): string {
    if (!EvalsService.UNTRUSTED_SKILL_SOURCES.has(skill.source)) return skill.body;
    return `<untrusted source="skill:${skill.source}">\n${skill.body.replaceAll('</untrusted>', '<\\/untrusted>')}\n</untrusted>`;
  }

  /** One skill-owned case: exactly 2 `reviewPullRequest` calls — with/without
   *  the skill body appended to the fixed reference prompt (AC-24/AC-27/Q6). */
  private async runOneSkillCase(
    provider: Provider,
    model: string,
    skill: SkillRow,
    evalCase: EvalCaseRow,
    batchId: string,
    ranAt: Date,
  ): Promise<{ runRow: EvalRunRow; result: EvalRun }> {
    const expected = parseExpectedOutput(evalCase.expectedOutput);
    const diff = parseUnifiedDiff(evalCase.inputDiff ?? '');
    const llm = await this.container.llm(provider);
    const prDescription = this.prDescription(evalCase);
    const task = this.taskLine(evalCase);
    const skillBody = this.wrapSkillBodyIfUntrusted(skill);

    const withStart = Date.now();
    const withOutcome = await reviewPullRequest({
      systemPrompt: `${REFERENCE_PROMPT}\n\n${skillBody}`,
      model,
      diff,
      llm,
      ...(prDescription ? { prDescription } : {}),
      task,
    });
    const withDurationMs = Date.now() - withStart;

    const withoutStart = Date.now();
    const withoutOutcome = await reviewPullRequest({
      systemPrompt: REFERENCE_PROMPT,
      model,
      diff,
      llm,
      ...(prDescription ? { prDescription } : {}),
      task,
    });
    const withoutDurationMs = Date.now() - withoutStart;

    const withScore = scoreCase(expected, withOutcome.review.findings);
    const withoutScore = scoreCase(expected, withoutOutcome.review.findings);
    const caseType = caseTypeOf(expected);
    const pass = computeSkillPass(caseType, withScore, withoutScore);

    const withCitation = computeCitationAccuracy(
      withOutcome.review.findings.length,
      withOutcome.dropped.length,
    );
    const withoutCitation = computeCitationAccuracy(
      withoutOutcome.review.findings.length,
      withoutOutcome.dropped.length,
    );

    const durationMs = withDurationMs + withoutDurationMs;
    const costUsd =
      withOutcome.costUsd == null && withoutOutcome.costUsd == null
        ? null
        : (withOutcome.costUsd ?? 0) + (withoutOutcome.costUsd ?? 0);

    // Q6: top-level recall/precision/citation_accuracy mirror the WITH-skill
    // result (the headline number); the full with/without pair lives in
    // actual_output (jsonb — unstructured by design for exactly this).
    const actualOutput = {
      with: {
        findings: withOutcome.review.findings,
        recall: withScore.recall,
        precision: withScore.precision,
        citation_accuracy: withCitation,
      },
      without: {
        findings: withoutOutcome.review.findings,
        recall: withoutScore.recall,
        precision: withoutScore.precision,
        citation_accuracy: withoutCitation,
      },
    };

    const runRow = await this.repo.insertRun({
      caseId: evalCase.id,
      ranAt,
      actualOutput,
      pass,
      recall: withScore.recall,
      precision: withScore.precision,
      citationAccuracy: withCitation,
      durationMs,
      costUsd,
      batchId,
      agentVersion: null,
    });

    const result: EvalRun = {
      recall: withScore.recall,
      precision: withScore.precision,
      citation_accuracy: withCitation,
      traces_passed: pass ? 1 : 0,
      traces_total: 1,
      duration_ms: durationMs,
      cost_usd: costUsd,
      per_trace: [{ name: evalCase.name, pass, expected, actual: actualOutput }],
    };
    return { runRow, result };
  }

  // ---- dashboards -------------------------------------------------------------

  /** `GET /agents/:id/eval-dashboard` / `GET /skills/:id/eval-dashboard`. */
  async dashboardForOwner(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<EvalDashboard> {
    if (ownerKind === 'agent') {
      const agent = await this.container.agentsRepo.getById(workspaceId, ownerId);
      if (!agent) throw new NotFoundError('Agent not found');
    } else {
      const skill = await this.container.skillsRepo.getById(workspaceId, ownerId);
      if (!skill) throw new NotFoundError('Skill not found');
    }

    const cases = await this.repo.listCases(workspaceId, ownerKind, ownerId);
    const runs = await this.repo.runsForOwnerKind(workspaceId, ownerKind, ownerId);
    const recentRuns = runs
      .slice(0, RECENT_RUNS_LIMIT)
      .map((r) => toEvalRunRecordDto(r.run, r.caseName));

    return buildDashboard(ownerKind, ownerId, cases.length, runs, recentRuns);
  }

  /** `GET /eval-dashboard` — workspace landing overview (AC-13/14/15). */
  async dashboardOverview(workspaceId: string): Promise<EvalDashboardOverview> {
    const agents = await this.container.agentsRepo.list(workspaceId);
    const allRuns = await this.repo.runsForOwnerKind(workspaceId, 'agent');
    const caseCounts = await this.repo.casesCountByOwner(workspaceId, 'agent');

    const runsByAgent = new Map<string, typeof allRuns>();
    for (const r of allRuns) {
      const arr = runsByAgent.get(r.ownerId) ?? [];
      arr.push(r);
      runsByAgent.set(r.ownerId, arr);
    }

    const agentDashboards = agents.map((agent) => {
      const runs = runsByAgent.get(agent.id) ?? [];
      const recentRuns = runs
        .slice(0, RECENT_RUNS_LIMIT)
        .map((r) => toEvalRunRecordDto(r.run, r.caseName));
      return buildDashboard('agent', agent.id, caseCounts.get(agent.id) ?? 0, runs, recentRuns);
    });

    const recentRuns = buildRecentBatchSummaries(allRuns, RECENT_RUNS_LIMIT);
    return { agents: agentDashboards, recent_runs: recentRuns };
  }

  // ---- findings prefill ---------------------------------------------------------

  /**
   * `POST /findings/:id/eval-case` — build (never insert) an `EvalCaseInput`
   * prefilled from a resolved finding (AC-9). Accepted → one expected finding;
   * dismissed (or otherwise unresolved) → empty `expected_output`.
   */
  async prefillFromFinding(workspaceId: string, findingId: string): Promise<EvalCaseInput> {
    const ctx = await this.container.reviewRepo.findingContext(findingId);
    if (!ctx || ctx.pull.workspaceId !== workspaceId) {
      throw new NotFoundError('Finding not found');
    }
    const { finding, review, pull } = ctx;

    const expectedOutput =
      finding.acceptedAt != null
        ? [
            {
              file: finding.file,
              start_line: finding.startLine,
              end_line: finding.endLine,
              severity: finding.severity,
              category: finding.category,
              title: finding.title,
            },
          ]
        : [];

    const repoRow = await this.container.reviewRepo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found for this finding');

    const diff = await loadDiff(this.container, this.container.reviewRepo, workspaceId, pull, repoRow);
    // sliceDiff's own fallback returns the WHOLE raw diff when the file isn't
    // found — that does not match the "file missing → empty input_diff" edge
    // case, so check presence explicitly first.
    const fileInDiff = diff.files.some((f) => f.path === finding.file);
    const inputDiff = fileInDiff ? sliceDiff(diff, finding.file) : '';

    return {
      owner_kind: 'agent',
      owner_id: review.agentId ?? '',
      name: `From finding: ${finding.title}`,
      input_diff: inputDiff,
      input_files: null,
      input_meta: {
        pr_title: `PR #${pull.number}: ${pull.title}`,
        ...(pull.body ? { pr_body: pull.body } : {}),
      },
      expected_output: expectedOutput,
      notes: `Prefilled from finding ${finding.id} (${finding.acceptedAt != null ? 'accepted' : 'dismissed'}).`,
    };
  }
}
