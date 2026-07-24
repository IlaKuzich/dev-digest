import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { NotificationService } from './service.js';

export default async function notificationsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new NotificationService(app.container);

  app.get('/notifications', async (req) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    return service.listUnread(workspaceId, userId);
  });
}
