import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { BriefService } from './service.js';

/** `_shared/schemas.ts`'s `IdParams` is keyed `id` (server/INSIGHTS.md:42) —
 *  this route's path segment is `:prId`, so it needs its own local schema. */
const PrIdParams = z.object({ prId: z.string().uuid() });

/**
 * Why+Risk Brief module.
 *   GET  /pulls/:prId/brief   → BriefEnvelope | null (null = not generated yet — cache read, zero LLM)
 *   POST /pulls/:prId/brief   → BriefEnvelope (generate-or-regenerate — one structured call)
 *
 * Both routes resolve the PR via the workspace-scoped `pullsRepo.getById`
 * FIRST (AC-14) inside the service — a cross-workspace `prId` 404s before
 * anything is read or generated.
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BriefService(app.container);

  app.get('/pulls/:prId/brief', { schema: { params: PrIdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.params.prId);
  });

  app.post('/pulls/:prId/brief', { schema: { params: PrIdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.regenerate(workspaceId, req.params.prId, req.log);
  });
}
