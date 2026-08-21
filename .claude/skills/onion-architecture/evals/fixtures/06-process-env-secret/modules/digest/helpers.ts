import type { DigestEntry } from './service.js';

export function formatDigestBody(entries: DigestEntry[]): string {
  return entries.map((e) => `- ${e.repoFullName}: ${e.openPrs} open PRs`).join('\n');
}
