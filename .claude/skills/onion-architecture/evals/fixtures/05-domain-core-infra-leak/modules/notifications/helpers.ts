import type { NotificationInput } from './ports.js';

export function toNotificationDto(row: NotificationInput) {
  return { id: row.id, message: row.message, read: row.read, createdAt: row.createdAt };
}
