"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Drawer, Icon } from "@devdigest/ui";
import type { CiRun } from "@devdigest/shared";
import { FindingsSeverityBadges } from "@/components/findings-severity-badges";
import { RunCostBadge } from "@/components/run-cost-badge";
import { formatDuration, formatTimestamp, severityCounts, truncate } from "./helpers";
import { s } from "./styles";

const SOURCE_LABEL_KEY: Record<string, string> = {
  gha: "exportWizard.targets.gha",
  circle: "exportWizard.targets.circle",
  jenkins: "exportWizard.targets.jenkins",
  cli: "exportWizard.targets.cli",
};

const STATUS_LABEL_KEY: Record<string, string> = {
  succeeded: "runs.status.succeeded",
  no_findings: "runs.status.noFindings",
  failed: "runs.status.failed",
  running: "runs.status.running",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={s.traceField}>
      <span style={s.traceLabel}>{label}</span>
      <span style={s.traceValue}>{value}</span>
    </div>
  );
}

/**
 * Lightweight per-run trace drawer (AC-25) — ingested data + a link to the
 * GitHub Actions logs only. No prompt assembly, tool calls, or raw model
 * output: this is explicitly NOT a full RunTrace-parity view.
 */
export function TraceDrawer({ run, onClose }: { run: CiRun; onClose: () => void }) {
  const t = useTranslations("ci");
  const bySeverity = severityCounts(run.findings);
  const status = run.status ?? "";
  const statusLabel = STATUS_LABEL_KEY[status] ? t(STATUS_LABEL_KEY[status]!) : status || "—";
  const sourceLabel = run.target_type && SOURCE_LABEL_KEY[run.target_type]
    ? t(SOURCE_LABEL_KEY[run.target_type]!)
    : run.target_type ?? "—";
  const pr = run.pr_number != null ? `#${run.pr_number} ${truncate(run.pr_title, 80)}`.trim() : "—";

  return (
    <Drawer title={t("runs.trace.title")} onClose={onClose} width={480}>
      <div style={s.traceGrid}>
        <Field label={t("runs.trace.agent")} value={run.agent ?? "—"} />
        <Field label={t("runs.trace.pullRequest")} value={pr} />
        <Field label={t("runs.trace.source")} value={sourceLabel} />
        <Field label={t("runs.trace.status")} value={statusLabel} />
        <Field label={t("runs.trace.duration")} value={formatDuration(run.duration_ms)} />
        <Field label={t("runs.trace.cost")} value={<RunCostBadge costUsd={run.cost_usd} />} />
        <Field label={t("runs.trace.findings")} value={<FindingsSeverityBadges bySeverity={bySeverity} />} />
        <Field label={t("runs.trace.timestamp")} value={formatTimestamp(run.ran_at)} />
      </div>
      {run.github_url && (
        <div style={s.traceFooter}>
          <a href={run.github_url} target="_blank" rel="noopener noreferrer" style={s.githubLink}>
            <Icon.ExternalLink size={15} />
            {t("runs.trace.viewOnGithub")}
          </a>
        </div>
      )}
    </Drawer>
  );
}
