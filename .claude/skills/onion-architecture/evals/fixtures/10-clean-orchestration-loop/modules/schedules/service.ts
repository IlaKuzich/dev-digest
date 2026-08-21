import type { Container } from '../../platform/container.js';
import { ScheduleRepository } from './repository.js';
import { nextRunAt } from './helpers.js';
import { DIGEST_SEND_JOB_KIND } from './constants.js';

export class ScheduleService {
  private repo: ScheduleRepository;

  constructor(private container: Container) {
    this.repo = new ScheduleRepository(container.db);
  }

  async runDue(workspaceId: string): Promise<number> {
    const now = new Date();
    const due = await this.repo.listDue(workspaceId, now);
    let dispatched = 0;
    for (const schedule of due) {
      const timezone = schedule.timezone ?? this.container.config.timezoneDefault;
      await this.container.jobs.enqueue(workspaceId, DIGEST_SEND_JOB_KIND, {
        scheduleId: schedule.id,
        repoId: schedule.repoId,
        timezone,
      });
      const next = nextRunAt(schedule.frequency, now);
      await this.repo.bumpNextRun(workspaceId, schedule.id, next);
      dispatched++;
    }
    return dispatched;
  }
}
