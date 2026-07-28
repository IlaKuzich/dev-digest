import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SyncService } from './service.js';

export default async function syncRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SyncService(app.container);

  app.post('/pulls/:id/sync-status', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { state } = req.body as { state: string };
    await service.syncStatus(workspaceId, req.params.id, state);
    return { ok: true };
  });
}
