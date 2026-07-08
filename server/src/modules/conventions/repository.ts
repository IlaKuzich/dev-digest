import { and, eq, inArray, desc } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow, ConventionScanRow } from '../../db/rows.js';
import { normalizeWs } from './helpers.js';
export type { ConventionRow, ConventionScanRow };

export interface InsertConvention {
  workspaceId: string;
  repoId: string;
  scanId: string;
  category: string;
  rule: string;
  evidencePath: string;
  evidenceLineStart: number | null;
  evidenceLineEnd: number | null;
  evidenceSnippet: string;
  confidence: number;
}

export interface UpdateConvention {
  status?: 'candidate' | 'accepted' | 'rejected';
  rule?: string; // written to editedRule (preserves the model's original in `rule`)
  category?: string;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async getRepoRef(repoId: string) {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        clonePath: t.repos.clonePath,
        fullName: t.repos.fullName,
      })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    return row;
  }

  async insertScan(v: {
    workspaceId: string;
    repoId: string;
    sampleCount: number;
    model: string;
  }): Promise<ConventionScanRow> {
    const [row] = await this.db.insert(t.conventionScans).values(v).returning();
    return row!;
  }

  async latestScan(repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(eq(t.conventionScans.repoId, repoId))
      .orderBy(desc(t.conventionScans.createdAt))
      .limit(1);
    return row;
  }

  /** Re-scan hygiene: drop prior candidate + rejected rows for the repo; keep accepted. */
  async clearCandidatesAndRejected(repoId: string): Promise<void> {
    await this.db
      .delete(t.conventions)
      .where(
        and(
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.status, ['candidate', 'rejected']),
        ),
      );
  }

  async acceptedRuleKeys(workspaceId: string, repoId: string): Promise<Set<string>> {
    const rows = await this.acceptedForRepo(workspaceId, repoId);
    return new Set(
      rows.map((r) => `${r.category ?? ''}|${normalizeWs(r.editedRule ?? r.rule)}`),
    );
  }

  async insertCandidates(rows: InsertConvention[]): Promise<ConventionRow[]> {
    if (rows.length === 0) return [];
    return this.db
      .insert(t.conventions)
      .values(rows.map((r) => ({ ...r, status: 'candidate' as const })))
      .returning();
  }

  async listForRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    const latest = await this.latestScan(repoId);
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
    // latest-scan candidates + every accepted row (accepted survive re-scans)
    return rows.filter(
      (r) => r.status === 'accepted' || (latest != null && r.scanId === latest.id),
    );
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConvention,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.rule !== undefined ? { editedRule: patch.rule } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  async acceptedForRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
        ),
      );
  }

  async stampSkillId(ids: string[], skillId: string): Promise<void> {
    if (ids.length === 0) return;
    await this.db.update(t.conventions).set({ skillId }).where(inArray(t.conventions.id, ids));
  }
}
