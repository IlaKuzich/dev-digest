/* EvalsTab — ONE component mounted in both AgentEditor and SkillEditor
   (AC-23). Renders: aggregated metric tiles, case list (name, last-run
   pass/fail, recall%), "New case" button. Agent-only: "View full dashboard"
   link. Skill-only: no trend/history/Compare/Promote/dashboard-link, but
   each case row additionally shows with/without-skill numbers (AC-28). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Button,
  Skeleton,
  EmptyState,
  MetricCard,
  Badge,
  Icon,
} from "@devdigest/ui";
import type { EvalCase, EvalOwnerKind } from "@devdigest/shared";
import {
  useEvalCases,
  useEvalDashboard,
  useDeleteEvalCase,
  useRunEvalCase,
} from "@/lib/hooks/evals";
import { EvalCaseModal } from "@/components/evals/EvalCaseModal/EvalCaseModal";
import { lastRunForCase, parseWithWithout } from "./helpers";

export function EvalsTab({
  ownerKind,
  ownerId,
}: {
  ownerKind: EvalOwnerKind;
  ownerId: string;
}) {
  const t = useTranslations("eval.evalsTab");
  const td = useTranslations("eval.dashboard");

  const { data: cases, isLoading: casesLoading } = useEvalCases(
    ownerKind,
    ownerId,
  );
  const { data: dashboard } = useEvalDashboard(ownerKind, ownerId);
  const deleteCase = useDeleteEvalCase();
  const runCase = useRunEvalCase();

  const [modalState, setModalState] = React.useState<
    { mode: "new" } | { mode: "edit"; evalCase: EvalCase } | null
  >(null);

  const recentRuns = dashboard?.recent_runs ?? [];
  const isSkill = ownerKind === "skill";

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
      {modalState && (
        <EvalCaseModal
          ownerKind={ownerKind}
          ownerId={ownerId}
          initial={modalState.mode === "edit" ? modalState.evalCase : null}
          onClose={() => setModalState(null)}
        />
      )}

      {/* Aggregated metric tiles */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 700 }}>{t("metricsTitle")}</h2>
          {!isSkill && (
            <Link
              href={`/eval/${ownerId}`}
              style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}
            >
              {t("viewDashboard")}
            </Link>
          )}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14 }}>
          {t("metricsSubtitle")}
        </p>
        {dashboard ? (
          <div style={{ display: "flex", gap: 12 }}>
            <MetricCard
              label={td("metrics.recall")}
              value={`${Math.round(dashboard.current.recall * 100)}`}
              suffix="%"
            />
            <MetricCard
              label={td("metrics.precision")}
              value={`${Math.round(dashboard.current.precision * 100)}`}
              suffix="%"
            />
            <MetricCard
              label={td("metrics.citationAccuracy")}
              value={`${Math.round(dashboard.current.citation_accuracy * 100)}`}
              suffix="%"
            />
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12 }}>
            <Skeleton height={90} />
            <Skeleton height={90} />
            <Skeleton height={90} />
          </div>
        )}
      </div>

      {/* Case list */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 700 }}>{t("casesHeading")}</h2>
          <Button
            kind="primary"
            size="sm"
            icon="Plus"
            onClick={() => setModalState({ mode: "new" })}
          >
            {t("newCase")}
          </Button>
        </div>

        {casesLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Skeleton height={56} />
            <Skeleton height={56} />
          </div>
        ) : !cases || cases.length === 0 ? (
          <EmptyState icon="FlaskConical" title={t("emptyCases")} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cases.map((c) => {
              const last = lastRunForCase(recentRuns, c.id);
              const withWithout = isSkill
                ? parseWithWithout(last?.actual_output)
                : null;
              return (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg-elevated)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {last == null ? (
                        t("neverRun")
                      ) : (
                        <>
                          {last.pass ? (
                            <Badge color="var(--ok)" bg="var(--ok-bg)" icon="CheckCircle">
                              {t("passed")}
                            </Badge>
                          ) : (
                            <Badge color="var(--crit)" bg="var(--crit-bg)" icon="XCircle">
                              {t("failed")}
                            </Badge>
                          )}
                          {last.recall != null &&
                            t("recallSuffix", {
                              recall: Math.round(last.recall * 100),
                            })}
                        </>
                      )}
                      {isSkill && withWithout && (withWithout.with || withWithout.without) && (
                        <span style={{ marginLeft: 8 }}>
                          {withWithout.with?.recall != null &&
                            `· ${t("withSkill")} ${Math.round(withWithout.with.recall * 100)}%`}
                          {withWithout.without?.recall != null &&
                            ` / ${t("withoutSkill")} ${Math.round(withWithout.without.recall * 100)}%`}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="Play"
                    loading={runCase.isPending && runCase.variables?.id === c.id}
                    onClick={() =>
                      runCase.mutate({ id: c.id, ownerKind, ownerId })
                    }
                  >
                    {runCase.isPending && runCase.variables?.id === c.id ? t("running") : t("run")}
                  </Button>
                  <Button
                    kind="ghost"
                    size="sm"
                    icon="Edit"
                    onClick={() => setModalState({ mode: "edit", evalCase: c })}
                  >
                    {t("edit")}
                  </Button>
                  <button
                    type="button"
                    aria-label={t("delete")}
                    title={t("delete")}
                    onClick={() =>
                      deleteCase.mutate({ id: c.id, ownerKind, ownerId })
                    }
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-muted)",
                      display: "inline-flex",
                      padding: 4,
                    }}
                  >
                    <Icon.Trash size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
