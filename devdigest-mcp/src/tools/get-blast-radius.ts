/**
 * `get_blast_radius` — blast-radius impact map for a PR's changed files.
 *
 * Calls the server's `GET /pulls/:id/blast` (shipped by T1 of
 * `docs/plans/2026-07-16-blast-radius.md`) — a read-only facade over the
 * repo-intel index, zero LLM calls on this path. Flat args (`repo`, `pr`)
 * resolved to an internal PR id via `deps.resolve` (mirrors
 * `run-agent-on-pr.ts` / `get-findings.ts` — no second resolution path).
 *
 * Trims the response to `{changed_symbols, downstream, index_state}` (design
 * principle 3) and drops `summary` when it is empty (the read path never
 * calls an LLM, so `summary` is always `""` today — see T1/T4 planning notes).
 *
 * Degradation is NEVER swallowed: whenever `index_state.degraded` is true or
 * `index_state.status !== 'full'`, a `degraded_note` field is added so a
 * model cannot mistake an incomplete map (e.g. `crons_affected: []` because
 * the index has no cron data yet) for a complete "nothing is affected"
 * answer — see root `docs/plans/2026-07-16-blast-radius.md` T6 step 4.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { toToolResult } from '../errors.js';
import { getBlastRadiusOutputShape, getBlastRadiusShape } from '../schemas.js';
import { guardCharacterLimit } from '../trim.js';
import type { ToolDeps, ToolModule } from '../types.js';

const GET_BLAST_RADIUS_DESCRIPTION =
  "Blast-radius impact map for a PR's changed files: which symbols changed, who calls them, " +
  'and which endpoints/crons are affected. Flat args: repo (owner/name), pr (number). Reads a ' +
  'pre-built repo-intel index — zero analysis at call time. The map may be degraded/partial ' +
  '(e.g. the index is behind the PR, or graph resolution failed); when so, a "degraded_note" ' +
  'field is included and callers/endpoints/crons must be treated as incomplete, not "none".';

/** Shape of the server's `BlastRadius` (`brief.ts:39-44`) + `index_state`
 * (`modules/blast/service.ts` `BlastResponse`) — only the fields this tool
 * reads. */
interface BlastChangedSymbolDto {
  name: string;
  file: string;
  kind: string;
}

interface BlastCallerDto {
  name: string;
  file: string;
  line: number;
}

interface BlastDownstreamDto {
  symbol: string;
  callers: BlastCallerDto[];
  endpoints_affected: string[];
  crons_affected: string[];
}

interface BlastIndexStateDto {
  status: string;
  filesIndexed: number;
  filesSkipped: number;
  degraded?: boolean;
  degradedReason?: string;
}

interface BlastRadiusDto {
  changed_symbols: BlastChangedSymbolDto[];
  downstream: BlastDownstreamDto[];
  summary: string;
  index_state: BlastIndexStateDto;
}

interface TrimmedBlastRadius {
  changed_symbols: BlastChangedSymbolDto[];
  downstream: BlastDownstreamDto[];
  index_state: BlastIndexStateDto;
  summary?: string;
  degraded_note?: string;
}

/** Reduce the server's `BlastRadius` DTO to `{changed_symbols, downstream,
 * index_state}`, dropping empty `summary`, and adding `degraded_note` when
 * the index is anything less than a full, healthy index. */
function trimBlastRadius(dto: BlastRadiusDto): TrimmedBlastRadius {
  const trimmed: TrimmedBlastRadius = {
    changed_symbols: dto.changed_symbols,
    downstream: dto.downstream,
    index_state: dto.index_state,
  };

  if (dto.summary) {
    trimmed.summary = dto.summary;
  }

  const isDegraded = dto.index_state.degraded === true || dto.index_state.status !== 'full';
  if (isDegraded) {
    trimmed.degraded_note =
      `The repo-intel index for this PR is ${dto.index_state.status}` +
      `${dto.index_state.degradedReason ? ` (${dto.index_state.degradedReason})` : ''} — ` +
      'downstream callers, endpoints_affected, and crons_affected may be incomplete. An empty ' +
      'crons_affected/endpoints_affected here does NOT mean nothing is affected; it may mean ' +
      'the index has not recorded that data yet.';
  }

  return trimmed;
}

export const registerGetBlastRadius: ToolModule = (server, deps: ToolDeps) => {
  server.registerTool(
    'get_blast_radius',
    {
      title: 'Get blast radius',
      description: GET_BLAST_RADIUS_DESCRIPTION,
      inputSchema: getBlastRadiusShape,
      outputSchema: getBlastRadiusOutputShape,
    },
    async (args) => {
      try {
        const repoId = await deps.resolve.repoId(args.repo);
        const prId = await deps.resolve.prId(repoId, args.pr);
        const blast = await deps.http.get<BlastRadiusDto>(`/pulls/${prId}/blast`);

        const structuredContent = guardCharacterLimit({ ...trimBlastRadius(blast) });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }],
          structuredContent,
        };
      } catch (err) {
        return toToolResult(err) as CallToolResult;
      }
    },
  );
};
