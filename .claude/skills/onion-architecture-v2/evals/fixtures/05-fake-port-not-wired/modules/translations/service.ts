import type { Container } from '../../platform/container.js';
import { GoogleTranslateAdapter } from '../../adapters/translate/google-translate.js';
import { TranslationRepository } from './repository.js';

interface Translator {
  translate(text: string, targetLang: string): Promise<string>;
}

export class TranslationService {
  private repo: TranslationRepository;
  private translator: Translator = new GoogleTranslateAdapter();

  constructor(private container: Container) {
    this.repo = new TranslationRepository(container.db);
  }

  async translateDescription(workspaceId: string, prId: string, targetLang: string): Promise<string> {
    const pr = await this.repo.getDescription(workspaceId, prId);
    const translated = await this.translator.translate(pr?.description ?? '', targetLang);
    await this.repo.cacheTranslation(workspaceId, prId, targetLang, translated);
    return translated;
  }
}
