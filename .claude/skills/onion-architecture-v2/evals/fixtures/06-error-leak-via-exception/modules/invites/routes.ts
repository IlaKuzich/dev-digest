import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { InviteService } from './service.js';

export default async function invitesRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new InviteService(app.container);

  app.post('/invites', async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const { email } = req.body as { email: string };
    try {
      await service.invite(workspaceId, email);
    } catch (err: any) {
      if (err.code === '23505') {
        reply.status(409);
        return { error: 'already_invited' };
      }
      throw err;
    }
    reply.status(201);
    return { ok: true };
  });

  app.get('/invites', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });
}
