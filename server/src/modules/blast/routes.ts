import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService, type BlastResponse } from './service.js';

/**
 * Blast radius module (transport). Read-only over the repo-intel facade —
 * zero analysis at review time, zero LLM calls on the GET path (see
 * service.ts). The POST /explain route is the ONLY LLM call in this module,
 * and it is optional and user-triggered — never invoked from the GET path.
 *
 *   GET  /pulls/:id/blast         → BlastRadius + index_state + prior_prs
 *   POST /pulls/:id/blast/explain → { summary } (optional, user-triggered)
 *
 * `prior_prs` (T11) is a direct `pr_files` join (`BlastRepository`), not a
 * facade read — the ONLY module data this route serves that doesn't come
 * from `container.repoIntel`.
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

  app.post(
    '/pulls/:id/blast/explain',
    { schema: { params: IdParams } },
    async (req): Promise<{ summary: string }> => {
      const { workspaceId } = await getContext(container, req);
      return service.explain(workspaceId, req.params.id);
    },
  );
}
