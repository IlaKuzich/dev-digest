/* DashboardHome — the standalone cross-agent Eval Dashboard (Surface C,
   AC-18/19/20/21). Metric numbers are ALWAYS paired with a label/percentage —
   never color alone (spec Accessibility). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton, Sparkline, SectionLabel, Badge } from "@devdigest/ui";
import type { AgentEvalSummary } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useEvalDashboardHome, useRunAllAgents } from "@/lib/hooks/eval";
import { RecentRunsTable } from "../RecentRunsTable";
import { formatAgentRowSubtitle } from "./helpers";
import { s } from "./styles";

const METRIC_COLOR = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation: "var(--warn)",
} as const;

function AgentRow({
  agent,
  neverRunLabel,
  onOpen,
}: {
  agent: AgentEvalSummary;
  neverRunLabel: string;
  onOpen: () => void;
}) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${agent.agent_name}`}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      style={s.row}
    >
      <div style={s.iconBox}>
        <Icon.Cpu size={16} />
      </div>
      <div style={s.rowText}>
        <div style={s.rowNameLine}>
          <span style={s.rowName}>{agent.agent_name}</span>
          <Badge color="var(--text-secondary)" mono>
            {agent.model}
          </Badge>
        </div>
        <div style={s.rowSubtitle}>{formatAgentRowSubtitle(agent, neverRunLabel)}</div>
      </div>
      <Sparkline data={agent.sparkline} color={METRIC_COLOR.recall} w={80} h={24} />
      <span style={{ ...s.metricValue, color: METRIC_COLOR.recall }} aria-label={`Recall ${agent.recall != null ? Math.round(agent.recall * 100) : 0}%`}>
        {agent.recall != null ? `${Math.round(agent.recall * 100)}%` : "—"}
      </span>
      <span style={{ ...s.metricValue, color: METRIC_COLOR.precision }} aria-label={`Precision ${agent.precision != null ? Math.round(agent.precision * 100) : 0}%`}>
        {agent.precision != null ? `${Math.round(agent.precision * 100)}%` : "—"}
      </span>
      <span style={{ ...s.metricValue, color: METRIC_COLOR.citation }} aria-label={`Citation ${agent.citation_accuracy != null ? Math.round(agent.citation_accuracy * 100) : 0}%`}>
        {agent.citation_accuracy != null ? `${Math.round(agent.citation_accuracy * 100)}%` : "—"}
      </span>
      <Icon.ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
    </div>
  );
}

export function DashboardHome() {
  const t = useTranslations("eval");
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useEvalDashboardHome();
  const runAll = useRunAllAgents();

  const crumb = [{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }];

  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen title="Couldn't load the eval dashboard" onRetry={() => refetch()} />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("dashboard.title")}</h1>
            <p style={s.subtitle}>{t("dashboard.subtitle")}</p>
          </div>
          <Button kind="primary" icon="Play" loading={runAll.isPending} onClick={() => runAll.mutate()}>
            {t("dashboard.runAllAgents")}
          </Button>
        </div>

        <SectionLabel icon="Cpu">{t("dashboard.agentsHeading")}</SectionLabel>
        {isLoading && (
          <div style={s.list}>
            <Skeleton height={72} />
            <Skeleton height={72} />
            <Skeleton height={72} />
          </div>
        )}
        {!isLoading && data && data.agents.length === 0 && (
          <EmptyState
            icon="Gauge"
            title="No reviewer agents yet"
            body="Create a reviewer agent to start tracking its eval metrics here."
          />
        )}
        {!isLoading && data && data.agents.length > 0 && (
          <div style={s.list}>
            <div style={s.columnHeader}>
              <div style={{ width: 34 }} />
              <div style={{ flex: 1 }} />
              <div style={{ width: 80 }} />
              <span style={s.columnHeaderLabel}>{t("dashboard.metrics.recall")}</span>
              <span style={s.columnHeaderLabel}>{t("dashboard.metrics.precisionShort")}</span>
              <span style={s.columnHeaderLabel}>{t("dashboard.metrics.citationShort")}</span>
              <div style={{ width: 16 }} />
            </div>
            {data.agents.map((agent) => (
              <AgentRow
                key={agent.agent_id}
                agent={agent}
                neverRunLabel={t("evalsTab.neverRun")}
                onOpen={() => router.push(`/eval/${agent.agent_id}`)}
              />
            ))}
          </div>
        )}

        <div style={s.section}>
          <SectionLabel icon="History">{t("dashboard.recentAllAgents")}</SectionLabel>
          <RecentRunsTable
            runs={data?.recent_runs ?? []}
            showAgentColumn
            emptyMessage={t("dashboard.noRuns")}
            labels={{
              agent: t("dashboard.table.agent"),
              version: t("dashboard.table.version"),
              ranAt: t("dashboard.table.ranAt"),
              recall: t("dashboard.table.recall"),
              precision: t("dashboard.table.precision"),
              citation: t("dashboard.table.citation"),
              pass: t("dashboard.table.pass"),
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
