import type { InferSelectModel } from 'drizzle-orm';
import type * as t from '../../db/schema.js';

export type NotificationInput = InferSelectModel<typeof t.notifications>;

export interface NotificationPort {
  send(input: NotificationInput): Promise<void>;
}
