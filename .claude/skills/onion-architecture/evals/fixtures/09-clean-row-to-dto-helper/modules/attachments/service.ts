import type { Container } from '../../platform/container.js';
import { AttachmentRepository } from './repository.js';
import { toAttachmentDto } from './helpers.js';
import { MAX_ATTACHMENT_BYTES } from './constants.js';

export class AttachmentService {
  private repo: AttachmentRepository;

  constructor(private container: Container) {
    this.repo = new AttachmentRepository(container.db);
  }

  async list(workspaceId: string, reviewId: string) {
    const rows = await this.repo.listForReview(workspaceId, reviewId);
    return rows.map(toAttachmentDto);
  }

  async upload(workspaceId: string, reviewId: string, fileBuffer: Buffer): Promise<ReturnType<typeof toAttachmentDto>> {
    if (fileBuffer.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new Error('Attachment too large');
    }
    const key = await this.container.storage.put(fileBuffer);
    const row = await this.repo.insert(workspaceId, reviewId, key, fileBuffer.byteLength);
    return toAttachmentDto(row);
  }
}
