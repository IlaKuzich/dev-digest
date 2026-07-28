import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { SmsService } from './service.js';

export default async function smsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SmsService(app.container);

  app.post('/internal/sms/send', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { phone, body } = req.body as { phone: string; body: string };
    await service.send(workspaceId, phone, body);
    return { ok: true };
  });
}
