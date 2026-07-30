import * as t from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { PgFixture } from './pg.js';

/**
 * `runReview` is fire-and-forget: the POST returns runIds immediately and each
 * agent's review is persisted in the background (the client subscribes to SSE).
 * Tests that assert on persisted reviews/findings/traces must first wait for the
 * background runs to finish. This polls `agent_runs` until every row for the PR
 * reaches a terminal status (done / failed / cancelled).
 *
 * On timeout this THROWS (it does not silently return the non-terminal runs) so
 * a slow/stuck run fails loudly at this call site with a diagnostic message,
 * instead of masquerading as an unrelated downstream assertion failure.
 */
const TERMINAL = new Set(['done', 'failed', 'cancelled']);

export async function waitForPrRuns(
  db: PgFixture['handle']['db'],
  prId: string,
  opts: { expected?: number; timeoutMs?: number } = {},
): Promise<Array<typeof t.agentRuns.$inferSelect>> {
  const { expected, timeoutMs = 30_000 } = opts;
  const start = Date.now();
  for (;;) {
    const runs = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId));
    const terminal = runs.filter((r) => TERMINAL.has(r.status ?? ''));
    // With an explicit `expected`, wait until that many runs finish (ignores any
    // extra rows, e.g. a trifecta scan). Otherwise wait for all rows to settle.
    const done =
      expected != null
        ? terminal.length >= expected
        : runs.length > 0 && terminal.length === runs.length;
    if (done) return runs;
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `waitForPrRuns timed out after ${timeoutMs}ms waiting for ${expected ?? 'all'} terminal run(s) on pr ${prId}; observed ${runs.length} run(s): ${runs.map((r) => `${r.id}=${r.status}${r.error ? ` (${r.error})` : ''}`).join(', ')}`,
      );
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}
