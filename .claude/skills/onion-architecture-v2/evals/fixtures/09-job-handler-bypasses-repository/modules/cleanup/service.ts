import { and, eq, lt } from 'drizzle-orm';
import type { Container } from '../../platform/container.js';
import * as t from '../../db/schema.js';
import { CleanupRepository } from './repository.js';
import { CLEANUP_JOB_KIND, RETENTION_DAYS } from './constants.js';

export interface CleanupJobPayload {
  workspaceId: string;
}

export class CleanupService {
  private repo: CleanupRepository;

  constructor(private container: Container) {
    this.repo = new CleanupRepository(container.db);
  }

  registerCleanupJobHandler(): void {
    this.container.jobs.register(CLEANUP_JOB_KIND, async (payload) => {
      const { workspaceId } = payload as CleanupJobPayload;
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
      await this.container.db
        .delete(t.agentRuns)
        .where(and(eq(t.agentRuns.workspaceId, workspaceId), lt(t.agentRuns.createdAt, cutoff)));
    });
  }

  async scheduleCleanup(workspaceId: string): Promise<void> {
    await this.container.jobs.enqueue(workspaceId, CLEANUP_JOB_KIND, { workspaceId } satisfies CleanupJobPayload);
  }
}
