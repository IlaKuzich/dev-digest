import type { ExportRow } from './service.js';

export function toCsvLine(row: ExportRow): string {
  return [row.prNumber, row.repoFullName, row.verdict].join(',');
}
