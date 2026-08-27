/* lint.ts — pure YAML parse + client soft-warn helpers for the Preview step
   (AC-12/13). This is CLIENT-side advisory only: `parseYamlSafe` HARD-blocks
   Continue/Install on a syntax error (AC-12), but `lintWorkflowYml` only
   returns advisory warning strings that must never block by themselves — the
   server's `lintWorkflowYml` (server/src/modules/ci/generators/lint.ts, T1)
   is the authoritative AC-39/40/41 gate (AC-48 hard-reject happens there). */

import { parse } from "yaml";

export type ParseYamlResult = { ok: true } | { ok: false; message: string };

/** Wraps `yaml.parse` — never throws, surfaces the parser's message instead. */
export function parseYamlSafe(text: string): ParseYamlResult {
  try {
    parse(text);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid YAML";
    return { ok: false, message };
  }
}

const RUNNER_INVOCATION = ".devdigest/runner/index.js";
const ALLOWED_PERMISSIONS = new Set(["contents: read", "pull-requests: write"]);

/** Advisory-only structural warnings for a `workflow.yml` draft (AC-13).
 *  Mirrors the AC-39/40/41 invariants the server hard-enforces, but returning
 *  a non-empty array here must NEVER block the wizard by itself. */
export function lintWorkflowYml(text: string): string[] {
  const warnings: string[] = [];

  const permissionsBlock = extractPermissionsBlock(text);
  if (permissionsBlock) {
    const entries = permissionsBlock
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const hasBroaderGrant = entries.some((line) => !ALLOWED_PERMISSIONS.has(line));
    if (hasBroaderGrant || entries.length === 0) {
      warnings.push(
        "Permissions grant more than contents: read and pull-requests: write — the server will reject a broader grant."
      );
    }
  }

  if (/pull_request_target\s*:/.test(text) || /\bpull_request_target\b/.test(text)) {
    warnings.push("Uses the pull_request_target trigger, which the server will reject.");
  }

  if (hasHardcodedSecret(text)) {
    warnings.push("Contains what looks like a hardcoded secret instead of ${{ secrets.* }}.");
  }

  if (!text.includes(RUNNER_INVOCATION)) {
    warnings.push(`Missing the runner invocation step (node ${RUNNER_INVOCATION}).`);
  }

  return warnings;
}

function extractPermissionsBlock(text: string): string[] | null {
  const lines = text.split("\n");
  const startIndex = lines.findIndex((line) => /^permissions\s*:\s*$/.test(line.trim()));
  if (startIndex === -1) return null;
  const startLine = lines[startIndex] ?? "";
  const indent = startLine.match(/^\s*/)?.[0].length ?? 0;
  const block: string[] = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim().length === 0) continue;
    const lineIndent = line.match(/^\s*/)?.[0].length ?? 0;
    if (lineIndent <= indent) break;
    block.push(line);
  }
  return block;
}

function hasHardcodedSecret(text: string): boolean {
  // A "secret"-shaped assignment (env/with key ending in _TOKEN/_KEY/_SECRET)
  // whose value is a literal rather than a `${{ secrets.* }}` expression.
  const lines = text.split("\n");
  for (const line of lines) {
    const match = line.match(/^\s*[A-Z0-9_]*(?:TOKEN|KEY|SECRET)\s*:\s*(.+)\s*$/);
    if (!match) continue;
    const value = (match[1] ?? "").trim();
    if (value.length === 0) continue;
    if (value.includes("${{")) continue;
    return true;
  }
  return false;
}
