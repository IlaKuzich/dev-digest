import type { ContextRoot } from "@devdigest/shared";

/**
 * Display-only mirror of the server's default context roots
 * (`server/src/modules/context/constants.ts` `CONTEXT_ROOTS`). Used only to
 * name the searched roots in the empty-roots copy (AC-3) — the actual
 * discovered documents always come from the server response, this never
 * drives discovery itself.
 */
export const CONTEXT_ROOTS_DISPLAY: readonly ContextRoot[] = ["specs", "docs", "insights"];

export const SKELETON_ROWS = 4;
