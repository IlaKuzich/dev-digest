/* CiRunsView — CI Runs page (Section D). Only CI-executed runs are ever shown
   here (`GET /ci-runs` already scopes to `source='ci'`, AC-45); ingest itself
   (`POST /ci-runs/refresh`) is pull-based on mount + manual Refresh, never a
   recurring interval (AC-27). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { CiRun } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { relativeTimeFrom } from "@/lib/format-relative-time";
import { useCiRuns, useRefreshCiRuns } from "@/lib/hooks/ci";
import { FiltersBar } from "./FiltersBar";
import { RunRow } from "./RunRow";
import { TraceDrawer } from "./TraceDrawer";
import { DEFAULT_FILTERS, distinctValues, toCiRunsQuery, type CiRunsFilters } from "./helpers";
import { s } from "./styles";

export function CiRunsView() {
  const t = useTranslations("ci");
  const router = useRouter();

  const [filters, setFilters] = React.useState<CiRunsFilters>(DEFAULT_FILTERS);
  const query = React.useMemo(() => toCiRunsQuery(filters), [filters]);

  // Unfiltered fetch powers the agent/repo dropdown option lists — there is no
  // separate "list agents"/"list repos for CI" endpoint, and a CI installation's
  // repo need not be one of the studio's own tracked repos.
  const allRuns = useCiRuns({});
  const { data, isLoading, isError, refetch } = useCiRuns(query);
  const refresh = useRefreshCiRuns();

  const [traceRun, setTraceRun] = React.useState<CiRun | null>(null);
  const [syncedAt, setSyncedAt] = React.useState<string | null>(null);

  // AC-27 — ONE ingest request on mount, none thereafter (no interval/poller).
  const didAutoSync = React.useRef(false);
  React.useEffect(() => {
    if (didAutoSync.current) return;
    didAutoSync.current = true;
    refresh.mutate(undefined, { onSuccess: (res) => setSyncedAt(res.synced_at) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRefresh() {
    refresh.mutate(undefined, { onSuccess: (res) => setSyncedAt(res.synced_at) });
  }

  const runs = data?.runs ?? [];
  const allRunsList = allRuns.data?.runs ?? [];
  const agentOptions = distinctValues(allRunsList, (r) => r.agent);
  const repoOptions = distinctValues(allRunsList, (r) => r.repo);

  const syncedLabel = syncedAt ? relativeTimeFrom(syncedAt) : null;

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div>
            <h1 style={s.h1}>{t("runs.title")}</h1>
            <p style={s.subtitle}>{t("runs.subtitle")}</p>
          </div>
          <div style={s.headerRight}>
            <span style={s.syncIndicator}>
              <span style={s.syncDot} />
              {syncedLabel ? `synced ${syncedLabel}` : t("runs.autoRefresh")}
            </span>
            <Button kind="secondary" icon="RefreshCw" onClick={handleRefresh} loading={refresh.isPending}>
              {refresh.isPending ? t("runs.refreshing") : t("runs.refresh")}
            </Button>
          </div>
        </div>

        <FiltersBar filters={filters} onChange={setFilters} agents={agentOptions} repos={repoOptions} />

        {isLoading && (
          <div style={s.list}>
            <Skeleton height={40} />
            <Skeleton height={40} />
            <Skeleton height={40} />
          </div>
        )}

        {isError && <ErrorState onRetry={() => refetch()} />}

        {!isLoading && !isError && runs.length === 0 && (
          <EmptyState
            icon="Workflow"
            title={t("runs.emptyTitle")}
            body={t("runs.emptyBody")}
            // AC-26's exact CTA copy ("+ Set up CI for an agent") has no key in
            // ci.json (owned/read-only for this task, per Owns) — `EmptyState`
            // already renders the "+" via its own Plus icon, so only the label
            // text is hardcoded here.
            cta="Set up CI for an agent"
            onCta={() => router.push("/agents")}
          />
        )}

        {!isLoading && !isError && runs.length > 0 && (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>{t("runs.table.timestamp")}</th>
                  <th style={s.th}>{t("runs.table.pullRequest")}</th>
                  <th style={s.th}>{t("runs.table.agent")}</th>
                  <th style={s.th}>{t("runs.table.source")}</th>
                  <th style={s.th}>{t("runs.table.duration")}</th>
                  <th style={s.th}>{t("runs.table.findings")}</th>
                  <th style={s.th}>{t("runs.table.cost")}</th>
                  <th style={s.th}>{t("runs.table.status")}</th>
                  <th style={s.th}>{t("runs.table.trace")}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <RunRow key={run.id} run={run} onTrace={setTraceRun} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {traceRun && <TraceDrawer run={traceRun} onClose={() => setTraceRun(null)} />}
    </AppShell>
  );
}
