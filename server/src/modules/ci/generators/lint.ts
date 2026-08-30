/**
 * Server-side security re-lint for a caller-supplied `workflow.yml` override
 * (AC-48). This is the AUTHORITATIVE hard-reject gate — the client-side
 * checks (YAML-syntax hard-block, structural soft-warn) are advisory only.
 *
 * Mirrors the AC-39/40/41 invariants baked into `generators/workflow.ts`:
 *   (a) `permissions:` grants nothing beyond {contents: read, pull-requests: write}
 *   (b) no `pull_request_target` trigger
 *   (c) no hardcoded secret — must be `${{ secrets.* }}`
 *   (d) a `node .devdigest/runner/index.js` invocation step is present
 *
 * Pure function; no I/O. Implemented via structural string/line scanning
 * (mirrors the hand-rolled style of `generators/manifest.ts` — no YAML
 * library in the server generator) and only fixed regex LITERALS (never a
 * `RegExp` built from a variable string) per root `INSIGHTS.md`.
 */

export type LintResult = { ok: true } | { ok: false; violations: string[] };

const ALLOWED_PERMISSIONS: Record<string, string> = {
  contents: "read",
  "pull-requests": "write",
};

/** Env-var-shaped keys that are expected to carry a secret reference. */
const SECRET_KEY_PATTERN = /(_KEY|_TOKEN|_SECRET|_PASSWORD)$/;
const RUNNER_INVOCATION_PATTERN = /node\s+\.devdigest\/runner\/index\.js/;

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * GitHub Actions allows a `permissions:` block at BOTH the workflow level
 * AND per-job (under `jobs.<job-id>:`) — a job-level block REPLACES the
 * workflow-level one for that job, it does not merge with it. So a
 * compliant top-level block does NOT guarantee a compliant workflow: an
 * edited YAML can keep the top-level block intact while escalating scope
 * in a job-level override. Every `permissions:` occurrence in the file
 * (whatever its nesting) must therefore be found and validated — checking
 * only the first occurrence is a full bypass of this invariant.
 */
function checkPermissions(lines: string[], violations: string[]): void {
  const permissionsLineIndexes = lines
    .map((l, i) => (l.trim().startsWith("permissions:") ? i : -1))
    .filter((i) => i !== -1);

  if (permissionsLineIndexes.length === 0) {
    violations.push(
      "missing `permissions:` block — must grant exactly contents: read, pull-requests: write",
    );
    return;
  }

  for (const idx of permissionsLineIndexes) {
    checkOnePermissionsBlock(lines, idx, violations);
  }
}

function checkOnePermissionsBlock(
  lines: string[],
  idx: number,
  violations: string[],
): void {
  const headerLine = lines[idx]!;
  const inlineValue = headerLine.slice(headerLine.indexOf(":") + 1).trim();
  const baseIndent = indentOf(headerLine);
  const location = `line ${idx + 1}`;

  if (inlineValue.length > 0 && !inlineValue.startsWith("#")) {
    // Scalar form, e.g. `permissions: write-all` — always broader than allowed.
    violations.push(
      `permissions (${location}): uses scalar value "${inlineValue}" instead of an explicit contents/pull-requests map`,
    );
    return;
  }

  // Block form — collect indented key: value pairs immediately below.
  const granted: Record<string, string> = {};
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim().length === 0) continue;
    if (indentOf(line) <= baseIndent) break;
    const trimmed = line.trim();
    const sep = trimmed.indexOf(":");
    if (sep === -1) continue;
    const key = trimmed.slice(0, sep).trim().replace(/^["']|["']$/g, "");
    const value = trimmed.slice(sep + 1).trim();
    granted[key] = value;
  }

  const grantedKeys = Object.keys(granted);
  const extraKeys = grantedKeys.filter((k) => !(k in ALLOWED_PERMISSIONS));
  const wrongValues = grantedKeys.filter(
    (k) => k in ALLOWED_PERMISSIONS && granted[k] !== ALLOWED_PERMISSIONS[k],
  );

  if (extraKeys.length > 0) {
    violations.push(
      `permissions (${location}): grants additional scope(s) beyond contents:read/pull-requests:write — ${extraKeys.join(", ")}`,
    );
  }
  if (wrongValues.length > 0) {
    violations.push(
      `permissions (${location}): grants a broader level than allowed — ${wrongValues
        .map((k) => `${k}: ${granted[k]}`)
        .join(", ")}`,
    );
  }
}

function checkNoPullRequestTarget(lines: string[], violations: string[]): void {
  // Skip comment-only lines — e.g. the generator's own advisory comment
  // ("Do not ... use pull_request_target.") legitimately mentions the term
  // without using it as a trigger, and must not self-trip this check.
  const codeOnly = lines
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
  if (codeOnly.includes("pull_request_target")) {
    violations.push(
      "workflow uses `pull_request_target` — forbidden (would leak secrets to fork PRs)",
    );
  }
}

function checkNoHardcodedSecret(lines: string[], violations: string[]): void {
  for (const line of lines) {
    const trimmed = line.trim();
    const sep = trimmed.indexOf(":");
    if (sep === -1) continue;
    const key = trimmed.slice(0, sep).trim();
    if (!SECRET_KEY_PATTERN.test(key)) continue;
    const value = trimmed.slice(sep + 1).trim();
    if (value.length === 0) continue;
    if (value.includes("secrets.")) continue;
    violations.push(
      `hardcoded secret detected for "${key}" — must reference \${{ secrets.${key} }}, not a literal value`,
    );
  }
}

function checkRunnerInvocation(contents: string, violations: string[]): void {
  if (!RUNNER_INVOCATION_PATTERN.test(contents)) {
    violations.push(
      "missing `node .devdigest/runner/index.js` invocation step",
    );
  }
}

/**
 * Lint a `workflow.yml` string against the AC-39/40/41 security invariants.
 * Returns every violation found (not just the first) so the caller can
 * report a complete list.
 */
export function lintWorkflowYml(contents: string): LintResult {
  const lines = contents.split("\n");
  const violations: string[] = [];

  checkPermissions(lines, violations);
  checkNoPullRequestTarget(lines, violations);
  checkNoHardcodedSecret(lines, violations);
  checkRunnerInvocation(contents, violations);

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
