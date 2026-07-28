import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { AlertService } from './service.js';

export default async function alertsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new AlertService(app.container);

  app.post('/internal/alerts/notify', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { repoId, message } = req.body as { repoId: string; message: string };
    await service.notify(workspaceId, repoId, message);
    return { ok: true };
  });
}
