"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Badge, MonoLink } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { githubBlobUrl } from "../../../../../../lib/github-urls";
import { cs, confFill } from "./styles";

export function ConventionCard({
  convention,
  repoFullName,
  defaultBranch,
  onAccept,
  onReject,
  onEdit,
}: {
  convention: ConventionCandidate;
  repoFullName?: string | null;
  defaultBranch?: string | null;
  onAccept: () => void;
  onReject: () => void;
  onEdit: (rule: string) => void;
}) {
  const t = useTranslations("conventions");
  const c = convention;
  const accepted = c.status === "accepted";
  const displayRule = c.edited_rule ?? c.rule;
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(displayRule);

  const pct = Math.round(c.confidence * 100);
  const range =
    c.evidence_line_start != null
      ? `${c.evidence_path}:${c.evidence_line_start}${c.evidence_line_end != null ? `-${c.evidence_line_end}` : ""}`
      : c.evidence_path;
  // Conventions are scanned off the synced clone (tracks the default branch), not
  // a specific PR, so the deep-link pins to `defaultBranch` rather than a head sha.
  const fileHref =
    repoFullName && defaultBranch
      ? githubBlobUrl(
          repoFullName,
          defaultBranch,
          c.evidence_path,
          c.evidence_line_start ?? undefined,
          c.evidence_line_end ?? undefined,
        )
      : undefined;

  function save() {
    const next = draft.trim();
    if (next && next !== displayRule) onEdit(next);
    setEditing(false);
  }

  return (
    <div style={{ ...cs.card, ...(accepted ? cs.cardAccepted : {}) }}>
      <div style={cs.topRow}>
        <div style={cs.ruleWrap}>
          <div style={cs.category}>
            <Badge color="var(--text-secondary)">{c.category}</Badge>
          </div>
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              style={cs.ruleInput}
              aria-label={t("card.edit")}
            />
          ) : (
            <p style={cs.rule}>{displayRule}</p>
          )}
        </div>
        <div style={cs.actions}>
          {editing ? (
            <>
              <Button kind="primary" size="sm" icon="Check" onClick={save}>
                {t("card.save")}
              </Button>
              <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
                {t("card.cancel")}
              </Button>
            </>
          ) : (
            <>
              <Button
                kind={accepted ? "secondary" : "primary"}
                size="sm"
                icon="Check"
                onClick={onAccept}
                disabled={accepted}
              >
                {accepted ? t("card.accepted") : t("card.accept")}
              </Button>
              <Button kind="ghost" size="sm" icon="Edit" onClick={() => { setDraft(displayRule); setEditing(true); }}>
                {t("card.edit")}
              </Button>
              <Button kind="ghost" size="sm" icon="X" onClick={onReject}>
                {t("card.reject")}
              </Button>
            </>
          )}
        </div>
      </div>

      {fileHref ? (
        <MonoLink href={fileHref}>{range}</MonoLink>
      ) : (
        <div style={cs.evidence}>{range}</div>
      )}
      {fileHref ? (
        <a
          href={fileHref}
          target="_blank"
          rel="noopener noreferrer"
          style={cs.codeLink}
          aria-label={t("card.openOnGithub")}
        >
          <pre style={cs.code}>{c.evidence_snippet}</pre>
        </a>
      ) : (
        <pre style={cs.code}>{c.evidence_snippet}</pre>
      )}

      <div style={cs.confRow}>
        <span style={cs.confLabel}>{t("card.confidence")}</span>
        <div style={cs.confTrack}>
          <div style={confFill(pct, pct >= 80)} />
        </div>
        <span style={cs.confPct}>{pct}%</span>
      </div>
    </div>
  );
}
