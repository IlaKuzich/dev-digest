import type { Container } from '../../platform/container.js';
import type {
  Agent,
  AgentEvalDashboard,
  EvalBatchRun,
  EvalBatchResult,
  EvalCompare,
  EvalDashboardHome,
  EvalRunResult,
} from '@devdigest/shared';
import { reviewPullRequest, type ReviewOutcome } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { AgentsService } from '../agents/service.js';
import {
  citationAccuracy,
  microAggregate,
  scoreCase,
  type CaseType,
  type Located,
  type ScoreCaseResult,
} from './scoring.js';
import {
  buildSingleFileDiff,
  formatSkillsForPrompt,
  safeParseVersionConfig,
  slugifyCaseName,
  toEvalBatchRunDto,
  toAgentEvalDashboard,
  toEvalCaseDto,
  toEvalCompare,
  toEvalDashboardHome,
  toLocatedArray,
  type EvalCaseDto,
} from './helpers.js';
import { EvalRepository, type AgentRow, type EvalCaseRow } from './repository.js';
import { RECENT_BATCHES_LIMIT } from './constants.js';

/**
 * T4 — eval service. Business logic for Surfaces A–D: one-click capture
 * (Group A), case CRUD + single-case run (Group B), the cross-agent dashboard
 * (Group C), per-agent detail/compare/promote (Group D). All scoring math is
 * T3's `scoring.ts` (imported, never re-derived); the only I/O added here is
 * the SAME `reviewPullRequest` engine seam production reviews use (AC-32).
 */

export interface CreateEvalCaseInput {
  name: string;
  input_diff?: string;
  input_files?: unknown;
  input_meta?: unknown;
  expected_output: unknown;
  notes?: string | null;
}

export interface UpdateEvalCaseInput {
  name?: string;
  input_diff?: string;
  input_files?: unknown;
  input_meta?: unknown;
  expected_output?: unknown;
  notes?: string | null;
}

/** Result of running one case against the engine (before persistence). */
interface CaseExecution {
  score: ScoreCaseResult;
  citation: number;
  keptCount: number;
  droppedCount: number;
  durationMs: number;
  costUsd: number | null;
  actualOutput: unknown;
}

export class EvalService {
  private repo: EvalRepository;

  constructor(private container: Container) {
    this.repo = new EvalRepository(container.db);
  }

  // ---- Group A — capture (AC-1..6) ----------------------------------------

