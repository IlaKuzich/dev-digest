/** Pure helpers for EvalCaseModal — no React, no fetch. */

/**
 * Derives the case type from `expected_output.length`, exactly mirroring the
 * server's one-line derivation (`server/src/modules/evals/scoring.ts`
 * `caseTypeOf`) so the POSITIVE/NEGATIVE banner always agrees with how the
 * server will score this case (AC-10).
 */
export function caseTypeOf(
  expectedOutput: unknown,
): "must_find" | "must_not_flag" {
  return Array.isArray(expectedOutput) && expectedOutput.length > 0
    ? "must_find"
    : "must_not_flag";
}

/** Safely parse the `expected_output` JSON textarea value. Returns `null` on
 *  invalid JSON (caller renders the invalid-JSON indicator + disables save). */
export function tryParseExpectedOutput(raw: string): unknown[] | null {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Pretty-print a value for the expected_output textarea's initial contents. */
export function stringifyExpectedOutput(value: unknown): string {
  if (value == null) return "[]";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[]";
  }
}
