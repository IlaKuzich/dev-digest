import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SyncOrchestratorService } from './service.js';

export default async function syncOrchestratorRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SyncOrchestratorService(app.container);

  app.post('/repos/:id/full-sync', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { owner, name } = req.body as { owner: string; name: string };
    return service.runFullSync(workspaceId, req.params.id, owner, name);
  });

  app.get('/repos/:id/sync-runs', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });
}
