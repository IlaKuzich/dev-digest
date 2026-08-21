import type { Container } from '../../platform/container.js';
import { SlackNotifier } from '../../adapters/slack/slack-notifier.js';
import { WebhookRepository } from './repository.js';
import { formatSlackMessage } from './helpers.js';
import { SLACK_CHANNEL_DEFAULT } from './constants.js';

export interface ReviewSummary {
  prNumber: number;
  score: number;
}

export class WebhookService {
  private repo: WebhookRepository;
  private notifier = new SlackNotifier(SLACK_CHANNEL_DEFAULT);

  constructor(private container: Container) {
    this.repo = new WebhookRepository(container.db);
  }

  async notifyReviewComplete(workspaceId: string, summary: ReviewSummary): Promise<void> {
    const config = await this.repo.getConfig(workspaceId);
    if (!config?.slackEnabled) return;
    await this.notifier.send(formatSlackMessage(summary));
    await this.repo.markNotified(workspaceId, summary.prNumber);
  }
}
