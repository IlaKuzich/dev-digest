/**
 * Human-facing values (repo slug, PR number, agent name) → internal ids.
 *
 * Matching is done with plain string/array operations (`===`, `.find`) —
 * NEVER a dynamically-built `RegExp` (root `INSIGHTS.md:26`, `server/INSIGHTS.md:32`).
 */
import type { HttpClient } from './http/client.js';
import { agentNotFound, prNotFound, repoNotFound } from './errors.js';

interface RepoListItem {
  id: string;
  full_name: string;
}

interface PrListItem {
  id?: string | null;
  number: number;
}

interface AgentListItem {
  id: string;
  name: string;
}

export interface Resolvers {
  /** `owner/name` slug → internal repo id. */
  repoId(slug: string): Promise<string>;
  /** PR number (within a resolved repo) → internal PR id. */
  prId(repoId: string, number: number): Promise<string>;
  /** Agent id or name → internal agent id (identity if already an id). */
  agentId(nameOrId: string): Promise<string>;
}

export function makeResolvers(http: HttpClient): Resolvers {
  return {
    async repoId(slug: string): Promise<string> {
      const repos = await http.get<RepoListItem[]>('/repos');
      const match = repos.find((r) => r.full_name === slug);
      if (!match) throw repoNotFound(slug);
      return match.id;
    },

    async prId(repoId: string, number: number): Promise<string> {
      const pulls = await http.get<PrListItem[]>(`/repos/${repoId}/pulls`);
      const match = pulls.find((p) => p.number === number);
      if (!match || match.id == null) throw prNotFound(number, repoId);
      return match.id;
    },

    async agentId(nameOrId: string): Promise<string> {
      const agents = await http.get<AgentListItem[]>('/agents');
      const match = agents.find((a) => a.id === nameOrId || a.name === nameOrId);
      if (!match) throw agentNotFound(nameOrId);
      return match.id;
    },
  };
}
