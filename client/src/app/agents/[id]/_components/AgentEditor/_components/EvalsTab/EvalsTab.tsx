"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, MetricCard } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import {
  useAgentEvalDashboard,
  useDeleteEvalCase,
  useEvalCases,
  useRunAllEvals,
  useRunEvalCase,
  type EvalCaseWithLastRun,
} from "@/lib/hooks/eval-cases";
import { CaseEditorModal } from "./CaseEditorModal";
import { CaseRow } from "./CaseRow";
import { casesPassing } from "./helpers";
import { s } from "./styles";

type EditorState = "new" | EvalCaseWithLastRun | null;

/**
 * Agent editor "Evals" tab (Surface B, AC-8/9/10/11/12/30): metric tiles fed
 * by the agent's eval dashboard, a "P / T passing" pill, "Run all evals" /
 * "New eval case", and the per-case rows + editor modal.
 */
export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval");
  const { data: dashboard } = useAgentEvalDashboard(agent.id);
  const { data: cases } = useEvalCases(agent.id);
  const runAll = useRunAllEvals(agent.id);
  const runCase = useRunEvalCase();
  const deleteCase = useDeleteEvalCase();
  const [runningId, setRunningId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<EditorState>(null);

  const { passed, total } = casesPassing(cases ?? []);
  const current = dashboard?.current;

  const runOne = (caseId: string) => {
    setRunningId(caseId);
    runCase.mutate(caseId, { onSettled: () => setRunningId(null) });
  };

  return (
    <div style={s.wrap}>
      <div style={s.metricsHeader}>
        <span style={s.sectionLabel}>{t("evalsTab.metricsTitle")}</span>
        <a href={`/eval/${agent.id}`} style={s.dashboardLink}>
          {t("evalsTab.viewFullDashboard")}
        </a>
      </div>
      <div style={s.tiles}>
        <MetricCard
          label={t("dashboard.metrics.recall")}
          value={`${Math.round((current?.recall ?? 0) * 100)}%`}
          delta={dashboard?.delta.recall}
        />
        <MetricCard
          label={t("dashboard.metrics.precision")}
          value={`${Math.round((current?.precision ?? 0) * 100)}%`}
          delta={dashboard?.delta.precision}
        />
        <MetricCard
          label={t("dashboard.metrics.citationAccuracy")}
          value={`${Math.round((current?.citation_accuracy ?? 0) * 100)}%`}
          delta={dashboard?.delta.citation_accuracy}
        />
        <div style={s.tile}>
          <div style={s.tileLabel}>{t("evalsTab.tracesPassed")}</div>
          <div style={s.tileValue}>
            {current ? `${current.traces_passed}/${current.traces_total}` : "—"}
          </div>
        </div>
      </div>

      <div style={s.casesHeader}>
        <h3 style={s.h3}>{t("evalsTab.casesHeading")}</h3>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--ok)",
            background: "var(--bg-hover)",
            padding: "2px 10px",
            borderRadius: 5,
          }}
        >
          {t("evalsTab.passingPill", { passing: passed, total })}
        </span>
        <div style={s.headerActions}>
          <Button kind="secondary" icon="Play" onClick={() => runAll.mutate()} disabled={runAll.isPending}>
            {runAll.isPending ? t("evalsTab.running") : t("evalsTab.runAllEvals")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={() => setEditing("new")}>
            {t("caseEditor.newCase")}
          </Button>
        </div>
      </div>

      {cases && cases.length === 0 ? (
        <div style={s.empty}>{t("evalsTab.emptyCases")}</div>
      ) : (
        <div style={s.list}>
          {(cases ?? []).map((c) => (
            <CaseRow
              key={c.id}
              evalCase={c}
              running={runningId === c.id}
              onRun={() => runOne(c.id)}
              onEdit={() => setEditing(c)}
              onDelete={() => deleteCase.mutate(c.id)}
            />
          ))}
        </div>
      )}

      {editing && (
        <CaseEditorModal
          agent={agent}
          evalCase={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
