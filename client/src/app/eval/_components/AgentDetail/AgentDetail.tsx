/* AgentDetail — per-agent Eval detail (Surface D): metric trend, degradation
   banner, run selection → Compare, Promote (AC-23..AC-30). */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, MetricCard, SectionLabel, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgentEvalDashboard, useRunAgentEval } from "@/lib/hooks/eval";
import { WarningBanner } from "../WarningBanner";
import { MetricTrendChart } from "../MetricTrendChart";
import { RecentRunsTable } from "../RecentRunsTable";
import { CompareModal } from "../CompareModal";
import { orderForCompare } from "./helpers";
import { s } from "./styles";

const METRIC_COLOR = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation: "var(--warn)",
} as const;

export function AgentDetail() {
  const t = useTranslations("eval");
  const router = useRouter();
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;

  const { data, isLoading, isError, refetch } = useAgentEvalDashboard(agentId);
  const runEval = useRunAgentEval(agentId);

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = React.useState(false);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvalDashboard"), href: "/eval" },
    { label: data?.agent_name ?? "" },
  ];

  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title="Couldn't load this agent's eval dashboard"
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  if (isLoading || !data) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <Skeleton height={24} width={240} />
          <Skeleton height={90} />
          <Skeleton height={220} />
        </div>
      </AppShell>
    );
  }

  const pair = compareOpen ? orderForCompare(data.recent_runs, Array.from(selected)) : null;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.backLink}>
          <Button kind="tertiary" size="sm" icon="ChevronLeft" onClick={() => router.push("/eval")}>
            All agents
          </Button>
        </div>

        <div style={s.header}>
          <div style={{ flex: 1 }}>
            <div style={s.titleRow}>
              <Icon.Cpu size={18} style={{ color: "var(--accent)" }} />
              <h1 style={s.h1}>{data.agent_name}</h1>
              <Badge color="var(--text-secondary)" mono>
                {data.model}
              </Badge>
            </div>
            <p style={s.subtitle}>
              Regression harness · {data.recent_runs.length} runs on the {data.current.traces_total}-trace gold set
            </p>
          </div>
          <Button kind="primary" icon="Play" loading={runEval.isPending} onClick={() => runEval.mutate()}>
            {t("dashboard.runEval", { count: data.current.traces_total })}
          </Button>
        </div>

        <WarningBanner message={data.alert} />

        <div style={s.metrics}>
          <MetricCard
            label={t("dashboard.metrics.recall")}
            value={Math.round(data.current.recall * 100)}
            suffix="%"
            delta={data.delta.recall}
            color={METRIC_COLOR.recall}
            trend={data.trend.map((p) => p.recall)}
          />
          <MetricCard
            label={t("dashboard.metrics.precision")}
            value={Math.round(data.current.precision * 100)}
            suffix="%"
            delta={data.delta.precision}
            color={METRIC_COLOR.precision}
            trend={data.trend.map((p) => p.precision)}
          />
          <MetricCard
            label={t("dashboard.metrics.citationAccuracy")}
            value={Math.round(data.current.citation_accuracy * 100)}
            suffix="%"
            delta={data.delta.citation_accuracy}
            color={METRIC_COLOR.citation}
            trend={data.trend.map((p) => p.citation_accuracy)}
          />
        </div>

        <MetricTrendChart trend={data.trend} />

        <div style={s.section}>
          <SectionLabel
            icon="History"
            right={
              <Button kind="primary" size="sm" icon="BarChart" disabled={selected.size !== 2} onClick={() => setCompareOpen(true)}>
                {t("compare.compareButton")}
              </Button>
            }
          >
            {t("dashboard.recentRuns")}
            {selected.size > 0 ? ` · ${t("compare.selectedCount", { count: selected.size })}` : ""}
          </SectionLabel>
          <RecentRunsTable
            runs={data.recent_runs}
            selectable
            showCost
            selectedIds={selected}
            onToggleSelect={toggleSelect}
            emptyMessage={t("dashboard.noRuns")}
            labels={{
              version: t("dashboard.table.version"),
              ranAt: t("dashboard.table.ranAt"),
              recall: t("dashboard.table.recall"),
              precision: t("dashboard.table.precision"),
              citation: t("dashboard.table.citation"),
              pass: t("dashboard.table.pass"),
              cost: t("dashboard.table.cost"),
            }}
          />
        </div>
      </div>

      {compareOpen && pair && (
        <CompareModal agentId={agentId} batchA={pair[0]} batchB={pair[1]} onClose={() => setCompareOpen(false)} />
      )}
    </AppShell>
  );
}
