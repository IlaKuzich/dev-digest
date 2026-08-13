/* PrBriefCard — L07: the PR Brief summary at the top of the Overview tab.
   Three left-to-right regions (spec `2026-08-11-pr-brief-rollup-layout`
   AC-12): (1) the risk-severity indicator, filled/solid (AC-13); (2) the
   risk-level headline (icon+color+label, never color alone) + findings/
   blockers badge + the Brief's what/why summary; (3) the PR-wide metrics
   rollup — score ring, cost, tokens — from the server-computed
   `usePrMetricsRollup` (AC-7: the card never recomputes this client-side).
   Generate/Regenerate both send `{ regenerate: true }` via useGenerateBrief.
   Page-local to the PR Overview tab, mirrors IntentCard. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, EmptyState, ErrorState, Skeleton, CircularScore, Icon } from "@devdigest/ui";
import { useBrief, useGenerateBrief } from "@/lib/hooks/brief";
import { usePrMetricsRollup } from "@/lib/hooks/reviews";
import { formatCost, formatTokenCount } from "@/components/run-cost-badge";
import { ApiError } from "@/lib/api";
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
  const { data: rollup } = usePrMetricsRollup(prId);

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

      <div style={s.body}>
        {/* Region 1 — the risk-severity indicator alone, full card height. */}
        <div style={s.region1}>
          <div style={{ ...s.riskDisc, background: meta.color }}>
            <RiskIcon size={20} color="#fff" />
          </div>
        </div>

        {/* Region 2 — headline + findings/blockers badge, then what/why. */}
        <div style={s.region2}>
          <div style={s.titleRow}>
            <span style={{ ...s.riskLabel, color: meta.color }}>{t(meta.labelKey)}</span>
            {rollup != null && (
              <span style={s.countsBadge}>
                {prReviewT("verdict.findingsCount", { count: rollup.findings_count })}
                {prReviewT("verdict.blockers", { count: rollup.blockers })}
              </span>
            )}
          </div>

          <div style={s.summaryBlock} aria-live="polite">
            <p style={s.summary}>{brief.what}</p>
            <p style={s.summary}>{brief.why}</p>
          </div>
        </div>

        {/* Region 3 — score ring + label, cost, tokens — omitted when the
            rollup set is empty (AC-16); region 2 reflows to fill. */}
        {rollup != null && (
          <div style={s.region3}>
            {rollup.score != null && (
              <>
                <CircularScore score={rollup.score} />
                <span style={s.scoreLabel}>{t("prScore")}</span>
              </>
            )}
            {rollup.cost_usd != null && (
              <div style={s.costLine}>
                <Icon.DollarSign size={12} />
                <span>{formatCost(rollup.cost_usd)}</span>
              </div>
            )}
            <div style={s.tokensLine}>
              <span>
                {formatTokenCount(rollup.tokens_in)}→{formatTokenCount(rollup.tokens_out)}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
