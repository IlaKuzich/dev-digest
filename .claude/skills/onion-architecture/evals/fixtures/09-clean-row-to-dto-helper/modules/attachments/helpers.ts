import type { AttachmentRow } from './repository.js';

export function toAttachmentDto(row: AttachmentRow) {
  return { id: row.id, sizeBytes: row.sizeBytes, downloadUrl: `/attachments/${row.id}/download` };
}
