/* MetricTrendChart — the multi-series "Metric trend" chart (AC-23), built on
   the vendored Recharts-backed LineChart. Recall/precision/citation colors
   match the rest of the surface (blue/green/orange). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { LineChart, SectionLabel } from "@devdigest/ui";
import type { EvalTrendPoint } from "@devdigest/shared";
import { s } from "./styles";

const METRIC_COLOR = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation: "var(--warn)",
} as const;

export function MetricTrendChart({ trend }: { trend: EvalTrendPoint[] }) {
  const t = useTranslations("eval");

  return (
    <div style={s.card}>
      <SectionLabel icon="TrendingUp">{t("dashboard.metricTrend")}</SectionLabel>
      <div style={s.legend}>
        <span style={s.legendItem}>
          <span style={{ ...s.dot, background: METRIC_COLOR.recall }} />
          {t("dashboard.legend.recall")}
        </span>
        <span style={s.legendItem}>
          <span style={{ ...s.dot, background: METRIC_COLOR.precision }} />
          {t("dashboard.legend.precision")}
        </span>
        <span style={s.legendItem}>
          <span style={{ ...s.dot, background: METRIC_COLOR.citation }} />
          {t("dashboard.legend.citation")}
        </span>
      </div>
      {trend.length === 0 ? (
        <div style={s.empty}>{t("dashboard.noRuns")}</div>
      ) : (
        <LineChart
          series={[
            { name: "recall", color: METRIC_COLOR.recall, data: trend.map((p) => p.recall) },
            { name: "precision", color: METRIC_COLOR.precision, data: trend.map((p) => p.precision) },
            { name: "citation", color: METRIC_COLOR.citation, data: trend.map((p) => p.citation_accuracy) },
          ]}
        />
      )}
    </div>
  );
}
