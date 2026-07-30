import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * T4 — eval data-access. The ONLY layer touching `eval_cases`, `eval_runs`,
 * and `eval_batches`.
 *
 * Tenancy (server/INSIGHTS.md's IDOR-for-child-tables note): `eval_cases` and
 * `eval_batches` carry `workspace_id` directly, so their reads filter it
 * in-place. `eval_runs` has NO `workspace_id` column — every read reachable
 * from a route joins through the owning `eval_cases` row and filters ITS
 * `workspace_id`; a bare `case_id`/`batch_id` filter alone would be an IDOR.
 */

export type EvalCaseRow = typeof t.evalCases.$inferSelect;
export type EvalRunRow = typeof t.evalRuns.$inferSelect;
export type EvalBatchRow = typeof t.evalBatches.$inferSelect;
export type AgentRow = typeof t.agents.$inferSelect;

export interface InsertEvalCase {
  workspaceId: string;
  ownerKind: 'agent' | 'skill';
  ownerId: string;
  name: string;
  inputDiff?: string;
  inputFiles?: unknown;
  inputMeta?: unknown;
  expectedOutput: unknown;
  notes?: string | null;
}

export interface UpdateEvalCase {
  name?: string;
  inputDiff?: string;
  inputFiles?: unknown;
  inputMeta?: unknown;
  expectedOutput?: unknown;
  notes?: string | null;
}

export interface InsertEvalRun {
  caseId: string;
  batchId?: string | null;
  actualOutput?: unknown;
  pass: boolean | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number | null;
  costUsd: number | null;
}

export interface InsertEvalBatch {
  workspaceId: string;
  agentId: string;
  agentVersion: number;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  tracesPassed: number;
  tracesTotal: number;
  costUsd: number | null;
}

/** One agent's summary rows source for the dashboard home (AC-18). */
export interface AgentBatchGroup {
  agent: AgentRow;
  batches: EvalBatchRow[];
}

export class EvalRepository {
  constructor(private db: Db) {}

  // ---- eval_cases (workspace-scoped directly) ------------------------------

  /** Every case owned by this agent, in a fixed (insertion-order) sequence —
   *  needed so two batch runs over the same set are directly comparable. */
  async listCasesForAgent(workspaceId: string, agentId: string): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
        ),
      )
      .orderBy(asc(t.evalCases.id));
  }

  async getCase(workspaceId: string, caseId: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)));
    return row;
  }

  async insertCase(values: InsertEvalCase): Promise<EvalCaseRow> {
    const [row] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: values.workspaceId,
        ownerKind: values.ownerKind,
        ownerId: values.ownerId,
        name: values.name,
        inputDiff: values.inputDiff ?? '',
        inputFiles: (values.inputFiles as object | null | undefined) ?? null,
        inputMeta: (values.inputMeta as object | null | undefined) ?? null,
        expectedOutput: values.expectedOutput as object,
        notes: values.notes ?? null,
      })
      .returning();
    return row!;
  }

  async updateCase(
    workspaceId: string,
    caseId: string,
    patch: UpdateEvalCase,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.inputDiff !== undefined ? { inputDiff: patch.inputDiff } : {}),
        ...(patch.inputFiles !== undefined ? { inputFiles: patch.inputFiles as object } : {}),
        ...(patch.inputMeta !== undefined ? { inputMeta: patch.inputMeta as object } : {}),
        ...(patch.expectedOutput !== undefined
          ? { expectedOutput: patch.expectedOutput as object }
          : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      })
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
      .returning();
    return row;
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  // ---- eval_runs (no workspace_id column — join eval_cases for tenancy) ---

  async insertRun(values: InsertEvalRun): Promise<EvalRunRow> {
    const [row] = await this.db.insert(t.evalRuns).values(values).returning();
    return row!;
  }

  /** Latest `eval_runs` row per case, for cases owned by this agent
   *  (workspace-scoped via the `eval_cases` join, per the IDOR note above). */
  async lastRunByCase(workspaceId: string, agentId: string): Promise<Map<string, EvalRunRow>> {
    const rows = await this.db
      .select({ run: t.evalRuns, caseId: t.evalCases.id })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
        ),
      )
      .orderBy(desc(t.evalRuns.ranAt));
    const byCase = new Map<string, EvalRunRow>();
    for (const r of rows) {
      if (!byCase.has(r.caseId)) byCase.set(r.caseId, r.run);
    }
    return byCase;
  }

  // ---- eval_batches (workspace_id column present — scope directly) --------

  async insertBatch(values: InsertEvalBatch): Promise<EvalBatchRow> {
    const [row] = await this.db.insert(t.evalBatches).values(values).returning();
    return row!;
  }

  /** Newest first. */
  async listBatches(workspaceId: string, agentId: string): Promise<EvalBatchRow[]> {
    return this.db
      .select()
      .from(t.evalBatches)
      .where(and(eq(t.evalBatches.workspaceId, workspaceId), eq(t.evalBatches.agentId, agentId)))
      .orderBy(desc(t.evalBatches.ranAt));
  }

  async getBatch(workspaceId: string, batchId: string): Promise<EvalBatchRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalBatches)
      .where(and(eq(t.evalBatches.workspaceId, workspaceId), eq(t.evalBatches.id, batchId)));
    return row;
  }

  /** Per-agent summary rows for the cross-agent dashboard home (AC-18):
   *  every agent in the workspace, paired with its batches (newest first). */
  async listAgentSummaries(workspaceId: string): Promise<AgentBatchGroup[]> {
    const agents = await this.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
    if (agents.length === 0) return [];
    const agentIds = agents.map((a) => a.id);
    const batches = await this.db
      .select()
      .from(t.evalBatches)
      .where(and(eq(t.evalBatches.workspaceId, workspaceId), inArray(t.evalBatches.agentId, agentIds)))
      .orderBy(desc(t.evalBatches.ranAt));
    return agents.map((agent) => ({
      agent,
      batches: batches.filter((b) => b.agentId === agent.id),
    }));
  }

  /** Most recent batch runs across all agents in the workspace (AC-19). */
  async recentBatchesAllAgents(
    workspaceId: string,
    limit: number,
  ): Promise<{ batch: EvalBatchRow; agentName: string | null }[]> {
    const rows = await this.db
      .select({ batch: t.evalBatches, agentName: t.agents.name })
      .from(t.evalBatches)
      .innerJoin(t.agents, eq(t.evalBatches.agentId, t.agents.id))
      .where(eq(t.evalBatches.workspaceId, workspaceId))
      .orderBy(desc(t.evalBatches.ranAt))
      .limit(limit);
    return rows;
  }
}
