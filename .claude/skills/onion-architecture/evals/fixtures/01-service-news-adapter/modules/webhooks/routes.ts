import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { WebhookService } from './service.js';

export default async function webhooksRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new WebhookService(app.container);

  app.post('/internal/review-complete', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { prNumber, score } = req.body as { prNumber: number; score: number };
    await service.notifyReviewComplete(workspaceId, { prNumber, score });
    return { ok: true };
  });
}
