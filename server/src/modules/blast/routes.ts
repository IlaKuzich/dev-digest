import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService, type BlastResponse } from './service.js';

/**
 * Blast radius module (transport). Read-only over the repo-intel facade —
 * zero analysis at review time, zero LLM calls on this path (see service.ts).
 *
 *   GET /pulls/:id/blast → BlastRadius + index_state
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new BlastService(container);

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams } },
    async (req): Promise<BlastResponse> => {
      const { workspaceId } = await getContext(container, req);
      return service.getBlast(workspaceId, req.params.id);
    },
  );
}
