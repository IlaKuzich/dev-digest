import type { EvalCaseWithLastRun } from "@/lib/hooks/eval-cases";

export type CaseState = "pass" | "fail" | "never-run";

/** AC-17: no persisted last run ⇒ "never run" + neutral glyph. Otherwise the
    state follows the last run's `pass` flag (a run that errored/failed
    scoring persists `pass: false`, per T4's AC-42 handling). */
export function caseState(c: EvalCaseWithLastRun): CaseState {
  if (!c.last_run) return "never-run";
  return c.last_run.pass ? "pass" : "fail";
}

/** `expected_output` is an untrusted/unknown-shaped JSON value (Zod
    `z.unknown()`) — only its array length drives the "expected N" count
    (AC-9); never interpreted further here. */
export function expectedCount(c: EvalCaseWithLastRun): number {
  return Array.isArray(c.expected_output) ? c.expected_output.length : 0;
}

/** The last run's `actual_output` is likewise untrusted JSON — only its
    array length drives the "got M" count. */
export function producedCount(c: EvalCaseWithLastRun): number {
  const out = c.last_run?.actual_output;
  return Array.isArray(out) ? out.length : 0;
}

/** Severity/category tag text, or `null` when the case is a `must_not_flag`
    case (`expected_output` is `[]`) — callers render the "empty []" tag
    instead (AC-9). */
export function severityCategoryTag(c: EvalCaseWithLastRun): string | null {
  if (!Array.isArray(c.expected_output) || c.expected_output.length === 0) return null;
  const first = c.expected_output[0] as { severity?: unknown; category?: unknown } | null;
  const severity = typeof first?.severity === "string" ? first.severity : null;
  const category = typeof first?.category === "string" ? first.category : null;
  if (!severity && !category) return null;
  return [severity, category].filter(Boolean).join(" · ");
}

export function isEmptyExpectedCase(c: EvalCaseWithLastRun): boolean {
  return Array.isArray(c.expected_output) && c.expected_output.length === 0;
}

/** "P / T passing" (AC-10): T = cases with a last run, P = those that passed. */
export function casesPassing(cases: EvalCaseWithLastRun[]): { passed: number; total: number } {
  const withRun = cases.filter((c) => c.last_run != null);
  const passed = withRun.filter((c) => c.last_run?.pass === true).length;
  return { passed, total: withRun.length };
}

/** Best-effort parse for the case editor's Expected-output JSON editor
    (AC-14) — never `eval`, just `JSON.parse` in a try/catch. */
export function tryParseJson(text: string): { valid: true; value: unknown } | { valid: false } {
  try {
    return { valid: true, value: JSON.parse(text) };
  } catch {
    return { valid: false };
  }
}

/** "+ Finding skeleton" (AC-15): append a template finding to whatever is
    already a valid JSON array in the editor, or start a fresh one-element
    array when the current content isn't a valid array. */
export function insertFindingSkeleton(currentText: string): string {
  const parsed = tryParseJson(currentText);
  const arr = parsed.valid && Array.isArray(parsed.value) ? [...parsed.value] : [];
  arr.push({
    severity: "CRITICAL",
    category: "security",
    title: "",
    file: "",
    start_line: 1,
  });
  return JSON.stringify(arr, null, 2);
}
