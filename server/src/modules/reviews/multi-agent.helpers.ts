/**
 * Pure helpers for the multi-agent review service (side-effect free; no
 * DB/network/`this`). Owns:
 *   - the exact `file:line` conflict grouping (AC-20/AC-21/AC-22)
 *   - the per-agent estimate DTO shape (AC-4/AC-5/AC-6)
 */
import type { Conflict, ConflictTake, Severity } from '@devdigest/shared';

/** One finding a participating agent produced, reduced to just what grouping
 *  needs. `file`/`line` are treated as OPAQUE data — never interpolated into a
 *  query, path, or RegExp (untrusted PR/agent-derived text; AC-27). */
export interface ParticipatingAgentFinding {
  file: string;
  line: number;
  severity: Severity;
  title: string;
}

/** One agent that took part in THIS run (already filtered to a completed
 *  ('done') status by the caller — a still-running or failed agent has no
 *  findings to compare, and AC-22 restricts the block to this run's agents). */
export interface ParticipatingAgentFindings {
  agent_id: string;
  persona: string;
  findings: ParticipatingAgentFinding[];
}

/**
 * Build the exact `file:line` grouping key with plain string ops — NOT a built
 * RegExp over untrusted data (root INSIGHTS 2026-07-15 on path-pattern
 * matching without regex; the same "never interpolate untrusted text into a
 * dynamically-built RegExp" rule applies to `file`/`line` here, AC-27).
 */
function locationKey(file: string, line: number): string {
  return file + ':' + String(line);
}

/**
 * Group this run's findings by exact `file:line` (AC-20 — no fuzzy/embedding
 * grouping) and surface the locations where the run's participating agents
 * disagree (AC-22): one agent flagged a location another agent (that also
 * reviewed) did not — an explicit `'ignored'` take — OR the flagging agents
 * assigned divergent severities. Each original finding's title/text and its
 * authoring agent stay inspectable via the returned `takes[]` (AC-21).
 *
 * Only agents passed in `agents` are ever considered — the caller is
 * responsible for excluding agents outside this run (AC-22).
 */
export function buildConflicts(agents: ParticipatingAgentFindings[]): Conflict[] {
  if (agents.length < 2) return [];

  type Flag = { severity: Severity; title: string };
  const locations = new Map<string, { file: string; line: number; flags: Map<string, Flag> }>();

  for (const agent of agents) {
    for (const finding of agent.findings) {
      const key = locationKey(finding.file, finding.line);
      let loc = locations.get(key);
      if (!loc) {
        loc = { file: finding.file, line: finding.line, flags: new Map() };
        locations.set(key, loc);
      }
      // First finding wins per agent per location — grouping is exact
      // file:line only, never a severity re-rank across an agent's own
      // multiple findings at the same line.
      if (!loc.flags.has(agent.agent_id)) {
        loc.flags.set(agent.agent_id, { severity: finding.severity, title: finding.title });
      }
    }
  }

  const conflicts: Conflict[] = [];
  for (const loc of locations.values()) {
    const severities = new Set([...loc.flags.values()].map((f) => f.severity));
    const allFlagged = loc.flags.size === agents.length;
    const divergentSeverity = severities.size > 1;
    // A conflict needs >=2 agents to diverge: some flagged + some did not
    // ('ignored'), OR the flagging agents disagree on severity.
    if (allFlagged && !divergentSeverity) continue;

    const takes: ConflictTake[] = agents.map((agent) => {
      const flag = loc.flags.get(agent.agent_id);
      return {
        agent_id: agent.agent_id,
        persona: agent.persona,
        verdict: flag ? flag.severity : 'ignored',
        note: flag ? flag.title : 'Reviewed but did not flag this location.',
      };
    });
    const title = [...loc.flags.values()][0]?.title ?? '';
    conflicts.push({ file: loc.file, line: loc.line, title, takes });
  }

  // Deterministic ordering (file, then line) so the response is stable across
  // calls with the same input — pure string/number comparisons only.
  conflicts.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    return a.line - b.line;
  });
  return conflicts;
}

/** Per-agent time/cost estimate + latest per-PR summary (AC-3/AC-4/AC-5/AC-6). */
export interface AgentEstimate {
  agent_id: string;
  agent_name: string;
  /** `null` when the agent has no past runs — render as "no history yet" (AC-5). */
  avg_duration_ms: number | null;
  avg_cost_usd: number | null;
  runs: number;
  /** `null` when the agent has no prior review on this PR (AC-6). */
  summary: string | null;
}

/** Build one `AgentEstimate` from raw repo aggregates — pure mapping only. */
export function buildAgentEstimate(
  agent: { id: string; name: string },
  stats: { avgDurationMs: number | null; avgCostUsd: number | null; runs: number },
  summary: string | null,
): AgentEstimate {
  return {
    agent_id: agent.id,
    agent_name: agent.name,
    avg_duration_ms: stats.runs === 0 ? null : stats.avgDurationMs,
    avg_cost_usd: stats.runs === 0 ? null : stats.avgCostUsd,
    runs: stats.runs,
    summary,
  };
}
