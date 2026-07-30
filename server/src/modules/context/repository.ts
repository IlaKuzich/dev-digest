import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { dedupeFirstWins, type ContextAttachmentRow } from './helpers.js';

export type { ContextAttachmentRow };

/**
 * T3 — context data-access. Owns `agent_context` / `skill_context` (defined
 * in `db/schema/project-context.ts` — NOT `schema/context.ts`, which is an
 * unrelated repo-intel file; see `server/INSIGHTS.md:46`).
 *
 * Neither table carries its own `workspace_id` (same shape as `agent_skills`,
 * `server/src/db/schema/agents.ts:51-64`) — tenancy is enforced HERE by
 * joining every read/write to the owning `agents`/`skills` row, which IS
 * workspace-scoped (server/INSIGHTS.md:38). A cross-workspace agent/skill id
 * resolves to `undefined`, which the service/route maps to a 404 — it never
 * leaks another workspace's attachment rows.
 */
export class ContextRepository {
  constructor(private db: Db) {}

  // ---- repo clone lookup (IDOR-guarded: workspace-scoped natively) --------

  /** `clonePath` + a "last synced" marker for a repo. `repos` has no dedicated
   *  sync timestamp; `lastPolledAt` is bumped alongside `clonePath` on every
   *  clone/refresh/resync (`repos/repository.ts:updateClonePath`), so it is
   *  the best available proxy for "last-synced snapshot" (AC-4). Returns
   *  undefined when the repo doesn't belong to this workspace. */
  async getRepoClone(
    workspaceId: string,
    repoId: string,
  ): Promise<{ clonePath: string | null; syncedAt: Date | null } | undefined> {
    const [row] = await this.db
      .select({ clonePath: t.repos.clonePath, syncedAt: t.repos.lastPolledAt })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** Every repo in the workspace that has a clone on disk (clonePath set).
   *  Agents/skills aren't repo-scoped, so attach-path validation checks
   *  against the union of docs discoverable across all of them. */
  async listClonePaths(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .select({ clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(eq(t.repos.workspaceId, workspaceId));
    return rows
      .map((r) => r.clonePath)
      .filter((p): p is string => p != null);
  }

  // ---- ownership checks (IDOR guard) --------------------------------------

  private async agentInWorkspace(workspaceId: string, agentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return row !== undefined;
  }

  private async skillInWorkspace(workspaceId: string, skillId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)));
    return row !== undefined;
  }

  // ---- agent_context ---------------------------------------------------------

