import type { Container } from '../../platform/container.js';
import { NotificationRepository } from './repository.js';
import { toNotificationDto } from './helpers.js';

export class NotificationService {
  private repo: NotificationRepository;

  constructor(private container: Container) {
    this.repo = new NotificationRepository(container.db);
  }

  async push(workspaceId: string, userId: string, message: string): Promise<void> {
    await this.repo.insert(workspaceId, userId, message);
  }

  async listUnread(workspaceId: string, userId: string) {
    const rows = await this.repo.listUnread(workspaceId, userId);
    return rows.map(toNotificationDto);
  }
}
