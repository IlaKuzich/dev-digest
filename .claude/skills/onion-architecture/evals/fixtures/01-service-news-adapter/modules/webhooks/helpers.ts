import type { ReviewSummary } from './service.js';

export function formatSlackMessage(summary: ReviewSummary): string {
  const verdict = summary.score >= 80 ? 'looks good' : 'needs attention';
  return `PR #${summary.prNumber} review complete (score ${summary.score}) — ${verdict}`;
}
