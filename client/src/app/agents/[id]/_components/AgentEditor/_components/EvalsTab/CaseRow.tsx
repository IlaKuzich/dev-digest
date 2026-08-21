"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, IconBtn } from "@devdigest/ui";
import type { EvalCaseWithLastRun } from "@/lib/hooks/eval-cases";
import { caseState, expectedCount, isEmptyExpectedCase, producedCount, severityCategoryTag } from "./helpers";
import { s } from "./styles";

const STATE_ICON = {
  pass: { icon: "CheckCircle", color: "var(--ok)" },
  fail: { icon: "XCircle", color: "var(--crit)" },
  "never-run": { icon: "Dot", color: "var(--text-muted)" },
} as const;

/**
 * One eval case row (AC-9): pass/fail/never-run glyph, mono name, "expected N
 * got M" subtitle, severity·category (or `empty []`) tag, and per-row
 * run/edit/delete controls. Each control is its own labelled `IconBtn`
 * (`<button aria-label>`) — the row itself is a plain `<div>`, never a
 * button-wrapping-buttons nesting (client INSIGHTS.md nested-interactives lesson).
 */
export function CaseRow({
  evalCase,
  onRun,
  onEdit,
  onDelete,
  running,
}: {
  evalCase: EvalCaseWithLastRun;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  running?: boolean;
}) {
  const t = useTranslations("eval");
  const state = caseState(evalCase);
  const StateIcon = Icon[STATE_ICON[state].icon];
  const tag = severityCategoryTag(evalCase);

  return (
    <div style={s.row} data-case-state={state}>
      <StateIcon size={16} style={{ color: STATE_ICON[state].color, flexShrink: 0 }} aria-hidden="true" />
      <div style={s.rowBody}>
        <span className="mono" style={s.rowName}>
          {evalCase.name}
        </span>
        <span style={s.rowSubtitle}>
          {state === "never-run"
            ? t("evalsTab.neverRun")
            : t("evalsTab.expectedGot", { expected: expectedCount(evalCase), got: producedCount(evalCase) })}
        </span>
      </div>
      {isEmptyExpectedCase(evalCase) ? <Badge>empty []</Badge> : tag ? <Badge>{tag}</Badge> : null}
      <div style={s.rowActions}>
        <IconBtn icon="Play" label={`${t("evalsTab.run")} ${evalCase.name}`} onClick={onRun} />
        <IconBtn icon="Edit" label={`${t("evalsTab.edit")} ${evalCase.name}`} onClick={onEdit} />
        <IconBtn icon="Trash" label={`${t("evalsTab.delete")} ${evalCase.name}`} onClick={onDelete} danger />
      </div>
      {running && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("evalsTab.running")}</span>}
    </div>
  );
}
