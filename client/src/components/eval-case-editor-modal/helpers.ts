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
