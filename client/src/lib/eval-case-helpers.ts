import type { EvalCaseWithLastRun } from "./hooks/eval-cases";

/** `expected_output` is an untrusted/unknown-shaped JSON value (Zod
    `z.unknown()`) — only its array length drives the "expected N" count
    (AC-9); never interpreted further here. Shared by the Evals tab's
    `CaseRow` and the eval-case editor modal (2+ routes). */
export function expectedCount(c: EvalCaseWithLastRun): number {
  return Array.isArray(c.expected_output) ? c.expected_output.length : 0;
}
