/* FindingCard — ported from findings.jsx (createElement → TSX).
   Severity icon+label, category, file:line, confidence, markdown rationale +
   suggestion, accept/dismiss actions. Accept/dismiss reflect persisted
   timestamps. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Icon,
  SeverityBadge,
  CategoryTag,
  MonoLink,
  ConfidenceNum,
  Button,
  Markdown,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord, FindingActionKind } from "@devdigest/shared";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "./constants";
import { lineLabel } from "./helpers";
import { githubBlobUrl } from "../../../../../../../lib/github-urls";
import { s } from "./styles";

export function FindingCard({
  f,
  focused,
  defaultExpanded,
  onAction,
  onCapture,
  pending,
  capturePending,
  hasAgentOwner = true,
  repoFullName,
  headSha,
  onFileClick,
  expandSignal,
}: {
  f: FindingRecord;
  focused?: boolean;
  defaultExpanded?: boolean;
  onAction?: (action: FindingActionKind, reply?: string) => void;
  /** "Turn into eval case" — separate from onAction; server derives the case
     type from this finding's accept/dismiss state (AC-1..AC-4). */
  onCapture?: () => void;
  pending?: boolean;
  /** True while THIS finding's own capture-to-eval-case mutation is in
     flight — guards the "Turn into eval case" button independently of
     `pending` (which only reflects the accept/dismiss mutation). */
  capturePending?: boolean;
  /** False when this finding's review has no owning agent (AC-6) — the
     server rejects the capture outright, so the button stays disabled with
     an explanatory tooltip instead of letting the click fail. */
  hasAgentOwner?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Navigate to this finding's file:line inside the Files-changed diff (internal). */
  onFileClick?: (file: string, line: number) => void;
  /** Bumped when this card is the deep-link focus target — forces it expanded. */
  expandSignal?: number;
}) {
  const t = useTranslations("prReview");
  const tEval = useTranslations("eval");
  const [expanded, setExpanded] = React.useState(defaultExpanded ?? false);
  // Deep-link focus opens this card so its rationale is visible on arrival.
  React.useEffect(() => {
    if (expandSignal != null) setExpanded(true);
  }, [expandSignal]);
  const sevColor = SEV_COLOR[f.severity] ?? SEV_COLOR_FALLBACK;
  // Internal diff navigation takes precedence; fall back to a GitHub deep-link
  // only when no in-app handler is wired.
  const fileHref =
    !onFileClick && repoFullName && headSha
      ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
      : undefined;
  const accepted = !!f.accepted_at;
  const dismissed = !!f.dismissed_at;
  const muted = accepted || dismissed;

  return (
    <div id={`finding-${f.id}`} data-finding-id={f.id} style={s.card(!!focused, sevColor, muted)}>
      <div onClick={() => setExpanded((e) => !e)} style={s.header}>
        <div style={s.badgeWrap}>
          <SeverityBadge severity={f.severity as Severity} compact />
        </div>
        <div style={s.headerMain}>
          <div style={s.titleRow}>
            <span style={s.title(muted, dismissed)}>{f.title}</span>
            <CategoryTag category={f.category as Category} />
            {accepted && <span style={s.acceptedTag}>{t("finding.accepted")}</span>}
            {dismissed && <span style={s.dismissedTag}>{t("finding.dismissed")}</span>}
          </div>
          <div style={s.metaRow} onClick={(e) => e.stopPropagation()}>
            <MonoLink
              href={fileHref}
              onClick={onFileClick ? () => onFileClick(f.file, f.start_line) : undefined}
            >
              {f.file}:{lineLabel(f)}
            </MonoLink>
            <ConfidenceNum value={f.confidence} />
          </div>
        </div>
        <Icon.ChevronDown size={16} style={s.chevron(expanded)} />
      </div>

      {expanded && (
        <div style={s.body}>
          <div style={s.prose}>
            <Markdown>{f.rationale}</Markdown>
          </div>
          {f.suggestion && (
            <div style={s.suggestionWrap}>
              <div style={s.suggestionLabel}>{t("finding.suggestedFix")}</div>
              <div style={s.prose}>
                <Markdown>{f.suggestion}</Markdown>
              </div>
            </div>
          )}

          <div style={s.actions}>
            <Button
              kind="secondary"
              size="sm"
              icon="Check"
              disabled={pending}
              active={accepted}
              onClick={() => onAction?.("accept")}
            >
              {t("finding.accept")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="X"
              disabled={pending}
              active={dismissed}
              onClick={() => onAction?.("dismiss")}
            >
              {t("finding.dismiss")}
            </Button>
            {/* "Turn into eval case" — AC-7: inert until the finding has been
               accepted or dismissed (the case type must be unambiguous), and
               AC-6: inert when the owning review has no agent. `kind` flips
               to "secondary" (filled) once enabled — the "ghost" style alone
               made enabled vs. disabled nearly indistinguishable. */}
            <Button
              kind={muted && hasAgentOwner ? "secondary" : "ghost"}
              size="sm"
              icon="FlaskConical"
              disabled={pending || capturePending || !muted || !hasAgentOwner}
              title={
                !muted
                  ? tEval("capture.needsDecision")
                  : !hasAgentOwner
                    ? tEval("capture.noAgentOwner")
                    : undefined
              }
              aria-label={tEval("capture.button")}
              onClick={() => onCapture?.()}
            >
              {tEval("capture.button")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
