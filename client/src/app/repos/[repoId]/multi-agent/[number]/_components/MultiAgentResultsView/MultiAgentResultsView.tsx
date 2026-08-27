/* MultiAgentResultsView — /repos/:repoId/multi-agent/:number (spec
   2026-08-25-multiagent-review). Keyed on the PR NUMBER (AC-29): with no
   `?run=` query param the server resolves the PR's LATEST multi-agent run,
   so the bare URL is stable and reload-safe. An optional `?run=<runId>`
   (2026-08-27 "Previous Runs" follow-on) views one specific historical run
   instead — set by the history page's "View" action. Columns mode
   (AC-13/AC-14/AC-16) and Tabs mode (AC-17/AC-18) render the same
   `MultiAgentRun`; a "View trace" action from either mode opens the existing
   RunTraceDrawer (AC-15/AC-25). */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { usePulls } from "@/lib/hooks";
import { useMultiAgentRun, useRunFindings } from "@/lib/hooks/multi-agent-results";
import { ApiError } from "@/lib/api";
import { formatCost } from "@/components/run-cost-badge/RunCostBadge";
// Reused across routes — see AgentTabs.tsx for the "no lift" note; this task
// does not own the PR page's import sites so the shared component stays put.
import RunTraceDrawer from "../../../../pulls/[number]/_components/RunTraceDrawer";
import { AgentColumnCard } from "./AgentColumnCard";
import { AgentTabs } from "./AgentTabs";
import { DisagreementBlock } from "./DisagreementBlock";
import { VIEW_MODES, type ViewMode } from "./constants";
import { formatDurationMs } from "./helpers";
import { s } from "./styles";

export function MultiAgentResultsView() {
  const t = useTranslations("multiAgent");
  const params = useParams<{ repoId: string; number: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { repoId, number } = params;
  // Optional — set when arriving from the "Previous Runs" list's "View"
  // action (2026-08-27 follow-on); absent for the default latest-per-PR view.
  const runId = search.get("run");
  const repoNotFound = useRepoNotFound(repoId);
  const { activeRepo } = useActiveRepo();

  // The route is keyed by PR number, but the multi-agent API is keyed by the
  // PR's row uuid — resolve number → uuid via the (cached) pulls list, same
  // pattern as PrDetailView.tsx:37 (`prId: string | null`, never narrowed).
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const pr = pulls?.find((p) => p.number === Number(number)) ?? null;
  const prId = pr?.id ?? null;

  const { data: run, isLoading: runLoading, isError, error, refetch } = useMultiAgentRun(prId, runId);
  const findingsByRun = useRunFindings(prId);

  const [mode, setMode] = React.useState<ViewMode>("columns");
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);
  const [trace, setTrace] = React.useState<{ runId: string; agentName: string } | null>(null);

  // In-app deep link into the PR's own Files-changed tab (never GitHub) —
  // reuses the exact `?file=&line=` contract PrDetailView already parses
  // (PrDetailView.tsx's `handleFocusDiffLine`/`fileParam`/`lineParam`), so a
  // finding's file:line here opens the same in-system diff view a click from
  // the PR page itself would (fix: this was previously unwired, rendering an
  // inert link with no href and no onClick at all).
  const handleFileClick = React.useCallback(
    (file: string, line: number) => {
      router.push(
        `/repos/${repoId}/pulls/${number}?file=${encodeURIComponent(file)}&line=${line}`,
      );
    },
    [router, repoId, number],
  );

  const crumb = [
    { label: t("configure.breadcrumbFeature") },
    { label: `#${number}`, mono: true },
  ];

  const isLoading = pullsLoading || (prId != null && runLoading);
  const notFound = isError && error instanceof ApiError && error.status === 404;

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
          <Skeleton height={28} width={420} />
          <Skeleton height={16} width={300} />
          <Skeleton height={220} />
        </div>
      </AppShell>
    );
  }

  if (isError && !notFound) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("results.errorTitle")}
          body={error instanceof ApiError ? error.message : undefined}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  if (!run) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <ErrorState
            title={t("results.noRunTitle")}
            body={t("results.noRunBody")}
            onRetry={() => router.push(`/repos/${repoId}/multi-agent/configure?pr=${number}`)}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.topRow}>
          <div style={s.titleBlock}>
            <div style={s.pageTitle}>{t("configure.breadcrumbFeature")}</div>
            <div style={s.pageSubtitle}>{t("results.subtitle", { count: run.agent_count })}</div>
          </div>
          <div style={s.buttonRow}>
            <Button
              kind="secondary"
              size="sm"
              icon="Settings"
              onClick={() => router.push(`/repos/${repoId}/multi-agent/configure?pr=${number}`)}
            >
              {t("results.configureRun")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="History"
              onClick={() => router.push(`/repos/${repoId}/multi-agent/history`)}
            >
              {t("results.previousRuns")}
            </Button>
          </div>
          <div style={s.toggleGroup} role="group" aria-label={t("results.viewModeLabel")}>
            {VIEW_MODES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                style={s.toggleBtn(mode === m)}
                onClick={() => setMode(m)}
              >
                {t(`results.mode.${m}`)}
              </button>
            ))}
          </div>
        </div>

        <div style={s.headerRow}>
          <div>
            <div style={s.prLine}>
              <span style={s.prNumber}>#{run.pr_number ?? number}</span>
              {pr?.title && <span style={s.prTitle}>{pr.title}</span>}
            </div>
            <div style={s.totalsLine}>
              {t("results.totalsLine", {
                count: run.agent_count,
                duration: formatDurationMs(run.total_duration_ms),
                cost: formatCost(run.total_cost_usd),
              })}
            </div>
          </div>
        </div>

        {mode === "columns" ? (
          <div style={s.columnsGrid}>
            {run.columns.map((c) => (
              <AgentColumnCard
                key={c.agent_id}
                column={c}
                onOpenTrace={(runId, agentName) => setTrace({ runId, agentName })}
                onFileClick={handleFileClick}
              />
            ))}
          </div>
        ) : (
          <AgentTabs
            columns={run.columns}
            findingsByRun={findingsByRun}
            prId={prId ?? ""}
            onOpenTrace={(runId, agentName) => setTrace({ runId, agentName })}
            onFileClick={handleFileClick}
          />
        )}

        <DisagreementBlock
          conflicts={run.conflicts}
          onlyConflicts={onlyConflicts}
          onToggleOnlyConflicts={setOnlyConflicts}
        />
      </div>

      {trace && (
        <RunTraceDrawer
          runId={trace.runId}
          agentName={trace.agentName}
          prNumber={run.pr_number ?? Number(number)}
          findings={findingsByRun[trace.runId] ?? []}
          running={run.columns.find((c) => c.run_id === trace.runId)?.status === "running"}
          onFileClick={handleFileClick}
          onClose={() => setTrace(null)}
        />
      )}
    </AppShell>
  );
}
