import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { CleanupService } from './service.js';

export default async function cleanupRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new CleanupService(app.container);
  service.registerCleanupJobHandler();

  app.post('/internal/cleanup/schedule', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.scheduleCleanup(workspaceId);
    return { ok: true };
  });
}
