import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { FlagService } from './service.js';

export default async function flagsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new FlagService(app.container);

  app.get('/pulls/:id/flags', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.put('/pulls/:id/flags/:key', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { id, key } = req.params as { id: string; key: string };
    const { value } = req.body as { value: boolean };
    await service.set(workspaceId, id, key, value);
    return { ok: true };
  });
}
