/** Reprompt-on-error budget for the structured intent-classifier call. */
export const INTENT_MAX_RETRIES = 2;

/** Cap on how much of a resolved plan/spec doc we read (bytes), per file. */
export const PLAN_SPEC_MAX_BYTES = 16 * 1024;

/** Accepted extensions for an in-repo plan/spec doc read from the local clone.
 *  Extension-less refs are intentionally excluded (defense-in-depth) — a
 *  plan/spec is realistically `.md`/`.txt`; extension-less files are far more
 *  likely to be binaries/executables we never want to read. */
export const PLAN_SPEC_ALLOWED_EXTENSIONS = ['.md', '.txt'] as const;
