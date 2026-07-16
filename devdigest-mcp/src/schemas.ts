/**
 * Local Zod contracts for devdigest-mcp tool inputs/outputs.
 *
 * Deliberately NOT vendored from `@devdigest/shared` — this package speaks
 * HTTP+JSON to the server, not TypeScript imports, so a handful of narrow
 * local schemas are cheaper than keeping a third vendor copy in sync (see
 * root `INSIGHTS.md` "Codebase Patterns" on dual-vendor sync cost, and
 * `docs/plans/2026-07-16-devdigest-mcp-server.md` "Planning notes").
 *
 * Each `*Shape` is a raw `ZodRawShape` (for the MCP SDK's `registerTool`
 * `inputSchema`); each `*Schema` is the `.strict()` `z.object()` wrapper used
 * to parse/validate args inside the handler.
 */
import { z } from 'zod';
import { MAX_LIMIT } from './config.js';

/** Local copy of the 3-value severity enum (`findings.ts:11` upstream). */
export const Severity = z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']);
export type Severity = z.infer<typeof Severity>;

const limit = z.number().int().min(1).max(MAX_LIMIT).optional();
const offset = z.number().int().min(0).optional();

// ---- list_agents ----------------------------------------------------------
export const listAgentsShape = { limit, offset };
export const listAgentsSchema = z.object(listAgentsShape).strict();

// ---- run_agent_on_pr -------------------------------------------------------
export const runAgentShape = {
  repo: z.string().min(1),
  pr: z.number().int().positive(),
  agent: z.string().min(1),
  timeout_ms: z.number().int().positive().optional(),
};
export const runAgentSchema = z.object(runAgentShape).strict();

// ---- get_findings -----------------------------------------------------------
export const getFindingsShape = {
  run_id: z.string().optional(),
  repo: z.string().optional(),
  pr: z.number().int().positive().optional(),
  limit,
  offset,
};
export const getFindingsSchema = z.object(getFindingsShape).strict();

// ---- get_conventions --------------------------------------------------------
export const getConventionsShape = {
  repo: z.string().min(1),
  limit,
  offset,
};
export const getConventionsSchema = z.object(getConventionsShape).strict();

// ---- get_blast_radius (STUB) -------------------------------------------------
export const getBlastRadiusShape = {
  repo: z.string().min(1),
  pr: z.number().int().positive(),
};
export const getBlastRadiusSchema = z.object(getBlastRadiusShape).strict();

// ---- Output schemas ----------------------------------------------------------
// Only declared where structural validation of the response is worth it
// (get_findings, get_conventions); other tools omit outputSchema.

export const trimmedFindingShape = {
  id: z.string(),
  severity: Severity,
  title: z.string(),
  file: z.string(),
  line: z.number().int().nullable(),
};

export const getFindingsOutputShape = {
  verdict: z.string().nullable().optional(),
  score: z.number().nullable().optional(),
  findings: z.array(z.object(trimmedFindingShape)),
  has_more: z.boolean(),
};

export const trimmedConventionShape = {
  rule: z.string(),
  evidence_path: z.string(),
  confidence: z.number(),
  accepted: z.boolean(),
};

export const getConventionsOutputShape = {
  conventions: z.array(z.object(trimmedConventionShape)),
  has_more: z.boolean(),
};
