import type { Container } from '../../platform/container.js';
import { PagerDutyClient } from '../../adapters/pagerduty/pagerduty-client.js';
import { AlertRepository } from './repository.js';
import { toPagerDutySummary } from './helpers.js';
import { ALERT_SEVERITY_DEFAULT } from './constants.js';

export interface AlertPayload {
  repoFullName: string;
  message: string;
  severity: string;
}

export class AlertService {
  private repo: AlertRepository;
  private pagerDuty = new PagerDutyClient(process.env.PAGERDUTY_ROUTING_KEY ?? '');

  constructor(private container: Container) {
    this.repo = new AlertRepository(container.db);
  }

  async notify(workspaceId: string, repoId: string, message: string): Promise<void> {
    const payload: AlertPayload = { repoFullName: repoId, message, severity: ALERT_SEVERITY_DEFAULT };
    await this.pagerDuty.trigger(toPagerDutySummary(payload));
    await this.repo.recordSent(workspaceId, repoId, message);
  }
}
