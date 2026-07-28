import type { Container } from '../../platform/container.js';
import type { IndexSummary } from '../repo-intel/contracts.js';
import { SyncOrchestratorRepository } from './repository.js';
import { toSyncRunDto } from './helpers.js';
import { RESYNC_FOLLOWUP_JOB_KIND } from './constants.js';

export class SyncOrchestratorService {
  private repo: SyncOrchestratorRepository;

  constructor(private container: Container) {
    this.repo = new SyncOrchestratorRepository(container.db);
  }

  async runFullSync(
    workspaceId: string,
    repoId: string,
    owner: string,
    name: string,
  ): Promise<ReturnType<typeof toSyncRunDto>> {
    const run = await this.repo.recordRun(workspaceId, repoId, 'running');
    await this.container.git.sync({ owner, name });
    const meta = await (await this.container.github()).getRepoMeta(owner, name);
    await this.container.jobs.enqueue(workspaceId, RESYNC_FOLLOWUP_JOB_KIND, {
      repoId,
      defaultBranch: meta.defaultBranch,
    });
    return toSyncRunDto(run);
  }

  async list(workspaceId: string) {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toSyncRunDto);
  }

  describeCoverage(summary: IndexSummary): string {
    return `${summary.analyzedFiles}/${summary.changedFiles} files analyzed`;
  }
}
