/* PrBriefCard/helpers.ts — pure helpers: the "should auto-generate once"
   predicate and file_ref → link-target derivation. No React import —
   business logic only (react-best-practices). */
import type { BriefEnvelope, RiskSeverity, Verdict } from "@devdigest/shared";
import type { Severity, IconName } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";

/** Per-verdict icon + color for the brief header band. Kept local so PrBriefCard
    stays self-contained; mirrors VerdictBanner's `VERDICT_META`. The label text
    lives in the `brief` i18n namespace under `verdict.<labelKey>`. */
export const VERDICT_META: Record<Verdict, { icon: IconName; c: string; bg: string; labelKey: string }> = {
  request_changes: { icon: "XCircle", c: "var(--crit)", bg: "var(--crit-bg)", labelKey: "requestChanges" },
  approve: { icon: "CheckCircle", c: "var(--ok)", bg: "var(--ok-bg)", labelKey: "approve" },
  comment: { icon: "MessageSquare", c: "var(--info)", bg: "var(--info-bg)", labelKey: "comment" },
};

/** Maps the brief's high/medium/low risk_level onto the app's existing
    severity color tokens (SEV) so risk_level is color-coded with the SAME
    palette findings use elsewhere — not a new one-off palette (AC-16). */
export const RISK_LEVEL_TO_SEV: Record<RiskSeverity, Severity> = {
  high: "CRITICAL",
  medium: "WARNING",
  low: "SUGGESTION",
};

/**
 * True exactly when the card should fire its ONE auto-generation call
 * (AC-9): the server has confirmed no cache exists (`data === null`), no
 * generation is already in flight, the last attempt (if any) did not error,
 * and this card has not already fired one. `data === undefined` (still
 * loading) or a populated envelope must never trigger this — only a
 * confirmed cache miss does. The error guard prevents an auto-fire ↔ error
 * loop: once a generation attempt has failed, only an explicit user Retry
 * (not this predicate) fires the next one.
 */
export function shouldAutoGenerate(
  data: BriefEnvelope | null | undefined,
  isRegeneratePending: boolean,
  isRegenerateError: boolean,
  alreadyFired: boolean,
): boolean {
  return data === null && !isRegeneratePending && !isRegenerateError && !alreadyFired;
}

/** The latest review run's headline numbers, surfaced in the PR Brief header
    band (score gauge + cost + findings·blockers) — mirrors the design's top
    panel. Sourced from the review run, NOT the brief itself; null score/cost
    mean "not reviewed yet" and the band collapses accordingly. */
export interface PrReviewSummary {
  /** Aggregate verdict compressed from ALL agent runs — derived from the most
      severe finding (blocker → request_changes, warning → comment, none →
      approve); null when the PR has not been reviewed yet. */
  verdict: Verdict | null;
  score: number | null;
  costUsd: number | null;
  findingsCount: number;
  blockers: number;
}

export interface ParsedFileRef {
  path: string;
  startLine?: number;
  endLine?: number;
}

/** Resolve a review-focus `file_ref` to an internal Files-changed focus target
    (path + line), or null when it is not a navigable file. Endpoint refs (e.g.
    "GET /api/x") carry a space and have no diff line to focus — those stay
    plain text. Line falls back to an embedded `:line`, then to 1. */
export function focusTarget(
  ref: string,
  line?: number | null,
): { path: string; line: number } | null {
  if (ref.includes(" ")) return null;
  const parsed = parseFileRef(ref);
  if (!parsed.path) return null;
  return { path: parsed.path, line: line ?? parsed.startLine ?? 1 };
}

/** Strip a trailing `:line` or `:start-end` suffix from a raw `file_ref`
    string, mirroring the server's grounding normalization (server
    `brief/grounding.ts`). An endpoint ref (e.g. `GET /api/public/items`)
    has no such suffix and passes through unchanged. */
export function parseFileRef(ref: string): ParsedFileRef {
  const match = ref.match(/^(.*):(\d+)(?:-(\d+))?$/);
  if (!match) return { path: ref };
  return {
    path: match[1] ?? ref,
    startLine: Number(match[2]),
    endLine: match[3] ? Number(match[3]) : undefined,
  };
}

/** Human-readable label for a file_ref row: `path:line` when a line is known
    (explicit `line` field wins over one embedded in the ref), `path:start-end`
    for a range, or the bare ref (e.g. an endpoint) otherwise. */
export function formatFileRef(ref: string, line?: number | null): string {
  const parsed = parseFileRef(ref);
  if (line != null) return `${parsed.path}:${line}`;
  if (parsed.startLine == null) return parsed.path;
  if (parsed.endLine != null) return `${parsed.path}:${parsed.startLine}-${parsed.endLine}`;
  return `${parsed.path}:${parsed.startLine}`;
}

/** GitHub deep-link for a file_ref, or `null` when there is no repo to link
    into (endpoint/cron refs, or `repoFullName` not yet known) — callers must
    render the plain label instead of a link in that case. */
export function fileRefLink(
  ref: string,
  line: number | null | undefined,
  repoFullName: string | null,
  headSha: string,
): string | null {
  const parsed = parseFileRef(ref);
  // No embedded/explicit line and no path separator-like shape typical of an
  // endpoint (e.g. "GET /api/x") — still try to link; githubBlobUrl handles
  // encoding, and an unlinkable ref simply produces a (harmless) blob URL for
  // that "path". The one hard requirement is a known repo to link into.
  if (!repoFullName) return null;
  const startLine = line ?? parsed.startLine;
  const endLine = line != null ? undefined : parsed.endLine;
  return githubBlobUrl(repoFullName, headSha, parsed.path, startLine ?? undefined, endLine);
}
