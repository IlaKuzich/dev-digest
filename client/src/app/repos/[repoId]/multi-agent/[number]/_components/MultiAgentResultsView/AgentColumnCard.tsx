/* AgentColumnCard — one agent's column in Columns mode (AC-13). Score badge
   doubles as a live "running" ring; a failed column shows its failure reason
   and still renders alongside healthy columns (AC-16). All agent-authored
   text (summary, verdict, finding titles) is untrusted model output and goes
   through the vendored Markdown primitive, never raw HTML (AC-27). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, CircularScore, Icon, Markdown, MonoLink } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared";
import { useRunEvents } from "@/lib/hooks/reviews";
import { formatCost } from "@/components/run-cost-badge/RunCostBadge";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "./constants";
import { formatDurationMs } from "./helpers";
import { s } from "./styles";

export function AgentColumnCard({
  column,
  onOpenTrace,
  onFileClick,
}: {
  column: AgentColumn;
  onOpenTrace: (runId: string, agentName: string) => void;
  /** Opens the finding's file:line in the PR's own in-app diff view. */
  onFileClick?: (file: string, line: number) => void;
}) {
  const t = useTranslations("multiAgent");
  const running = column.status === "running";
  const failed = column.status === "failed";
  // Live status while running (AC-14) — subscribed only for THIS column's own
  // run, so a slow/still-running agent never blocks its siblings' rendering.
  const { events } = useRunEvents(running ? [column.run_id] : []);
  const lastEvent = events[events.length - 1];

  const borderColor = failed
    ? "var(--crit)"
    : column.score != null
      ? column.score >= 75
        ? "var(--ok)"
        : column.score >= 50
          ? "var(--warn)"
          : "var(--crit)"
      : "var(--border-strong)";

  return (
    <div style={s.column(borderColor)}>
      <div style={s.columnHeader}>
        <div>
          <div style={s.columnAgentName}>{column.agent_name}</div>
          <div style={s.columnMeta}>
            {formatDurationMs(column.duration_ms)} · {formatCost(column.cost_usd)}
          </div>
        </div>
        {running ? (
          <Icon.RefreshCw size={22} style={s.spin} aria-hidden />
        ) : failed ? (
          <Icon.XCircle size={22} style={{ color: "var(--crit)" }} aria-hidden />
        ) : column.score != null ? (
          <CircularScore score={column.score} size={40} stroke={4} />
        ) : (
          <Icon.Dot size={22} style={{ color: "var(--text-muted)" }} aria-hidden />
        )}
      </div>

      <div style={s.columnBody}>
        {failed && (
          // The contract has no dedicated `error` field for a failed column —
          // the server carries the failure reason in `summary` instead
          // (server multi-agent.service.ts:116-122); `verdict` stays null.
          <div style={s.columnFailedNote}>
            {column.summary ? <Markdown>{column.summary}</Markdown> : t("results.failedReason")}
          </div>
        )}
        {running && <div style={s.columnLiveNote}>{lastEvent?.msg ?? t("results.running")}</div>}
        {!failed && column.summary && (
          <div style={s.columnSummary}>
            <Markdown>{column.summary}</Markdown>
          </div>
        )}
        {column.findings.map((f) => {
          const sevColor = SEV_COLOR[f.severity] ?? SEV_COLOR_FALLBACK;
          return (
            <div key={f.id} style={s.columnFinding(sevColor)}>
              <div style={s.columnFindingTitle}>
                <Markdown>{f.title}</Markdown>
              </div>
              <div style={s.columnFindingLoc}>
                <MonoLink onClick={onFileClick ? () => onFileClick(f.file, f.start_line) : undefined}>
                  {f.file}:{f.start_line}
                </MonoLink>
              </div>
            </div>
          );
        })}
        {!running && !failed && column.findings.length === 0 && (
          <div style={s.columnLiveNote}>{t("results.noFindings")}</div>
        )}
      </div>

      <div style={s.columnFooter}>
        <Button kind="ghost" size="sm" onClick={() => onOpenTrace(column.run_id, column.agent_name)}>
          {t("results.viewTrace")}
        </Button>
        <span>{t("results.findingsCount", { count: column.findings.length })}</span>
      </div>
    </div>
  );
}
