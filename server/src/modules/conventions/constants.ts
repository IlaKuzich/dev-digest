/** How many top-ranked source files to feed the extractor. */
export const SAMPLE_FILE_COUNT = 12;

/** Config files fed as extra signal (enhancement #1). Read from clone root if present. */
export const CONFIG_FILES = [
  '.eslintrc.json',
  '.eslintrc.cjs',
  '.eslintrc.js',
  'eslint.config.js',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
  'package.json',
] as const;

export const MAX_CANDIDATES = 12;
export const EXTRACT_MAX_RETRIES = 2;
