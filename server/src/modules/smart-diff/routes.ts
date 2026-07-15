import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { SmartDiff } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SmartDiffService } from './service.js';

/**
 * L03/Smart Diff module (transport). Deterministic composition — no LLM call.
 * All logic lives in SmartDiffService; routes only parse, delegate, and let
 * platform errors map to status.
 *
 *   GET /pulls/:id/smart-diff → SmartDiff
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new SmartDiffService(container);

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams } },
    async (req): Promise<SmartDiff> => {
      const { workspaceId } = await getContext(container, req);
      return service.getSmartDiff(workspaceId, req.params.id);
    },
  );
}
