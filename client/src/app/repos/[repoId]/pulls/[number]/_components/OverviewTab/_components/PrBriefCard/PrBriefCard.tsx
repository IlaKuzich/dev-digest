/* PrBriefCard — the Why+Risk Brief: a single top-of-Overview summary stating
   WHAT the PR does, WHY, an overall risk level, a grounded risks list, and a
   "read these first" review-focus list. This is a NEW card that COEXISTS
   with VerdictBanner/IntentCard/BlastCard — it subsumes none of them and
   shows no cost line (that lives on VerdictBanner). See
   docs/plans/2026-07-17-why-risk-brief.md and
   specs/assets/2026-07-17-why-risk-brief/pr-overview-tab.png.

   All data flows through useBrief/useRegenerateBrief — this component never
   calls fetch/api directly. On first open with no cache (`data === null`)
   it auto-generates exactly once (AC-9), guarded by a `fired` ref so re-
   renders never fire a second POST (AC-25). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Badge, Skeleton, ErrorState, Markdown, SEV } from "@devdigest/ui";
import type { Risk, RiskSeverity, ReviewFocus } from "@devdigest/shared";
import { useBrief, useRegenerateBrief } from "@/lib/hooks/brief";
import { RISK_LEVEL_TO_SEV, shouldAutoGenerate, formatFileRef, fileRefLink } from "./helpers";
import { s } from "./styles";

interface PrBriefCardProps {
  prId: string | null;
  repoFullName: string | null;
  headSha: string;
}

function CardShell({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section style={s.card}>
      <SectionLabel icon="FileText" right={right}>
        PR Brief
      </SectionLabel>
      {children}
    </section>
  );
}

function RiskLevelBadge({ level, label, compact }: { level: RiskSeverity; label: string; compact?: boolean }) {
  // Reuses the app's existing severity color tokens (SEV) — color-coded via
  // the SAME palette findings use elsewhere, plus this explicit text `label`
  // (risk-domain wording, e.g. "High risk") so color is never the only
  // signal (AC-16).
  const tone = SEV[RISK_LEVEL_TO_SEV[level]];
  return (
    <Badge color={tone.c} bg={tone.bg} icon={tone.icon} style={compact ? { padding: "2px 8px" } : undefined}>
      {label}
    </Badge>
  );
}

function FileRefLink({
  fileRef,
  line,
  repoFullName,
  headSha,
}: {
  fileRef: string;
  line?: number | null;
  repoFullName: string | null;
  headSha: string;
}) {
  const label = formatFileRef(fileRef, line);
  const href = fileRefLink(fileRef, line, repoFullName, headSha);
  if (!href) {
    return (
      <span className="mono" style={s.fileRefPlain}>
        {label}
      </span>
    );
  }
  return (
    <a className="mono" href={href} target="_blank" rel="noreferrer" style={{ color: "var(--accent-text)" }}>
      {label}
    </a>
  );
}

function RiskRow({
  risk,
  t,
  repoFullName,
  headSha,
}: {
  risk: Risk;
  t: ReturnType<typeof useTranslations>;
  repoFullName: string | null;
  headSha: string;
}) {
  return (
    <li style={s.riskRow}>
      <RiskLevelBadge level={risk.severity} label={t(`riskLevel.${risk.severity}`)} compact />
      <div style={s.riskBody}>
        <div style={s.riskTitle}>{risk.title}</div>
        <p style={s.riskExplanation}>{risk.explanation}</p>
        {risk.file_refs.length > 0 && (
          <div style={s.fileRefRow}>
            {risk.file_refs.map((ref) => (
              <FileRefLink key={ref} fileRef={ref} repoFullName={repoFullName} headSha={headSha} />
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function FocusRow({
  item,
  repoFullName,
  headSha,
}: {
  item: ReviewFocus;
  repoFullName: string | null;
  headSha: string;
}) {
  return (
    <li style={s.focusRow}>
      <FileRefLink fileRef={item.file_ref} line={item.line} repoFullName={repoFullName} headSha={headSha} />
      <span style={s.focusReason}>— {item.reason}</span>
    </li>
  );
}

export function PrBriefCard({ prId, repoFullName, headSha }: PrBriefCardProps) {
  const t = useTranslations("brief");
  const { data, isLoading, isError: queryError, refetch } = useBrief(prId);
  const regenerate = useRegenerateBrief(prId);
  const firedRef = React.useRef(false);

  // Reset the "fired" latch if the PR identity itself changes (navigating
  // from one PR to another re-mounts this component anyway in practice, but
  // guarding here keeps the predicate honest for the prId it currently owns).
  React.useEffect(() => {
    firedRef.current = false;
  }, [prId]);

  React.useEffect(() => {
    if (shouldAutoGenerate(data, regenerate.isPending, regenerate.isError, firedRef.current)) {
      firedRef.current = true;
      regenerate.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, regenerate.isPending, regenerate.isError]);

  if (prId == null) {
    return (
      <CardShell>
        <p style={s.placeholder}>{t("placeholder")}</p>
      </CardShell>
    );
  }

  if (isLoading) {
    return (
      <CardShell>
        <Skeleton height={15} width="60%" />
        <Skeleton height={40} style={{ marginTop: 10 }} />
      </CardShell>
    );
  }

  if (queryError) {
    return (
      <CardShell>
        <ErrorState title={t("error.title")} body={t("error.body")} onRetry={() => refetch()} />
      </CardShell>
    );
  }

  if (data === null) {
    if (regenerate.isError) {
      return (
        <CardShell>
          <ErrorState title={t("error.title")} body={t("error.body")} onRetry={() => regenerate.mutate()} />
        </CardShell>
      );
    }
    return (
      <CardShell>
        <p style={s.placeholder} aria-live="polite">
          {t("generating")}
        </p>
      </CardShell>
    );
  }

  if (!data) return null;

  const { brief, stale } = data;
  const regenButton = (
    <div style={s.headerActions}>
      {stale && (
        <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
          {t("stale.badge")}
        </Badge>
      )}
      <Button
        kind="ghost"
        size="sm"
        icon="RefreshCw"
        loading={regenerate.isPending}
        disabled={regenerate.isPending}
        onClick={() => regenerate.mutate()}
        aria-label={t("regenerate")}
      >
        {t("regenerate")}
      </Button>
    </div>
  );

  return (
    <CardShell right={regenButton}>
      {stale && <p style={s.staleHint}>{t("stale.hint")}</p>}
      {regenerate.isError && (
        <p role="alert" style={s.inlineError}>
          {t("error.body")}
        </p>
      )}

      <div style={s.whatWhy}>
        <Markdown>{brief.what}</Markdown>
        <Markdown>{brief.why}</Markdown>
      </div>

      <div style={s.riskLevelRow}>
        <span style={s.riskLevelLabel}>{t("riskLevel.label")}</span>
        <RiskLevelBadge level={brief.risk_level} label={t(`riskLevel.${brief.risk_level}`)} />
      </div>

      <div style={s.section}>
        <div style={s.sectionLabel}>{t("risks.title")}</div>
        {brief.risks.length === 0 ? (
          <p style={s.emptyNote}>{t("risks.empty")}</p>
        ) : (
          <ul style={s.riskList}>
            {brief.risks.map((risk, i) => (
              <RiskRow key={`${risk.title}-${i}`} risk={risk} t={t} repoFullName={repoFullName} headSha={headSha} />
            ))}
          </ul>
        )}
      </div>

      <div style={s.section}>
        <div style={s.sectionLabel}>{t("reviewFocus.title")}</div>
        {brief.review_focus.length === 0 ? (
          <p style={s.emptyNote}>{t("reviewFocus.empty")}</p>
        ) : (
          <ul style={s.focusList}>
            {brief.review_focus.map((item, i) => (
              <FocusRow key={`${item.file_ref}-${i}`} item={item} repoFullName={repoFullName} headSha={headSha} />
            ))}
          </ul>
        )}
      </div>
    </CardShell>
  );
}
