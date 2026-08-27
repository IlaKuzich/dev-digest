/* MultiAgentHistoryView — /repos/:repoId/multi-agent/history ("Previous
   Runs", 2026-08-27 follow-on; supersedes the plan's original "no browsable
   history of past runs" non-goal). Repo-wide (requester decision): lists
   every past multi-agent run across ALL of the repo's PRs, newest-first, so
   each row shows which PR it ran against. "View" opens that specific run on
   the results page via `?run=<id>` (MultiAgentResultsView reads it). */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useRepoNotFound } from "@/lib/repo-context";
import { useMultiAgentRunHistory } from "@/lib/hooks/multi-agent-results";
import { formatCost } from "@/components/run-cost-badge/RunCostBadge";
import { ApiError } from "@/lib/api";
import { formatDurationMs } from "./helpers";
import { s } from "./styles";

const STATUS_ICON = {
  running: { icon: "RefreshCw", color: "var(--accent)", spin: true },
  done: { icon: "CheckCircle", color: "var(--ok)", spin: false },
  failed: { icon: "XCircle", color: "var(--crit)", spin: false },
} as const;

export function MultiAgentHistoryView() {
  const t = useTranslations("multiAgent");
  const params = useParams<{ repoId: string }>();
  const router = useRouter();
  const { repoId } = params;
  const repoNotFound = useRepoNotFound(repoId);

  const { data: runs, isLoading, isError, error, refetch } = useMultiAgentRunHistory(repoId);

  const crumb = [{ label: t("configure.breadcrumbFeature") }, { label: t("history.breadcrumbPage") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <Skeleton height={28} width={280} />
          <Skeleton height={16} width={320} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </div>
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("history.errorTitle")}
          body={error instanceof ApiError ? error.message : undefined}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.topRow}>
          <div style={s.titleBlock}>
            <div style={s.pageTitle}>{t("history.heading")}</div>
            <div style={s.pageSubtitle}>{t("history.subheading")}</div>
          </div>
          <Button
            kind="ghost"
            size="sm"
            icon="ChevronLeft"
            onClick={() => router.push(`/repos/${repoId}/multi-agent`)}
          >
            {t("history.back")}
          </Button>
        </div>

        {!runs || runs.length === 0 ? (
          <EmptyState icon="History" title={t("history.emptyTitle")} body={t("history.emptyBody")} />
        ) : (
          <div style={s.list}>
            {runs.map((run) => {
              const st = STATUS_ICON[run.status];
              const I = Icon[st.icon];
              return (
                <div key={run.id} style={s.row}>
                  <I size={20} style={st.spin ? { color: st.color, animation: "ddspin 1s linear infinite" } : { color: st.color }} aria-hidden />
                  <div style={s.rowMain}>
                    <div style={s.rowPr}>
                      <span style={s.rowPrNumber}>#{run.pr_number}</span>
                      {run.pr_title}
                    </div>
                    <div style={s.rowSecondary}>
                      <span>{new Date(run.ran_at).toLocaleString()}</span>
                      <span>·</span>
                      {run.status === "running" ? (
                        <span>{t("results.running")}</span>
                      ) : (
                        <span>
                          {t("history.rowSummary", {
                            count: run.agent_count,
                            duration: formatDurationMs(run.total_duration_ms),
                            cost: formatCost(run.total_cost_usd),
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    kind="secondary"
                    size="sm"
                    onClick={() => router.push(`/repos/${repoId}/multi-agent/${run.pr_number}?run=${run.id}`)}
                  >
                    {t("history.view")}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
