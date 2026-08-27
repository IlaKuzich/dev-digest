"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SelectInput } from "@devdigest/ui";
import type { CiRunsFilters } from "./helpers";
import { s } from "./styles";

const STATUS_OPTIONS = ["succeeded", "no_findings", "failed", "running"] as const;
const SOURCE_OPTIONS = ["gha", "circle", "jenkins", "cli"] as const;

const STATUS_LABEL_KEY: Record<(typeof STATUS_OPTIONS)[number], string> = {
  succeeded: "runs.status.succeeded",
  no_findings: "runs.status.noFindings",
  failed: "runs.status.failed",
  running: "runs.status.running",
};

const SOURCE_LABEL_KEY: Record<(typeof SOURCE_OPTIONS)[number], string> = {
  gha: "exportWizard.targets.gha",
  circle: "exportWizard.targets.circle",
  jenkins: "exportWizard.targets.jenkins",
  cli: "exportWizard.targets.cli",
};

export interface FiltersBarProps {
  filters: CiRunsFilters;
  onChange: (filters: CiRunsFilters) => void;
  /** Distinct values seen across all CI runs (server has no separate list endpoint). */
  agents: string[];
  repos: string[];
}

/** AC-21 — 5 filter controls whose active values flow into `CiRunsQuery`. */
export function FiltersBar({ filters, onChange, agents, repos }: FiltersBarProps) {
  const t = useTranslations("ci");

  return (
    <div style={s.filters}>
      {/* ci.json only ships a "Last 7 days" preset (`runs.filters.last7Days`) —
          this is a fixed 7-day window in v1, matching the mockup's one shown state. */}
      <SelectInput
        value={filters.range}
        onChange={(v) => onChange({ ...filters, range: v as CiRunsFilters["range"] })}
        options={[{ value: "7d", label: t("runs.filters.last7Days") }]}
        mono={false}
      />
      <SelectInput
        value={filters.agent}
        onChange={(v) => onChange({ ...filters, agent: v })}
        options={[{ value: "", label: t("runs.filters.allAgents") }, ...agents.map((a) => ({ value: a, label: a }))]}
        mono={false}
      />
      <SelectInput
        value={filters.repo}
        onChange={(v) => onChange({ ...filters, repo: v })}
        options={[{ value: "", label: t("runs.filters.allRepos") }, ...repos.map((r) => ({ value: r, label: r }))]}
        mono={false}
      />
      <SelectInput
        value={filters.status}
        onChange={(v) => onChange({ ...filters, status: v })}
        options={[
          { value: "", label: t("runs.filters.allStatuses") },
          ...STATUS_OPTIONS.map((v) => ({ value: v, label: t(STATUS_LABEL_KEY[v]) })),
        ]}
        mono={false}
      />
      <SelectInput
        value={filters.source}
        onChange={(v) => onChange({ ...filters, source: v })}
        options={[
          { value: "", label: t("runs.filters.allSources") },
          ...SOURCE_OPTIONS.map((v) => ({ value: v, label: t(SOURCE_LABEL_KEY[v]) })),
        ]}
        mono={false}
      />
    </div>
  );
}
