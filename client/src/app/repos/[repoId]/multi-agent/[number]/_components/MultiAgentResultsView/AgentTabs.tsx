/* AgentTabs — Tabs mode (AC-17): one tab per agent (name + score); the
   selected tab renders a summary header then that agent's findings as
   expandable FindingCards, wired to Accept/Dismiss/Turn-into-eval-case
   exactly like the PR page's FindingsPanel (accept/dismiss via
   useFindingAction, "Turn into eval case" via useEvalCaseDraft +
   EvalCaseEditorModal). Every column here IS an agent, so `hasAgentOwner` is
   always true (unlike FindingsPanel, which can render an ownerless review).
   Learn/Reply-to-author were removed from FindingCard (2026-08-27 — stub
   buttons pulled per requester feedback; no real functionality behind them
   yet), so `onAction` here only ever receives 'accept'/'dismiss'. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, CircularScore, EmptyState, Icon, Markdown, Tabs, type TabDef } from "@devdigest/ui";
import type { AgentColumn, EvalCaseDraft, FindingRecord } from "@devdigest/shared";
import { EvalCaseEditorModal } from "@/components/eval-case-editor-modal";
import { formatCost } from "@/components/run-cost-badge/RunCostBadge";
import { useFindingAction } from "@/lib/hooks/reviews";
import { useEvalCaseDraft } from "@/lib/hooks/eval-capture";
// Reused across routes without a client-project-structure "lift" to
// src/components/ — that would require also updating the PR page's
// FindingsPanel import, which is outside this task's file ownership. See
// the task report for this documented deviation.
import { FindingCard } from "../../../../pulls/[number]/_components/FindingCard";
import { formatDurationMs } from "./helpers";
import { s } from "./styles";

/** `AgentColumn.verdict` is a plain `string | null` in the contract (not the
   `Verdict` enum) — index safely and fall back to the raw value for anything
   outside the three known verdicts, rather than risking a missing-message
   lookup. */
const VERDICT_KEY: Partial<Record<string, string>> = {
  request_changes: "verdict.requestChanges",
  approve: "verdict.approve",
  comment: "verdict.comment",
};

export function AgentTabs({
  columns,
  findingsByRun,
  prId,
  onOpenTrace,
  onFileClick,
}: {
  columns: AgentColumn[];
  findingsByRun: Record<string, FindingRecord[]>;
  prId: string;
  onOpenTrace: (runId: string, agentName: string) => void;
  /** Opens the finding's file:line in the PR's own in-app diff view. */
  onFileClick?: (file: string, line: number) => void;
}) {
  const t = useTranslations("multiAgent");
  const tReview = useTranslations("prReview");
  const [selected, setSelected] = React.useState<string | null>(null);
  // Derived, not stored (react-best-practices): default to the first column
  // until the user picks a tab.
  const activeId = selected ?? columns[0]?.agent_id ?? null;
  const active = columns.find((c) => c.agent_id === activeId) ?? columns[0] ?? null;

  const action = useFindingAction();
  const draft = useEvalCaseDraft();
  const [draftModal, setDraftModal] = React.useState<EvalCaseDraft | null>(null);

  const tabs: TabDef[] = columns.map((c) => ({
    key: c.agent_id,
    label: c.agent_name,
    count: c.score ?? undefined,
  }));

  if (!active) return null;

  const findings = findingsByRun[active.run_id] ?? [];
  const verdictKey = active.verdict != null ? VERDICT_KEY[active.verdict] : undefined;
  const verdictLabel = verdictKey ? tReview(verdictKey) : active.verdict;

  return (
    <div>
      <Tabs tabs={tabs} value={active.agent_id} onChange={setSelected} />
      <div style={s.tabsBody}>
        <div style={s.tabSummary}>
          {active.score != null ? (
            <CircularScore score={active.score} size={44} stroke={4} />
          ) : active.status === "running" ? (
            <Icon.RefreshCw size={24} style={s.spin} aria-hidden />
          ) : (
            <Icon.XCircle size={24} style={{ color: "var(--crit)" }} aria-hidden />
          )}
          <div style={s.tabSummaryMain}>
            <div style={s.tabSummaryVerdict}>
              {active.agent_name}
              {verdictLabel != null && ` · ${verdictLabel}`}
            </div>
            {active.summary && (
              <div style={s.tabSummaryBody}>
                <Markdown>{active.summary}</Markdown>
              </div>
            )}
          </div>
          <div style={s.tabSummaryMeta}>
            <Button kind="ghost" size="sm" onClick={() => onOpenTrace(active.run_id, active.agent_name)}>
              {t("results.viewTrace")}
            </Button>
            <span>
              {formatDurationMs(active.duration_ms)} · {formatCost(active.cost_usd)}
            </span>
          </div>
        </div>

        <div style={s.findingsList}>
          {findings.length === 0 ? (
            <EmptyState icon="Filter" title={t("results.noFindings")} />
          ) : (
            findings.map((f, i) => (
              <FindingCard
                key={f.id}
                f={f}
                defaultExpanded={i === 0}
                pending={action.isPending}
                capturePending={draft.isPending}
                hasAgentOwner
                onAction={(act, reply) =>
                  action.mutate({ findingId: f.id, action: act, reply, prId })
                }
                onCapture={() => draft.mutate(f.id, { onSuccess: setDraftModal })}
                onFileClick={onFileClick}
              />
            ))
          )}
        </div>
      </div>

      {draftModal && (
        <EvalCaseEditorModal
          agentId={active.agent_id}
          agentName={active.agent_name}
          evalCase={null}
          initialValues={draftModal}
          onClose={() => setDraftModal(null)}
        />
      )}
    </div>
  );
}
