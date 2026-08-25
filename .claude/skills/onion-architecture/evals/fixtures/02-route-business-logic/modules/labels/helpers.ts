import { AUTO_LABEL_PREFIX } from './constants.js';

export function isAutoLabel(name: string): boolean {
  return name.startsWith(AUTO_LABEL_PREFIX);
}