  /**
   * The agent's OWN attached context paths, in stored order — no skill
   * inheritance (that's `resolvePathsForAgent`'s job, for run-time injection).
   * No workspace check: this is an internal read for callers that already
   * hold a workspace-scoped agent (e.g. `agents/service.ts`'s version-
   * snapshot path, AC-27) — the sole point of this method existing is so
   * `agent_context` has exactly ONE owning repository (architecture-review
   * W2 fix: `agents/repository.ts` used to re-query this table directly,
   * the same trap `agent_skills` avoids by having a single owner).
   */
  async pathsForAgent(agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.agentContext.path })
      .from(t.agentContext)
      .where(eq(t.agentContext.agentId, agentId))
      .orderBy(asc(t.agentContext.order));
    return rows.map((r) => r.path);
  }

  /** Ordered attachment rows for an agent. Undefined when the agent doesn't
   *  belong to this workspace (IDOR — route maps this to 404). */
  async agentContext(
    workspaceId: string,
    agentId: string,
  ): Promise<ContextAttachmentRow[] | undefined> {
    if (!(await this.agentInWorkspace(workspaceId, agentId))) return undefined;
    return this.db
      .select({ path: t.agentContext.path, order: t.agentContext.order })
      .from(t.agentContext)
      .where(eq(t.agentContext.agentId, agentId))
      .orderBy(asc(t.agentContext.order));
  }

  /** Replace the agent's full attachment set. Only `attached: true` entries
   *  ever reach here as rows (the table has no `attached` column — presence
   *  IS attachment). Undefined when the agent doesn't belong to this
   *  workspace. */
  async setAgentContext(
    workspaceId: string,
    agentId: string,
    rows: ContextAttachmentRow[],
  ): Promise<ContextAttachmentRow[] | undefined> {
    if (!(await this.agentInWorkspace(workspaceId, agentId))) return undefined;
    await this.db.delete(t.agentContext).where(eq(t.agentContext.agentId, agentId));
    if (rows.length > 0) {
      await this.db
        .insert(t.agentContext)
        .values(rows.map((r) => ({ agentId, path: r.path, order: r.order })));
    }
    return rows;
  }

  // ---- skill_context (mirror of agent_context) --------------------------------

  async skillContext(
    workspaceId: string,
    skillId: string,
  ): Promise<ContextAttachmentRow[] | undefined> {
    if (!(await this.skillInWorkspace(workspaceId, skillId))) return undefined;
    return this.db
      .select({ path: t.skillContext.path, order: t.skillContext.order })
      .from(t.skillContext)
      .where(eq(t.skillContext.skillId, skillId))
      .orderBy(asc(t.skillContext.order));
  }

  async setSkillContext(
    workspaceId: string,
    skillId: string,
    rows: ContextAttachmentRow[],
  ): Promise<ContextAttachmentRow[] | undefined> {
    if (!(await this.skillInWorkspace(workspaceId, skillId))) return undefined;
    await this.db.delete(t.skillContext).where(eq(t.skillContext.skillId, skillId));
    if (rows.length > 0) {
      await this.db
        .insert(t.skillContext)
        .values(rows.map((r) => ({ skillId, path: r.path, order: r.order })));
    }
    return rows;
  }

  // ---- used_by_agents (AC-26) --------------------------------------------

  /** Count of DISTINCT agents attaching each path, scoped to the workspace
   *  (joins `agent_context` -> `agents` and filters on `workspace_id`, since
   *  `agent_context` carries no workspace of its own). */
  async usedByAgentsCounts(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .selectDistinct({ path: t.agentContext.path, agentId: t.agentContext.agentId })
      .from(t.agentContext)
      .innerJoin(t.agents, eq(t.agents.id, t.agentContext.agentId))
      .where(eq(t.agents.workspaceId, workspaceId));
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.path, (counts.get(r.path) ?? 0) + 1);
    return counts;
  }

  // ---- run-time resolution (AC-14) ----------------------------------------

  /** Skill ids enabled for injection into this agent's prompt: BOTH the
   *  per-agent toggle (`agent_skills.enabled`) and the skill's own global
   *  toggle (`skills.enabled`) must be on — mirrors
   *  `agents/repository.ts:enabledSkillsForAgent`. Ordered by
   *  `agent_skills.order`. */
  private async enabledSkillIdsForAgent(agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ skillId: t.agentSkills.skillId })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .where(
        and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
        ),
      )
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => r.skillId);
  }

  /**
   * The ordered, deduped path list to inject for an agent's next run:
   * skill-inherited paths (from the agent's enabled skills, in skill order,
   * then each skill's own doc order) FIRST, then the agent's own attached
   * paths, deduplicated by path so a doc attached at both levels is injected
   * once at its FIRST (skill-inherited) position (AC-14). Returns `[]` if the
   * agent doesn't belong to this workspace (IDOR — callers already hold a
   * workspace-scoped agent, so this is defense-in-depth, not the primary
   * guard).
   */
  async resolvePathsForAgent(workspaceId: string, agentId: string): Promise<string[]> {
    if (!(await this.agentInWorkspace(workspaceId, agentId))) return [];

    const skillIds = await this.enabledSkillIdsForAgent(agentId);
    const inherited: string[] = [];
    for (const skillId of skillIds) {
      const rows = await this.db
        .select({ path: t.skillContext.path })
        .from(t.skillContext)
        .where(eq(t.skillContext.skillId, skillId))
        .orderBy(asc(t.skillContext.order));
      inherited.push(...rows.map((r) => r.path));
    }

    const agentPaths = await this.pathsForAgent(agentId);
    return dedupeFirstWins([...inherited, ...agentPaths]);
  }
}
