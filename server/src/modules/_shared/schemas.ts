import { z } from 'zod';

/**
 * Shared route param schemas. Most `/:id` routes address a DB row whose primary
 * key is a uuid (see db/schema/*), so validate that shape at the edge — an
 * invalid id becomes a clean 422 instead of a downstream DB/500.
 *
 * NOTE: not every `:id` is a uuid (e.g. `/providers/:id` where id is a provider
 * name like "openai"); those routes use their own schema.
 */
export const IdParams = z.object({ id: z.string().uuid() });
export type IdParams = z.infer<typeof IdParams>;

/**
 * Params for the `/:id/versions/:version` sub-resources (agents, skills).
 * `z.coerce` turns a non-numeric version into a 422 at the edge rather than a
 * confusing 404 for a version that could never exist.
 */
export const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});
export type VersionParams = z.infer<typeof VersionParams>;

/**
 * Params for `/pulls/:id/multi-agent/runs/:runId` — viewing one specific
 * historical multi-agent run (2026-08-27 "Previous Runs" follow-on). Both
 * segments are uuids; the service additionally checks the run belongs to
 * this PR (see `MultiAgentService.getById`).
 */
export const PrRunParams = z.object({ id: z.string().uuid(), runId: z.string().uuid() });
export type PrRunParams = z.infer<typeof PrRunParams>;
