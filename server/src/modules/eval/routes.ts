import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { EvalPromoteInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { EvalService } from './service.js';

/**
 * T4 — eval module (Group A–E). 13 endpoints per the spec's Contracts & flows
 * table (`specs/eval-pipeline.md`):
 *   POST   /findings/:id/eval-case          → capture (Surface A)
 *   POST   /agents/:id/eval-cases           → create case
 *   GET    /agents/:id/eval-cases           → list cases (Evals tab)
 *   PUT    /eval-cases/:id                  → update case
 *   DELETE /eval-cases/:id                  → delete case
 *   POST   /eval-cases/:id/run              → run one case
 *   POST   /agents/:id/eval-runs            → run all evals (one batch)
 *   GET    /agents/:id/eval-runs            → batch-run rows (Recent runs)
 *   GET    /agents/:id/eval-dashboard       → per-agent dashboard (tab tiles + detail)
 *   GET    /eval-dashboard                  → cross-agent dashboard home
 *   POST   /eval/run-all                    → run every agent's set
 *   GET    /agents/:id/eval-runs/compare    → two-batch compare (?a=&b=)
 *   POST   /agents/:id/promote              → forward-only version promote
 *
 * Every route resolves `workspaceId` via `getContext`; local Zod param
 * schemas are used where the segment isn't `:id` (server/INSIGHTS.md:45).
 */

const CreateEvalCaseBody = z.object({
  name: z.string().min(1),
  input_diff: z.string().optional(),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});

const UpdateEvalCaseBody = z.object({
  name: z.string().min(1).optional(),
  input_diff: z.string().optional(),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown().optional(),
  notes: z.string().nullish(),
});

/** `?a=<batchId>&b=<batchId>` for the compare endpoint. */
const CompareQuery = z.object({
  a: z.string().uuid(),
  b: z.string().uuid(),
});

export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new EvalService(app.container);

  // ---- Group A — capture ---------------------------------------------------

  app.post('/findings/:id/eval-case', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const evalCase = await service.captureFromFinding(workspaceId, req.params.id);
    reply.status(201);
    return evalCase;
  });

  // ---- Group B — case CRUD + single-case run -------------------------------

  app.post(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, body: CreateEvalCaseBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      // `fastify-type-provider-zod` types `req.body` from the schema's INPUT
      // (pre-parse) shape, so a bare `z.unknown()` field infers as optional
      // (`unknown` absorbs `undefined`) even though Zod has already validated
      // the body by this point. Normalize at this boundary — never `[]` by
      // default — before calling the service, whose `CreateEvalCaseInput`
      // keeps `expected_output` a required field (it's always meaningful:
      // `[]` means a `must_not_flag` case).
      const evalCase = await service.createCase(workspaceId, req.params.id, {
        ...req.body,
        expected_output: req.body.expected_output ?? [],
      });
      if (!evalCase) throw new NotFoundError('Agent not found');
      reply.status(201);
      return evalCase;
    },
  );

  app.get('/agents/:id/eval-cases', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const cases = await service.listCases(workspaceId, req.params.id);
    if (!cases) throw new NotFoundError('Agent not found');
    return cases;
  });

  app.put(
    '/eval-cases/:id',
    { schema: { params: IdParams, body: UpdateEvalCaseBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const updated = await service.updateCase(workspaceId, req.params.id, req.body);
      if (!updated) throw new NotFoundError('Eval case not found');
      return updated;
    },
  );

  app.delete('/eval-cases/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.deleteCase(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Eval case not found');
    return { ok: true };
  });

  app.post('/eval-cases/:id/run', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const result = await service.runCase(workspaceId, req.params.id);
    if (!result) throw new NotFoundError('Eval case not found');
    return result;
  });

  // ---- Group B/E — batch run + recent runs ---------------------------------

  app.post('/agents/:id/eval-runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.runBatch(workspaceId, req.params.id);
  });

  app.get('/agents/:id/eval-runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const runs = await service.listBatchRuns(workspaceId, req.params.id);
    if (!runs) throw new NotFoundError('Agent not found');
    return runs;
  });

  // ---- Group C/D — dashboards -----------------------------------------------

  app.get('/agents/:id/eval-dashboard', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const dashboard = await service.agentDashboard(workspaceId, req.params.id);
    if (!dashboard) throw new NotFoundError('Agent not found');
    return dashboard;
  });

  app.get('/eval-dashboard', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.dashboardHome(workspaceId);
  });

  app.post('/eval/run-all', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.runAllAgents(workspaceId);
  });

  app.get(
    '/agents/:id/eval-runs/compare',
    { schema: { params: IdParams, querystring: CompareQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const compare = await service.compare(workspaceId, req.params.id, req.query.a, req.query.b);
      if (!compare) throw new NotFoundError('Eval run(s) not found');
      return compare;
    },
  );

  // ---- Group D — promote ----------------------------------------------------

  app.post(
    '/agents/:id/promote',
    { schema: { params: IdParams, body: EvalPromoteInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.promote(workspaceId, req.params.id, req.body.version);
    },
  );
}
