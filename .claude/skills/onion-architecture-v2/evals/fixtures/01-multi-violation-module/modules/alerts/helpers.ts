import type { AlertPayload } from './service.js';

export function toPagerDutySummary(payload: AlertPayload): string {
  return `[${payload.severity}] ${payload.repoFullName}: ${payload.message}`;
}
