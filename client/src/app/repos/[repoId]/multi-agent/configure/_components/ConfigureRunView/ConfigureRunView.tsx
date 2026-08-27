/* ConfigureRunView — /repos/:repoId/multi-agent/configure (spec
   2026-08-25-multiagent-review). Step 1 picks a pull request; step 2 shows a
   "pick a pull request first" empty state until one is chosen (AC-2), then
   one AgentSelectCard per workspace agent with an aggregate estimate and the
   "Run multi-agent review (N)" trigger (AC-3/AC-5/AC-6/AC-7/AC-8/AC-9). The
   PR can arrive preselected via `?pr=<number>` from the PR-page picker's
   "Configure agents…" link (AC-31). */
"use client";

import React from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { Button, EmptyState, SearchableSelect } from "@devdigest/ui";
import { formatCost } from "@/components/run-cost-badge/RunCostBadge";
import { usePulls } from "@/lib/hooks";
import { useAgents } from "@/lib/hooks/agents";
import { useAgentEstimates, useTriggerMultiAgentRun } from "@/lib/hooks/multi-agent";
import { AgentSelectCard } from "./AgentSelectCard";
import { aggregateEstimates, estimateFor, formatTimeMs } from "./helpers";
import { PR_SELECT_WIDTH } from "./constants";

export function ConfigureRunView() {
  const t = useTranslations("multiAgent");
  const params = useParams<{ repoId: string }>();
  const search = useSearchParams();
  const { repoId } = params;

  const { data: pulls } = usePulls(repoId);

  // Preselect from `?pr=` once at mount (AC-31) — the user can still change it.
  const [selectedPrNumber, setSelectedPrNumber] = React.useState<number | null>(() => {
    const raw = search.get("pr");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  });

  const selectedPr = pulls?.find((p) => p.number === selectedPrNumber) ?? null;
  const prId = selectedPr?.id ?? null;

  const { data: agents } = useAgents();
  const { data: estimates } = useAgentEstimates(prId);
  const trigger = useTriggerMultiAgentRun();
  const all = agents ?? [];

  // Selection resets (and defaults to "all") each time the chosen PR changes,
  // matching the picker's default-select-all behavior.
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const initializedForPrId = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!prId) {
      initializedForPrId.current = null;
      return;
    }
    if (initializedForPrId.current !== prId && all.length > 0) {
      initializedForPrId.current = prId;
      setSelectedIds(new Set(all.map((a) => a.id)));
    }
  }, [prId, all]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(all.map((a) => a.id)));

  const count = selectedIds.size;
  const aggregate = aggregateEstimates(estimates, selectedIds);

  const run = () => {
    if (!prId || !selectedPr || count === 0) return;
    trigger.mutate({
      prId,
      repoId,
      prNumber: selectedPr.number,
      agentIds: Array.from(selectedIds),
    });
  };

  const prOptions = (pulls ?? []).map((p) => ({
    value: String(p.number),
    label: `#${p.number} · ${p.title}`,
  }));

  return (
    <AppShell
      crumb={[
        // No index route owned by this task (T4 owns the per-PR results page
        // only) — leave the feature crumb unlinked rather than dead-end.
        { label: t("configure.breadcrumbFeature") },
        { label: t("configure.breadcrumbPage") },
      ]}
    >
      <div style={{ padding: "28px 32px 44px", maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            {t("configure.heading")}
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.5 }}>
            {t("configure.subheading")}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            {t("configure.step1Label")}
          </div>
          <div style={{ maxWidth: PR_SELECT_WIDTH }}>
            <SearchableSelect
              value={selectedPrNumber != null ? String(selectedPrNumber) : ""}
              onChange={(v) => setSelectedPrNumber(v ? Number(v) : null)}
              options={prOptions}
              placeholder={t("configure.step1Placeholder")}
              mono={false}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: prId ? "var(--text-primary)" : "var(--text-muted)" }}>
              {t("configure.step2Label")}
            </div>
            {prId && all.length > 0 && (
              <button
                type="button"
                onClick={selectAll}
                style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: 13, cursor: "pointer" }}
              >
                {t("configure.selectAll")}
              </button>
            )}
          </div>

          {!prId && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 8 }}>
              <EmptyState icon="Users" title={t("configure.emptyTitle")} body={t("configure.emptyBody")} />
            </div>
          )}

          {prId && all.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("configure.noAgents")}</div>
          )}

          {prId &&
            all.map((a) => (
              <AgentSelectCard
                key={a.id}
                agent={a}
                estimate={estimateFor(estimates, a.id)}
                selected={selectedIds.has(a.id)}
                onToggle={() => toggle(a.id)}
                noHistoryLabel={t("configure.noHistory")}
                noSummaryLabel={t("configure.noSummary")}
              />
            ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Button
            kind="primary"
            icon="Users"
            disabled={count === 0}
            loading={trigger.isPending}
            onClick={run}
          >
            {t("configure.runReviewCount", { count })}
          </Button>
          {count > 0 && (
            <span className="mono tnum" style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {t("configure.aggregate", { time: formatTimeMs(aggregate.timeMs), cost: formatCost(aggregate.costUsd) })}
            </span>
          )}
        </div>
      </div>
    </AppShell>
  );
}
