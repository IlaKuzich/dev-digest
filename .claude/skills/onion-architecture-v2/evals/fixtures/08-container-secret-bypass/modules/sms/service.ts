import type { Container } from '../../platform/container.js';
import { SmsRepository } from './repository.js';
import { getSmsAdapter } from './wiring.js';

export class SmsService {
  private repo: SmsRepository;

  constructor(private container: Container) {
    this.repo = new SmsRepository(container.db);
  }

  async send(workspaceId: string, phone: string, body: string): Promise<void> {
    await getSmsAdapter().send(phone, body);
    await this.repo.logSend(workspaceId, phone);
  }
}
