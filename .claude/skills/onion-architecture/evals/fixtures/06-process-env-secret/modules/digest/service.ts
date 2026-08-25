import type { Container } from '../../platform/container.js';
import { DigestRepository } from './repository.js';
import { formatDigestBody } from './helpers.js';

export interface DigestEntry {
  repoFullName: string;
  openPrs: number;
}

export class DigestService {
  private repo: DigestRepository;

  constructor(private container: Container) {
    this.repo = new DigestRepository(container.db);
  }

  async send(workspaceId: string, entries: DigestEntry[]): Promise<void> {
    const webhookUrl = process.env.DIGEST_WEBHOOK_URL;
    if (!webhookUrl) return;
    const subscribers = await this.repo.listSubscribers(workspaceId);
    if (subscribers.length === 0) return;
    const body = formatDigestBody(entries);
    await fetch(webhookUrl, { method: 'POST', body });
  }
}
