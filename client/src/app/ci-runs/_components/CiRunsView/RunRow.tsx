"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { CiRun } from "@devdigest/shared";
import { FindingsTooltip } from "@/components/findings-severity-badges";
import { RunCostBadge } from "@/components/run-cost-badge";
import { githubPrUrl } from "@/lib/github-urls";
import { formatDuration, formatTimestamp, severityCounts, toTopFindings, truncate } from "./helpers";
import { s } from "./styles";

const STATUS_TONE: Record<string, { color: string; bg: string }> = {
  succeeded: { color: "var(--ok)", bg: "var(--ok-bg)" },
  no_findings: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
  failed: { color: "var(--crit)", bg: "var(--crit-bg)" },
  running: { color: "var(--accent)", bg: "var(--bg-hover)" },
};

const STATUS_LABEL_KEY: Record<string, string> = {
  succeeded: "runs.status.succeeded",
  no_findings: "runs.status.noFindings",
  failed: "runs.status.failed",
  running: "runs.status.running",
};

const SOURCE_LABEL_KEY: Record<string, string> = {
  gha: "exportWizard.targets.gha",
  circle: "exportWizard.targets.circle",
  jenkins: "exportWizard.targets.jenkins",
  cli: "exportWizard.targets.cli",
};

export function RunRow({ run, onTrace }: { run: CiRun; onTrace: (run: CiRun) => void }) {
  const t = useTranslations("ci");
  const findings = toTopFindings(run.findings);
  const bySeverity = severityCounts(run.findings);
  const status = run.status ?? "";
  const statusTone = STATUS_TONE[status] ?? STATUS_TONE.no_findings!;
  const statusLabel = STATUS_LABEL_KEY[status] ? t(STATUS_LABEL_KEY[status]!) : status || "—";
  const sourceLabel = run.target_type && SOURCE_LABEL_KEY[run.target_type]
    ? t(SOURCE_LABEL_KEY[run.target_type]!)
    : run.target_type ?? "—";

  return (
    <tr>
      <td style={s.td}>{formatTimestamp(run.ran_at)}</td>
      <td style={s.td}>
        {run.pr_number != null && (
          <div>
            {run.repo ? (
              <a
                className="mono"
                href={githubPrUrl(run.repo, run.pr_number)}
                target="_blank"
                rel="noopener noreferrer"
                style={s.prNumber}
              >
                #{run.pr_number}
              </a>
            ) : (
              <span className="mono" style={s.prNumber}>
                #{run.pr_number}
              </span>
            )}
            {run.pr_title && <div style={s.prTitle}>{truncate(run.pr_title, 60)}</div>}
          </div>
        )}
        {run.pr_number == null && "—"}
      </td>
      <td style={s.td}>{run.agent ?? "—"}</td>
      <td style={s.td}>
        <Badge>{sourceLabel}</Badge>
      </td>
      <td style={{ ...s.td, ...s.tnum }}>{formatDuration(run.duration_ms)}</td>
      <td style={s.td}>
        <FindingsTooltip bySeverity={bySeverity} findings={findings} />
      </td>
      <td style={{ ...s.td, ...s.tnum }}>
        <RunCostBadge costUsd={run.cost_usd} />
      </td>
      <td style={s.td}>
        <Badge color={statusTone.color} bg={statusTone.bg} dot>
          {statusLabel}
        </Badge>
      </td>
      <td style={s.td}>
        <button type="button" style={s.traceLink} onClick={() => onTrace(run)}>
          {t("runs.table.trace")}
        </button>
      </td>
    </tr>
  );
}
