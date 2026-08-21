import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { ScheduleService } from './service.js';

export default async function schedulesRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ScheduleService(app.container);

  app.post('/internal/schedules/run-due', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const dispatched = await service.runDue(workspaceId);
    return { dispatched };
  });
}
