import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BriefRequest } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { BriefService } from './service.js';

// `IdParams` (`_shared/schemas.ts`) is hardcoded to the `id` param key — a
// `/pulls/:prId/...` route needs its own params schema (server INSIGHTS
// 2026-07-15).
const PrIdParams = z.object({ prId: z.string().uuid() });

/**
 * Brief module.
 *   POST /pulls/:prId/brief   (no body flag / {regenerate:false}) → cached Brief | null
 *   POST /pulls/:prId/brief   ({regenerate:true})                 → recomputed Brief
 *
 * A single POST route serves both the cached read and the recompute — no
 * separate GET route (spec Non-goals: an explicit, human-overridden decision
 * of the assignment's literal route shape, unlike Intent's two-route
 * convention).
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BriefService(app.container);

  app.post(
    '/pulls/:prId/brief',
    // `.nullish()` (not `.optional()`): Fastify's default JSON body parser
    // yields `null`, not `undefined`, for a bodyless POST — `.optional()`
    // alone rejects `null` with a 422 (verified against `brief.it.test.ts`).
    { schema: { params: PrIdParams, body: BriefRequest.nullish() } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getOrDerive(workspaceId, req.params.prId, req.body?.regenerate ?? false, req.log);
    },
  );
}
