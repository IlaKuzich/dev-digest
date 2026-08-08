/* PrBriefCard — L07: the PR Brief summary at the top of the Overview tab.
   Risk-level headline (icon+color+label, never color alone), findings/
   blockers + score + cost/tokens from the latest COMPLETED review run
   (usePrRuns — not the Brief endpoint), and the Brief's own what/why
   summary. Generate/Regenerate both send `{ regenerate: true }` via
   useGenerateBrief. Page-local to the PR Overview tab, mirrors IntentCard. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, EmptyState, ErrorState, Skeleton, CircularScore, Icon } from "@devdigest/ui";
import { useBrief, useGenerateBrief } from "@/lib/hooks/brief";
import { usePrRuns } from "@/lib/hooks/reviews";
import { formatCost, formatTokenCount } from "@/components/run-cost-badge";
import { ApiError } from "@/lib/api";
import { latestDoneMetrics } from "./helpers";
import { RISK_META } from "./constants";
import { s } from "./styles";

interface PrBriefCardProps {
  prId: string | null;
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <section style={s.card}>
      <SectionLabel icon="FileText">PR Brief</SectionLabel>
      {children}
    </section>
  );
}

export function PrBriefCard({ prId }: PrBriefCardProps) {
  const t = useTranslations("brief");
  const prReviewT = useTranslations("prReview");
  const { data: brief, isLoading, isError, error } = useBrief(prId);
  const gen = useGenerateBrief(prId);
  const { data: runs } = usePrRuns(prId);
  const metrics = latestDoneMetrics(runs);

  if (isLoading) {
    return (
      <CardShell>
        <Skeleton height={40} />
        <Skeleton height={15} width="80%" />
        <Skeleton height={15} width="55%" style={{ marginTop: 6 }} />
      </CardShell>
    );
  }

  if (isError) {
    return (
      <CardShell>
        <ErrorState
          title={t("error.title")}
          body={error instanceof ApiError ? error.message : undefined}
        />
        <div style={s.errorActions}>
          <Button
            kind="secondary"
            icon="RefreshCw"
            loading={gen.isPending}
            onClick={() => gen.mutate()}
            aria-label={t("error.retry")}
          >
            {t("error.retry")}
          </Button>
        </div>
      </CardShell>
    );
  }

  if (brief == null) {
    return (
      <CardShell>
        <EmptyState
          icon="FileText"
          title={t("empty.title")}
          body={t("empty.body")}
          cta={t("generate")}
          onCta={() => gen.mutate()}
          ctaLoading={gen.isPending}
        />
      </CardShell>
    );
  }

  const meta = RISK_META[brief.risk_level];
  const RiskIcon = Icon[meta.icon];

  return (
    <section style={s.card}>
      <SectionLabel
        icon="FileText"
        right={
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            loading={gen.isPending}
            onClick={() => gen.mutate()}
            aria-label={t("regenerate")}
          >
            {t("regenerate")}
          </Button>
        }
      >
        PR Brief
      </SectionLabel>

      <div style={s.headlineRow}>
        <div style={s.headlineLeft}>
          <RiskIcon size={20} style={{ color: meta.color }} />
          <span style={{ ...s.riskLabel, color: meta.color }}>{t(meta.labelKey)}</span>
          {metrics && (
            <span style={s.countsBadge}>
              {prReviewT("verdict.findingsCount", { count: metrics.findingsCount })}
              {prReviewT("verdict.blockers", { count: metrics.blockers })}
            </span>
          )}
        </div>

        {metrics && (
          <div style={s.scoreBlock}>
            <CircularScore score={metrics.score} />
            <span style={s.scoreLabel}>{t("prScore")}</span>
          </div>
        )}
      </div>

      <div style={s.summaryBlock} aria-live="polite">
        <p style={s.summary}>{brief.what}</p>
        <p style={s.summary}>{brief.why}</p>
      </div>

      {metrics && (
        <div style={s.costLine}>
          <Icon.DollarSign size={12} />
          <span>{formatCost(metrics.costUsd)}</span>
          <span>
            {formatTokenCount(metrics.tokensIn)}→{formatTokenCount(metrics.tokensOut)}
          </span>
        </div>
      )}
    </section>
  );
}
