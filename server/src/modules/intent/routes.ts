import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IntentService } from './service.js';

const PrIdParams = z.object({ prId: z.string().uuid() });

/**
 * Intent module.
 *   GET  /pulls/:prId/intent          → Intent | null (null = not derived yet)
 *   POST /pulls/:prId/intent/derive   → Intent (derive-or-recompute)
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new IntentService(app.container);

  app.get('/pulls/:prId/intent', { schema: { params: PrIdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.getIntent(workspaceId, req.params.prId);
  });

  app.post('/pulls/:prId/intent/derive', { schema: { params: PrIdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.derive(workspaceId, req.params.prId, req.log);
  });
}
