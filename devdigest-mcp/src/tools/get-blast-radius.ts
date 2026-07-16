/**
 * `get_blast_radius` — STUB (T4).
 *
 * There is no backing HTTP route for blast-radius impact analysis yet:
 * `RepoIntel.getBlastRadius(repoId, changedFiles)` exists only as a facade
 * method on the server (`server/src/modules/repo-intel/types.ts:147`) and is
 * not exposed over HTTP. This handler intentionally does NOT call the API and
 * does NOT throw — it always returns a fixed "not implemented" result so the
 * model gets a clean, predictable signal instead of a tool error.
 */
import { getBlastRadiusShape } from '../schemas.js';
import type { ToolModule } from '../types.js';

export const registerGetBlastRadius: ToolModule = (server) => {
  server.registerTool(
    'get_blast_radius',
    {
      title: 'Get blast radius',
      description:
        "Blast-radius impact map for a PR's changed files. NOT IMPLEMENTED YET — returns {status:'not_implemented'}; the real analysis (reads repo-intel) lands in a later lesson.",
      inputSchema: getBlastRadiusShape,
    },
    async () => {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'get_blast_radius is not implemented yet — blast radius (repo-intel) lands in a later lesson.',
          },
        ],
        structuredContent: { status: 'not_implemented' },
        isError: false,
      };
    },
  );
};