  async captureFromFinding(workspaceId: string, findingId: string): Promise<EvalCaseDto> {
    const ctx = await this.container.reviewRepo.findingContext(findingId);
    if (!ctx || ctx.pull.workspaceId !== workspaceId) {
      throw new NotFoundError('Finding not found');
    }
    const { finding, review, pull } = ctx;

    // AC-6 — a summary/agent-less review can't own an eval case.
    if (!review.agentId) {
      throw new AppError(
        'no_agent_owner',
        'Cannot create an eval case from a review with no owning agent',
        400,
      );
    }
    // Defense-in-depth mirror of AC-7's client-side disabled state: the
    // case type must be unambiguous from a decision that has actually been made.
    if (!finding.acceptedAt && !finding.dismissedAt) {
      throw new ValidationError(
        'Finding must be accepted or dismissed before it can become an eval case',
      );
    }

    // AC-2 — freeze ONLY the finding's file, at creation time.
    const files = await this.container.reviewRepo.getPrFiles(pull.id);
    const inputDiff = buildSingleFileDiff(files, finding.file);

    // AC-3/AC-4 — accepted → must_find (one expected finding); dismissed → must_not_flag ([]).
    const expectedOutput = finding.acceptedAt
      ? [
          {
            severity: finding.severity,
            category: finding.category,
            title: finding.title,
            file: finding.file,
            start_line: finding.startLine,
            end_line: finding.endLine,
          },
        ]
      : [];

    const row = await this.repo.insertCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: review.agentId,
      name: slugifyCaseName(finding.title),
      inputDiff,
      expectedOutput,
    });
    return toEvalCaseDto(row);
    // AC-5 — nothing above touches `finding.accepted_at`/`dismissed_at`.
  }

  // ---- Group B — case CRUD -------------------------------------------------

  async createCase(
    workspaceId: string,
    agentId: string,
    input: CreateEvalCaseInput,
  ): Promise<EvalCaseDto | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const row = await this.repo.insertCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agentId,
      name: input.name,
      inputDiff: input.input_diff,
      inputFiles: input.input_files,
      inputMeta: input.input_meta,
      expectedOutput: input.expected_output,
      notes: input.notes,
    });
    return toEvalCaseDto(row);
  }

  async listCases(workspaceId: string, agentId: string): Promise<EvalCaseDto[] | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const [rows, lastRuns] = await Promise.all([
      this.repo.listCasesForAgent(workspaceId, agentId),
      this.repo.lastRunByCase(workspaceId, agentId),
    ]);
    return rows.map((row) => toEvalCaseDto(row, lastRuns.get(row.id)));
  }

  async updateCase(
    workspaceId: string,
    caseId: string,
    patch: UpdateEvalCaseInput,
  ): Promise<EvalCaseDto | undefined> {
    const row = await this.repo.updateCase(workspaceId, caseId, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.input_diff !== undefined ? { inputDiff: patch.input_diff } : {}),
      ...(patch.input_files !== undefined ? { inputFiles: patch.input_files } : {}),
      ...(patch.input_meta !== undefined ? { inputMeta: patch.input_meta } : {}),
      ...(patch.expected_output !== undefined ? { expectedOutput: patch.expected_output } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    });
    return row ? toEvalCaseDto(row) : undefined;
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<boolean> {
    return this.repo.deleteCase(workspaceId, caseId);
  }

  // ---- Group E engine seam (AC-32/33/37) -----------------------------------

  /** Execute ONE case through the same `reviewPullRequest` engine path
   *  production reviews use, then score it deterministically (T3). Throws on
   *  an engine failure — callers decide isolate-vs-propagate (AC-42). */
  private async executeCase(
    agent: AgentRow,
    skills: string[],
    caseRow: EvalCaseRow,
  ): Promise<CaseExecution> {
    const start = Date.now();
    const llm = await this.container.llm(agent.provider);
    const diff = parseUnifiedDiff(caseRow.inputDiff ?? '');
    const outcome: ReviewOutcome = await reviewPullRequest({
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      diff,
      llm,
      strategy: agent.strategy,
      ...(skills.length ? { skills } : {}),
    });

    const produced: Located[] = outcome.review.findings.map((f) => ({
      file: f.file,
      start_line: f.start_line,
      end_line: f.end_line,
    }));
    const expected = toLocatedArray(caseRow.expectedOutput);
    const score = scoreCase({ produced, expected });
    // AC-37 — citation accuracy from grounding survivors (kept vs dropped).
    const citation = citationAccuracy(outcome.review.findings.length, outcome.dropped.length);

    return {
      score,
      citation,
      keptCount: outcome.review.findings.length,
      droppedCount: outcome.dropped.length,
      durationMs: Date.now() - start,
      costUsd: outcome.costUsd,
      actualOutput: outcome.review.findings,
    };
  }

  /** Build the `EvalRunResult` for one case's execution (success or failure). */
  private toRunResult(runId: string, caseRow: EvalCaseRow, exec: CaseExecution | null, error: string | null): EvalRunResult {
    const actual = exec ? exec.actualOutput : { error };
    return {
      run_id: runId,
      case_id: caseRow.id,
      result: {
        recall: exec ? exec.score.recall ?? 1 : 0,
        precision: exec ? exec.score.precision : 0,
        citation_accuracy: exec ? exec.citation : 0,
        traces_passed: exec?.score.pass ? 1 : 0,
        traces_total: 1,
        duration_ms: exec ? exec.durationMs : 0,
        cost_usd: exec ? exec.costUsd : null,
        per_trace: [
          {
            name: caseRow.name,
            pass: exec ? exec.score.pass : false,
            expected: caseRow.expectedOutput,
            actual,
          },
        ],
      },
    };
  }

  /** Run a single eval case (AC-12/16/32). */
  async runCase(workspaceId: string, caseId: string): Promise<EvalRunResult | undefined> {
    const caseRow = await this.repo.getCase(workspaceId, caseId);
    if (!caseRow) return undefined;
    if (caseRow.ownerKind !== 'agent') {
      throw new ValidationError('Only agent-owned eval cases can be run');
    }
    const agent = await this.container.agentsRepo.getById(workspaceId, caseRow.ownerId);
    if (!agent) throw new NotFoundError('Owning agent not found');

    const enabledSkills = await this.container.agentsRepo.enabledSkillsForAgent(agent.id);
    const skills = formatSkillsForPrompt(enabledSkills);

    let exec: CaseExecution | null = null;
    let error: string | null = null;
    try {
      exec = await this.executeCase(agent, skills, caseRow);
    } catch (err) {
      error = (err as Error).message;
    }

    const runRow = await this.repo.insertRun({
      caseId,
      batchId: null,
      actualOutput: exec ? exec.actualOutput : { error },
      pass: exec ? exec.score.pass : false,
      recall: exec ? exec.score.recall : null,
      precision: exec ? exec.score.precision : null,
      citationAccuracy: exec ? exec.citation : null,
      durationMs: exec ? exec.durationMs : null,
      costUsd: exec ? exec.costUsd : null,
    });

    return this.toRunResult(runRow.id, caseRow, exec, error);
  }

  /** Run every case for an agent as one batch (AC-11/24/41/42). */
  async runBatch(workspaceId: string, agentId: string): Promise<EvalBatchResult> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const caseRows = await this.repo.listCasesForAgent(workspaceId, agentId);
    const enabledSkills = await this.container.agentsRepo.enabledSkillsForAgent(agentId);
    const skills = formatSkillsForPrompt(enabledSkills);

    const perCase: { caseRow: EvalCaseRow; exec: CaseExecution | null; error: string | null }[] = [];
    for (const caseRow of caseRows) {
      try {
        const exec = await this.executeCase(agent, skills, caseRow);
        perCase.push({ caseRow, exec, error: null });
      } catch (err) {
        // AC-42 — isolate this case's failure and keep running the rest.
        perCase.push({ caseRow, exec: null, error: (err as Error).message });
      }
    }

    const scoredCases = perCase.filter(
      (p): p is { caseRow: EvalCaseRow; exec: CaseExecution; error: null } => p.exec !== null,
    );
    const agg = microAggregate(
      scoredCases.map((p) => ({
        tp: p.exec.score.tp,
        fp: p.exec.score.fp,
        fn: p.exec.score.fn,
        caseType: p.exec.score.caseType as CaseType,
        pass: p.exec.score.pass,
      })),
    );
    const sumKept = scoredCases.reduce((n, p) => n + p.exec.keptCount, 0);
    const sumDropped = scoredCases.reduce((n, p) => n + p.exec.droppedCount, 0);
    const batchCitation = scoredCases.length > 0 ? citationAccuracy(sumKept, sumDropped) : null;
    let costSum: number | null = null;
    for (const p of scoredCases) {
      if (p.exec.costUsd != null) costSum = (costSum ?? 0) + p.exec.costUsd;
    }

    const batchRow = await this.repo.insertBatch({
      workspaceId,
      agentId,
      agentVersion: agent.version,
      recall: agg.recall,
      precision: agg.precision,
      citationAccuracy: batchCitation,
      tracesPassed: agg.tracesPassed,
      tracesTotal: perCase.length,
      costUsd: costSum,
    });

    const results: EvalRunResult[] = [];
    for (const p of perCase) {
      const runRow = await this.repo.insertRun({
        caseId: p.caseRow.id,
        batchId: batchRow.id,
        actualOutput: p.exec ? p.exec.actualOutput : { error: p.error },
        pass: p.exec ? p.exec.score.pass : false,
        recall: p.exec ? p.exec.score.recall : null,
        precision: p.exec ? p.exec.score.precision : null,
        citationAccuracy: p.exec ? p.exec.citation : null,
        durationMs: p.exec ? p.exec.durationMs : null,
        costUsd: p.exec ? p.exec.costUsd : null,
      });
      results.push(this.toRunResult(runRow.id, p.caseRow, p.exec, p.error));
    }

    return { batch: toEvalBatchRunDto(batchRow, agent.name), results };
  }

  /** One batch per agent in the workspace, sequentially (AC-20). */
  async runAllAgents(workspaceId: string): Promise<EvalDashboardHome> {
    const agents = await this.container.agentsRepo.list(workspaceId);
    for (const agent of agents) {
      await this.runBatch(workspaceId, agent.id);
    }
    return this.dashboardHome(workspaceId);
  }

  async listBatchRuns(workspaceId: string, agentId: string): Promise<EvalBatchRun[] | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const batches = await this.repo.listBatches(workspaceId, agentId);
    return batches.map((b) => toEvalBatchRunDto(b, agent.name));
  }

  // ---- Group C/D — dashboards, compare, promote ----------------------------

  async agentDashboard(workspaceId: string, agentId: string): Promise<AgentEvalDashboard | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const batches = await this.repo.listBatches(workspaceId, agentId);
    return toAgentEvalDashboard(agent, batches);
  }

  async dashboardHome(workspaceId: string): Promise<EvalDashboardHome> {
    const [groups, recent] = await Promise.all([
      this.repo.listAgentSummaries(workspaceId),
      this.repo.recentBatchesAllAgents(workspaceId, RECENT_BATCHES_LIMIT),
    ]);
    return toEvalDashboardHome(groups, recent);
  }

  async compare(
    workspaceId: string,
    agentId: string,
    aId: string,
    bId: string,
  ): Promise<EvalCompare | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const [a, b] = await Promise.all([
      this.repo.getBatch(workspaceId, aId),
      this.repo.getBatch(workspaceId, bId),
    ]);
    // A batch id that resolves in this workspace but belongs to a DIFFERENT
    // agent than :id is not this comparison's to show (IDOR-adjacent guard).
    if (!a || !b || a.agentId !== agentId || b.agentId !== agentId) return undefined;

    const [oldVersionRow, newVersionRow] = await Promise.all([
      this.container.agentsRepo.getVersion(agentId, a.agentVersion),
      this.container.agentsRepo.getVersion(agentId, b.agentVersion),
    ]);
    const oldConfig = safeParseVersionConfig(oldVersionRow);
    const newConfig = safeParseVersionConfig(newVersionRow);

    return toEvalCompare(a, b, agent.name, oldConfig, newConfig);
  }

  /**
   * Forward-only promote (AC-29/30/31): re-apply version N's config through
   * the NORMAL agent-update path so a new highest version is appended equal
   * to N's — mirrors the skills forward-only restore (server/INSIGHTS.md).
   * Never decrements `agents.version`; never rewrites `agent_versions`.
   */
  async promote(workspaceId: string, agentId: string, version: number): Promise<Agent> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const versionRow = await this.container.agentsRepo.getVersion(agentId, version);
    if (!versionRow) throw new NotFoundError(`Agent version v${version} not found`);

    const config = safeParseVersionConfig(versionRow);
    if (!config) {
      throw new ValidationError(`Agent version v${version}'s config snapshot is malformed`);
    }

    // Re-link the promoted version's skill set FIRST: `AgentsRepository.update`
    // snapshots `skillIdsForAgent` AT UPDATE TIME (agents/repository.ts), so the
    // new version's snapshot only matches vN's skills if the link table
    // already reflects them by the time `update()` runs below.
    await this.container.agentsRepo.setSkills(
      agentId,
      config.skills.map((skillId) => ({ skillId, enabled: true })),
    );

    const agentsService = new AgentsService(this.container);
    const updated = await agentsService.update(workspaceId, agentId, {
      provider: config.provider,
      model: config.model,
      system_prompt: config.system_prompt,
      output_schema: config.output_schema,
      strategy: config.strategy,
      ci_fail_on: config.ci_fail_on,
      repo_intel: config.repo_intel,
    });
    if (!updated) throw new NotFoundError('Agent not found');
    return updated;
  }
}
